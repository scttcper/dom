// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/event/createEvent.ts

import type {
  ClipboardEvent,
  ClipboardEventInit,
  Element,
  Event,
  EventInit,
  EventModifierInit,
  FocusEvent,
  FocusEventInit,
  InputEvent,
  InputEventInit,
  KeyboardEvent,
  KeyboardEventInit,
  MouseEvent,
  MouseEventInit,
  PointerEvent,
  PointerEventInit,
  UIEvent,
  UIEventInit,
  Window,
} from '../dom-types.ts'
import {getWindow} from '../utils/index.ts'
import {implOf} from '../ctrl-dom.ts'
import {eventMap} from './eventMap.ts'
import {
  type EventType,
  type EventTypeInit,
  type FixedDocumentEventMap,
} from './types.ts'

interface InterfaceMap {
  ClipboardEvent: {type: ClipboardEvent; init: ClipboardEventInit}
  InputEvent: {type: InputEvent; init: InputEventInit}
  MouseEvent: {type: MouseEvent; init: MouseEventInit}
  PointerEvent: {type: PointerEvent; init: PointerEventInit}
  KeyboardEvent: {type: KeyboardEvent; init: KeyboardEventInit}
  FocusEvent: {type: FocusEvent; init: FocusEventInit}
}
type InterfaceNames = (typeof eventMap)[keyof typeof eventMap]['EventType']
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

/** The keyboard's modifier state (KeyboardHost.modifiers). */
interface ModifierFlags {
  Alt: boolean
  AltGraph: boolean
  CapsLock: boolean
  Control: boolean
  Fn: boolean
  FnLock: boolean
  Meta: boolean
  NumLock: boolean
  ScrollLock: boolean
  Shift: boolean
  Symbol: boolean
  SymbolLock: boolean
}

/** Supplies the UIEvent modifier members (the System). */
interface ModifierSource {
  assignUIEventModifiers(init: Record<string, unknown>): void
  readonly keyboard: {readonly modifiers: ModifierFlags}
}

export function createEvent<K extends EventType>(
  type: K,
  target: Element,
  init?: EventTypeInit<K>,
  modifiers?: ModifierSource,
) {
  const window = getWindow(target)
  const {EventType, defaultInit} = eventMap[type]
  const {fallbacks, constructors} = getEventConstructors(window)

  // A fallback class (the window lacks the interface, e.g. PointerEvent under
  // @ctrl/dom-jest-environment's jsdom 26 parity) takes upstream's path: its native superclass
  // constructor would drop the members only the initializers set (pointerType, width, ...).
  if (implOf(target) !== null && !fallbacks.has(EventType)) {
    return createNativeEvent(
      constructors[EventType],
      EventType,
      type,
      defaultInit,
      init,
      modifiers,
    ) as FixedDocumentEventMap[K]
  }

  if (modifiers !== undefined) {
    // Upstream's path reads the members from `init`: merge like upstream's dispatchUIEvent.
    const merged = {...init} as Record<string, unknown>
    modifiers.assignUIEventModifiers(merged)
    init = merged as unknown as EventTypeInit<K>
  }

  const event = new constructors[EventType](type, defaultInit)
  const initializers = eventInitializer[EventType]
  for (let i = 0; i < initializers.length; i++) {
    initializers[i](event as never, (init ?? {}) as never)
  }

  return event as FixedDocumentEventMap[K]
}

