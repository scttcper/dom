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

import { exposeMembers } from "../webidl-runtime.ts";
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
  #detail: T | null;

  constructor(type: string, eventInitDict?: CustomEventInit<T> | null) {
    requireArgs(arguments.length, 1, new.target.name);
    super(type, eventInitDict);
    const detail = eventInitDict?.detail;
    this.#detail = detail === undefined ? null : detail;
  }

  get detail(): T | null {
    return this.#detail;
  }

  /** https://dom.spec.whatwg.org/#dom-customevent-initcustomevent */
  initCustomEvent(type: string, bubbles = false, cancelable = false, detail: T | null = null): void {
    if (arguments.length === 0) throw new TypeError("Failed to execute 'initCustomEvent' on 'CustomEvent': 1 argument required, but only 0 present.");
    if ((this._s.flags & EF_DISPATCH) !== 0) return;
    initializeEvent(this._s, toDOMString(type), !!bubbles, !!cancelable);
    this.#detail = detail;
  }
}
setToStringTag(CustomEvent, 1);

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
  #message: string;
  #filename: string;
  #lineno: number;
  #colno: number;
  #error: unknown;

  constructor(type: string, eventInitDict?: ErrorEventInit | null) {
    requireArgs(arguments.length, 1, new.target.name);
    super(type, eventInitDict);
    const d = eventInitDict;
    this.#message = str(d, "message");
    this.#filename = str(d, "filename");
    const lineno = get(d, "lineno");
    const colno = get(d, "colno");
    this.#lineno = lineno === undefined ? 0 : toUnsignedLong(lineno);
    this.#colno = colno === undefined ? 0 : toUnsignedLong(colno);
    this.#error = get(d, "error");
  }

  get message(): string {
    return this.#message;
  }
  get filename(): string {
    return this.#filename;
  }
  get lineno(): number {
    return this.#lineno;
  }
  get colno(): number {
    return this.#colno;
  }
  get error(): unknown {
    return this.#error;
  }
}
setToStringTag(ErrorEvent, 1);

// --- PromiseRejectionEvent ------------------------------------------------------------------

export interface PromiseRejectionEventInit extends EventInit {
  promise: Promise<unknown>;
  reason?: unknown;
}

/** https://html.spec.whatwg.org/#the-promiserejectionevent-interface */
export class PromiseRejectionEvent extends Event {
  #promise: Promise<unknown>;
  #reason: unknown;

  constructor(type: string, eventInitDict: PromiseRejectionEventInit) {
    requireArgs(arguments.length, 2, new.target.name);
    const promise = required(eventInitDict, "promise", new.target.name);
    if (promise === null || (typeof promise !== "object" && typeof promise !== "function")) {
      throw new TypeError(`Failed to construct '${new.target.name}': member promise is not an object.`);
    }
    super(type, eventInitDict);
    this.#promise = promise as Promise<unknown>;
    this.#reason = get(eventInitDict, "reason");
  }

  get promise(): Promise<unknown> {
    return this.#promise;
  }
  get reason(): unknown {
    return this.#reason;
  }
}
setToStringTag(PromiseRejectionEvent, 2);

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
  #data: unknown;
  #origin: string;
  #lastEventId: string;
  #source: unknown;
  #ports: readonly unknown[];

  constructor(type: string, eventInitDict?: MessageEventInit | null) {
    requireArgs(arguments.length, 1, new.target.name);
    super(type, eventInitDict);
    const d = eventInitDict;
    const data = get(d, "data");
    this.#data = data === undefined ? null : data;
    this.#origin = str(d, "origin");
    this.#lastEventId = str(d, "lastEventId");
    this.#source = get(d, "source") ?? null;
    const ports = get(d, "ports");
    this.#ports = Object.freeze(ports == null ? [] : Array.from(ports as Iterable<unknown>));
  }

  get data(): unknown {
    return this.#data;
  }
  get origin(): string {
    return this.#origin;
  }
  get lastEventId(): string {
    return this.#lastEventId;
  }
  get source(): unknown {
    return this.#source;
  }
  get ports(): readonly unknown[] {
    return this.#ports;
  }

  /** https://html.spec.whatwg.org/#dom-messageevent-initmessageevent */
  initMessageEvent(type: string, bubbles = false, cancelable = false, data: unknown = null, origin = "", lastEventId = "", source: unknown = null, ports: unknown[] = []): void {
    if ((this._s.flags & EF_DISPATCH) !== 0) return;
    initializeEvent(this._s, toDOMString(type), !!bubbles, !!cancelable);
    this.#data = data;
    this.#origin = toDOMString(origin);
    this.#lastEventId = toDOMString(lastEventId);
    this.#source = source;
    this.#ports = Object.freeze(Array.from(ports));
  }
}
setToStringTag(MessageEvent, 1);

