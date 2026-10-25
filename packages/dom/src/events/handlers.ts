// Event handler IDL attributes (`onclick`, `oninput`, ...).
// https://html.spec.whatwg.org/#event-handler-attributes
// https://html.spec.whatwg.org/#globaleventhandlers
// https://html.spec.whatwg.org/#windoweventhandlers
// https://html.spec.whatwg.org/#documentandelementeventhandlers
//
// Only the IDL attributes: setting `el.onclick = fn` registers one listener (the event handler
// processing algorithm) the first time and later sets just swap the stored function, so the
// listener keeps its original position among the target's listeners. Setting null removes it.
// Content attributes (`<button onclick="...">`) are never compiled (no script execution —
// docs/deviations.md).
//
// Owners call `installEventHandlers(proto, kind)` once per interface prototype:
//   HTMLElement.prototype, SVGElement.prototype (and MathMLElement) → "element"
//   HTMLBodyElement.prototype, HTMLFrameSetElement.prototype      → "body"
//   Document.prototype                                             → "document"
//   Window.prototype                                               → "window"

import type { EventTarget } from "./EventTarget.ts";
import { Event, setCanceledFlag } from "./Event.ts";
import { addEventListener, removeEventListener } from "./listeners.ts";
import { ErrorEvent, BeforeUnloadEvent } from "./events.ts";
import { isWindow } from "./UIEvents.ts";
import { $impl, $window } from "../keys.ts";

/** https://html.spec.whatwg.org/#globaleventhandlers (+ pointer, touch, animation, transition, selection events). */
// oxfmt-ignore
export const GLOBAL_EVENT_HANDLER_EVENTS: readonly string[] = [
  "abort", "auxclick", "beforeinput", "beforematch", "beforetoggle", "blur", "cancel", "canplay",
  "canplaythrough", "change", "click", "close", "command", "contextlost", "contextmenu",
  "contextrestored", "copy", "cuechange", "cut", "dblclick", "drag", "dragend", "dragenter",
  "dragleave", "dragover", "dragstart", "drop", "durationchange", "emptied", "ended", "error",
  "focus", "formdata", "input", "invalid", "keydown", "keypress", "keyup", "load", "loadeddata",
  "loadedmetadata", "loadstart", "mousedown", "mouseenter", "mouseleave", "mousemove", "mouseout",
  "mouseover", "mouseup", "paste", "pause", "play", "playing", "progress", "ratechange", "reset",
  "resize", "scroll", "scrollend", "securitypolicyviolation", "seeked", "seeking", "select",
  "slotchange", "stalled", "submit", "suspend", "timeupdate", "toggle", "volumechange", "waiting",
  "webkitanimationend", "webkitanimationiteration", "webkitanimationstart", "webkittransitionend",
  "wheel",
  // https://w3c.github.io/pointerevents/#extensions-to-the-globaleventhandlers-mixin
  "gotpointercapture", "lostpointercapture", "pointerdown", "pointermove", "pointerrawupdate",
  "pointerup", "pointercancel", "pointerover", "pointerout", "pointerenter", "pointerleave",
  // https://w3c.github.io/touch-events/#extensions-to-the-globaleventhandlers-mixin (jsdom exposes these too)
  "touchstart", "touchend", "touchmove", "touchcancel",
  // https://drafts.csswg.org/css-animations/#interface-globaleventhandlers-idl
  "animationstart", "animationiteration", "animationend", "animationcancel",
  // https://drafts.csswg.org/css-transitions/#interface-globaleventhandlers-idl
  "transitionrun", "transitionstart", "transitionend", "transitioncancel",
  // https://w3c.github.io/selection-api/#extensions-to-globaleventhandlers-interface
  "selectstart", "selectionchange",
];

/** https://html.spec.whatwg.org/#windoweventhandlers */
// oxfmt-ignore
export const WINDOW_EVENT_HANDLER_EVENTS: readonly string[] = [
  "afterprint", "beforeprint", "beforeunload", "hashchange", "languagechange", "message",
  "messageerror", "offline", "online", "pagehide", "pagereveal", "pageshow", "pageswap", "popstate",
  "rejectionhandled", "storage", "unhandledrejection", "unload",
];

/** GlobalEventHandlers members that body/frameset reflect from their Window. */
const WINDOW_REFLECTING_BODY_EVENTS: readonly string[] = ["blur", "error", "focus", "load", "resize", "scroll"];

/** Document-only handlers (https://html.spec.whatwg.org/#the-document-object). */
const DOCUMENT_EVENTS: readonly string[] = ["readystatechange", "visibilitychange"];

type Handler = ((...args: unknown[]) => unknown) | object;

class HandlerEntry {
  value: Handler | null;
  listener: ((event: Event) => void) | null;
  constructor() {
    this.value = null;
    this.listener = null;
  }
}

const handlerMaps = new WeakMap<EventTarget, Map<string, HandlerEntry>>();

