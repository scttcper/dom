// Event listener storage.
// https://dom.spec.whatwg.org/#concept-event-listener
// https://dom.spec.whatwg.org/#add-an-event-listener
// https://dom.spec.whatwg.org/#remove-an-event-listener
//
// Platform event names use small integer IDs so React's delegated listeners fit in an indexed
// array on each root. Custom names belong to their target and disappear on removal or collection.
// Each slot holds a linked list of callbacks in registration order.
//
// Removal during dispatch: the spec clones the listener list before invoking it and skips
// listeners whose `removed` flag (LISTENER_REMOVED) is set. Instead of cloning, each listener
// records `seq`, its position in a process-wide insertion counter, and inner invoke walks the
// chain up to the first listener added after it started. Removing a listener unlinks it but
// leaves its own `next` intact, so a walk standing on it still reaches the rest of the chain.
// Chains are in seq order (appends go to the tail and nothing is reinserted), so that walk sees
// exactly the clone: listeners present when it started, minus those removed since.

import { GLOBAL_EVENT_HANDLER_EVENTS, WINDOW_EVENT_HANDLER_EVENTS } from "./handler-names.ts";
import { addAbortListener } from "node:events";
import type { AddEventListenerOptions, EventListenerOptions, EventListenerOrEventListenerObject } from "../webidl.ts";
import type { EventTarget } from "./EventTarget.ts";
import { DOCUMENT_NODE, F_MO_REGISTERED } from "../nodes/constants.ts";
import type { NodeImpl } from "../nodes/NodeImpl.ts";
import { $impl, $listeners, $listenerTypesChanged, $shadowRoot, $window } from "../keys.ts";

// Listener.flags bits: the spec's capture, once, passive and removed.
export const LISTENER_CAPTURE = 1;
export const LISTENER_ONCE = 2;
export const LISTENER_PASSIVE = 4;
export const LISTENER_REMOVED = 8;

const LISTENER_SIGNAL = 16;

/** Insertion counter behind Listener.seq. */
let nextSeq = 0;

/** The seq the next added listener gets: inner invoke stops at listeners at or past it. */
export function listenerSeqLimit(): number {
  return nextSeq;
}

/**
 * The booleans pack into `flags` and the signal state lives out of line: a React root holds 142
 * of these and none has a signal.
 */
export class Listener {
  declare callback: EventListenerOrEventListenerObject;
  /** LISTENER_* bits. */
  declare flags: number;
  /** The next listener of the same type on the same target, in insertion order. */
  declare next: Listener | null;
  declare seq: number;
  declare id: ListenerType;

  constructor(id: ListenerType, callback: EventListenerOrEventListenerObject, flags: number) {
    this.callback = callback;
    this.flags = flags;
    this.next = null;
    this.seq = nextSeq++;
    this.id = id;
  }
}

/** A live target owns its listener. A shared signal must not keep that target or its callback alive. */
class SignalListener extends Listener {
  declare target: EventTarget;
  declare signal: AbortSignal;
  declare ref: AbortRef;

  constructor(
    id: ListenerType,
    callback: EventListenerOrEventListenerObject,
    flags: number,
    target: EventTarget,
    signal: AbortSignal,
  ) {
    super(id, callback, flags | LISTENER_SIGNAL);
    this.target = target;
    this.signal = signal;
    this.ref = new AbortRef(this);
  }
}

/** The signal owns only weak references. The finalizer can drop a dead registration without
 * keeping either its signal (which may have application abort handlers) or its target alive. */
class AbortRef extends WeakRef<SignalListener> {
  signal: WeakRef<AbortSignal>;
  previous: AbortRef | null = null;
  next: AbortRef | null;

  constructor(listener: SignalListener) {
    super(listener);
    const signal = listener.signal;
    this.next = abortHeads.get(signal) ?? null;
    if (this.next === null) {
      this.signal = new WeakRef(signal);
    } else {
      this.signal = this.next.signal;
      this.next.previous = this;
    }
    abortHeads.set(signal, this);
    collected.register(listener, this, this);
  }
}

const abortHeads = new WeakMap<AbortSignal, AbortRef>();
const collected = new FinalizationRegistry<AbortRef>((ref) => {
  const signal = ref.signal.deref();
  if (signal !== undefined) dropAbortStep(signal, ref);
});

function dropAbortStep(signal: AbortSignal, ref: AbortRef): void {
  if (ref.previous !== null) ref.previous.next = ref.next;
  else if (ref.next !== null) abortHeads.set(signal, ref.next);
  else {
    abortHeads.delete(signal);
    signal.removeEventListener("abort", runAbortSteps);
  }
  if (ref.next !== null) ref.next.previous = ref.previous;
  ref.previous = ref.next = null;
}

