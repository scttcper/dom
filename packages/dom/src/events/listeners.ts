// Event listener storage.
// https://dom.spec.whatwg.org/#concept-event-listener
// https://dom.spec.whatwg.org/#add-an-event-listener
// https://dom.spec.whatwg.org/#remove-an-event-listener
//
// Layout: every event type gets a small integer id the first time anything listens for it
// (`typeIds`, shared by the whole process). `EventTarget[$listeners]` is null until the first
// addEventListener (the common case for almost every node) and then a sparse array indexed by
// type id, each slot the head of that type's listeners as a singly linked list in insertion
// order. React's root container (142 listeners over 87 types via `listenToAllSupportedEvents`)
// is then one array plus 142 listeners: no per-target hash table, no per-type list objects, and
// dispatch resolves the type's id once per event instead of hashing it at every path entry.
//
// Removal during dispatch: the spec clones the listener list before invoking it and skips
// listeners whose `removed` flag (LISTENER_REMOVED) is set. Instead of cloning, each listener
// records `seq`, its position in a process-wide insertion counter, and inner invoke walks the
// chain up to the first listener added after it started. Removing a listener unlinks it but
// leaves its own `next` intact, so a walk standing on it still reaches the rest of the chain.
// Chains are in seq order (appends go to the tail and nothing is reinserted), so that walk sees
// exactly the clone: listeners present when it started, minus those removed since.

import type { AddEventListenerOptions, EventListenerOptions, EventListenerOrEventListenerObject } from "../webidl.ts";
import type { EventTarget } from "./EventTarget.ts";
import { DOCUMENT_NODE, F_MO_REGISTERED } from "../nodes/constants.ts";
import type { NodeImpl } from "../nodes/NodeImpl.ts";
import { $impl, $listeners, $shadowRoot, $window } from "../keys.ts";

// Listener.flags bits: the spec's capture, once, passive and removed.
export const LISTENER_CAPTURE = 1;
export const LISTENER_ONCE = 2;
export const LISTENER_PASSIVE = 4;
export const LISTENER_REMOVED = 8;

/** A listener's signal and the abort algorithm registered on it, kept so removal can unregister it. */
class AbortBinding {
  signal: AbortSignal;
  onAbort: () => void;

  constructor(signal: AbortSignal, onAbort: () => void) {
    this.signal = signal;
    this.onAbort = onAbort;
  }
}

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
  callback: EventListenerOrEventListenerObject;
  /** LISTENER_* bits. */
  flags: number;
  /** The next listener of the same type on the same target, in insertion order. */
  next: Listener | null;
  seq: number;
  /** Null unless added with a signal. */
  abort: AbortBinding | null;

  constructor(callback: EventListenerOrEventListenerObject, flags: number) {
    this.callback = callback;
    this.flags = flags;
    this.next = null;
    this.seq = nextSeq++;
    this.abort = null;
  }
}

/** Indexed by type id; a hole or undefined means no listener of that type. */
export type ListenerSlots = (Listener | undefined)[];

const typeIds = new Map<string, number>();

function idForType(type: string): number {
  let id = typeIds.get(type);
  if (id === undefined) {
    id = typeIds.size;
    typeIds.set(type, id);
  }
  return id;
}

/** `type`'s id, or -1 when nothing has ever listened for it (so no target has a listener). */
export function typeIdOf(type: string): number {
  const id = typeIds.get(type);
  return id === undefined ? -1 : id;
}

/** The first listener for type id `id` (-1 included) on a target whose slots are `slots`. */
export function firstListener(slots: ListenerSlots, id: number): Listener | undefined {
  // `>>> 0` sends -1 out of range instead of reading the property "-1".
  return id >>> 0 < slots.length ? slots[id] : undefined;
}

interface Flattened {
  capture: boolean;
  once: boolean;
  passive: boolean | null;
  signal: AbortSignal | null;
}

// Reused result object for flattenMore (no allocation per addEventListener call).
const flat: Flattened = { capture: false, once: false, passive: null, signal: null };

/** https://dom.spec.whatwg.org/#concept-flatten-options */
export function flattenCapture(options: boolean | EventListenerOptions | undefined | null): boolean {
  if (typeof options === "boolean") return options;
  if (options === undefined || options === null) return false;
  if (typeof options !== "object" && typeof options !== "function") return !!options;
  return !!options.capture;
}

