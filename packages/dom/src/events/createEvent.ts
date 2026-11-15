// https://dom.spec.whatwg.org/#dom-document-createevent
//
// `Document.prototype.createEvent` calls `createEvent(interfaceName)`.

import { EF_INITIALIZED, Event, setInternalConstruct } from "./Event.ts";
import { asciiLowercase } from "../nodes/attributes.ts";
import {
  CompositionEvent,
  DragEvent,
  FocusEvent,
  KeyboardEvent,
  MouseEvent,
  TextEvent,
  TouchEvent,
  UIEvent,
} from "./UIEvents.ts";
import { BeforeUnloadEvent, CustomEvent, HashChangeEvent, MessageEvent, StorageEvent } from "./events.ts";

type AnyEventCtor = new (type: string) => Event;

// Step 2 table (keys are ASCII-lowercased interface names).
const TABLE: Record<string, AnyEventCtor | null> = {
  __proto__: null as unknown as AnyEventCtor,
  beforeunloadevent: BeforeUnloadEvent as unknown as AnyEventCtor,
  compositionevent: CompositionEvent,
  customevent: CustomEvent,
  devicemotionevent: null,
  deviceorientationevent: null,
  dragevent: DragEvent,
  event: Event,
  events: Event,
  focusevent: FocusEvent,
  hashchangeevent: HashChangeEvent,
  htmlevents: Event,
  keyboardevent: KeyboardEvent,
  messageevent: MessageEvent,
  mouseevent: MouseEvent,
  mouseevents: MouseEvent,
  storageevent: StorageEvent,
  svgevents: Event,
  textevent: TextEvent,
  touchevent: TouchEvent,
  uievent: UIEvent,
  uievents: UIEvent,
};

/** https://dom.spec.whatwg.org/#dom-document-createevent */
export function createEvent(interfaceName: string): Event {
  // Steps 1-3.
  const ctor = TABLE[asciiLowercase(String(interfaceName))];
  if (ctor === undefined || ctor === null) {
    throw new DOMException(
      `Failed to execute 'createEvent' on 'Document': The provided event type ('${interfaceName}') is invalid.`,
      "NotSupportedError",
    );
  }
  // Step 4: create an event (no constructor steps beyond defaults). Steps 5-7: type "",
  // timeStamp now, isTrusted false, initialized flag unset.
  const prev = setInternalConstruct(true);
  let event: Event;
  try {
    event = new ctor("");
  } finally {
    setInternalConstruct(prev);
  }
  event._s.flags &= ~EF_INITIALIZED;
  return event;
}
