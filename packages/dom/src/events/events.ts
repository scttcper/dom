// Non-UI event interfaces.
// https://dom.spec.whatwg.org/#interface-customevent
// https://html.spec.whatwg.org/#the-errorevent-interface
// https://html.spec.whatwg.org/#the-promiserejectionevent-interface
// https://html.spec.whatwg.org/#the-messageevent-interface
// https://xhr.spec.whatwg.org/#interface-progressevent
// https://drafts.csswg.org/css-animations/#interface-animationevent
// https://drafts.csswg.org/css-transitions/#interface-transitionevent
// https://html.spec.whatwg.org/#the-popstateevent-interface
// https://html.spec.whatwg.org/#the-hashchangeevent-interface
// https://html.spec.whatwg.org/#the-pagetransitionevent-interface
// https://html.spec.whatwg.org/#the-storageevent-interface
// https://html.spec.whatwg.org/#the-submitevent-interface
// https://html.spec.whatwg.org/#the-formdataevent-interface
// https://html.spec.whatwg.org/#the-toggleevent-interface
// https://html.spec.whatwg.org/#the-beforeunloadevent-interface
// https://websockets.spec.whatwg.org/#the-closeevent-interface

import { EF_DISPATCH, Event, initializeEvent, isInternalConstruct, setToStringTag } from "./Event.ts";
import type { EventInit } from "../webidl.ts";
import { requireArgs } from "./UIEvents.ts";
import { toDOMString, toDouble, toUnsignedLong, toUnsignedShort } from "./convert.ts";

type Dict = Record<string, unknown>;

const get = (d: unknown, k: string): unknown => (d === undefined || d === null ? undefined : (d as Dict)[k]);
const str = (d: unknown, k: string, def = ""): string => {
  const v = get(d, k);
  return v === undefined ? def : toDOMString(v);
};
const nullableStr = (d: unknown, k: string): string | null => {
  const v = get(d, k);
  return v === undefined || v === null ? null : toDOMString(v);
};
const dbl = (d: unknown, k: string, iface: string): number => {
  const v = get(d, k);
  return v === undefined ? 0 : toDouble(v, `Failed to construct '${iface}': member ${k}`);
};

function required(d: unknown, k: string, iface: string): unknown {
  const v = get(d, k);
  if (v === undefined) throw new TypeError(`Failed to construct '${iface}': required member ${k} is undefined.`);
  return v;
}

// --- CustomEvent ----------------------------------------------------------------------------

export interface CustomEventInit<T = unknown> extends EventInit {
  detail?: T;
}

/** https://dom.spec.whatwg.org/#interface-customevent */
export class CustomEvent<T = unknown> extends Event {
  _detail: T | null;

  constructor(type: string, eventInitDict?: CustomEventInit<T> | null) {
    requireArgs(arguments.length, 1, new.target.name);
    super(type, eventInitDict);
    const detail = eventInitDict?.detail;
    this._detail = detail === undefined ? null : detail;
  }

  get detail(): T | null {
    return this._detail;
  }

  /** https://dom.spec.whatwg.org/#dom-customevent-initcustomevent */
  initCustomEvent(type: string, bubbles = false, cancelable = false, detail: T | null = null): void {
    if (arguments.length === 0) throw new TypeError("Failed to execute 'initCustomEvent' on 'CustomEvent': 1 argument required, but only 0 present.");
    if ((this._s.flags & EF_DISPATCH) !== 0) return;
    initializeEvent(this._s, toDOMString(type), !!bubbles, !!cancelable);
    this._detail = detail;
  }
}
setToStringTag(CustomEvent);

// --- ErrorEvent -----------------------------------------------------------------------------

export interface ErrorEventInit extends EventInit {
  message?: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  error?: unknown;
}

/** https://html.spec.whatwg.org/#the-errorevent-interface */
export class ErrorEvent extends Event {
  _message: string;
  _filename: string;
  _lineno: number;
  _colno: number;
  _error: unknown;

  constructor(type: string, eventInitDict?: ErrorEventInit | null) {
    requireArgs(arguments.length, 1, new.target.name);
    super(type, eventInitDict);
    const d = eventInitDict;
    this._message = str(d, "message");
    this._filename = str(d, "filename");
    const lineno = get(d, "lineno");
    const colno = get(d, "colno");
    this._lineno = lineno === undefined ? 0 : toUnsignedLong(lineno);
    this._colno = colno === undefined ? 0 : toUnsignedLong(colno);
    this._error = get(d, "error");
  }

  get message(): string {
    return this._message;
  }
  get filename(): string {
    return this._filename;
  }
  get lineno(): number {
    return this._lineno;
  }
  get colno(): number {
    return this._colno;
  }
  get error(): unknown {
    return this._error;
  }
}
setToStringTag(ErrorEvent);