/**
 * @ctrl/dom path: its event constructors implement the full UI Events / Pointer Events /
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
  Ctor: EventConstructor,
  eventInterface: string,
  type: string,
  defaultInit: EventInit,
  init: object | undefined,
  modifiers: ModifierSource | undefined,
): Event {
  const i = (init ?? {}) as NativeInit
  const m = modifiers?.keyboard.modifiers
  let dict: object
  switch (eventInterface) {
    case 'KeyboardEvent':
      dict = new KeyboardEventDict(i, defaultInit, m)
      break
    case 'MouseEvent':
      dict = new MouseEventDict(i, defaultInit, m)
      break
    case 'PointerEvent':
      dict = new PointerEventDict(i, defaultInit, m)
      break
    case 'InputEvent':
      dict = new InputEventDict(i, defaultInit)
      break
    default:
      // FocusEvent, ClipboardEvent, Event: dispatchUIEvent passes modifiers only for mouse and
      // keyboard events, and these constructors read no modifier, coordinate or pressure member.
      dict = {
        ...i,
        bubbles: defaultInit.bubbles,
        cancelable: defaultInit.cancelable,
        composed: defaultInit.composed,
      }
  }
  const event = new Ctor(type, dict)
  setLayoutMembers(event, i)
  return event
}

type LayoutInit = {
  offsetX?: unknown
  offsetY?: unknown
  pageX?: unknown
  pageY?: unknown
}

function setLayoutMembers(event: Event, i: LayoutInit) {
  if (i.offsetX !== undefined)
    Object.defineProperty(event, 'offsetX', {value: Number(i.offsetX)})
  if (i.offsetY !== undefined)
    Object.defineProperty(event, 'offsetY', {value: Number(i.offsetY)})
  if (i.pageX !== undefined)
    Object.defineProperty(event, 'pageX', {value: Number(i.pageX)})
  if (i.pageY !== undefined)
    Object.defineProperty(event, 'pageY', {value: Number(i.pageY)})
}

// Init dictionaries for the interfaces user-event dispatches most, with one shape each: every
// member @ctrl/dom's constructor reads, in a fixed order, so its reads stay monomorphic (a spread
// of `init` plus the overrides made a different, dictionary-sized object at every call site).
// Classes so the members the interfaces share are written once: V8 sizes an instance for every
// `this.x =` of its constructor chain, so each dictionary is one in-object allocation, like a
// literal. Same values as the generic path: `init`'s members, the System's modifiers over
// `init`'s (Hyper and Super are not System modifiers), the event map's bubbles/cancelable/
// composed, the defaults applied above. Upstream stringifies `key`, `code` and `inputType` with
// `String(x)`, so a missing one reads as "undefined" (`inputType` of the `input` events
// selectOptions/upload fire). test/event/native-dicts.test.ts pins the member lists against the
// constructors' reads.

type NativeInit = Record<string, unknown>

/** UIEventInit members, with EventInit's from the event map. */
class UIEventDict {
  [member: string]: unknown
  constructor(i: NativeInit, d: EventInit) {
    this.bubbles = d.bubbles
    this.cancelable = d.cancelable
    this.composed = d.composed
    this.view = i.view
    this.detail = i.detail
    this.which = i.which
  }
}

/** EventModifierInit members (with UIEventInit's). */
class ModifierEventDict extends UIEventDict {
  constructor(i: NativeInit, d: EventInit, m: ModifierFlags | undefined) {
    super(i, d)
    const fromInit = m === undefined
    this.ctrlKey = fromInit ? i.ctrlKey : m.Control
    this.shiftKey = fromInit ? i.shiftKey : m.Shift
    this.altKey = fromInit ? i.altKey : m.Alt
    this.metaKey = fromInit ? i.metaKey : m.Meta
    this.modifierAltGraph = fromInit ? i.modifierAltGraph : m.AltGraph
    this.modifierCapsLock = fromInit ? i.modifierCapsLock : m.CapsLock
    this.modifierFn = fromInit ? i.modifierFn : m.Fn
    this.modifierFnLock = fromInit ? i.modifierFnLock : m.FnLock
    this.modifierHyper = i.modifierHyper
    this.modifierNumLock = fromInit ? i.modifierNumLock : m.NumLock
    this.modifierScrollLock = fromInit ? i.modifierScrollLock : m.ScrollLock
    this.modifierSuper = i.modifierSuper
    this.modifierSymbol = fromInit ? i.modifierSymbol : m.Symbol
    this.modifierSymbolLock = fromInit ? i.modifierSymbolLock : m.SymbolLock
  }
}