// --- ProgressEvent --------------------------------------------------------------------------

export interface ProgressEventInit extends EventInit {
  lengthComputable?: boolean;
  loaded?: number;
  total?: number;
}

/** https://xhr.spec.whatwg.org/#interface-progressevent */
export class ProgressEvent extends Event {
  #lengthComputable: boolean;
  #loaded: number;
  #total: number;

  constructor(type: string, eventInitDict?: ProgressEventInit | null) {
    requireArgs(arguments.length, 1, new.target.name);
    super(type, eventInitDict);
    this.#lengthComputable = !!get(eventInitDict, "lengthComputable");
    this.#loaded = dbl(eventInitDict, "loaded", new.target.name);
    this.#total = dbl(eventInitDict, "total", new.target.name);
  }

  get lengthComputable(): boolean {
    return this.#lengthComputable;
  }
  get loaded(): number {
    return this.#loaded;
  }
  get total(): number {
    return this.#total;
  }
}
setToStringTag(ProgressEvent, 1);

// --- AnimationEvent / TransitionEvent -------------------------------------------------------

export interface AnimationEventInit extends EventInit {
  animationName?: string;
  elapsedTime?: number;
  pseudoElement?: string;
}

/** https://drafts.csswg.org/css-animations/#interface-animationevent */
export class AnimationEvent extends Event {
  #animationName: string;
  #elapsedTime: number;
  #pseudoElement: string;

  constructor(type: string, eventInitDict?: AnimationEventInit | null) {
    requireArgs(arguments.length, 1, new.target.name);
    super(type, eventInitDict);
    this.#animationName = str(eventInitDict, "animationName");
    this.#elapsedTime = dbl(eventInitDict, "elapsedTime", new.target.name);
    this.#pseudoElement = str(eventInitDict, "pseudoElement");
  }

  get animationName(): string {
    return this.#animationName;
  }
  get elapsedTime(): number {
    return this.#elapsedTime;
  }
  get pseudoElement(): string {
    return this.#pseudoElement;
  }
}
setToStringTag(AnimationEvent, 1);

export interface TransitionEventInit extends EventInit {
  propertyName?: string;
  elapsedTime?: number;
  pseudoElement?: string;
}

/** https://drafts.csswg.org/css-transitions/#interface-transitionevent */
export class TransitionEvent extends Event {
  #propertyName: string;
  #elapsedTime: number;
  #pseudoElement: string;

  constructor(type: string, eventInitDict?: TransitionEventInit | null) {
    requireArgs(arguments.length, 1, new.target.name);
    super(type, eventInitDict);
    this.#propertyName = str(eventInitDict, "propertyName");
    this.#elapsedTime = dbl(eventInitDict, "elapsedTime", new.target.name);
    this.#pseudoElement = str(eventInitDict, "pseudoElement");
  }

  get propertyName(): string {
    return this.#propertyName;
  }
  get elapsedTime(): number {
    return this.#elapsedTime;
  }
  get pseudoElement(): string {
    return this.#pseudoElement;
  }
}
setToStringTag(TransitionEvent, 1);

