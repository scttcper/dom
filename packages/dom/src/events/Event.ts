// https://dom.spec.whatwg.org/#interface-event
//
// Design notes (performance):
// - Every piece of state the dispatch algorithm touches lives in one `EventState` object
//   (`event._s`). Event subclasses have different hidden classes, so reading flags straight
//   off the event would make the dispatch loop megamorphic as soon as a test mixes
//   MouseEvent/KeyboardEvent/FocusEvent/InputEvent... Reading `event._s` once and then
//   working on the monomorphic `EventState` keeps the hot loop on a single map.
// - The event path (https://dom.spec.whatwg.org/#event-path) is not an array of struct
//   objects: structs live in one module-level strided array used as a stack (see `PATH`).
//   A dispatch pushes its structs at the top and pops them when done, so nested
//   (re-entrant) dispatches stack naturally and steady-state dispatch allocates nothing.

import { exposeMembers } from "../webidl-runtime.ts";
import type { EventInit } from "../webidl.ts";
import type { EventTarget } from "./EventTarget.ts";
import { toDOMString } from "./convert.ts";

export const NONE = 0;
export const CAPTURING_PHASE = 1;
export const AT_TARGET = 2;
export const BUBBLING_PHASE = 3;

// EventState.flags — https://dom.spec.whatwg.org/#stop-propagation-flag and following.
export const EF_STOP_PROPAGATION = 1 << 0;
export const EF_STOP_IMMEDIATE = 1 << 1;
export const EF_CANCELED = 1 << 2;
export const EF_IN_PASSIVE_LISTENER = 1 << 3;
export const EF_COMPOSED = 1 << 4;
export const EF_INITIALIZED = 1 << 5;
export const EF_DISPATCH = 1 << 6;
export const EF_TRUSTED = 1 << 7;
export const EF_BUBBLES = 1 << 8;
export const EF_CANCELABLE = 1 << 9;
/** Set on MouseEvent (and subclasses) so dispatch can detect activation events without instanceof. */
export const EF_MOUSE_EVENT = 1 << 10;
/** Set on TouchEvent so dispatch computes touch target lists. */
export const EF_TOUCH_EVENT = 1 << 11;

/** Internal, monomorphic per-event state. Never exposed. */
export class EventState {
  flags: number;
  type: string;
  target: EventTarget | null;
  relatedTarget: EventTarget | null;
  currentTarget: EventTarget | null;
  eventPhase: number;
  /** Offset of the first path struct in `PATH`, or -1 when the path is empty. */
  pathStart: number;
  /** Number of structs in the path. */
  pathLength: number;
  /** https://dom.spec.whatwg.org/#event-touch-target-list (retargeted touch targets for the current struct). */
  touchTargets: EventTarget[] | null;
  timeStamp: number;

  constructor(type: string, flags: number) {
    this.flags = flags;
    this.type = type;
    this.target = null;
    this.relatedTarget = null;
    this.currentTarget = null;
    this.eventPhase = NONE;
    this.pathStart = -1;
    this.pathLength = 0;
    this.touchTargets = null;
    this.timeStamp = performance.now();
  }
}

// ---------------------------------------------------------------------------------------------
// The event path stack. Struct i of a path starting at `start` occupies
// PATH[start + i*STRIDE ... start + i*STRIDE + STRIDE - 1]:
//   +0 invocation target (EventTarget)
//   +1 effective target: shadow-adjusted target of this struct or the nearest preceding struct
//      that has one (what `event.target` is set to when this struct is invoked)
//   +2 relatedTarget (EventTarget | null)
//   +3 touch target list (EventTarget[] | null)
//   +4 PF_* flags
// https://dom.spec.whatwg.org/#concept-event-path-append

export const STRIDE = 5;
export const PF_IN_SHADOW_TREE = 1;
export const PF_ROOT_OF_CLOSED_TREE = 2;
export const PF_SLOT_IN_CLOSED_TREE = 4;
export const PF_HAS_SHADOW_ADJUSTED_TARGET = 8;

export const PATH: unknown[] = [];
export const pathStack = { top: 0 };

let constructing = false;
/** @internal Allows `createEvent` / internal code to construct interfaces with no public constructor. */
export function withInternalConstruct<T>(fn: () => T): T {
  const prev = constructing;
  constructing = true;
  try {
    return fn();
  } finally {
    constructing = prev;
  }
}
export function isInternalConstruct(): boolean {
  return constructing;
}

const IS_TRUSTED: PropertyDescriptor = {
  get: function isTrusted(this: Event): boolean {
    return (this._s.flags & EF_TRUSTED) !== 0;
  },
  enumerable: true,
  configurable: false,
};

export class Event {
  static readonly NONE = NONE;
  static readonly CAPTURING_PHASE = CAPTURING_PHASE;
  static readonly AT_TARGET = AT_TARGET;
  static readonly BUBBLING_PHASE = BUBBLING_PHASE;
  declare readonly NONE: 0;
  declare readonly CAPTURING_PHASE: 1;
  declare readonly AT_TARGET: 2;
  declare readonly BUBBLING_PHASE: 3;