/** @internal KeyboardEventInit members (with EventModifierInit's). */
export class KeyboardEventDict extends ModifierEventDict {
  constructor(i: NativeInit, d: EventInit, m: ModifierFlags | undefined) {
    super(i, d, m)
    this.key = i.key === undefined ? 'undefined' : i.key
    this.code = i.code === undefined ? 'undefined' : i.code
    this.location = i.location
    this.repeat = i.repeat
    this.isComposing = i.isComposing
    this.charCode = i.charCode
    this.keyCode = i.keyCode
  }
}

/** @internal MouseEventInit members (with EventModifierInit's). */
export class MouseEventDict extends ModifierEventDict {
  constructor(i: NativeInit, d: EventInit, m: ModifierFlags | undefined) {
    super(i, d, m)
    this.screenX = i.screenX
    this.screenY = i.screenY
    this.clientX = i.clientX === undefined ? i.x : i.clientX
    this.clientY = i.clientY === undefined ? i.y : i.clientY
    this.button = i.button
    this.buttons = i.buttons
    this.movementX = i.movementX
    this.movementY = i.movementY
    this.relatedTarget = i.relatedTarget
  }
}

/** @internal PointerEventInit members (with MouseEventInit's). */
export class PointerEventDict extends MouseEventDict {
  constructor(i: NativeInit, d: EventInit, m: ModifierFlags | undefined) {
    super(i, d, m)
    this.pointerId = i.pointerId
    this.width = i.width
    this.height = i.height
    this.pressure =
      i.pressure === undefined ? (i.buttons ? 0.5 : 0) : i.pressure
    this.tangentialPressure = i.tangentialPressure
    this.tiltX = i.tiltX
    this.tiltY = i.tiltY
    this.altitudeAngle = i.altitudeAngle
    this.azimuthAngle = i.azimuthAngle
    this.twist = i.twist
    this.pointerType = i.pointerType
    this.isPrimary = i.isPrimary
    this.persistentDeviceId = i.persistentDeviceId
    this.coalescedEvents = i.coalescedEvents
    this.predictedEvents = i.predictedEvents
  }
}

/** @internal InputEventInit members (with UIEventInit's). */
export class InputEventDict extends UIEventDict {
  constructor(i: NativeInit, d: EventInit) {
    super(i, d)
    this.data = i.data
    this.isComposing = i.isComposing
    this.inputType = i.inputType === undefined ? 'undefined' : i.inputType
    this.dataTransfer = i.dataTransfer
  }
}

const constructorCache = new WeakMap<
  object,
  ReturnType<typeof buildEventConstructors>
>()

function getEventConstructors(window: Window) {
  let constructors = constructorCache.get(window)
  if (constructors === undefined) {
    constructors = buildEventConstructors(window)
    constructorCache.set(window, constructors)
  }
  return constructors
}

type EventConstructor = new (type: string, init: object) => Event

/**
 * The interfaces of the event map, each after its parent. Upstream also builds AnimationEvent,
 * CompositionEvent, DragEvent, PopStateEvent, ProgressEvent, TouchEvent and TransitionEvent, which
 * no event it creates uses.
 */
const EVENT_INTERFACES = [
  ['Event', ''],
  ['UIEvent', 'Event'],
  ['ClipboardEvent', 'Event'],
  ['FocusEvent', 'UIEvent'],
  ['InputEvent', 'UIEvent'],
  ['KeyboardEvent', 'UIEvent'],
  ['MouseEvent', 'UIEvent'],
  ['PointerEvent', 'MouseEvent'],
] as const

/* istanbul ignore next */
function buildEventConstructors(window: Window) {
  const own = window as unknown as Record<string, EventConstructor | undefined>
  // Interfaces the window lacks, replaced by a bare subclass of the parent with the
  // interface's name (upstream's `class PointerEvent extends MouseEvent {}`).
  const fallbacks = new Set<string>()
  const constructors: Record<string, EventConstructor> = {}
  for (const [name, parent] of EVENT_INTERFACES) {
    let Ctor = own[name]
    if (Ctor === undefined) {
      fallbacks.add(name)
      const Parent = (constructors[parent] ?? Object) as EventConstructor
      Ctor = {[name]: class extends Parent {}}[name]
    }
    constructors[name] = Ctor
  }
  return {fallbacks, constructors}
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
