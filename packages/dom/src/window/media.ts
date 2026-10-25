// https://drafts.csswg.org/cssom-view/#the-mediaquerylist-interface
// https://drafts.csswg.org/mediaqueries-5/ (fallback evaluator)
//
// `matchMedia()` evaluates through `windowHooks.evaluateMediaQuery` when the css area registers
// one; otherwise through the small evaluator below (media types, width/height/aspect-ratio/
// orientation/resolution in plain and range syntax, and the common discrete features with
// fixed "desktop browser" values). Change events fire synchronously when the window's
// viewport size or devicePixelRatio is changed (assigning innerWidth, resizeTo, ...).

import { EventTarget } from "../events/EventTarget.ts";
import type { AddEventListenerOptions, EventListenerOrEventListenerObject } from "../webidl.ts";
import { windowHooks, type MediaFeatureEnvironment } from "./hooks.ts";
import { MediaQueryListEvent } from "./events.ts";
import type { Window } from "./Window.ts";
import { $matches, $media, $mediaQueryLists, $onchange, $options, $window } from "../keys.ts";

export class MediaQueryList extends EventTarget {
  [$window]: Window;
  [$media]: string;
  /** Last value change listeners were told about. */
  [$matches]: boolean;
  [$onchange]: EventListenerOrEventListenerObject | null;

  constructor(window: Window, media: string) {
    super();
    this[$window] = window;
    this[$media] = media;
    this[$matches] = false;
    this[$onchange] = null;
  }

  /** https://drafts.csswg.org/cssom-view/#dom-mediaquerylist-media */
  get media(): string {
    return this[$media];
  }

  /** https://drafts.csswg.org/cssom-view/#dom-mediaquerylist-matches */
  get matches(): boolean {
    return evaluateMediaQuery(this[$media], this[$window]);
  }

  /** https://drafts.csswg.org/cssom-view/#dom-mediaquerylist-addlistener */
  addListener(callback: EventListenerOrEventListenerObject | null): void {
    this.addEventListener("change", callback);
  }

  removeListener(callback: EventListenerOrEventListenerObject | null): void {
    this.removeEventListener("change", callback);
  }

  override addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void {
    super.addEventListener(type, callback, options);
    if (callback !== null && type === "change") this._watch();
  }

  get onchange(): EventListenerOrEventListenerObject | null {
    return this[$onchange];
  }

  set onchange(value: EventListenerOrEventListenerObject | null) {
    if (this[$onchange] !== null) super.removeEventListener("change", this[$onchange]);
    this[$onchange] = typeof value === "function" || (value !== null && typeof value === "object") ? value : null;
    if (this[$onchange] !== null) {
      super.addEventListener("change", this[$onchange]);
      this._watch();
    }
  }

  _watch(): void {
    const watched = this[$window][$mediaQueryLists];
    if (watched.has(this)) return;
    this[$matches] = this.matches;
    watched.add(this);
  }

  get [Symbol.toStringTag](): string {
    return "MediaQueryList";
  }
}

/** https://drafts.csswg.org/cssom-view/#evaluate-media-queries-and-report-changes */
export function reportMediaQueryChanges(window: Window): void {
  for (const mql of window[$mediaQueryLists]) {
    const matches = mql.matches;
    if (matches === mql[$matches]) continue;
    mql[$matches] = matches;
    mql.dispatchEvent(new MediaQueryListEvent("change", { media: mql[$media], matches }));
  }
}

export function mediaEnvironment(window: Window): MediaFeatureEnvironment {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
    mediaType: "screen",
    features: window[$options].mediaFeatures ?? null,
  };
}

export function evaluateMediaQuery(query: string, window: Window): boolean {
  const env = mediaEnvironment(window);
  const hook = windowHooks.evaluateMediaQuery;
  if (hook !== null) return hook(query, env);
  return evaluateMediaQueryList(query, env, env.features ?? undefined);
}

// --- fallback evaluator ------------------------------------------------------------------------

