// Event listener storage.
// https://dom.spec.whatwg.org/#concept-event-listener
// https://dom.spec.whatwg.org/#add-an-event-listener
// https://dom.spec.whatwg.org/#remove-an-event-listener
//
// Layout: `EventTarget._listeners` is null until the first addEventListener (the common case
// for almost every node) and then a Map from event type to a `ListenerList` (possibly empty). Keying by type keeps React's root container
// (≈150 types × capture/bubble listeners via `listenToAllSupportedEvents`) at one hash
// lookup per invoked path entry instead of a scan over 300 listeners.
//
// Removal during dispatch: the spec clones the listener list before invoking it and skips
// listeners whose `removed` flag is set. Instead of cloning on every invoke, a list being
// iterated has `iterating > 0`; mutations made while iterating replace `items` with a copy
// first (copy-on-write), so the dispatch loop keeps iterating its stable snapshot and the
// common no-mutation case allocates nothing.

import type { AddEventListenerOptions, EventListenerOptions, EventListenerOrEventListenerObject } from "../webidl.ts";
import type { EventTarget } from "./EventTarget.ts";
import { DOCUMENT_NODE } from "../nodes/constants.ts";

export class Listener {
  callback: EventListenerOrEventListenerObject;
  capture: boolean;
  once: boolean;
  passive: boolean;
  removed: boolean;
  signal: AbortSignal | null;
  /** The abort algorithm registered on `signal`, kept so removal can unregister it. */
  onAbort: (() => void) | null;

  constructor(callback: EventListenerOrEventListenerObject, capture: boolean, once: boolean, passive: boolean, signal: AbortSignal | null) {
    this.callback = callback;
    this.capture = capture;
    this.once = once;
    this.passive = passive;
    this.removed = false;
    this.signal = signal;
    this.onAbort = null;
  }
}

export class ListenerList {
  items: Listener[];
  /** Number of in-progress invocations iterating `items` (nested dispatches can stack). */
  iterating: number;

  constructor() {
    this.items = [];
    this.iterating = 0;
  }
}

export type ListenerMap = Map<string, ListenerList>;

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
    if (signal === null || typeof signal !== "object" || typeof (signal as AbortSignal).aborted !== "boolean" || typeof signal.addEventListener !== "function") {
      throw new TypeError("Failed to execute 'addEventListener' on 'EventTarget': member signal is not of type 'AbortSignal'.");
    }
    flat.signal = signal;
  }
  return flat;
}

/** https://dom.spec.whatwg.org/#default-passive-value */
function defaultPassiveValue(type: string, target: EventTarget): boolean {
  if (type !== "touchstart" && type !== "touchmove" && type !== "wheel" && type !== "mousewheel") return false;
  const t = target as unknown as {
    _impl?: { type: number; doc: { _impl: unknown; documentElement: unknown; body: unknown; _window: unknown } };
    document?: { _window?: unknown };
  };
  const impl = t._impl;
  if (impl === undefined) {
    // A Window: its document's browsing context window is itself.
    const doc = t.document;
    return doc !== undefined && doc !== null && doc._window === target;
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

/** https://dom.spec.whatwg.org/#add-an-event-listener */
export function addEventListener(
  target: EventTarget,
  type: string,
  callback: EventListenerOrEventListenerObject | null | undefined,
  options: boolean | AddEventListenerOptions | undefined | null,
): void {
  const { capture, once, passive, signal } = flattenMore(options);
  // Step 2.
  if (signal !== null && signal.aborted) return;
  // Step 3.
  if (callback === null || callback === undefined) return;
  checkCallback(callback, "addEventListener");
  let map = target._listeners;
  let list: ListenerList | undefined;
  if (map === null) {
    map = target._listeners = new Map();
  } else {
    list = map.get(type);
  }
  if (list === undefined) {
    list = new ListenerList();
    map.set(type, list);
  } else {
    // Step 5: no duplicate (type, callback, capture).
    const items = list.items;
    for (let i = 0; i < items.length; i++) {
      const l = items[i];
      if (l.callback === callback && l.capture === capture) return;
    }
  }
  // Step 4.
  const listener = new Listener(callback, capture, once, passive === null ? defaultPassiveValue(type, target) : passive, signal);
  if (list.iterating > 0) list.items = list.items.slice();
  list.items.push(listener);
  // Step 6.
  if (signal !== null) {
    const onAbort = () => removeListener(target, type, listener);
    listener.onAbort = onAbort;
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
  const capture = flattenCapture(options);
  if (callback === null || callback === undefined) return;
  checkCallback(callback, "removeEventListener");
  const map = target._listeners;
  if (map === null) return;
  const list = map.get(type);
  if (list === undefined) return;
  const items = list.items;
  for (let i = 0; i < items.length; i++) {
    const l = items[i];
    if (l.callback === callback && l.capture === capture) {
      removeAt(target, type, list, i);
      return;
    }
  }
}

/** https://dom.spec.whatwg.org/#remove-an-event-listener */
export function removeListener(target: EventTarget, type: string, listener: Listener): void {
  if (listener.removed) return;
  const map = target._listeners;
  const list = map === null ? undefined : map.get(type);
  if (list === undefined) {
    listener.removed = true;
    return;
  }
  const i = list.items.indexOf(listener);
  if (i === -1) listener.removed = true;
  else removeAt(target, type, list, i);
}

function removeAt(target: EventTarget, type: string, list: ListenerList, i: number): void {
  const listener = list.items[i];
  // Step 2: set removed (an in-progress dispatch holding a snapshot will skip it).
  listener.removed = true;
  if (listener.signal !== null && listener.onAbort !== null) {
    listener.signal.removeEventListener("abort", listener.onAbort);
    listener.onAbort = null;
  }
  if (list.iterating > 0) {
    const copy = list.items.slice();
    copy.splice(i, 1);
    list.items = copy;
    return;
  }
  // Empty lists stay in the map: add/remove churn on the same type (effects re-subscribing)
  // then reuses them (measured ~1.5x faster than deleting and re-creating the entry).
  list.items.splice(i, 1);
}

/** https://dom.spec.whatwg.org/#concept-event-listener-remove-all */
export function removeAllEventListeners(target: EventTarget): void {
  const map = target._listeners;
  if (map === null) return;
  for (const [type, list] of map) {
    const items = list.items;
    for (let i = items.length - 1; i >= 0; i--) removeAt(target, type, list, i);
  }
  target._listeners = null;
}

/** Whether `target` has at least one listener for `type` (internal fast check for other areas). */
export function hasListeners(target: EventTarget, type: string): boolean {
  const map = target._listeners;
  if (map === null) return false;
  const list = map.get(type);
  return list !== undefined && list.items.length > 0;
}
