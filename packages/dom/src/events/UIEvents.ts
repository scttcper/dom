// UI Events and friends.
// https://w3c.github.io/uievents/ (UIEvent, FocusEvent, MouseEvent, WheelEvent, InputEvent,
//   KeyboardEvent, CompositionEvent, TextEvent, legacy members)
// https://drafts.csswg.org/cssom-view/#extensions-to-the-mouseevent-interface (pageX/offsetX/x/y)
// https://w3c.github.io/pointerlock/#extensions-to-the-mouseevent-interface (movementX/Y)
// https://w3c.github.io/pointerevents/#pointerevent-interface
// https://w3c.github.io/touch-events/ (Touch, TouchList, TouchEvent)
// https://html.spec.whatwg.org/#the-dragevent-interface
// https://w3c.github.io/clipboard-apis/#clipboard-event-interfaces
//
// Fields are plain `_`-prefixed data properties initialized in constructors (stable shapes);
// the IDL attributes are prototype getters, so assigning to e.g. `event.clientX` fails like
// it does in browsers and `Object.defineProperty(event, ...)` (Testing Library) still works.
// No layout: pageX/offsetX mirror clientX like jsdom (docs/deviations.md).

import {
  EF_DISPATCH,
  EF_MOUSE_EVENT,
  EF_TOUCH_EVENT,
  Event,
  initializeEvent,
  isInternalConstruct,
  setToStringTag,
  withInternalConstruct as withConstruct,
} from "./Event.ts";
import type { EventTarget } from "./EventTarget.ts";
import type { EventInit } from "../webidl.ts";
import type { Window } from "../window/Window.ts";
import type { DataTransfer } from "./DataTransfer.ts";
import { toDOMString, toDouble, toFloat, toLong, toShort, toUnsignedLong, toUnsignedShort } from "./convert.ts";

type Dict = Record<string, unknown>;

export function requireArgs(given: number, needed: number, iface: string): void {
  if (given < needed) {
    throw new TypeError(`Failed to construct '${iface}': ${needed} argument${needed > 1 ? "s" : ""} required, but only ${given} present.`);
  }
}

function dict(v: unknown, iface: string): Dict | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "object" && typeof v !== "function") {
    throw new TypeError(`Failed to construct '${iface}': The provided value is not of type '${iface}Init'.`);
  }
  return v as Dict;
}

/** Window detection without importing the Window class (avoids an import cycle). */
export function isWindow(v: unknown): v is Window {
  if (v === null || typeof v !== "object") return false;
  const w = v as { document?: { _window?: unknown }; window?: unknown };
  return w.window === v || (w.document != null && w.document._window === v);
}

function viewMember(d: Dict | null, iface: string): Window | null {
  const v = d === null ? undefined : d.view;
  if (v === undefined || v === null) return null;
  if (!isWindow(v)) throw new TypeError(`Failed to construct '${iface}': member view is not of type Window.`);
  return v;
}

function targetMember(v: unknown): EventTarget | null {
  // Lenient: any object (jsdom validates EventTarget; tests occasionally pass plain objects).
  return v === undefined || v === null ? null : (v as EventTarget);
}

const str = (d: Dict | null, k: string, def: string): string => {
  const v = d === null ? undefined : d[k];
  return v === undefined ? def : toDOMString(v);
};
const bool = (d: Dict | null, k: string): boolean => d !== null && !!d[k];
const long = (d: Dict | null, k: string, def = 0): number => {
  const v = d === null ? undefined : d[k];
  return v === undefined ? def : toLong(v);
};
const ulong = (d: Dict | null, k: string): number => {
  const v = d === null ? undefined : d[k];
  return v === undefined ? 0 : toUnsignedLong(v);
};
const double = (d: Dict | null, k: string, iface: string, def = 0): number => {
  const v = d === null ? undefined : d[k];
  return v === undefined ? def : toDouble(v, `Failed to construct '${iface}': member ${k}`);
};
const float = (d: Dict | null, k: string, iface: string, def = 0): number => {
  const v = d === null ? undefined : d[k];
  return v === undefined ? def : toFloat(v, `Failed to construct '${iface}': member ${k}`);
};

// --- modifier keys ----------------------------------------------------------------------
// https://w3c.github.io/uievents/#dom-eventmodifierinit-modifieraltgraph etc.

const M_CTRL = 1 << 0;
const M_SHIFT = 1 << 1;
const M_ALT = 1 << 2;
const M_META = 1 << 3;
const MODIFIER_INIT: ReadonlyArray<readonly [string, number]> = [
  ["ctrlKey", M_CTRL],
  ["shiftKey", M_SHIFT],
  ["altKey", M_ALT],
  ["metaKey", M_META],
  ["modifierAltGraph", 1 << 4],
  ["modifierCapsLock", 1 << 5],
  ["modifierFn", 1 << 6],
  ["modifierFnLock", 1 << 7],
  ["modifierHyper", 1 << 8],
  ["modifierNumLock", 1 << 9],
  ["modifierScrollLock", 1 << 10],
  ["modifierSuper", 1 << 11],
  ["modifierSymbol", 1 << 12],
  ["modifierSymbolLock", 1 << 13],
];

