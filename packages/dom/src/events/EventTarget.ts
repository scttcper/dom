// https://dom.spec.whatwg.org/#interface-eventtarget
//
// Contract with the rest of the DOM:
//   - `Node extends EventTarget`; `_listeners` is the FIRST field of every wrapper and stays
//     null until the first addEventListener (most nodes never get one: zero cost).
//   - `_getTheParent(event)` is the propagation-path hook
//     (https://dom.spec.whatwg.org/#get-the-parent). Node delegates to
//     `nodeGetTheParent` (dispatch.ts: assigned slot / shadow root host / parent),
//     Document returns its Window (except for "load"), Window returns null.
// Listener storage is in listeners.ts, the dispatch algorithm in dispatch.ts.

import { EF_DISPATCH, EF_INITIALIZED, EF_TRUSTED, Event, NONE } from "./Event.ts";
import type { AddEventListenerOptions, EventListenerOptions, EventListenerOrEventListenerObject } from "../webidl.ts";
import { addEventListener, removeEventListener, type ListenerMap } from "./listeners.ts";
import { dispatch } from "./dispatch.ts";
import { toDOMString } from "./convert.ts";

export class EventTarget {
  /** @internal Event type → listener list, or null when there are no listeners (see listeners.ts). */
  _listeners: ListenerMap | null;

  /** https://dom.spec.whatwg.org/#dom-eventtarget-eventtarget */
  constructor() {
    this._listeners = null;
  }

  /** https://dom.spec.whatwg.org/#dom-eventtarget-addeventlistener */
  addEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions): void {
    if (arguments.length < 2) {
      throw new TypeError(`Failed to execute 'addEventListener' on 'EventTarget': 2 arguments required, but only ${arguments.length} present.`);
    }
    addEventListener(this, typeof type === "string" ? type : toDOMString(type), callback, options);
  }

  /** https://dom.spec.whatwg.org/#dom-eventtarget-removeeventlistener */
  removeEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions): void {
    if (arguments.length < 2) {
      throw new TypeError(`Failed to execute 'removeEventListener' on 'EventTarget': 2 arguments required, but only ${arguments.length} present.`);
    }
    removeEventListener(this, typeof type === "string" ? type : toDOMString(type), callback, options);
  }

  /** https://dom.spec.whatwg.org/#dom-eventtarget-dispatchevent */
  dispatchEvent(event: Event): boolean {
    if (!(event instanceof Event)) {
      throw new TypeError("Failed to execute 'dispatchEvent' on 'EventTarget': parameter 1 is not of type 'Event'.");
    }
    const s = event._s;
    // Step 1.
    if ((s.flags & EF_INITIALIZED) === 0) {
      throw new DOMException("Failed to execute 'dispatchEvent' on 'EventTarget': The event provided is uninitialized.", "InvalidStateError");
    }
    if ((s.flags & EF_DISPATCH) !== 0 || s.eventPhase !== NONE) {
      throw new DOMException("Failed to execute 'dispatchEvent' on 'EventTarget': The event is already being dispatched.", "InvalidStateError");
    }
    // Step 2.
    s.flags &= ~EF_TRUSTED;
    // Step 3.
    return dispatch(event, this);
  }

  /** https://dom.spec.whatwg.org/#get-the-parent */
  _getTheParent(_event: Event): EventTarget | null {
    return null;
  }
}

Object.defineProperty(EventTarget.prototype, Symbol.toStringTag, { value: "EventTarget", configurable: true });