function runAbortSteps(this: AbortSignal): void {
  // A synthetic event consumes Node's once listener without aborting the signal.
  if (!this.aborted) {
    addAbortListener(this, runAbortSteps);
    return;
  }
  let ref: AbortRef | null = abortHeads.get(this) ?? null;
  if (ref === null) return;
  // Visit in registration order. Unlinking many listeners of the same type from one
  // target then removes each from the front of its listener chain.
  while (ref.next !== null) ref = ref.next;
  while (ref !== null) {
    const next: AbortRef | null = ref.previous;
    const listener = ref.deref();
    if (listener !== undefined) removeListener(listener.target, listener);
    ref = next;
  }
}

/** Abort algorithms take effect before application abort handlers can dispatch another event. */
export function listenerAborted(listener: Listener): boolean {
  return (listener.flags & LISTENER_SIGNAL) !== 0 && (listener as SignalListener).signal.aborted;
}

/**
 * React adds just one event type (invalid) to each input, select and textarea. Store that
 * type's listener chain directly. Two to four types use an array of chain heads. From
 * the fifth type on, a sparse array indexed by type ID serves large targets like React roots.
 */
export type ListenerType = number | string;
type SlotArray = (Listener | undefined)[] & { custom?: Map<string, Listener> };
export type ListenerSlots = Listener | SlotArray;

const COMPACT_TYPES = 4;

// Only names supplied by the platform get process-wide slots. Assign IDs on first use so
// React's root types stay packed regardless of which other events the platform supports.
const typeIds = new Map<string, number>();
for (const name of [
  ...GLOBAL_EVENT_HANDLER_EVENTS,
  ...WINDOW_EVENT_HANDLER_EVENTS,
  "compositionend",
  "compositionstart",
  "compositionupdate",
  "dragexit",
  "encrypted",
  "focusin",
  "focusout",
  "fullscreenchange",
  "fullscreenerror",
  "readystatechange",
  "textInput",
  "visibilitychange",
  "webkitAnimationEnd",
  "webkitAnimationIteration",
  "webkitAnimationStart",
  "webkitTransitionEnd",
])
  typeIds.set(name, -1);
let nextTypeId = 0;

export function idForType(type: string): ListenerType {
  const id = typeIds.get(type);
  if (id !== -1) return id ?? type;
  typeIds.set(type, nextTypeId);
  return nextTypeId++;
}

/** A platform ID (-1 before the first subscription), or the original custom event name. */
export function typeIdOf(type: string): ListenerType {
  return typeIds.get(type) ?? type;
}

/** The first listener for type id `id` (-1 included) on a target whose slots are `slots`. */
export function firstListener(slots: ListenerSlots, id: ListenerType): Listener | undefined {
  if (!Array.isArray(slots)) return slots.id === id ? slots : undefined;
  const length = slots.length;
  if (length <= COMPACT_TYPES) {
    for (let i = 0; i < length; i++) if (slots[i]!.id === id) return slots[i];
    return undefined;
  }
  if (typeof id === "string") return slots.custom?.get(id);
  // `>>> 0` sends -1 out of range instead of reading the property "-1".
  return id >>> 0 < length ? slots[id] : undefined;
}

function setIndexedHead(slots: SlotArray, id: ListenerType, head: Listener | undefined): void {
  if (typeof id === "number") slots[id] = head;
  else if (head !== undefined) (slots.custom ??= new Map()).set(id, head);
  else if (slots.custom?.delete(id) && slots.custom.size === 0) slots.custom = undefined;
}

/** Replace a chain head on removal, or add the first listener for a new type. */
function setFirstListener(
  target: EventTarget,
  slots: ListenerSlots,
  id: ListenerType,
  head: Listener | undefined,
): void {
  if (!Array.isArray(slots)) {
    if (slots.id === id) target[$listeners] = head;
    else if (head !== undefined) target[$listeners] = [slots, head];
    return;
  }
  const length = slots.length;
  if (length > COMPACT_TYPES) {
    setIndexedHead(slots, id, head);
    return;
  }
  for (let i = 0; i < length; i++) {
    if (slots[i]!.id !== id) continue;
    if (head !== undefined) slots[i] = head;
    else if (length === 2) target[$listeners] = slots[1 - i];
    else slots.splice(i, 1);
    return;
  }
  if (head === undefined) return;
  if (length < COMPACT_TYPES) {
    // Keep small lists at their exact size (push leaves spare capacity).
    const next = new Array<Listener | undefined>(length + 1);
    for (let i = 0; i < length; i++) next[i] = slots[i];
    next[length] = head;
    target[$listeners] = next;
  } else {
    // Length distinguishes layouts even when all five types are custom.
    const indexed: SlotArray = new Array(COMPACT_TYPES + 1);
    for (const listener of slots) setIndexedHead(indexed, listener!.id, listener);
    setIndexedHead(indexed, id, head);
    target[$listeners] = indexed;
  }
}