  // All internal state lives in one private field: nothing but `isTrusted` is an own
  // enumerable property, as with WebIDL/jsdom (pretty-format prints `Event {"isTrusted": false}`).
  #s: EventState;

  /** @internal The per-event state record (non-enumerable prototype accessor). */
  get _s(): EventState {
    return this.#s;
  }

  /** https://dom.spec.whatwg.org/#dom-event-event */
  constructor(type: string, eventInitDict?: EventInit | null) {
    if (arguments.length === 0) {
      throw new TypeError(`Failed to construct '${new.target.name}': 1 argument required, but only 0 present.`);
    }
    // WebIDL converts arguments in order: the type before the dictionary members.
    const typeString = toDOMString(type);
    let flags = EF_INITIALIZED;
    if (eventInitDict !== undefined && eventInitDict !== null) {
      if (typeof eventInitDict !== "object" && typeof eventInitDict !== "function") {
        throw new TypeError(`Failed to construct '${new.target.name}': The provided value is not of type '${new.target.name}Init'.`);
      }
      if (eventInitDict.bubbles) flags |= EF_BUBBLES;
      if (eventInitDict.cancelable) flags |= EF_CANCELABLE;
      if (eventInitDict.composed) flags |= EF_COMPOSED;
    }
    this.#s = new EventState(typeString, flags);
    // https://dom.spec.whatwg.org/#dom-event-istrusted — [LegacyUnforgeable]: an own,
    // enumerable, non-configurable accessor on every instance, sharing one getter.
    Object.defineProperty(this, "isTrusted", IS_TRUSTED);
  }

  get type(): string {
    return this._s.type;
  }

  get target(): EventTarget | null {
    return this._s.target;
  }

  /** https://dom.spec.whatwg.org/#dom-event-srcelement (historical alias) */
  get srcElement(): EventTarget | null {
    return this._s.target;
  }

  get currentTarget(): EventTarget | null {
    return this._s.currentTarget;
  }

  get eventPhase(): number {
    return this._s.eventPhase;
  }

  get bubbles(): boolean {
    return (this._s.flags & EF_BUBBLES) !== 0;
  }

  get cancelable(): boolean {
    return (this._s.flags & EF_CANCELABLE) !== 0;
  }

  get composed(): boolean {
    return (this._s.flags & EF_COMPOSED) !== 0;
  }

  declare readonly isTrusted: boolean;

  /** https://dom.spec.whatwg.org/#dom-event-timestamp — ms since the time origin (performance.now()). */
  get timeStamp(): number {
    return this._s.timeStamp;
  }

  get defaultPrevented(): boolean {
    return (this._s.flags & EF_CANCELED) !== 0;
  }

  /** https://dom.spec.whatwg.org/#dom-event-returnvalue */
  get returnValue(): boolean {
    return (this._s.flags & EF_CANCELED) === 0;
  }

  set returnValue(value: boolean) {
    if (!value) setCanceledFlag(this._s);
  }

  /** https://dom.spec.whatwg.org/#dom-event-cancelbubble */
  get cancelBubble(): boolean {
    return (this._s.flags & EF_STOP_PROPAGATION) !== 0;
  }

  set cancelBubble(value: boolean) {
    if (value) this._s.flags |= EF_STOP_PROPAGATION;
  }

  /** https://dom.spec.whatwg.org/#dom-event-stoppropagation */
  stopPropagation(): void {
    this._s.flags |= EF_STOP_PROPAGATION;
  }

  /** https://dom.spec.whatwg.org/#dom-event-stopimmediatepropagation */
  stopImmediatePropagation(): void {
    this._s.flags |= EF_STOP_PROPAGATION | EF_STOP_IMMEDIATE;
  }

  /** https://dom.spec.whatwg.org/#dom-event-preventdefault */
  preventDefault(): void {
    setCanceledFlag(this._s);
  }

