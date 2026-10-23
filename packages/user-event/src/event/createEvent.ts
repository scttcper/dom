// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/event/createEvent.ts

import type {ClipboardEvent, ClipboardEventInit, Element, Event, EventInit, EventModifierInit, FocusEvent, FocusEventInit, InputEvent, InputEventInit, KeyboardEvent, KeyboardEventInit, MouseEvent, MouseEventInit, PointerEvent, PointerEventInit, UIEvent, UIEventInit, Window} from '../dom-types.ts'
import {getWindow} from '../utils/index.ts'
import {implOf} from '../rtd.ts'
import {eventMap} from './eventMap.ts'
import {
  type EventType,
  type EventTypeInit,
  type FixedDocumentEventMap,
} from './types.ts'

interface InterfaceMap {
  ClipboardEvent: {type: ClipboardEvent, init: ClipboardEventInit}
  InputEvent: {type: InputEvent, init: InputEventInit}
  MouseEvent: {type: MouseEvent, init: MouseEventInit}
  PointerEvent: {type: PointerEvent, init: PointerEventInit}
  KeyboardEvent: {type: KeyboardEvent, init: KeyboardEventInit}
  FocusEvent: {type: FocusEvent, init: FocusEventInit}
}
type InterfaceNames = typeof eventMap[keyof typeof eventMap]['EventType']
type Interface<k extends InterfaceNames> = k extends keyof InterfaceMap
  ? InterfaceMap[k]
  : never

const eventInitializer: {
  [k in InterfaceNames]: Array<
    (e: Interface<k>['type'], i: Interface<k>['init']) => void
  >
} = {
  ClipboardEvent: [initClipboardEvent],
  Event: [],
  FocusEvent: [initUIEvent, initFocusEvent],
  InputEvent: [initUIEvent, initInputEvent],
  MouseEvent: [initUIEvent, initUIEventModifiers, initMouseEvent],
  PointerEvent: [
    initUIEvent,
    initUIEventModifiers,
    initMouseEvent,
    initPointerEvent,
  ],
  KeyboardEvent: [initUIEvent, initUIEventModifiers, initKeyboardEvent],
}

/** Supplies the UIEvent modifier members (System.assignUIEventModifiers). */
interface ModifierSource {
  assignUIEventModifiers(init: Record<string, unknown>): void
}

export function createEvent<K extends EventType>(
  type: K,
  target: Element,
  init?: EventTypeInit<K>,
  modifiers?: ModifierSource,
) {
  const window = getWindow(target)
  const {EventType, defaultInit} = eventMap[type]
  const constructors = getEventConstructors(window)

  if (modifiers !== undefined && (implOf(target) === null || constructors.fallbacks.has(EventType))) {
    // Upstream's path reads the members from `init`: merge like upstream's dispatchUIEvent.
    const merged = {...init} as Record<string, unknown>
    modifiers.assignUIEventModifiers(merged)
    init = merged as unknown as EventTypeInit<K>
    modifiers = undefined
  }

  // A fallback class (the window lacks the interface, e.g. PointerEvent under
  // jest-environment-rtd's jsdom 26 parity) takes upstream's path: its native superclass
  // constructor would drop the members only the initializers set (pointerType, width, ...).
  if (implOf(target) !== null && !constructors.fallbacks.has(EventType)) {
    return createNativeEvent(constructors[EventType], EventType, type, defaultInit, init, modifiers) as FixedDocumentEventMap[K]
  }

  const event = new constructors[EventType](type, defaultInit)
  const initializers = eventInitializer[EventType]
  for (let i = 0; i < initializers.length; i++) {
    initializers[i](event as never, (init ?? {}) as never)
  }

  return event as FixedDocumentEventMap[K]
}

/**
 * @rtd/dom path: its event constructors implement the full UI Events / Pointer Events /
 * Input Events / Clipboard API init dictionaries, so the event is created in one constructor
 * call instead of upstream's ~20 `Object.defineProperty` overrides per event (which also turn
 * every event into a dictionary-mode object).
 *
 * Observable parity with upstream's `assignProps`:
 * - `bubbles`/`cancelable`/`composed` always come from the event map, never from `init`.
 * - Missing numeric members are 0, `pointerType` defaults to '', `width`/`height` to 1,
 *   `pressure` to 0.5 while a button is pressed and 0 otherwise; a missing `inputType`,
 *   `key` or `code` is the string "undefined" (upstream uses `String(value)`).
 * - `x`/`y` are aliases of `clientX`/`clientY` (natively so); the layout-dependent
 *   `offsetX/offsetY/pageX/pageY` (not part of MouseEventInit) are set as own properties when
 *   given, exactly like upstream; otherwise they keep the native values (0 without layout).
 *
 * TODO(user-event): re-verify against the events agent's final constructors (charCode on
 * KeyboardEventInit, modifier* members on EventModifierInit, clipboardData on ClipboardEventInit).
 */