// --- PromiseRejectionEvent ------------------------------------------------------------------

export interface PromiseRejectionEventInit extends EventInit {
  promise: Promise<unknown>;
  reason?: unknown;
}

/** https://html.spec.whatwg.org/#the-promiserejectionevent-interface */
export class PromiseRejectionEvent extends Event {
  _promise: Promise<unknown>;
  _reason: unknown;

  constructor(type: string, eventInitDict: PromiseRejectionEventInit) {
    requireArgs(arguments.length, 2, new.target.name);
    const promise = required(eventInitDict, "promise", new.target.name);
    if (promise === null || (typeof promise !== "object" && typeof promise !== "function")) {
      throw new TypeError(`Failed to construct '${new.target.name}': member promise is not an object.`);
    }
    super(type, eventInitDict);
    this._promise = promise as Promise<unknown>;
    this._reason = get(eventInitDict, "reason");
  }

  get promise(): Promise<unknown> {
    return this._promise;
  }
  get reason(): unknown {
    return this._reason;
  }
}
setToStringTag(PromiseRejectionEvent);

// --- MessageEvent ---------------------------------------------------------------------------

export interface MessageEventInit extends EventInit {
  data?: unknown;
  origin?: string;
  lastEventId?: string;
  source?: unknown;
  ports?: unknown[];
}

/** https://html.spec.whatwg.org/#the-messageevent-interface */
export class MessageEvent extends Event {
  _data: unknown;
  _origin: string;
  _lastEventId: string;
  _source: unknown;
  _ports: readonly unknown[];

  constructor(type: string, eventInitDict?: MessageEventInit | null) {
    requireArgs(arguments.length, 1, new.target.name);
    super(type, eventInitDict);
    const d = eventInitDict;
    const data = get(d, "data");
    this._data = data === undefined ? null : data;
    this._origin = str(d, "origin");
    this._lastEventId = str(d, "lastEventId");
    this._source = get(d, "source") ?? null;
    const ports = get(d, "ports");
    this._ports = Object.freeze(ports == null ? [] : Array.from(ports as Iterable<unknown>));
  }

  get data(): unknown {
    return this._data;
  }
  get origin(): string {
    return this._origin;
  }
  get lastEventId(): string {
    return this._lastEventId;
  }
  get source(): unknown {
    return this._source;
  }
  get ports(): readonly unknown[] {
    return this._ports;
  }

  /** https://html.spec.whatwg.org/#dom-messageevent-initmessageevent */
  initMessageEvent(type: string, bubbles = false, cancelable = false, data: unknown = null, origin = "", lastEventId = "", source: unknown = null, ports: unknown[] = []): void {
    if ((this._s.flags & EF_DISPATCH) !== 0) return;
    initializeEvent(this._s, toDOMString(type), !!bubbles, !!cancelable);
    this._data = data;
    this._origin = toDOMString(origin);
    this._lastEventId = toDOMString(lastEventId);
    this._source = source;
    this._ports = Object.freeze(Array.from(ports));
  }
}
setToStringTag(MessageEvent);

// --- ProgressEvent --------------------------------------------------------------------------

export interface ProgressEventInit extends EventInit {
  lengthComputable?: boolean;
  loaded?: number;
  total?: number;
}

/** https://xhr.spec.whatwg.org/#interface-progressevent */
export class ProgressEvent extends Event {
  _lengthComputable: boolean;
  _loaded: number;
  _total: number;

  constructor(type: string, eventInitDict?: ProgressEventInit | null) {
    requireArgs(arguments.length, 1, new.target.name);
    super(type, eventInitDict);
    this._lengthComputable = !!get(eventInitDict, "lengthComputable");
    this._loaded = dbl(eventInitDict, "loaded", new.target.name);
    this._total = dbl(eventInitDict, "total", new.target.name);
  }

  get lengthComputable(): boolean {
    return this._lengthComputable;
  }
  get loaded(): number {
    return this._loaded;
  }
  get total(): number {
    return this._total;
  }
}
setToStringTag(ProgressEvent);

// --- AnimationEvent / TransitionEvent -------------------------------------------------------

export interface AnimationEventInit extends EventInit {
  animationName?: string;
  elapsedTime?: number;
  pseudoElement?: string;
}

/** https://drafts.csswg.org/css-animations/#interface-animationevent */
export class AnimationEvent extends Event {
  _animationName: string;
  _elapsedTime: number;
  _pseudoElement: string;