/** Calls `visit` with the first listener of every type that has one. */
function eachHead(slots: ListenerSlots, visit: (head: Listener) => void): void {
  if (!Array.isArray(slots)) return visit(slots);
  for (const head of slots) if (head !== undefined) visit(head);
  slots.custom?.forEach(visit);
}

/** https://dom.spec.whatwg.org/#concept-flatten-options */
export function flattenCapture(options: boolean | EventListenerOptions | undefined | null): boolean {
  if (typeof options === "boolean") return options;
  if (options === undefined || options === null) return false;
  if (typeof options !== "object" && typeof options !== "function") return !!options;
  return !!options.capture;
}

/** https://dom.spec.whatwg.org/#default-passive-value */
function defaultPassiveValue(type: string, target: EventTarget): boolean {
  if (type !== "touchstart" && type !== "touchmove" && type !== "wheel" && type !== "mousewheel") return false;
  const t = target as unknown as {
    [$impl]?: { type: number; doc: { [$impl]: unknown; documentElement: unknown; body: unknown; [$window]: unknown } };
    document?: { [$window]?: unknown };
  };
  const impl = t[$impl];
  if (impl === undefined) {
    // A Window: its document's browsing context window is itself.
    const doc = t.document;
    return doc !== undefined && doc !== null && doc[$window] === target;
  }
  if (impl.type === DOCUMENT_NODE) return true;
  const doc = impl.doc;
  return doc.documentElement === target || doc.body === target;
}

function checkCallback(callback: unknown, method: string): void {
  if (typeof callback !== "function" && (typeof callback !== "object" || callback === null)) {
    throw new TypeError(`Failed to execute '${method}' on 'EventTarget': parameter 2 is not of type 'Object'.`);
  }
}

/**
 * https://dom.spec.whatwg.org/#add-an-event-listener
 *
 * The most-called DOM entry point in component suites: React adds 142 listeners to every root
 * container, so each render() in a test makes 142 calls. It was our top function by self time in
 * Base UI's interaction tests at 0.2% of their CPU (bench/README.md "Where real suites spend their
 * time") before the type-id layout; `dom/react-root-listeners` replays React's calls.
 */
export function addEventListener(
  target: EventTarget,
  type: string,
  callback: EventListenerOrEventListenerObject | null | undefined,
  options: boolean | AddEventListenerOptions | undefined | null,
): void {
  if (options === null || (typeof options !== "object" && typeof options !== "function")) {
    if (callback == null) return;
    checkCallback(callback, "addEventListener");
    addFlattened(target, type, callback, !!options, false, null, null);
    return;
  }
  // https://dom.spec.whatwg.org/#event-flatten-more
  // Keep these local: getters can re-enter, and a signal may own application state.
  const capture = !!options.capture;
  const once = !!options.once;
  const passive = options.passive;
  const signal = options.signal;
  if (signal !== undefined) {
    if (
      signal === null ||
      typeof signal !== "object" ||
      typeof signal.aborted !== "boolean" ||
      typeof signal.addEventListener !== "function"
    ) {
      throw new TypeError(
        "Failed to execute 'addEventListener' on 'EventTarget': member signal is not of type 'AbortSignal'.",
      );
    }
    if (signal.aborted) return;
  }
  if (callback == null) return;
  checkCallback(callback, "addEventListener");
  addFlattened(target, type, callback, capture, once, passive === undefined ? null : !!passive, signal ?? null);
}

/** https://dom.spec.whatwg.org/#add-an-event-listener steps 4-6, with flattened options. */
function addFlattened(
  target: EventTarget,
  type: string,
  callback: EventListenerOrEventListenerObject,
  capture: boolean,
  once: boolean,
  passive: boolean | null,
  signal: AbortSignal | null,
): void {
  const captureBit = capture ? LISTENER_CAPTURE : 0;
  const id = idForType(type);
  const slots = target[$listeners];
  // Step 5: no duplicate (type, callback, capture). The walk ends on the tail to append to.
  let tail = slots == null ? undefined : firstListener(slots, id);
  if (tail !== undefined) {
    for (;;) {
      if (tail.callback === callback && (tail.flags & LISTENER_CAPTURE) === captureBit) {
        if (!listenerAborted(tail)) return;
        // An earlier abort handler is re-registering this callback with a new signal.
        removeListener(target, tail);
        return addFlattened(target, type, callback, capture, once, passive, signal);
      }
      const next: Listener | null = tail.next;
      if (next === null) break;
      tail = next;
    }
  }
  // Step 4.
  const flags =
    captureBit |
    (once ? LISTENER_ONCE : 0) |
    ((passive === null ? defaultPassiveValue(type, target) : passive) ? LISTENER_PASSIVE : 0);
  const listener =
    signal === null ? new Listener(id, callback, flags) : new SignalListener(id, callback, flags, target, signal);
  if (tail !== undefined) tail.next = listener;
  else if (slots == null) target[$listeners] = listener;
  else setFirstListener(target, slots, id, listener);
  // Install one abort hook per signal, after the target owns its first registration.
  if (signal !== null && (listener as SignalListener).ref.next === null) addAbortListener(signal, runAbortSteps);
  if (tail === undefined) target[$listenerTypesChanged]?.();
}