function modifiers(d: Dict | null): number {
  if (d === null) return 0;
  let m = 0;
  for (let i = 0; i < MODIFIER_INIT.length; i++) if (d[MODIFIER_INIT[i][0]]) m |= MODIFIER_INIT[i][1];
  return m;
}

/** https://w3c.github.io/uievents/#dom-mouseevent-getmodifierstate */
function modifierState(mods: number, key: string): boolean {
  let bit: number;
  switch (key) {
    case "Control":
      bit = M_CTRL;
      break;
    case "Shift":
      bit = M_SHIFT;
      break;
    case "Alt":
      bit = M_ALT;
      break;
    case "Meta":
      bit = M_META;
      break;
    default: {
      const entry = MODIFIER_INIT.find((e) => e[0] === "modifier" + key);
      if (entry === undefined) return false;
      bit = entry[1];
    }
  }
  return (mods & bit) !== 0;
}

function legacyMods(ctrlKey: unknown, altKey: unknown, shiftKey: unknown, metaKey: unknown, keep: number): number {
  let m = keep & ~(M_CTRL | M_ALT | M_SHIFT | M_META);
  if (ctrlKey) m |= M_CTRL;
  if (altKey) m |= M_ALT;
  if (shiftKey) m |= M_SHIFT;
  if (metaKey) m |= M_META;
  return m;
}

// --- UIEvent --------------------------------------------------------------------------------

export interface UIEventInit extends EventInit {
  view?: Window | null;
  detail?: number;
  which?: number;
}

/** https://w3c.github.io/uievents/#interface-uievent */
export class UIEvent extends Event {
  _view: Window | null;
  _detail: number;
  _which: number;

  constructor(type: string, eventInitDict?: UIEventInit | null) {
    requireArgs(arguments.length, 1, new.target.name);
    const d = dict(eventInitDict, new.target.name);
    super(type, eventInitDict);
    this._view = viewMember(d, new.target.name);
    this._detail = long(d, "detail");
    this._which = ulong(d, "which");
  }

  get view(): Window | null {
    return this._view;
  }

  get detail(): number {
    return this._detail;
  }

  /** https://w3c.github.io/uievents/#dom-uievent-which (init value, like jsdom). */
  get which(): number {
    return this._which;
  }

  /** https://w3c.github.io/uievents/#dom-uievent-inituievent */
  initUIEvent(type: string, bubbles = false, cancelable = false, view: Window | null = null, detail = 0): void {
    if (arguments.length === 0) throw new TypeError("Failed to execute 'initUIEvent' on 'UIEvent': 1 argument required, but only 0 present.");
    if (view !== null && view !== undefined && !isWindow(view)) {
      throw new TypeError(`Failed to execute 'initUIEvent' on '${this.constructor.name}': parameter 4 is not of type 'Window'.`);
    }
    if ((this._s.flags & EF_DISPATCH) !== 0) return;
    initializeEvent(this._s, toDOMString(type), !!bubbles, !!cancelable);
    this._view = view ?? null;
    this._detail = toLong(detail);
  }
}
setToStringTag(UIEvent);

// --- FocusEvent -----------------------------------------------------------------------------

export interface FocusEventInit extends UIEventInit {
  relatedTarget?: EventTarget | null;
}

/** https://w3c.github.io/uievents/#interface-focusevent */
export class FocusEvent extends UIEvent {
  constructor(type: string, eventInitDict?: FocusEventInit | null) {
    requireArgs(arguments.length, 1, new.target.name);
    super(type, eventInitDict);
    this._s.relatedTarget = targetMember(eventInitDict?.relatedTarget);
  }

  get relatedTarget(): EventTarget | null {
    return this._s.relatedTarget;
  }
}
setToStringTag(FocusEvent);

// --- MouseEvent -----------------------------------------------------------------------------

export interface EventModifierInit extends UIEventInit {
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  modifierAltGraph?: boolean;
  modifierCapsLock?: boolean;
  modifierFn?: boolean;
  modifierFnLock?: boolean;
  modifierHyper?: boolean;
  modifierNumLock?: boolean;
  modifierScrollLock?: boolean;
  modifierSuper?: boolean;
  modifierSymbol?: boolean;
  modifierSymbolLock?: boolean;
}

export interface MouseEventInit extends EventModifierInit {
  screenX?: number;
  screenY?: number;
  clientX?: number;
  clientY?: number;
  button?: number;
  buttons?: number;
  relatedTarget?: EventTarget | null;
  movementX?: number;
  movementY?: number;
}