  constructor(type: string, eventInitDict?: AnimationEventInit | null) {
    requireArgs(arguments.length, 1, new.target.name);
    super(type, eventInitDict);
    this._animationName = str(eventInitDict, "animationName");
    this._elapsedTime = dbl(eventInitDict, "elapsedTime", new.target.name);
    this._pseudoElement = str(eventInitDict, "pseudoElement");
  }

  get animationName(): string {
    return this._animationName;
  }
  get elapsedTime(): number {
    return this._elapsedTime;
  }
  get pseudoElement(): string {
    return this._pseudoElement;
  }
}
setToStringTag(AnimationEvent);

export interface TransitionEventInit extends EventInit {
  propertyName?: string;
  elapsedTime?: number;
  pseudoElement?: string;
}

/** https://drafts.csswg.org/css-transitions/#interface-transitionevent */
export class TransitionEvent extends Event {
  _propertyName: string;
  _elapsedTime: number;
  _pseudoElement: string;

  constructor(type: string, eventInitDict?: TransitionEventInit | null) {
    requireArgs(arguments.length, 1, new.target.name);
    super(type, eventInitDict);
    this._propertyName = str(eventInitDict, "propertyName");
    this._elapsedTime = dbl(eventInitDict, "elapsedTime", new.target.name);
    this._pseudoElement = str(eventInitDict, "pseudoElement");
  }

  get propertyName(): string {
    return this._propertyName;
  }
  get elapsedTime(): number {
    return this._elapsedTime;
  }
  get pseudoElement(): string {
    return this._pseudoElement;
  }
}
setToStringTag(TransitionEvent);

// --- History / navigation events -----------------------------------------------------------

export interface PopStateEventInit extends EventInit {
  state?: unknown;
  hasUAVisualTransition?: boolean;
}

/** https://html.spec.whatwg.org/#the-popstateevent-interface */
export class PopStateEvent extends Event {
  _state: unknown;
  _hasUAVisualTransition: boolean;

  constructor(type: string, eventInitDict?: PopStateEventInit | null) {
    requireArgs(arguments.length, 1, new.target.name);
    super(type, eventInitDict);
    const state = get(eventInitDict, "state");
    this._state = state === undefined ? null : state;
    this._hasUAVisualTransition = !!get(eventInitDict, "hasUAVisualTransition");
  }

  get state(): unknown {
    return this._state;
  }
  get hasUAVisualTransition(): boolean {
    return this._hasUAVisualTransition;
  }
}
setToStringTag(PopStateEvent);

export interface HashChangeEventInit extends EventInit {
  oldURL?: string;
  newURL?: string;
}

/** https://html.spec.whatwg.org/#the-hashchangeevent-interface */
export class HashChangeEvent extends Event {
  _oldURL: string;
  _newURL: string;

  constructor(type: string, eventInitDict?: HashChangeEventInit | null) {
    requireArgs(arguments.length, 1, new.target.name);
    super(type, eventInitDict);
    this._oldURL = str(eventInitDict, "oldURL");
    this._newURL = str(eventInitDict, "newURL");
  }

  get oldURL(): string {
    return this._oldURL;
  }
  get newURL(): string {
    return this._newURL;
  }
}
setToStringTag(HashChangeEvent);

export interface PageTransitionEventInit extends EventInit {
  persisted?: boolean;
}

/** https://html.spec.whatwg.org/#the-pagetransitionevent-interface */
export class PageTransitionEvent extends Event {
  _persisted: boolean;

  constructor(type: string, eventInitDict?: PageTransitionEventInit | null) {
    requireArgs(arguments.length, 1, new.target.name);
    super(type, eventInitDict);
    this._persisted = !!get(eventInitDict, "persisted");
  }

  get persisted(): boolean {
    return this._persisted;
  }
}
setToStringTag(PageTransitionEvent);

// --- StorageEvent ---------------------------------------------------------------------------

export interface StorageEventInit extends EventInit {
  key?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  url?: string;
  storageArea?: unknown;
}

/** https://html.spec.whatwg.org/#the-storageevent-interface */
export class StorageEvent extends Event {
  _key: string | null;
  _oldValue: string | null;
  _newValue: string | null;
  _url: string;
  _storageArea: unknown;

  constructor(type: string, eventInitDict?: StorageEventInit | null) {
    requireArgs(arguments.length, 1, new.target.name);
    super(type, eventInitDict);
    this._key = nullableStr(eventInitDict, "key");
    this._oldValue = nullableStr(eventInitDict, "oldValue");
    this._newValue = nullableStr(eventInitDict, "newValue");
    this._url = str(eventInitDict, "url");
    this._storageArea = get(eventInitDict, "storageArea") ?? null;
  }

  get key(): string | null {
    return this._key;
  }
  get oldValue(): string | null {
    return this._oldValue;
  }
  get newValue(): string | null {
    return this._newValue;
  }
  get url(): string {
    return this._url;
  }
  get storageArea(): unknown {
    return this._storageArea;
  }