// --- History / navigation events -----------------------------------------------------------

export interface PopStateEventInit extends EventInit {
  state?: unknown;
  hasUAVisualTransition?: boolean;
}

/** https://html.spec.whatwg.org/#the-popstateevent-interface */
export class PopStateEvent extends Event {
  #state: unknown;
  #hasUAVisualTransition: boolean;

  constructor(type: string, eventInitDict?: PopStateEventInit | null) {
    requireArgs(arguments.length, 1, new.target.name);
    super(type, eventInitDict);
    const state = get(eventInitDict, "state");
    this.#state = state === undefined ? null : state;
    this.#hasUAVisualTransition = !!get(eventInitDict, "hasUAVisualTransition");
  }

  get state(): unknown {
    return this.#state;
  }
  get hasUAVisualTransition(): boolean {
    return this.#hasUAVisualTransition;
  }
}
setToStringTag(PopStateEvent, 1);

export interface HashChangeEventInit extends EventInit {
  oldURL?: string;
  newURL?: string;
}

/** https://html.spec.whatwg.org/#the-hashchangeevent-interface */
export class HashChangeEvent extends Event {
  #oldURL: string;
  #newURL: string;

  constructor(type: string, eventInitDict?: HashChangeEventInit | null) {
    requireArgs(arguments.length, 1, new.target.name);
    super(type, eventInitDict);
    this.#oldURL = str(eventInitDict, "oldURL");
    this.#newURL = str(eventInitDict, "newURL");
  }

  get oldURL(): string {
    return this.#oldURL;
  }
  get newURL(): string {
    return this.#newURL;
  }
}
setToStringTag(HashChangeEvent, 1);

export interface PageTransitionEventInit extends EventInit {
  persisted?: boolean;
}

/** https://html.spec.whatwg.org/#the-pagetransitionevent-interface */
export class PageTransitionEvent extends Event {
  #persisted: boolean;

  constructor(type: string, eventInitDict?: PageTransitionEventInit | null) {
    requireArgs(arguments.length, 1, new.target.name);
    super(type, eventInitDict);
    this.#persisted = !!get(eventInitDict, "persisted");
  }

  get persisted(): boolean {
    return this.#persisted;
  }
}
setToStringTag(PageTransitionEvent, 1);

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
  #key: string | null;
  #oldValue: string | null;
  #newValue: string | null;
  #url: string;
  #storageArea: unknown;

  constructor(type: string, eventInitDict?: StorageEventInit | null) {
    requireArgs(arguments.length, 1, new.target.name);
    super(type, eventInitDict);
    this.#key = nullableStr(eventInitDict, "key");
    this.#oldValue = nullableStr(eventInitDict, "oldValue");
    this.#newValue = nullableStr(eventInitDict, "newValue");
    this.#url = str(eventInitDict, "url");
    this.#storageArea = get(eventInitDict, "storageArea") ?? null;
  }

  get key(): string | null {
    return this.#key;
  }
  get oldValue(): string | null {
    return this.#oldValue;
  }
  get newValue(): string | null {
    return this.#newValue;
  }
  get url(): string {
    return this.#url;
  }
  get storageArea(): unknown {
    return this.#storageArea;
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
    this.#key = key === null ? null : toDOMString(key);
    this.#oldValue = oldValue === null ? null : toDOMString(oldValue);
    this.#newValue = newValue === null ? null : toDOMString(newValue);
    this.#url = toDOMString(url);
    this.#storageArea = storageArea;
  }
}
setToStringTag(StorageEvent, 1);

// --- Form events ----------------------------------------------------------------------------

export interface SubmitEventInit extends EventInit {
  submitter?: unknown;
}

/** https://html.spec.whatwg.org/#the-submitevent-interface */
export class SubmitEvent extends Event {
  #submitter: unknown;

