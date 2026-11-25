// https://dom.spec.whatwg.org/#interface-eventtarget
//
// Contract with the rest of the DOM:
//   - `Node extends EventTarget`; its listener storage is allocated on first registration.
//   - `_getTheParent(event)` is the propagation-path hook
//     (https://dom.spec.whatwg.org/#get-the-parent). Node delegates to
//     `nodeGetTheParent` (dispatch.ts: assigned slot / shadow root host / parent),
//     Document returns its Window (except for "load"), Window returns null.
// Listener storage is in listeners.ts, the dispatch algorithm in dispatch.ts.

import { argumentsRequired, exposeMembers } from "../webidl-runtime.ts";
import { EF_DISPATCH, EF_INITIALIZED, Event, NONE, setToStringTag, setTrusted } from "./Event.ts";
import type { AddEventListenerOptions, EventListenerOptions, EventListenerOrEventListenerObject } from "../webidl.ts";
import { addEventListener, removeEventListener, type ListenerSlots } from "./listeners.ts";
import { dispatch } from "./dispatch.ts";
import { toDOMString } from "../webidl-convert.ts";
import { $listeners, $listenerTypesChanged } from "../keys.ts";

export class EventTarget {
  /**
   * @internal Listener chains by event type (see listeners.ts). Most nodes never get a listener
   * because React delegates to its root container, so the field is added on first registration.
   */
  declare [$listeners]?: ListenerSlots | null;
  /** @internal Called when a type gains its first listener or loses its last. */
  [$listenerTypesChanged]?(): void;

  /** https://dom.spec.whatwg.org/#dom-eventtarget-eventtarget */
  constructor() {}

  /** https://dom.spec.whatwg.org/#dom-eventtarget-addeventlistener */
  addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void {
    if (arguments.length < 2) argumentsRequired("addEventListener", "EventTarget", 2, arguments.length);
    addEventListener(this, typeof type === "string" ? type : toDOMString(type), callback, options);
  }

  /** https://dom.spec.whatwg.org/#dom-eventtarget-removeeventlistener */
  removeEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ): void {
    if (arguments.length < 2) argumentsRequired("removeEventListener", "EventTarget", 2, arguments.length);
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
      throw new DOMException(
        "Failed to execute 'dispatchEvent' on 'EventTarget': The event provided is uninitialized.",
        "InvalidStateError",
      );
    }
    if ((s.flags & EF_DISPATCH) !== 0 || s.eventPhase !== NONE) {
      throw new DOMException(
        "Failed to execute 'dispatchEvent' on 'EventTarget': The event is already being dispatched.",
        "InvalidStateError",
      );
    }
    // Step 2 (the flag and the own `isTrusted` property together).
    setTrusted(event, false);
    // Step 3.
    return dispatch(event, this);
  }

  /** https://dom.spec.whatwg.org/#get-the-parent */
  _getTheParent(_event: Event): EventTarget | null {
    return null;
  }
}

setToStringTag(EventTarget);

// WebIDL: attributes and operations are enumerable prototype members.
exposeMembers(EventTarget);