  /** https://dom.spec.whatwg.org/#dom-event-composedpath */
  composedPath(): EventTarget[] {
    const s = this._s;
    const composedPath: EventTarget[] = [];
    // Steps 2-3.
    const len = s.pathLength;
    if (len === 0 || s.pathStart < 0) return composedPath;
    const base = s.pathStart;
    // Steps 4-5.
    const currentTarget = s.currentTarget;
    if (currentTarget === null) return composedPath;
    // Steps 6-9: find the current target, tracking how deep in closed trees it is.
    let currentTargetIndex = 0;
    let currentTargetHiddenSubtreeLevel = 0;
    for (let index = len - 1; index >= 0; index--) {
      const o = base + index * STRIDE;
      const f = PATH[o + 4] as number;
      if ((f & PF_ROOT_OF_CLOSED_TREE) !== 0) currentTargetHiddenSubtreeLevel++;
      if (PATH[o] === currentTarget) {
        currentTargetIndex = index;
        break;
      }
      if ((f & PF_SLOT_IN_CLOSED_TREE) !== 0) currentTargetHiddenSubtreeLevel--;
    }
    // Steps 10-12: structs before the current target (collected reversed, then flipped).
    let currentHiddenLevel = currentTargetHiddenSubtreeLevel;
    let maxHiddenLevel = currentTargetHiddenSubtreeLevel;
    const before: EventTarget[] = [];
    for (let index = currentTargetIndex - 1; index >= 0; index--) {
      const o = base + index * STRIDE;
      const f = PATH[o + 4] as number;
      if ((f & PF_ROOT_OF_CLOSED_TREE) !== 0) currentHiddenLevel++;
      if (currentHiddenLevel <= maxHiddenLevel) before.push(PATH[o] as EventTarget);
      if ((f & PF_SLOT_IN_CLOSED_TREE) !== 0) {
        currentHiddenLevel--;
        if (currentHiddenLevel < maxHiddenLevel) maxHiddenLevel = currentHiddenLevel;
      }
    }
    for (let i = before.length - 1; i >= 0; i--) composedPath.push(before[i]);
    composedPath.push(currentTarget);
    // Steps 13-15: structs after the current target.
    currentHiddenLevel = currentTargetHiddenSubtreeLevel;
    maxHiddenLevel = currentTargetHiddenSubtreeLevel;
    for (let index = currentTargetIndex + 1; index < len; index++) {
      const o = base + index * STRIDE;
      const f = PATH[o + 4] as number;
      if ((f & PF_SLOT_IN_CLOSED_TREE) !== 0) currentHiddenLevel++;
      if (currentHiddenLevel <= maxHiddenLevel) composedPath.push(PATH[o] as EventTarget);
      if ((f & PF_ROOT_OF_CLOSED_TREE) !== 0) {
        currentHiddenLevel--;
        if (currentHiddenLevel < maxHiddenLevel) maxHiddenLevel = currentHiddenLevel;
      }
    }
    return composedPath;
  }

  /** https://dom.spec.whatwg.org/#dom-event-initevent */
  initEvent(type: string, bubbles = false, cancelable = false): void {
    if (arguments.length === 0) {
      throw new TypeError("Failed to execute 'initEvent' on 'Event': 1 argument required, but only 0 present.");
    }
    const s = this._s;
    if ((s.flags & EF_DISPATCH) !== 0) return;
    initializeEvent(s, toDOMString(type), !!bubbles, !!cancelable);
  }
}

Object.defineProperties(Event.prototype, {
  NONE: { value: NONE, enumerable: true },
  CAPTURING_PHASE: { value: CAPTURING_PHASE, enumerable: true },
  AT_TARGET: { value: AT_TARGET, enumerable: true },
  BUBBLING_PHASE: { value: BUBBLING_PHASE, enumerable: true },
  [Symbol.toStringTag]: { value: "Event", configurable: true },
});

/** https://dom.spec.whatwg.org/#set-the-canceled-flag */
export function setCanceledFlag(s: EventState): void {
  if ((s.flags & (EF_CANCELABLE | EF_IN_PASSIVE_LISTENER)) === EF_CANCELABLE) s.flags |= EF_CANCELED;
}

/** https://dom.spec.whatwg.org/#concept-event-initialize */
export function initializeEvent(s: EventState, type: string, bubbles: boolean, cancelable: boolean): void {
  // Steps 1-4: set initialized; unset stop propagation, stop immediate, canceled; isTrusted false.
  let f = (s.flags | EF_INITIALIZED) & ~(EF_STOP_PROPAGATION | EF_STOP_IMMEDIATE | EF_CANCELED | EF_TRUSTED | EF_BUBBLES | EF_CANCELABLE);
  if (bubbles) f |= EF_BUBBLES;
  if (cancelable) f |= EF_CANCELABLE;
  s.flags = f;
  // Steps 5-8.
  s.target = null;
  s.type = type;
}

/** @internal Mark an event as trusted (dispatched by the user agent). */
export function setTrusted(event: Event, trusted = true): void {
  if (trusted) event._s.flags |= EF_TRUSTED;
  else event._s.flags &= ~EF_TRUSTED;
}

/** Name used in subclass constructor errors. */
export function setToStringTag(ctor: { prototype: object; name: string }, requiredArgs?: number): void {
  Object.defineProperty(ctor.prototype, Symbol.toStringTag, { value: ctor.name, configurable: true });
  // https://webidl.spec.whatwg.org/#es-interface-call step "length": the shortest constructor
  // argument list (`constructor(type, optional init)` → 1; TS `init?` params would count as 2).
  if (requiredArgs !== undefined) Object.defineProperty(ctor, "length", { value: requiredArgs, configurable: true });
}

setToStringTag(Event, 1);
// WebIDL: attributes and operations are enumerable prototype members.
exposeMembers(Event);