  constructor(type: string, eventInitDict?: SubmitEventInit | null) {
    requireArgs(arguments.length, 1, new.target.name);
    super(type, eventInitDict);
    this.#submitter = get(eventInitDict, "submitter") ?? null;
  }

  get submitter(): unknown {
    return this.#submitter;
  }
}
setToStringTag(SubmitEvent, 1);

export interface FormDataEventInit extends EventInit {
  formData: unknown;
}

/** https://html.spec.whatwg.org/#the-formdataevent-interface */
export class FormDataEvent extends Event {
  #formData: unknown;

  constructor(type: string, eventInitDict: FormDataEventInit) {
    requireArgs(arguments.length, 2, new.target.name);
    const formData = required(eventInitDict, "formData", new.target.name);
    super(type, eventInitDict);
    this.#formData = formData;
  }

  get formData(): unknown {
    return this.#formData;
  }
}
setToStringTag(FormDataEvent, 2);

export interface ToggleEventInit extends EventInit {
  oldState?: string;
  newState?: string;
  source?: unknown;
}

/** https://html.spec.whatwg.org/#the-toggleevent-interface */
export class ToggleEvent extends Event {
  #oldState: string;
  #newState: string;
  #source: unknown;

  constructor(type: string, eventInitDict?: ToggleEventInit | null) {
    requireArgs(arguments.length, 1, new.target.name);
    super(type, eventInitDict);
    this.#oldState = str(eventInitDict, "oldState");
    this.#newState = str(eventInitDict, "newState");
    this.#source = get(eventInitDict, "source") ?? null;
  }

  get oldState(): string {
    return this.#oldState;
  }
  get newState(): string {
    return this.#newState;
  }
  get source(): unknown {
    return this.#source;
  }
}
setToStringTag(ToggleEvent, 1);

// --- BeforeUnloadEvent ----------------------------------------------------------------------

/** https://html.spec.whatwg.org/#the-beforeunloadevent-interface (no public constructor). */
export class BeforeUnloadEvent extends Event {
  #returnValue: string;

  constructor(type: string, eventInitDict?: EventInit | null) {
    if (!isInternalConstruct()) throw new TypeError("Illegal constructor");
    super(type, eventInitDict);
    this.#returnValue = "";
  }

  // The legacy string returnValue shadows Event#returnValue (boolean). Typed `any`, as in
  // TypeScript's lib.dom, so the emitted declarations stay valid against the base accessor.
  override get returnValue(): any {
    return this.#returnValue;
  }

  override set returnValue(value: any) {
    this.#returnValue = toDOMString(value);
  }
}
setToStringTag(BeforeUnloadEvent, 1);

// --- CloseEvent -----------------------------------------------------------------------------

export interface CloseEventInit extends EventInit {
  wasClean?: boolean;
  code?: number;
  reason?: string;
}

/** https://websockets.spec.whatwg.org/#the-closeevent-interface */
export class CloseEvent extends Event {
  #wasClean: boolean;
  #code: number;
  #reason: string;

  constructor(type: string, eventInitDict?: CloseEventInit | null) {
    requireArgs(arguments.length, 1, new.target.name);
    super(type, eventInitDict);
    this.#wasClean = !!get(eventInitDict, "wasClean");
    const code = get(eventInitDict, "code");
    this.#code = code === undefined ? 0 : toUnsignedShort(code);
    this.#reason = str(eventInitDict, "reason");
  }

  get wasClean(): boolean {
    return this.#wasClean;
  }
  get code(): number {
    return this.#code;
  }
  get reason(): string {
    return this.#reason;
  }
}
setToStringTag(CloseEvent, 1);

// WebIDL: attributes and operations are enumerable prototype members.
exposeMembers(CustomEvent, ErrorEvent, PromiseRejectionEvent, MessageEvent, ProgressEvent, AnimationEvent, TransitionEvent, PopStateEvent, HashChangeEvent, PageTransitionEvent, StorageEvent, SubmitEvent, FormDataEvent, ToggleEvent, BeforeUnloadEvent, CloseEvent);