/** https://html.spec.whatwg.org/#the-event-handler-processing-algorithm */
function makeProcessingListener(entry: HandlerEntry): (event: Event) => void {
  return function (this: EventTarget, event: Event): void {
    const value = entry.value;
    if (typeof value !== "function") return;
    const callback = value as (this: unknown, ...args: unknown[]) => unknown;
    const s = event._s;
    const currentTarget = s.currentTarget;
    // Step 4: special error event handling.
    if (event instanceof ErrorEvent && s.type === "error" && isWindow(currentTarget)) {
      const ret = callback.call(currentTarget, event.message, event.filename, event.lineno, event.colno, event.error);
      if (ret === true) setCanceledFlag(s);
      return;
    }
    const ret = callback.call(currentTarget, event);
    // Step 5: process the return value.
    if (event instanceof BeforeUnloadEvent && s.type === "beforeunload") {
      if (ret !== null && ret !== undefined) {
        setCanceledFlag(s);
        if (event.returnValue === "") event.returnValue = String(ret);
      }
    } else if (ret === false) {
      setCanceledFlag(s);
    }
  };
}

/** https://html.spec.whatwg.org/#getting-the-current-value-of-the-event-handler */
export function getEventHandler(target: EventTarget, type: string): Handler | null {
  const map = handlerMaps.get(target);
  if (map === undefined) return null;
  return map.get(type)?.value ?? null;
}

/** https://html.spec.whatwg.org/#event-handler-idl-attributes (setter) */
export function setEventHandler(target: EventTarget, type: string, value: unknown): void {
  // [LegacyTreatNonObjectAsNull]
  const handler =
    value !== null && (typeof value === "object" || typeof value === "function") ? (value as Handler) : null;
  let map = handlerMaps.get(target);
  if (handler === null) {
    // Deactivate: https://html.spec.whatwg.org/#deactivate-an-event-handler
    const entry = map?.get(type);
    if (entry === undefined) return;
    entry.value = null;
    if (entry.listener !== null) {
      removeEventListener(target, type, entry.listener, false);
      entry.listener = null;
    }
    return;
  }
  if (map === undefined) handlerMaps.set(target, (map = new Map()));
  let entry = map.get(type);
  if (entry === undefined) map.set(type, (entry = new HandlerEntry()));
  entry.value = handler;
  // Activate: https://html.spec.whatwg.org/#activate-an-event-handler
  if (entry.listener === null) {
    entry.listener = makeProcessingListener(entry);
    addEventListener(target, type, entry.listener, false);
  }
}

type HandlerAccessor = { get(this: EventTarget): unknown; set(this: EventTarget, value: unknown): void };

/** Accessors without target resolution, shared by every prototype that installs `type`. */
const directAccessors = new Map<string, HandlerAccessor>();

function handlerAccessor(type: string, resolve: ((self: EventTarget) => EventTarget | null) | null): HandlerAccessor {
  if (resolve === null) {
    let a = directAccessors.get(type);
    if (a === undefined) {
      a = {
        get(this: EventTarget) {
          return getEventHandler(this, type);
        },
        set(this: EventTarget, value: unknown) {
          setEventHandler(this, type, value);
        },
      };
      directAccessors.set(type, a);
    }
    return a;
  }
  return {
    get(this: EventTarget) {
      const target = resolve(this);
      return target === null ? null : getEventHandler(target, type);
    },
    set(this: EventTarget, value: unknown) {
      const target = resolve(this);
      if (target !== null) setEventHandler(target, type, value);
    },
  };
}

/**
 * Handlers whose event handler event type differs from the name after "on": the legacy prefixed
 * animation/transition handlers listen for the camel-cased types
 * (https://html.spec.whatwg.org/#event-handlers-on-elements,-document-objects,-and-window-objects).
 */
const HANDLER_EVENT_TYPES: Readonly<Record<string, string>> = {
  webkitanimationend: "webkitAnimationEnd",
  webkitanimationiteration: "webkitAnimationIteration",
  webkitanimationstart: "webkitAnimationStart",
  webkittransitionend: "webkitTransitionEnd",
};

function addHandler(
  descriptors: PropertyDescriptorMap,
  name: string,
  resolve: ((self: EventTarget) => EventTarget | null) | null,
): void {
  const { get, set } = handlerAccessor(HANDLER_EVENT_TYPES[name] ?? name, resolve);
  descriptors["on" + name] = { configurable: true, enumerable: true, get, set };
}

/** https://html.spec.whatwg.org/#determining-the-target-of-an-event-handler (body/frameset → Window). */
function bodyWindow(self: EventTarget): EventTarget | null {
  const impl = (self as unknown as { [$impl]?: { doc: { [$window]: EventTarget | null } } })[$impl];
  return impl === undefined ? null : impl.doc[$window];
}

export type EventHandlersKind = "element" | "body" | "document" | "window";

/** Install the `on*` IDL attributes for an interface prototype (see the header comment). */
export function installEventHandlers(proto: object, kind: EventHandlersKind): void {
  // One defineProperties call per prototype (startup: about half the cost of one call per name).
  const descriptors: PropertyDescriptorMap = {};
  if (kind === "body") {
    for (const type of WINDOW_REFLECTING_BODY_EVENTS) addHandler(descriptors, type, bodyWindow);
    for (const type of WINDOW_EVENT_HANDLER_EVENTS) addHandler(descriptors, type, bodyWindow);
  } else {
    for (const type of GLOBAL_EVENT_HANDLER_EVENTS) addHandler(descriptors, type, null);
    if (kind === "window") for (const type of WINDOW_EVENT_HANDLER_EVENTS) addHandler(descriptors, type, null);
    if (kind === "document") for (const type of DOCUMENT_EVENTS) addHandler(descriptors, type, null);
  }
  Object.defineProperties(proto, descriptors);
}