/** https://w3c.github.io/uievents/#interface-mouseevent */
export class MouseEvent extends UIEvent {
  _screenX: number;
  _screenY: number;
  _clientX: number;
  _clientY: number;
  _mods: number;
  _button: number;
  _buttons: number;
  _movementX: number;
  _movementY: number;

  constructor(type: string, eventInitDict?: MouseEventInit | null) {
    requireArgs(arguments.length, 1, new.target.name);
    super(type, eventInitDict);
    const n = new.target.name;
    const d = (eventInitDict ?? null) as Dict | null;
    this._screenX = double(d, "screenX", n);
    this._screenY = double(d, "screenY", n);
    this._clientX = double(d, "clientX", n);
    this._clientY = double(d, "clientY", n);
    this._mods = modifiers(d);
    this._button = d === null || d.button === undefined ? 0 : toShort(d.button);
    this._buttons = d === null || d.buttons === undefined ? 0 : toUnsignedShort(d.buttons);
    this._movementX = double(d, "movementX", n);
    this._movementY = double(d, "movementY", n);
    this._s.relatedTarget = targetMember(d?.relatedTarget);
    this._s.flags |= EF_MOUSE_EVENT;
  }

  get screenX(): number {
    return this._screenX;
  }
  get screenY(): number {
    return this._screenY;
  }
  get clientX(): number {
    return this._clientX;
  }
  get clientY(): number {
    return this._clientY;
  }
  /** https://drafts.csswg.org/cssom-view/#dom-mouseevent-x */
  get x(): number {
    return this._clientX;
  }
  get y(): number {
    return this._clientY;
  }
  /** https://drafts.csswg.org/cssom-view/#dom-mouseevent-pagex (no scrolling: = clientX). */
  get pageX(): number {
    return this._clientX;
  }
  get pageY(): number {
    return this._clientY;
  }
  /** https://drafts.csswg.org/cssom-view/#dom-mouseevent-offsetx (no layout: = pageX, like jsdom). */
  get offsetX(): number {
    return this._clientX;
  }
  get offsetY(): number {
    return this._clientY;
  }
  get movementX(): number {
    return this._movementX;
  }
  get movementY(): number {
    return this._movementY;
  }
  get ctrlKey(): boolean {
    return (this._mods & M_CTRL) !== 0;
  }
  get shiftKey(): boolean {
    return (this._mods & M_SHIFT) !== 0;
  }
  get altKey(): boolean {
    return (this._mods & M_ALT) !== 0;
  }
  get metaKey(): boolean {
    return (this._mods & M_META) !== 0;
  }
  get button(): number {
    return this._button;
  }
  get buttons(): number {
    return this._buttons;
  }
  get relatedTarget(): EventTarget | null {
    return this._s.relatedTarget;
  }

  getModifierState(keyArg: string): boolean {
    return modifierState(this._mods, toDOMString(keyArg));
  }

  /** https://w3c.github.io/uievents/#dom-mouseevent-initmouseevent */
  initMouseEvent(
    type: string,
    bubbles = false,
    cancelable = false,
    view: Window | null = null,
    detail = 0,
    screenX = 0,
    screenY = 0,
    clientX = 0,
    clientY = 0,
    ctrlKey = false,
    altKey = false,
    shiftKey = false,
    metaKey = false,
    button = 0,
    relatedTarget: EventTarget | null = null,
  ): void {
    if (arguments.length === 0) throw new TypeError("Failed to execute 'initMouseEvent' on 'MouseEvent': 1 argument required, but only 0 present.");
    if ((this._s.flags & EF_DISPATCH) !== 0) return;
    this.initUIEvent(type, bubbles, cancelable, view, detail);
    this._screenX = toLong(screenX);
    this._screenY = toLong(screenY);
    this._clientX = toLong(clientX);
    this._clientY = toLong(clientY);
    this._mods = legacyMods(ctrlKey, altKey, shiftKey, metaKey, this._mods);
    this._button = toShort(button);
    this._s.relatedTarget = targetMember(relatedTarget);
  }
}
setToStringTag(MouseEvent);

// --- PointerEvent ---------------------------------------------------------------------------

export interface PointerEventInit extends MouseEventInit {
  pointerId?: number;
  width?: number;
  height?: number;
  pressure?: number;
  tangentialPressure?: number;
  tiltX?: number;
  tiltY?: number;
  twist?: number;
  altitudeAngle?: number;
  azimuthAngle?: number;
  pointerType?: string;
  isPrimary?: boolean;
  persistentDeviceId?: number;
  coalescedEvents?: PointerEvent[];
  predictedEvents?: PointerEvent[];
}

const RAD_TO_DEG = 180 / Math.PI;