/** Discrete feature values of a typical desktop browser (overridable per window). */
const DISCRETE: Record<string, string | number> = {
  "prefers-color-scheme": "light",
  "prefers-reduced-motion": "no-preference",
  "prefers-reduced-transparency": "no-preference",
  "prefers-reduced-data": "no-preference",
  "prefers-contrast": "no-preference",
  "forced-colors": "none",
  "inverted-colors": "none",
  hover: "hover",
  "any-hover": "hover",
  pointer: "fine",
  "any-pointer": "fine",
  "display-mode": "browser",
  scripting: "enabled",
  update: "fast",
  "color-gamut": "srgb",
  "dynamic-range": "standard",
  "video-dynamic-range": "standard",
  "overflow-block": "scroll",
  "overflow-inline": "scroll",
  color: 8,
  "color-index": 0,
  monochrome: 0,
  grid: 0,
};

type Features = Record<string, string | number> | undefined;

/** https://drafts.csswg.org/mediaqueries-5/#mq-list — true if any query in the list matches. */
export function evaluateMediaQueryList(list: string, env: MediaFeatureEnvironment, features?: Features): boolean {
  const queries = splitTopLevel(String(list).toLowerCase(), ",");
  if (queries.length === 1 && queries[0].trim() === "") return true;
  for (const q of queries) {
    if (evaluateQuery(q.trim(), env, features) === true) return true;
  }
  return false;
}

function splitTopLevel(s: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === sep && depth === 0) {
      out.push(s.slice(start, i));
      start = i + 1;
    }
  }
  out.push(s.slice(start));
  return out;
}

/** https://drafts.csswg.org/mediaqueries-5/#typedef-media-query — returns null for "unknown". */
function evaluateQuery(q: string, env: MediaFeatureEnvironment, features: Features): boolean | null {
  if (q === "") return null;
  if (q[0] === "(" || q.startsWith("not (") || q.startsWith("not(")) return evaluateCondition(q, env, features);
  const m = /^(?:(not|only)\s+)?([a-z-]+)(?:\s+and\s+([\s\S]+))?$/.exec(q);
  if (m === null) return null;
  const [, modifier, type, rest] = m;
  let result: boolean | null = type === "all" || type === env.mediaType;
  if (
    type !== "all" &&
    !["screen", "print", "speech", "tv", "tty", "projection", "handheld", "braille", "embossed", "aural"].includes(type)
  ) {
    result = false;
  }
  if (rest !== undefined && result) result = evaluateCondition(rest, env, features);
  if (result === null) return null;
  return modifier === "not" ? !result : result;
}

/** https://drafts.csswg.org/mediaqueries-5/#typedef-media-condition (three-valued: null = unknown) */
function evaluateCondition(s: string, env: MediaFeatureEnvironment, features: Features): boolean | null {
  s = s.trim();
  if (s.startsWith("not")) {
    const inner = evaluateInParens(s.slice(3).trim(), env, features);
    return inner === null ? null : !inner;
  }
  // Split on top-level " and " / " or ".
  const parts: string[] = [];
  const ops: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (depth === 0) {
      const rest = s.slice(i);
      const op = /^\s+(and|or)\s+/.exec(rest) ?? (s[i - 1] === ")" ? /^\s*(and|or)\s*(?=\()/.exec(rest) : null);
      if (op !== null) {
        parts.push(s.slice(start, i));
        ops.push(op[1]);
        i += op[0].length - 1;
        start = i + 1;
      }
    }
  }
  parts.push(s.slice(start));
  let result = evaluateInParens(parts[0].trim(), env, features);
  for (let i = 1; i < parts.length; i++) {
    const value = evaluateInParens(parts[i].trim(), env, features);
    if (ops[i - 1] === "and")
      result = result === false || value === false ? false : result === null || value === null ? null : true;
    else result = result === true || value === true ? true : result === null || value === null ? null : false;
  }
  return result;
}

function evaluateInParens(s: string, env: MediaFeatureEnvironment, features: Features): boolean | null {
  if (s[0] !== "(" || s[s.length - 1] !== ")") return null;
  const inner = s.slice(1, -1).trim();
  if (inner[0] === "(" || inner.startsWith("not ") || inner.startsWith("not("))
    return evaluateCondition(inner, env, features);
  return evaluateFeature(inner, env, features);
}

const RANGE = /^([^<>=]+?)\s*(<=|>=|<|>|=)\s*([^<>=]+?)(?:\s*(<=|>=|<|>|=)\s*([^<>=]+?))?$/;