function createNativeEvent(
  Ctor: new (type: string, init: object) => Event,
  eventInterface: string,
  type: string,
  defaultInit: EventInit,
  init: object | undefined,
  modifiers: ModifierSource | undefined,
): Event {
  const i = (init ?? {}) as PointerEventInit & KeyboardEventInit & InputEventInit & ClipboardEventInit & {
    x?: number
    y?: number
    offsetX?: number
    offsetY?: number
    pageX?: number
    pageY?: number
  }
  const dict: Record<string, unknown> = {...i}
  modifiers?.assignUIEventModifiers(dict)
  dict.bubbles = defaultInit.bubbles
  dict.cancelable = defaultInit.cancelable
  dict.composed = defaultInit.composed
  if (i.clientX === undefined && i.x !== undefined) dict.clientX = i.x
  if (i.clientY === undefined && i.y !== undefined) dict.clientY = i.y
  if (i.pressure === undefined) dict.pressure = i.buttons ? 0.5 : 0
  // Upstream stringifies these with `String(x)`, so a missing value reads as "undefined"
  // (e.g. `inputType` of the `input` events fired by selectOptions/upload).
  if (eventInterface === 'InputEvent' && i.inputType === undefined) dict.inputType = 'undefined'
  if (eventInterface === 'KeyboardEvent') {
    if (i.key === undefined) dict.key = 'undefined'
    if (i.code === undefined) dict.code = 'undefined'
  }
  const event = new Ctor(type, dict)
  if (i.offsetX !== undefined) Object.defineProperty(event, 'offsetX', {value: Number(i.offsetX)})
  if (i.offsetY !== undefined) Object.defineProperty(event, 'offsetY', {value: Number(i.offsetY)})
  if (i.pageX !== undefined) Object.defineProperty(event, 'pageX', {value: Number(i.pageX)})
  if (i.pageY !== undefined) Object.defineProperty(event, 'pageY', {value: Number(i.pageY)})
  return event
}

const constructorCache = new WeakMap<object, ReturnType<typeof buildEventConstructors>>()

function getEventConstructors(window: Window) {
  let constructors = constructorCache.get(window)
  if (constructors === undefined) {
    constructors = buildEventConstructors(window)
    constructorCache.set(window, constructors)
  }
  return constructors
}

/* istanbul ignore next */
function buildEventConstructors(window: Window) {
  // Interfaces the window lacks (replaced by the classes below).
  const fallbacks = new Set<string>()
  for (const name of ['Event', 'AnimationEvent', 'ClipboardEvent', 'PopStateEvent', 'ProgressEvent', 'TransitionEvent', 'UIEvent', 'CompositionEvent', 'FocusEvent', 'InputEvent', 'KeyboardEvent', 'MouseEvent', 'DragEvent', 'PointerEvent', 'TouchEvent'] as const) {
    if (window[name] === undefined) fallbacks.add(name)
  }
  const Event = window.Event ?? class Event {}
  const AnimationEvent =
    window.AnimationEvent ?? class AnimationEvent extends Event {}
  const ClipboardEvent =
    window.ClipboardEvent ?? class ClipboardEvent extends Event {}
  const PopStateEvent =
    window.PopStateEvent ?? class PopStateEvent extends Event {}
  const ProgressEvent =
    window.ProgressEvent ?? class ProgressEvent extends Event {}
  const TransitionEvent =
    window.TransitionEvent ?? class TransitionEvent extends Event {}
  const UIEvent = window.UIEvent ?? class UIEvent extends Event {}
  const CompositionEvent =
    window.CompositionEvent ?? class CompositionEvent extends UIEvent {}
  const FocusEvent = window.FocusEvent ?? class FocusEvent extends UIEvent {}
  const InputEvent = window.InputEvent ?? class InputEvent extends UIEvent {}
  const KeyboardEvent =
    window.KeyboardEvent ?? class KeyboardEvent extends UIEvent {}
  const MouseEvent = window.MouseEvent ?? class MouseEvent extends UIEvent {}
  const DragEvent = window.DragEvent ?? class DragEvent extends MouseEvent {}
  const PointerEvent =
    window.PointerEvent ?? class PointerEvent extends MouseEvent {}
  const TouchEvent = window.TouchEvent ?? class TouchEvent extends UIEvent {}

  return {
    fallbacks,
    Event,
    AnimationEvent,
    ClipboardEvent,
    PopStateEvent,
    ProgressEvent,
    TransitionEvent,
    UIEvent,
    CompositionEvent,
    FocusEvent,
    InputEvent,
    KeyboardEvent,
    MouseEvent,
    DragEvent,
    PointerEvent,
    TouchEvent,
  }
}