  /** https://html.spec.whatwg.org/#dom-storageevent-initstorageevent */
  initStorageEvent(
    type: string,
    bubbles = false,
    cancelable = false,
    key: string | null = null,
    oldValue: string | null = null,
    newValue: string | null = null,
    url = "",
    storageArea: unknown = null,
  ): void {
    if ((this._s.flags & EF_DISPATCH) !== 0) return;
    initializeEvent(this._s, toDOMString(type), !!bubbles, !!cancelable);
    this._key = key === null ? null : toDOMString(key);
    this._oldValue = oldValue === null ? null : toDOMString(oldValue);
    this._newValue = newValue === null ? null : toDOMString(newValue);
    this._url = toDOMString(url);
    this._storageArea = storageArea;
  }
}
setToStringTag(StorageEvent);

// --- Form events ----------------------------------------------------------------------------

export interface SubmitEventInit extends EventInit {
  submitter?: unknown;
}

/** https://html.spec.whatwg.org/#the-submitevent-interface */
export class SubmitEvent extends Event {
  _submitter: unknown;

  constructor(type: string, eventInitDict?: SubmitEventInit | null) {
    requireArgs(arguments.length, 1, new.target.name);
    super(type, eventInitDict);
    this._submitter = get(eventInitDict, "submitter") ?? null;
  }

  get submitter(): unknown {
    return this._submitter;
  }
}
setToStringTag(SubmitEvent);

export interface FormDataEventInit extends EventInit {
  formData: unknown;
}

/** https://html.spec.whatwg.org/#the-formdataevent-interface */
export class FormDataEvent extends Event {
  _formData: unknown;

  constructor(type: string, eventInitDict: FormDataEventInit) {
    requireArgs(arguments.length, 2, new.target.name);
    const formData = required(eventInitDict, "formData", new.target.name);
    super(type, eventInitDict);
    this._formData = formData;
  }

  get formData(): unknown {
    return this._formData;
  }
}
setToStringTag(FormDataEvent);

export interface ToggleEventInit extends EventInit {
  oldState?: string;
  newState?: string;
  source?: unknown;
}

/** https://html.spec.whatwg.org/#the-toggleevent-interface */
export class ToggleEvent extends Event {
  _oldState: string;
  _newState: string;
  _source: unknown;

  constructor(type: string, eventInitDict?: ToggleEventInit | null) {
    requireArgs(arguments.length, 1, new.target.name);
    super(type, eventInitDict);
    this._oldState = str(eventInitDict, "oldState");
    this._newState = str(eventInitDict, "newState");
    this._source = get(eventInitDict, "source") ?? null;
  }

  get oldState(): string {
    return this._oldState;
  }
  get newState(): string {
    return this._newState;
  }
  get source(): unknown {
    return this._source;
  }
}
setToStringTag(ToggleEvent);

// --- BeforeUnloadEvent ----------------------------------------------------------------------

/** https://html.spec.whatwg.org/#the-beforeunloadevent-interface (no public constructor). */
export class BeforeUnloadEvent extends Event {
  _returnValue: string;

  constructor(type: string, eventInitDict?: EventInit | null) {
    if (!isInternalConstruct()) throw new TypeError("Illegal constructor");
    super(type, eventInitDict);
    this._returnValue = "";
  }

  // The legacy string returnValue shadows Event#returnValue (boolean).
  // @ts-expect-error — different type than the base accessor, as in the IDL.
  override get returnValue(): string {
    return this._returnValue;
  }

  // @ts-expect-error — see above.
  override set returnValue(value: string) {
    this._returnValue = toDOMString(value);
  }
}
setToStringTag(BeforeUnloadEvent);

// --- CloseEvent -----------------------------------------------------------------------------

export interface CloseEventInit extends EventInit {
  wasClean?: boolean;
  code?: number;
  reason?: string;
}

/** https://websockets.spec.whatwg.org/#the-closeevent-interface */
export class CloseEvent extends Event {
  _wasClean: boolean;
  _code: number;
  _reason: string;

  constructor(type: string, eventInitDict?: CloseEventInit | null) {
    requireArgs(arguments.length, 1, new.target.name);
    super(type, eventInitDict);
    this._wasClean = !!get(eventInitDict, "wasClean");
    const code = get(eventInitDict, "code");
    this._code = code === undefined ? 0 : toUnsignedShort(code);
    this._reason = str(eventInitDict, "reason");
  }

  get wasClean(): boolean {
    return this._wasClean;
  }
  get code(): number {
    return this._code;
  }
  get reason(): string {
    return this._reason;
  }
}
setToStringTag(CloseEvent);
