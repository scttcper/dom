// Port of @testing-library/dom src/event-map.js (MIT).
// https://github.com/testing-library/dom-testing-library/blob/main/src/event-map.js

export interface EventMapEntry {
  EventType: string;
  defaultInit: Record<string, unknown>;
}

// Upstream's table, written as runs of consecutive events with the same interface and init:
// [EventType, init flags, event names]. Flags: 1 bubbles, 2 cancelable, 4 `composed: true`,
// 8 `charCode: 0`, 16 `button: 0`; defaultInit keys come out in upstream's order (bubbles,
// cancelable, charCode/button, composed).
// oxfmt-ignore
const RUNS: [EventType: string, flags: number, names: string][] = [
  // Clipboard Events
  ["ClipboardEvent", 7, "copy cut paste"],
  // Composition Events
  ["CompositionEvent", 7, "compositionEnd compositionStart compositionUpdate"],
  // Keyboard Events
  ["KeyboardEvent", 15, "keyDown keyPress keyUp"],
  // Focus Events
  ["FocusEvent", 4, "focus blur"],
  ["FocusEvent", 5, "focusIn focusOut"],
  // Form Events
  ["Event", 1, "change"],
  ["InputEvent", 5, "input"],
  ["Event", 2, "invalid"],
  ["Event", 3, "submit reset"],
  // Mouse Events
  ["MouseEvent", 23, "click"],
  ["MouseEvent", 7, "contextMenu dblClick"],
  ["DragEvent", 7, "drag"],
  ["DragEvent", 5, "dragEnd"],
  ["DragEvent", 7, "dragEnter"],
  ["DragEvent", 5, "dragExit dragLeave"],
  ["DragEvent", 7, "dragOver dragStart drop"],
  ["MouseEvent", 7, "mouseDown"],
  ["MouseEvent", 4, "mouseEnter mouseLeave"],
  ["MouseEvent", 7, "mouseMove mouseOut mouseOver mouseUp"],
  // Selection Events
  ["Event", 1, "select"],
  // Touch Events
  ["TouchEvent", 5, "touchCancel"],
  ["TouchEvent", 7, "touchEnd touchMove touchStart"],
  // UI Events
  ["UIEvent", 0, "resize scroll"],
  // Wheel Events
  ["WheelEvent", 7, "wheel"],
  // Media Events
  ["Event", 0, "abort canPlay canPlayThrough durationChange emptied encrypted ended loadedData loadedMetadata"],
  ["ProgressEvent", 0, "loadStart"],
  ["Event", 0, "pause play playing"],
  ["ProgressEvent", 0, "progress"],
  ["Event", 0, "rateChange seeked seeking stalled suspend timeUpdate volumeChange waiting"],
  // Events
  // TODO: load events can be UIEvent or Event depending on what generated them
  // This is where this abstraction breaks down.
  // But the common targets are <img />, <script /> and window.
  // Neither of these targets receive a UIEvent
  ["Event", 0, "load error"],
  // Animation Events
  ["AnimationEvent", 1, "animationStart animationEnd animationIteration"],
  // Transition Events
  ["TransitionEvent", 1, "transitionCancel"],
  ["TransitionEvent", 3, "transitionEnd"],
  ["TransitionEvent", 1, "transitionRun transitionStart"],
  // pointer events
  ["PointerEvent", 7, "pointerOver"],
  ["PointerEvent", 0, "pointerEnter"],
  ["PointerEvent", 7, "pointerDown pointerMove pointerUp"],
  ["PointerEvent", 5, "pointerCancel"],
  ["PointerEvent", 7, "pointerOut"],
  ["PointerEvent", 0, "pointerLeave"],
  ["PointerEvent", 5, "gotPointerCapture lostPointerCapture"],
  // history events
  ["PopStateEvent", 1, "popState"],
  // window events
  ["Event", 0, "offline online"],
  ["PageTransitionEvent", 3, "pageHide pageShow"],
];

export const eventMap: Record<string, EventMapEntry> = {};
for (const [EventType, flags, names] of RUNS) {
  for (const name of names.split(" ")) {
    const defaultInit: Record<string, unknown> = { bubbles: (flags & 1) !== 0, cancelable: (flags & 2) !== 0 };
    if (flags & 8) defaultInit.charCode = 0;
    if (flags & 16) defaultInit.button = 0;
    if (flags & 4) defaultInit.composed = true;
    eventMap[name] = { EventType, defaultInit };
  }
}

export const eventAliasMap: Record<string, string> = {
  doubleClick: "dblClick",
};