function assignProps<T extends object>(obj: T, props: {[k in keyof T]?: T[k]}) {
  for (const [key, value] of Object.entries(props)) {
    Object.defineProperty(obj, key, {get: () => value ?? null})
  }
}

function sanitizeNumber(n: number | undefined) {
  return Number(n ?? 0)
}

function initClipboardEvent(
  event: ClipboardEvent,
  {clipboardData}: ClipboardEventInit,
) {
  assignProps(event, {
    clipboardData,
  })
}

function initFocusEvent(event: FocusEvent, {relatedTarget}: FocusEventInit) {
  assignProps(event, {
    relatedTarget,
  })
}

function initInputEvent(
  event: InputEvent,
  {data, inputType, isComposing}: InputEventInit,
) {
  assignProps(event, {
    data,
    isComposing: Boolean(isComposing),
    inputType: String(inputType),
  })
}

function initUIEvent(event: UIEvent, {view, detail}: UIEventInit) {
  assignProps(event, {
    view,
    detail: sanitizeNumber(detail ?? 0),
  })
}

function initUIEventModifiers(
  event: KeyboardEvent | MouseEvent,
  {
    altKey,
    ctrlKey,
    metaKey,
    shiftKey,
    modifierAltGraph,
    modifierCapsLock,
    modifierFn,
    modifierFnLock,
    modifierNumLock,
    modifierScrollLock,
    modifierSymbol,
    modifierSymbolLock,
  }: EventModifierInit,
) {
  assignProps(event, {
    altKey: Boolean(altKey),
    ctrlKey: Boolean(ctrlKey),
    metaKey: Boolean(metaKey),
    shiftKey: Boolean(shiftKey),
    getModifierState(k: string) {
      return Boolean(
        {
          Alt: altKey,
          AltGraph: modifierAltGraph,
          CapsLock: modifierCapsLock,
          Control: ctrlKey,
          Fn: modifierFn,
          FnLock: modifierFnLock,
          Meta: metaKey,
          NumLock: modifierNumLock,
          ScrollLock: modifierScrollLock,
          Shift: shiftKey,
          Symbol: modifierSymbol,
          SymbolLock: modifierSymbolLock,
        }[k],
      )
    },
  })
}

function initKeyboardEvent(
  event: KeyboardEvent,
  {
    key,
    code,
    location,
    repeat,
    isComposing,
    charCode, // `charCode` is necessary for React17 `keypress`
  }: KeyboardEventInit,
) {
  assignProps(event, {
    key: String(key),
    code: String(code),
    location: sanitizeNumber(location),
    repeat: Boolean(repeat),
    isComposing: Boolean(isComposing),
    charCode,
  })
}

function initMouseEvent(
  event: MouseEvent,
  {
    x,
    y,
    screenX,
    screenY,
    clientX = x,
    clientY = y,
    button,
    buttons,
    relatedTarget,
    offsetX,
    offsetY,
    pageX,
    pageY,
  }: MouseEventInit &
    Partial<
      Pick<MouseEvent, 'x' | 'y' | 'offsetX' | 'offsetY' | 'pageX' | 'pageY'>
    >,
) {
  assignProps(event, {
    screenX: sanitizeNumber(screenX),
    screenY: sanitizeNumber(screenY),
    clientX: sanitizeNumber(clientX),
    x: sanitizeNumber(clientX),
    clientY: sanitizeNumber(clientY),
    y: sanitizeNumber(clientY),
    button: sanitizeNumber(button),
    buttons: sanitizeNumber(buttons),
    relatedTarget,
    offsetX: sanitizeNumber(offsetX),
    offsetY: sanitizeNumber(offsetY),
    pageX: sanitizeNumber(pageX),
    pageY: sanitizeNumber(pageY),
  })
}

function initPointerEvent(
  event: PointerEvent,
  {
    pointerId,
    width,
    height,
    pressure,
    tangentialPressure,
    tiltX,
    tiltY,
    twist,
    pointerType,
    isPrimary,
    buttons,
  }: PointerEventInit,
) {
  assignProps(event, {
    pointerId: sanitizeNumber(pointerId),
    width: sanitizeNumber(width ?? 1),
    height: sanitizeNumber(height ?? 1),
    pressure: sanitizeNumber(pressure ?? (buttons ? 0.5 : 0)),
    tangentialPressure: sanitizeNumber(tangentialPressure),
    tiltX: sanitizeNumber(tiltX),
    tiltY: sanitizeNumber(tiltY),
    twist: sanitizeNumber(twist),
    pointerType: String(pointerType ?? ''),
    isPrimary: Boolean(isPrimary),
  })
}