/** https://w3c.github.io/pointerevents/#converting-between-tiltx-tilty-and-altitudeangle-azimuthangle */
function spherical2tilt(altitudeAngle: number, azimuthAngle: number): [number, number] {
  let tiltXrad = 0;
  let tiltYrad = 0;
  const PI = Math.PI;
  if (altitudeAngle === 0) {
    if (azimuthAngle === 0 || azimuthAngle === 2 * PI) tiltXrad = PI / 2;
    if (azimuthAngle === PI / 2) tiltYrad = PI / 2;
    if (azimuthAngle === PI) tiltXrad = -PI / 2;
    if (azimuthAngle === (3 * PI) / 2) tiltYrad = -PI / 2;
    if (azimuthAngle > 0 && azimuthAngle < PI / 2) {
      tiltXrad = PI / 2;
      tiltYrad = PI / 2;
    }
    if (azimuthAngle > PI / 2 && azimuthAngle < PI) {
      tiltXrad = -PI / 2;
      tiltYrad = PI / 2;
    }
    if (azimuthAngle > PI && azimuthAngle < (3 * PI) / 2) {
      tiltXrad = -PI / 2;
      tiltYrad = -PI / 2;
    }
    if (azimuthAngle > (3 * PI) / 2 && azimuthAngle < 2 * PI) {
      tiltXrad = PI / 2;
      tiltYrad = -PI / 2;
    }
  } else {
    const tanAlt = Math.tan(altitudeAngle);
    tiltXrad = Math.atan(Math.cos(azimuthAngle) / tanAlt);
    tiltYrad = Math.atan(Math.sin(azimuthAngle) / tanAlt);
  }
  return [Math.round(tiltXrad * RAD_TO_DEG), Math.round(tiltYrad * RAD_TO_DEG)];
}

function tilt2spherical(tiltX: number, tiltY: number): [number, number] {
  const tiltXrad = tiltX / RAD_TO_DEG;
  const tiltYrad = tiltY / RAD_TO_DEG;
  let azimuthAngle = 0;
  if (tiltX === 0) {
    if (tiltY > 0) azimuthAngle = Math.PI / 2;
    else if (tiltY < 0) azimuthAngle = (3 * Math.PI) / 2;
  } else if (tiltY === 0) {
    if (tiltX < 0) azimuthAngle = Math.PI;
  } else if (Math.abs(tiltX) === 90 || Math.abs(tiltY) === 90) {
    azimuthAngle = 0;
  } else {
    azimuthAngle = Math.atan2(Math.tan(tiltYrad), Math.tan(tiltXrad));
    if (azimuthAngle < 0) azimuthAngle += 2 * Math.PI;
  }
  let altitudeAngle: number;
  if (Math.abs(tiltX) === 90 || Math.abs(tiltY) === 90) altitudeAngle = 0;
  else if (tiltX === 0) altitudeAngle = Math.PI / 2 - Math.abs(tiltYrad);
  else if (tiltY === 0) altitudeAngle = Math.PI / 2 - Math.abs(tiltXrad);
  else altitudeAngle = Math.atan(1 / Math.sqrt(Math.tan(tiltXrad) ** 2 + Math.tan(tiltYrad) ** 2));
  return [altitudeAngle, azimuthAngle];
}

/** https://w3c.github.io/pointerevents/#pointerevent-interface */
export class PointerEvent extends MouseEvent {
  _pointerId: number;
  _width: number;
  _height: number;
  _pressure: number;
  _tangentialPressure: number;
  _tiltX: number;
  _tiltY: number;
  _twist: number;
  _altitudeAngle: number;
  _azimuthAngle: number;
  _pointerType: string;
  _isPrimary: boolean;
  _persistentDeviceId: number;
  _coalesced: PointerEvent[];
  _predicted: PointerEvent[];

  constructor(type: string, eventInitDict?: PointerEventInit | null) {
    requireArgs(arguments.length, 1, new.target.name);
    super(type, eventInitDict);
    const n = new.target.name;
    const d = (eventInitDict ?? null) as Dict | null;
    this._pointerId = long(d, "pointerId");
    this._width = double(d, "width", n, 1);
    this._height = double(d, "height", n, 1);
    this._pressure = float(d, "pressure", n);
    this._tangentialPressure = float(d, "tangentialPressure", n);
    const hasTilt = d !== null && (d.tiltX !== undefined || d.tiltY !== undefined);
    const hasAngles = d !== null && (d.altitudeAngle !== undefined || d.azimuthAngle !== undefined);
    let tiltX = long(d, "tiltX");
    let tiltY = long(d, "tiltY");
    let altitude = double(d, "altitudeAngle", n, Math.PI / 2);
    let azimuth = double(d, "azimuthAngle", n, 0);
    if (hasTilt && !hasAngles) [altitude, azimuth] = tilt2spherical(tiltX, tiltY);
    else if (hasAngles && !hasTilt) [tiltX, tiltY] = spherical2tilt(altitude, azimuth);
    this._tiltX = tiltX;
    this._tiltY = tiltY;
    this._twist = long(d, "twist");
    this._altitudeAngle = altitude;
    this._azimuthAngle = azimuth;
    this._pointerType = str(d, "pointerType", "");
    this._isPrimary = bool(d, "isPrimary");
    this._persistentDeviceId = long(d, "persistentDeviceId");
    this._coalesced = d !== null && d.coalescedEvents != null ? Array.from(d.coalescedEvents as Iterable<PointerEvent>) : [];
    this._predicted = d !== null && d.predictedEvents != null ? Array.from(d.predictedEvents as Iterable<PointerEvent>) : [];
  }