/** https://dom.spec.whatwg.org/#event-flatten-more */
function flattenMore(options: boolean | AddEventListenerOptions | undefined | null): Flattened {
  flat.capture = false;
  flat.once = false;
  flat.passive = null;
  flat.signal = null;
  if (options === undefined || options === null) return flat;
  if (typeof options !== "object" && typeof options !== "function") {
    // A boolean (or any other primitive, converted per the (AddEventListenerOptions or boolean) union).
    flat.capture = !!options;
    return flat;
  }
  // Read every member before writing `flat` (getters may re-enter addEventListener).
  const capture = !!options.capture;
  const once = !!options.once;
  const passive = options.passive;
  const signal = options.signal;
  flat.capture = capture;
  flat.once = once;
  flat.passive = passive === undefined ? null : !!passive;
  flat.signal = null;
  if (signal !== undefined) {
    if (
      signal === null ||
      typeof signal !== "object" ||
      typeof (signal as AbortSignal).aborted !== "boolean" ||
      typeof signal.addEventListener !== "function"
    ) {
      throw new TypeError(
        "Failed to execute 'addEventListener' on 'EventTarget': member signal is not of type 'AbortSignal'.",
      );
    }
    flat.signal = signal;
  }
  return flat;
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
  // React passes a boolean for all but 6 of its 142 root listeners: a boolean flattens to
  // (capture, false, null, null) without reading any member, so skip flattenMore.
  if (typeof options === "boolean") {
    // Step 3.
    if (callback === null || callback === undefined) return;
    checkCallback(callback, "addEventListener");
    addFlattened(target, type, callback, options, false, null, null);
    return;
  }
  const { capture, once, passive, signal } = flattenMore(options);
  // Step 2.
  if (signal !== null && signal.aborted) return;
  // Step 3.
  if (callback === null || callback === undefined) return;
  checkCallback(callback, "addEventListener");
  addFlattened(target, type, callback, capture, once, passive, signal);
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
  let slots = target[$listeners];
  if (slots == null) slots = target[$listeners] = [];
  // Step 5: no duplicate (type, callback, capture). The walk ends on the tail to append to.
  let tail = firstListener(slots, id);
  if (tail !== undefined) {
    for (;;) {
      if (tail.callback === callback && (tail.flags & LISTENER_CAPTURE) === captureBit) return;
      const next: Listener | null = tail.next;
      if (next === null) break;
      tail = next;
    }
  }
  // Step 4.
  const listener = new Listener(
    callback,
    captureBit |
      (once ? LISTENER_ONCE : 0) |
      ((passive === null ? defaultPassiveValue(type, target) : passive) ? LISTENER_PASSIVE : 0),
  );
  if (tail !== undefined) tail.next = listener;
  else {
    // Ids at or past the length grow the array (a gap leaves holes) rather than presizing it:
    // most targets listen for one or two types. A target's array is as long as the highest id
    // it uses, ~8 bytes per id below it. Ids stay small because event types are a small
    // vocabulary (React's 87 plus a few dozen); a process listening for over a thousand distinct
    // types would push later targets past V8's 1,024-element gap into slower dictionary arrays.
    slots[id] = listener;
  }
  // Step 6.
  if (signal !== null) {
    const onAbort = () => removeListener(target, type, listener);
    listener.abort = new AbortBinding(signal, onAbort);
    signal.addEventListener("abort", onAbort, { once: true });
  }
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
      unlink(slots, id, prev, l);
      return;
    }
  }
}

/** https://dom.spec.whatwg.org/#remove-an-event-listener */
export function removeListener(target: EventTarget, type: string, listener: Listener): void {
  if ((listener.flags & LISTENER_REMOVED) !== 0) return;
  const slots = target[$listeners];
  if (slots != null) {
    const id = typeIdOf(type);
    let prev: Listener | null = null;
    for (let l = firstListener(slots, id) ?? null; l !== null; prev = l, l = l.next) {
      if (l === listener) {
        unlink(slots, id, prev, l);
        return;
      }
    }
  }
  listener.flags |= LISTENER_REMOVED;
}

function unlink(slots: ListenerSlots, id: number, prev: Listener | null, listener: Listener): void {
  // Step 2: set removed (an in-progress dispatch standing before it will skip it).
  markRemoved(listener);
  // `listener.next` stays: a dispatch standing on it continues from there (see the header).
  if (prev === null) slots[id] = listener.next ?? undefined;
  else prev.next = listener.next;
}

function markRemoved(listener: Listener): void {
  listener.flags |= LISTENER_REMOVED;
  const abort = listener.abort;
  if (abort !== null) {
    abort.signal.removeEventListener("abort", abort.onAbort);
    listener.abort = null;
  }
}

/** https://dom.spec.whatwg.org/#concept-event-listener-remove-all */
export function removeAllEventListeners(target: EventTarget): void {
  const slots = target[$listeners];
  if (slots == null) return;
  target[$listeners] = null;
  for (let i = 0; i < slots.length; i++) {
    for (let l = slots[i] ?? null; l !== null; l = l.next) markRemoved(l);
  }
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
  for (let i = 0; i < slots.length; i++) {
    for (let l = slots[i] ?? null; l !== null; l = l.next) count++;
  }
  return count;
}

/** Whether `target` has any listener at all. */
export function hasAnyListener(target: EventTarget): boolean {
  const slots = target[$listeners];
  if (slots == null) return false;
  for (let i = 0; i < slots.length; i++) if (slots[i] !== undefined) return true;
  return false;
}