/** https://dom.spec.whatwg.org/#dom-eventtarget-removeeventlistener */
export function removeEventListener(
  target: EventTarget,
  type: string,
  callback: EventListenerOrEventListenerObject | null | undefined,
  options: boolean | EventListenerOptions | undefined | null,
): void {
  const captureBit = flattenCapture(options) ? LISTENER_CAPTURE : 0;
  if (callback === null || callback === undefined) return;
  checkCallback(callback, "removeEventListener");
  const slots = target[$listeners];
  if (slots == null) return;
  const id = typeIdOf(type);
  let prev: Listener | null = null;
  for (let l = firstListener(slots, id) ?? null; l !== null; prev = l, l = l.next) {
    if (l.callback === callback && (l.flags & LISTENER_CAPTURE) === captureBit) {
      unlink(target, slots, id, prev, l);
      return;
    }
  }
}

/** https://dom.spec.whatwg.org/#remove-an-event-listener */
export function removeListener(target: EventTarget, listener: Listener): void {
  if ((listener.flags & LISTENER_REMOVED) !== 0) return;
  const slots = target[$listeners];
  if (slots != null) {
    const id = listener.id;
    let prev: Listener | null = null;
    for (let l = firstListener(slots, id) ?? null; l !== null; prev = l, l = l.next) {
      if (l === listener) {
        unlink(target, slots, id, prev, l);
        return;
      }
    }
  }
  listener.flags |= LISTENER_REMOVED;
}

function unlink(
  target: EventTarget,
  slots: ListenerSlots,
  id: ListenerType,
  prev: Listener | null,
  listener: Listener,
): void {
  // Step 2: set removed (an in-progress dispatch standing before it will skip it).
  markRemoved(listener);
  // `listener.next` stays: a dispatch standing on it continues from there (see the header).
  if (prev === null) {
    setFirstListener(target, slots, id, listener.next ?? undefined);
    if (listener.next === null) target[$listenerTypesChanged]?.();
  } else prev.next = listener.next;
}

function markRemoved(listener: Listener): void {
  listener.flags |= LISTENER_REMOVED;
  if ((listener.flags & LISTENER_SIGNAL) !== 0) {
    const l = listener as SignalListener;
    collected.unregister(l.ref);
    dropAbortStep(l.signal, l.ref);
  }
}

/** https://dom.spec.whatwg.org/#concept-event-listener-remove-all */
export function removeAllEventListeners(target: EventTarget): void {
  const slots = target[$listeners];
  if (slots == null) return;
  target[$listeners] = null;
  eachHead(slots, (head) => {
    for (let l: Listener | null = head; l !== null; l = l.next) markRemoved(l);
  });
  target[$listenerTypesChanged]?.();
}

/** Whether `target` has at least one listener for `type` (internal fast check for other areas). */
export function hasListeners(target: EventTarget, type: string): boolean {
  const slots = target[$listeners];
  return slots != null && firstListener(slots, typeIdOf(type)) !== undefined;
}

/**
 * Whether a detached element is a new element in every way but its event listeners, of which it
 * has `listeners`: no parent, children, attributes, shadow root or mutation observers. For
 * @ctrl/dom/react, which gives such a container to the next render() (packages/react/src/pure.ts).
 * False for another DOM's nodes.
 */
export function reusableElement(element: EventTarget, listeners: number): boolean {
  const impl = (element as { [$impl]?: NodeImpl })[$impl];
  if (
    impl === undefined ||
    impl.parent !== null ||
    impl.first !== null ||
    impl.attrs !== null ||
    (impl.flags & F_MO_REGISTERED) !== 0 ||
    (element as { [$shadowRoot]?: object | null })[$shadowRoot] != null
  )
    return false;
  return listenerCount(element) === listeners;
}

/** How many listeners `target` has, over every type. */
export function listenerCount(target: EventTarget): number {
  const slots = target[$listeners];
  if (slots == null) return 0;
  let count = 0;
  eachHead(slots, (head) => {
    for (let l: Listener | null = head; l !== null; l = l.next) count++;
  });
  return count;
}

/** Whether `target` has any listener at all. */
export function hasAnyListener(target: EventTarget): boolean {
  const slots = target[$listeners];
  if (slots == null) return false;
  let any = false;
  eachHead(slots, () => {
    any = true;
  });
  return any;
}