  get pointerId(): number {
    return this._pointerId;
  }
  get width(): number {
    return this._width;
  }
  get height(): number {
    return this._height;
  }
  get pressure(): number {
    return this._pressure;
  }
  get tangentialPressure(): number {
    return this._tangentialPressure;
  }
  get tiltX(): number {
    return this._tiltX;
  }
  get tiltY(): number {
    return this._tiltY;
  }
  get twist(): number {
    return this._twist;
  }
  get altitudeAngle(): number {
    return this._altitudeAngle;
  }
  get azimuthAngle(): number {
    return this._azimuthAngle;
  }
  get pointerType(): string {
    return this._pointerType;
  }
  get isPrimary(): boolean {
    return this._isPrimary;
  }
  get persistentDeviceId(): number {
    return this._persistentDeviceId;
  }

  /** https://w3c.github.io/pointerevents/#dom-pointerevent-getcoalescedevents */
  getCoalescedEvents(): PointerEvent[] {
    return this._coalesced.slice();
  }

  /** https://w3c.github.io/pointerevents/#dom-pointerevent-getpredictedevents */
  getPredictedEvents(): PointerEvent[] {
    return this._predicted.slice();
  }
}
setToStringTag(PointerEvent);

// --- WheelEvent -----------------------------------------------------------------------------

export interface WheelEventInit extends MouseEventInit {
  deltaX?: number;
  deltaY?: number;
  deltaZ?: number;
  deltaMode?: number;
}

/** https://w3c.github.io/uievents/#interface-wheelevent */
export class WheelEvent extends MouseEvent {
  static readonly DOM_DELTA_PIXEL = 0;
  static readonly DOM_DELTA_LINE = 1;
  static readonly DOM_DELTA_PAGE = 2;
  _deltaX: number;
  _deltaY: number;
  _deltaZ: number;
  _deltaMode: number;

  constructor(type: string, eventInitDict?: WheelEventInit | null) {
    requireArgs(arguments.length, 1, new.target.name);
    super(type, eventInitDict);
    const n = new.target.name;
    const d = (eventInitDict ?? null) as Dict | null;
    this._deltaX = double(d, "deltaX", n);
    this._deltaY = double(d, "deltaY", n);
    this._deltaZ = double(d, "deltaZ", n);
    this._deltaMode = ulong(d, "deltaMode");
  }

  get deltaX(): number {
    return this._deltaX;
  }
  get deltaY(): number {
    return this._deltaY;
  }
  get deltaZ(): number {
    return this._deltaZ;
  }
  get deltaMode(): number {
    return this._deltaMode;
  }
}
setToStringTag(WheelEvent);
Object.defineProperties(WheelEvent.prototype, {
  DOM_DELTA_PIXEL: { value: 0, enumerable: true },
  DOM_DELTA_LINE: { value: 1, enumerable: true },
  DOM_DELTA_PAGE: { value: 2, enumerable: true },
});

// --- DragEvent ------------------------------------------------------------------------------

export interface DragEventInit extends MouseEventInit {
  dataTransfer?: DataTransfer | null;
}

/** https://html.spec.whatwg.org/#the-dragevent-interface */
export class DragEvent extends MouseEvent {
  _dataTransfer: DataTransfer | null;

  constructor(type: string, eventInitDict?: DragEventInit | null) {
    requireArgs(arguments.length, 1, new.target.name);
    super(type, eventInitDict);
    // Lenient (no DataTransfer type check): Testing Library passes plain objects here.
    this._dataTransfer = (eventInitDict?.dataTransfer ?? null) as DataTransfer | null;
  }

  get dataTransfer(): DataTransfer | null {
    return this._dataTransfer;
  }
}
setToStringTag(DragEvent);

// --- KeyboardEvent --------------------------------------------------------------------------

export interface KeyboardEventInit extends EventModifierInit {
  key?: string;
  code?: string;
  location?: number;
  repeat?: boolean;
  isComposing?: boolean;
  charCode?: number;
  keyCode?: number;
}

/** https://w3c.github.io/uievents/#interface-keyboardevent */
export class KeyboardEvent extends UIEvent {
  static readonly DOM_KEY_LOCATION_STANDARD = 0;
  static readonly DOM_KEY_LOCATION_LEFT = 1;
  static readonly DOM_KEY_LOCATION_RIGHT = 2;
  static readonly DOM_KEY_LOCATION_NUMPAD = 3;
  _key: string;
  _code: string;
  _location: number;
  _mods: number;
  _repeat: boolean;
  _isComposing: boolean;
  _charCode: number;
  _keyCode: number;

