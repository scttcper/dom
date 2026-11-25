// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/event/eventMap.ts
//
// Ours: the entries share their `defaultInit` objects (read-only: createEvent passes them to
// constructors and reads their members) and are built by one helper, instead of a separate
// literal per event type.

import {type EventType} from './types.ts'

const bubblesCancelableComposed = {
  bubbles: true,
  cancelable: true,
  composed: true,
} as const
const bubblesComposed = {
  bubbles: true,
  cancelable: false,
  composed: true,
} as const
const composedOnly = {
  bubbles: false,
  cancelable: false,
  composed: true,
} as const
const uncomposed = {bubbles: false, cancelable: false} as const

/** One entry: the interface createEvent constructs and the EventInit it passes. */
function entry<const I extends string, const D extends object>(
  EventType: I,
  defaultInit: D,
) {
  return {EventType, defaultInit}
}

export const eventMap = {
  auxclick: entry('PointerEvent', bubblesCancelableComposed),
  beforeinput: entry('InputEvent', bubblesCancelableComposed),
  blur: entry('FocusEvent', composedOnly),
  click: entry('PointerEvent', bubblesCancelableComposed),
  contextmenu: entry('PointerEvent', bubblesCancelableComposed),
  copy: entry('ClipboardEvent', bubblesCancelableComposed),
  change: entry('Event', {bubbles: true, cancelable: false}),
  cut: entry('ClipboardEvent', bubblesCancelableComposed),
  dblclick: entry('MouseEvent', bubblesCancelableComposed),
  focus: entry('FocusEvent', composedOnly),
  focusin: entry('FocusEvent', bubblesComposed),
  focusout: entry('FocusEvent', bubblesComposed),
  keydown: entry('KeyboardEvent', bubblesCancelableComposed),
  keypress: entry('KeyboardEvent', bubblesCancelableComposed),
  keyup: entry('KeyboardEvent', bubblesCancelableComposed),
  paste: entry('ClipboardEvent', bubblesCancelableComposed),
  input: entry('InputEvent', bubblesComposed),
  mousedown: entry('MouseEvent', bubblesCancelableComposed),
  mouseenter: entry('MouseEvent', composedOnly),
  mouseleave: entry('MouseEvent', composedOnly),
  mousemove: entry('MouseEvent', bubblesCancelableComposed),
  mouseout: entry('MouseEvent', bubblesCancelableComposed),
  mouseover: entry('MouseEvent', bubblesCancelableComposed),
  mouseup: entry('MouseEvent', bubblesCancelableComposed),
  pointerover: entry('PointerEvent', bubblesCancelableComposed),
  pointerenter: entry('PointerEvent', uncomposed),
  pointerdown: entry('PointerEvent', bubblesCancelableComposed),
  pointermove: entry('PointerEvent', bubblesCancelableComposed),
  pointerup: entry('PointerEvent', bubblesCancelableComposed),
  pointercancel: entry('PointerEvent', bubblesComposed),
  pointerout: entry('PointerEvent', bubblesCancelableComposed),
  pointerleave: entry('PointerEvent', uncomposed),
  submit: entry('Event', {bubbles: true, cancelable: true}),
}

function getEventClass(type: EventType) {
  return eventMap[type].EventType
}

const mouseEvents = ['MouseEvent', 'PointerEvent']
export function isMouseEvent(type: EventType) {
  return mouseEvents.includes(getEventClass(type))
}

export function isKeyboardEvent(type: EventType) {
  return getEventClass(type) === 'KeyboardEvent'
}