/** https://drafts.csswg.org/mediaqueries-5/#mq-features */
function evaluateFeature(s: string, env: MediaFeatureEnvironment, features: Features): boolean | null {
  const colon = s.indexOf(":");
  if (colon !== -1) {
    let name = s.slice(0, colon).trim();
    const value = s.slice(colon + 1).trim();
    let op = "=";
    if (name.startsWith("min-")) {
      name = name.slice(4);
      op = ">=";
    } else if (name.startsWith("max-")) {
      name = name.slice(4);
      op = "<=";
    }
    return compareFeature(name, op, value, env, features);
  }
  const range = RANGE.exec(s);
  if (range !== null) {
    const [, a, op1, b, op2, c] = range;
    if (op2 === undefined) {
      // "name op value" or "value op name"
      if (isFeatureName(a)) return compareFeature(a.trim(), op1, b, env, features);
      return compareFeature(b.trim(), flip(op1), a, env, features);
    }
    const first = compareFeature(b.trim(), flip(op1), a, env, features);
    const second = compareFeature(b.trim(), op2, c, env, features);
    return first === null || second === null ? null : first && second;
  }
  // Boolean context.
  const name = s.trim();
  const actual = featureValue(name, env, features);
  if (actual === undefined) return null;
  return actual !== 0 && actual !== "none" && actual !== "no-preference";
}

function isFeatureName(s: string): boolean {
  return /^[a-z-]+$/.test(s.trim());
}

function flip(op: string): string {
  return op === "<" ? ">" : op === ">" ? "<" : op === "<=" ? ">=" : op === ">=" ? "<=" : op;
}

function featureValue(name: string, env: MediaFeatureEnvironment, features: Features): string | number | undefined {
  if (features !== undefined && name in features) return features[name];
  switch (name) {
    case "width":
    case "device-width":
      return env.width;
    case "height":
    case "device-height":
      return env.height;
    case "aspect-ratio":
    case "device-aspect-ratio":
      return env.height === 0 ? 0 : env.width / env.height;
    case "orientation":
      return env.height >= env.width ? "portrait" : "landscape";
    case "resolution":
    case "-webkit-device-pixel-ratio":
    case "device-pixel-ratio":
      return env.devicePixelRatio;
    case "-webkit-min-device-pixel-ratio":
    case "-webkit-max-device-pixel-ratio":
      return env.devicePixelRatio;
  }
  return DISCRETE[name];
}

function compareFeature(
  name: string,
  op: string,
  raw: string,
  env: MediaFeatureEnvironment,
  features: Features,
): boolean | null {
  if (name === "-webkit-min-device-pixel-ratio") op = ">=";
  else if (name === "-webkit-max-device-pixel-ratio") op = "<=";
  const actual = featureValue(name, env, features);
  if (actual === undefined) return null;
  const value = raw.trim();
  if (typeof actual === "string") return op === "=" ? actual === value : null;
  const expected = parseValue(name, value);
  if (expected === null) return null;
  // Compare with a small epsilon so ratios and resolutions behave.
  const d = actual - expected;
  switch (op) {
    case "=":
      return Math.abs(d) < 1e-9;
    case "<":
      return d < -1e-9;
    case ">":
      return d > 1e-9;
    case "<=":
      return d <= 1e-9;
    case ">=":
      return d >= -1e-9;
  }
  return null;
}

function parseValue(name: string, value: string): number | null {
  if (name.endsWith("aspect-ratio")) {
    const m = /^([\d.]+)\s*(?:\/\s*([\d.]+))?$/.exec(value);
    if (m === null) return null;
    return Number(m[1]) / (m[2] === undefined ? 1 : Number(m[2]));
  }
  const m = /^(-?[\d.]+(?:e[+-]?\d+)?)([a-z%]*)$/.exec(value);
  if (m === null) return null;
  const n = Number(m[1]);
  if (Number.isNaN(n)) return null;
  switch (m[2]) {
    case "":
      return n;
    case "px":
      return n;
    case "em":
    case "rem":
      return n * 16;
    case "pt":
      return (n * 96) / 72;
    case "pc":
      return n * 16;
    case "in":
      return n * 96;
    case "cm":
      return (n * 96) / 2.54;
    case "mm":
      return (n * 96) / 25.4;
    case "dppx":
    case "x":
      return n;
    case "dpi":
      return n / 96;
    case "dpcm":
      return (n * 2.54) / 96;
  }
  return null;
}