  constructor(type: string, eventInitDict?: KeyboardEventInit | null) {
    requireArgs(arguments.length, 1, new.target.name);
    super(type, eventInitDict);
    const d = (eventInitDict ?? null) as Dict | null;
    this._key = str(d, "key", "");
    this._code = str(d, "code", "");
    this._location = ulong(d, "location");
    this._mods = modifiers(d);
    this._repeat = bool(d, "repeat");
    this._isComposing = bool(d, "isComposing");
    this._charCode = ulong(d, "charCode");
    this._keyCode = ulong(d, "keyCode");
  }

  get key(): string {
    return this._key;
  }
  get code(): string {
    return this._code;
  }
  get location(): number {
    return this._location;
  }
  get ctrlKey(): boolean {
    return (this._mods & M_CTRL) !== 0;
  }
  get shiftKey(): boolean {
    return (this._mods & M_SHIFT) !== 0;
  }
  get altKey(): boolean {
    return (this._mods & M_ALT) !== 0;
  }
  get metaKey(): boolean {
    return (this._mods & M_META) !== 0;
  }
  get repeat(): boolean {
    return this._repeat;
  }
  get isComposing(): boolean {
    return this._isComposing;
  }
  /** https://w3c.github.io/uievents/#dom-keyboardevent-charcode (legacy; init value). */
  get charCode(): number {
    return this._charCode;
  }
  /** https://w3c.github.io/uievents/#dom-keyboardevent-keycode (legacy; init value). */
  get keyCode(): number {
    return this._keyCode;
  }

  getModifierState(keyArg: string): boolean {
    return modifierState(this._mods, toDOMString(keyArg));
  }

  /** https://w3c.github.io/uievents/#dom-keyboardevent-initkeyboardevent */
  initKeyboardEvent(
    type: string,
    bubbles = false,
    cancelable = false,
    view: Window | null = null,
    key = "",
    location = 0,
    ctrlKey = false,
    altKey = false,
    shiftKey = false,
    metaKey = false,
  ): void {
    if (arguments.length === 0) throw new TypeError("Failed to execute 'initKeyboardEvent' on 'KeyboardEvent': 1 argument required, but only 0 present.");
    if ((this._s.flags & EF_DISPATCH) !== 0) return;
    this.initUIEvent(type, bubbles, cancelable, view, 0);
    this._key = toDOMString(key);
    this._location = toUnsignedLong(location);
    this._mods = legacyMods(ctrlKey, altKey, shiftKey, metaKey, this._mods);
  }
}
setToStringTag(KeyboardEvent);
Object.defineProperties(KeyboardEvent.prototype, {
  DOM_KEY_LOCATION_STANDARD: { value: 0, enumerable: true },
  DOM_KEY_LOCATION_LEFT: { value: 1, enumerable: true },
  DOM_KEY_LOCATION_RIGHT: { value: 2, enumerable: true },
  DOM_KEY_LOCATION_NUMPAD: { value: 3, enumerable: true },
});

// --- InputEvent -----------------------------------------------------------------------------

export interface InputEventInit extends UIEventInit {
  data?: string | null;
  isComposing?: boolean;
  inputType?: string;
  dataTransfer?: DataTransfer | null;
  targetRanges?: unknown[];
}

/** https://w3c.github.io/uievents/#interface-inputevent + https://w3c.github.io/input-events/ */
export class InputEvent extends UIEvent {
  _data: string | null;
  _isComposing: boolean;
  _inputType: string;
  _dataTransfer: DataTransfer | null;
  _targetRanges: unknown[];

  constructor(type: string, eventInitDict?: InputEventInit | null) {
    requireArgs(arguments.length, 1, new.target.name);
    super(type, eventInitDict);
    const d = (eventInitDict ?? null) as Dict | null;
    const data = d === null ? undefined : d.data;
    this._data = data === undefined || data === null ? null : toDOMString(data);
    this._isComposing = bool(d, "isComposing");
    this._inputType = str(d, "inputType", "");
    this._dataTransfer = (d?.dataTransfer ?? null) as DataTransfer | null;
    this._targetRanges = d !== null && d.targetRanges != null ? Array.from(d.targetRanges as Iterable<unknown>) : [];
  }

  get data(): string | null {
    return this._data;
  }
  get isComposing(): boolean {
    return this._isComposing;
  }
  get inputType(): string {
    return this._inputType;
  }
  get dataTransfer(): DataTransfer | null {
    return this._dataTransfer;
  }
  /** https://w3c.github.io/input-events/#dom-inputevent-gettargetranges */
  getTargetRanges(): unknown[] {
    return this._targetRanges.slice();
  }
}
setToStringTag(InputEvent);

// --- CompositionEvent -----------------------------------------------------------------------

export interface CompositionEventInit extends UIEventInit {
  data?: string;
}

