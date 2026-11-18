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