/** https://w3c.github.io/uievents/#interface-compositionevent */
export class CompositionEvent extends UIEvent {
  _data: string;

  constructor(type: string, eventInitDict?: CompositionEventInit | null) {
    requireArgs(arguments.length, 1, new.target.name);
    super(type, eventInitDict);
    this._data = str((eventInitDict ?? null) as Dict | null, "data", "");
  }

  get data(): string {
    return this._data;
  }

  /** https://w3c.github.io/uievents/#dom-compositionevent-initcompositionevent */
  initCompositionEvent(type: string, bubbles = false, cancelable = false, view: Window | null = null, data = ""): void {
    if (arguments.length === 0) throw new TypeError("Failed to execute 'initCompositionEvent' on 'CompositionEvent': 1 argument required, but only 0 present.");
    if ((this._s.flags & EF_DISPATCH) !== 0) return;
    this.initUIEvent(type, bubbles, cancelable, view, 0);
    this._data = toDOMString(data);
  }
}
setToStringTag(CompositionEvent);

// --- TextEvent (legacy, createEvent("textevent") only) ---------------------------------------

/** https://w3c.github.io/uievents/#legacy-textevent-interface */
export class TextEvent extends UIEvent {
  _data: string;

  constructor(type: string, eventInitDict?: UIEventInit | null) {
    if (!isInternalConstruct()) throw new TypeError("Illegal constructor");
    super(type, eventInitDict);
    this._data = "";
  }

  get data(): string {
    return this._data;
  }

  initTextEvent(type: string, bubbles = false, cancelable = false, view: Window | null = null, data = "undefined"): void {
    if ((this._s.flags & EF_DISPATCH) !== 0) return;
    this.initUIEvent(type, bubbles, cancelable, view, 0);
    this._data = toDOMString(data);
  }
}
setToStringTag(TextEvent);

// --- Touch / TouchList / TouchEvent ---------------------------------------------------------

export interface TouchInit {
  identifier: number;
  target: EventTarget;
  clientX?: number;
  clientY?: number;
  screenX?: number;
  screenY?: number;
  pageX?: number;
  pageY?: number;
  radiusX?: number;
  radiusY?: number;
  rotationAngle?: number;
  force?: number;
  altitudeAngle?: number;
  azimuthAngle?: number;
  touchType?: "direct" | "stylus";
}

/**
 * https://w3c.github.io/touch-events/#touch-interface
 * Deviation: `target` is the init target as-is; touch target lists are retargeted on the
 * event path but Touch objects are not re-created per path entry.
 */
export class Touch {
  _identifier: number;
  _target: EventTarget;
  _clientX: number;
  _clientY: number;
  _screenX: number;
  _screenY: number;
  _pageX: number;
  _pageY: number;
  _radiusX: number;
  _radiusY: number;
  _rotationAngle: number;
  _force: number;
  _altitudeAngle: number;
  _azimuthAngle: number;
  _touchType: string;

  constructor(touchInitDict: TouchInit) {
    requireArgs(arguments.length, 1, "Touch");
    const d = dict(touchInitDict, "Touch");
    if (d === null || d.identifier === undefined) throw new TypeError("Failed to construct 'Touch': required member identifier is undefined.");
    if (d.target === undefined) throw new TypeError("Failed to construct 'Touch': required member target is undefined.");
    const n = "Touch";
    this._identifier = toLong(d.identifier);
    this._target = d.target as EventTarget;
    this._clientX = double(d, "clientX", n);
    this._clientY = double(d, "clientY", n);
    this._screenX = double(d, "screenX", n);
    this._screenY = double(d, "screenY", n);
    this._pageX = double(d, "pageX", n);
    this._pageY = double(d, "pageY", n);
    this._radiusX = float(d, "radiusX", n);
    this._radiusY = float(d, "radiusY", n);
    this._rotationAngle = float(d, "rotationAngle", n);
    this._force = float(d, "force", n);
    this._altitudeAngle = double(d, "altitudeAngle", n);
    this._azimuthAngle = double(d, "azimuthAngle", n);
    this._touchType = str(d, "touchType", "direct");
  }

  get identifier(): number {
    return this._identifier;
  }
  get target(): EventTarget {
    return this._target;
  }
  get clientX(): number {
    return this._clientX;
  }
  get clientY(): number {
    return this._clientY;
  }
  get screenX(): number {
    return this._screenX;
  }
  get screenY(): number {
    return this._screenY;
  }
  get pageX(): number {
    return this._pageX;
  }
  get pageY(): number {
    return this._pageY;
  }
  get radiusX(): number {
    return this._radiusX;
  }
  get radiusY(): number {
    return this._radiusY;
  }
  get rotationAngle(): number {
    return this._rotationAngle;
  }
  get force(): number {
    return this._force;
  }
  get altitudeAngle(): number {
    return this._altitudeAngle;
  }
  get azimuthAngle(): number {
    return this._azimuthAngle;
  }
  get touchType(): string {
    return this._touchType;
  }
}
setToStringTag(Touch);

/** https://w3c.github.io/touch-events/#touchlist-interface (static list with own index properties). */
export class TouchList {
  [index: number]: Touch;
  _items: Touch[];

  constructor() {
    if (!isInternalConstruct()) throw new TypeError("Illegal constructor");
    this._items = [];
  }

  /** @internal */
  static _create(items: Touch[]): TouchList {
    const prev = isInternalConstruct();
    const list = prev ? new TouchList() : withConstruct(() => new TouchList());
    list._items = items;
    for (let i = 0; i < items.length; i++) Object.defineProperty(list, i, { value: items[i], enumerable: true, configurable: true });
    return list;
  }

  get length(): number {
    return this._items.length;
  }

  item(index: number): Touch | null {
    return this._items[toUnsignedLong(index)] ?? null;
  }

  [Symbol.iterator](): IterableIterator<Touch> {
    return this._items[Symbol.iterator]();
  }
}
setToStringTag(TouchList);


export interface TouchEventInit extends EventModifierInit {
  touches?: Touch[];
  targetTouches?: Touch[];
  changedTouches?: Touch[];
}

/**
 * sequence<Touch> conversion, relaxed: Touch instances and touch-like plain objects are kept
 * as-is (jsdom has no Touch interface and exposes whatever was passed; Testing Library users
 * write `fireEvent.touchStart(el, { touches: [{ clientX }] })`). Primitives still throw.
 * docs/deviations.md.
 */
function touchSequence(v: unknown, member: string): Touch[] {
  if (v === undefined || v === null) return [];
  const out = Array.from(v as Iterable<unknown>);
  for (const t of out) {
    if (t === null || (typeof t !== "object" && typeof t !== "function")) {
      throw new TypeError(`Failed to construct 'TouchEvent': Failed to read the '${member}' property from 'TouchEventInit': Failed to convert value to 'Touch'.`);
    }
  }
  return out as Touch[];
}

/** https://w3c.github.io/touch-events/#touchevent-interface */
export class TouchEvent extends UIEvent {
  _touches: TouchList;
  _targetTouches: TouchList;
  _changedTouches: TouchList;
  _mods: number;

  constructor(type: string, eventInitDict?: TouchEventInit | null) {
    requireArgs(arguments.length, 1, new.target.name);
    super(type, eventInitDict);
    const d = (eventInitDict ?? null) as Dict | null;
    this._touches = TouchList._create(touchSequence(d?.touches, "touches"));
    this._targetTouches = TouchList._create(touchSequence(d?.targetTouches, "targetTouches"));
    this._changedTouches = TouchList._create(touchSequence(d?.changedTouches, "changedTouches"));
    this._mods = modifiers(d);
    this._s.flags |= EF_TOUCH_EVENT;
  }

  get touches(): TouchList {
    return this._touches;
  }
  get targetTouches(): TouchList {
    return this._targetTouches;
  }
  get changedTouches(): TouchList {
    return this._changedTouches;
  }
  get altKey(): boolean {
    return (this._mods & M_ALT) !== 0;
  }
  get metaKey(): boolean {
    return (this._mods & M_META) !== 0;
  }
  get ctrlKey(): boolean {
    return (this._mods & M_CTRL) !== 0;
  }
  get shiftKey(): boolean {
    return (this._mods & M_SHIFT) !== 0;
  }

  getModifierState(keyArg: string): boolean {
    return modifierState(this._mods, toDOMString(keyArg));
  }

  /** @internal https://dom.spec.whatwg.org/#event-touch-target-list */
  _touchTargetList(): EventTarget[] {
    const out: EventTarget[] = [];
    for (const list of [this._touches, this._targetTouches, this._changedTouches]) {
      for (const t of list._items) {
        // Touch-like plain objects carry `target` (if any) as a normal property.
        const target = t instanceof Touch ? t._target : (t as { target?: unknown }).target;
        if (target !== null && typeof target === "object") out.push(target as EventTarget);
      }
    }
    return out;
  }
}
setToStringTag(TouchEvent);

// --- ClipboardEvent -------------------------------------------------------------------------

export interface ClipboardEventInit extends EventInit {
  clipboardData?: DataTransfer | null;
}

/** https://w3c.github.io/clipboard-apis/#clipboardevent */
export class ClipboardEvent extends Event {
  _clipboardData: DataTransfer | null;

  constructor(type: string, eventInitDict?: ClipboardEventInit | null) {
    requireArgs(arguments.length, 1, new.target.name);
    super(type, eventInitDict);
    // Lenient (no DataTransfer type check): Testing Library passes plain objects here.
    this._clipboardData = (eventInitDict?.clipboardData ?? null) as DataTransfer | null;
  }

  get clipboardData(): DataTransfer | null {
    return this._clipboardData;
  }
}
setToStringTag(ClipboardEvent);
