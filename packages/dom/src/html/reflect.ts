// IDL attribute reflection helpers.
// https://html.spec.whatwg.org/#reflecting-content-attributes-in-idl-attributes
//
// Each helper defines accessors on a prototype from a compact, space-separated list of IDL
// attribute names. The content attribute is the ASCII-lowercased IDL name unless written as
// `idlName=content-attr` (e.g. "htmlFor=for httpEquiv=http-equiv").
//
//   str(HTMLAnchorElement, "target download ping rel hreflang type");
//   bool(HTMLDetailsElement, "open");
//   url(HTMLImageElement, "src");
//   long(HTMLOListElement, "start", 1);
//   enumerated(HTMLElement, "dir", { keywords: ["ltr", "rtl", "auto"] });
//
// Accessors are plain getter/setter closures over the attribute name: one property definition
// per IDL attribute at module load, no per-read allocation. Reads use `contentAttr()` which
// matches only null-namespace attributes, as "get an attribute by namespace and local name"
// requires.
//
// Used by every element interface in src/html (including src/html/forms).

import type { NodeImpl } from "../nodes/NodeImpl.ts";
import { setAttribute, removeAttribute, isAsciiWhitespace } from "../nodes/attributes.ts";
import { DOMTokenList } from "../collections/DOMTokenList.ts";
import { HTML_NS } from "../nodes/constants.ts";
import { $impl } from "../keys.ts";

type Ctor = { prototype: object };
type Wrapper = { [$impl]: NodeImpl };

const INT_MIN = -2147483648;
const INT_MAX = 2147483647;

/** Value of the null-namespace attribute `localName`, or null. Allocation-free. */
export function contentAttr(el: NodeImpl, localName: string): string | null {
  const attrs = el.attrs;
  if (attrs === null) return null;
  for (let i = 0; i < attrs.length; i++) {
    const a = attrs[i];
    if (a.localName === localName && (a.rare === null || a.rare.ns === null)) return a.value;
  }
  return null;
}

/** https://dom.spec.whatwg.org/#concept-element-attributes-set-value (null namespace). */
export function setContentAttr(el: NodeImpl, localName: string, value: string): void {
  setAttribute(el, localName, value);
}

export function removeContentAttr(el: NodeImpl, localName: string): void {
  removeAttribute(el, localName);
}

/** Lowercase only ASCII letters; returns the input unchanged when already lowercase. */
function lower(s: string): string {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 65 && c <= 90) return s.replace(/[A-Z]+/g, (m) => m.toLowerCase());
  }
  return s;
}

function names(list: string): [idl: string, content: string][] {
  const out: [string, string][] = [];
  for (const item of list.split(" ")) {
    if (item === "") continue;
    const eq = item.indexOf("=");
    if (eq === -1) out.push([item, lower(item)]);
    else out.push([item.slice(0, eq), item.slice(eq + 1)]);
  }
  return out;
}

export function defineAccessor(C: Ctor, name: string, get: (this: Wrapper) => unknown, set?: (this: Wrapper, v: any) => void): void {
  Object.defineProperty(C.prototype, name, { get, set, configurable: true, enumerable: true });
}

// --- numbers ------------------------------------------------------------------------------

/**
 * https://html.spec.whatwg.org/#rules-for-parsing-integers — returns NaN on error.
 * Values outside the safe range saturate to ±Infinity so range checks fail as they should.
 */
export function parseInteger(input: string): number {
  const len = input.length;
  let i = 0;
  while (i < len && isAsciiWhitespace(input.charCodeAt(i))) i++;
  if (i === len) return NaN;
  let sign = 1;
  let c = input.charCodeAt(i);
  if (c === 0x2d) {
    sign = -1;
    i++;
  } else if (c === 0x2b) {
    i++;
  }
  if (i === len) return NaN;
  c = input.charCodeAt(i);
  if (c < 0x30 || c > 0x39) return NaN;
  let value = 0;
  while (i < len) {
    c = input.charCodeAt(i);
    if (c < 0x30 || c > 0x39) break;
    value = value * 10 + (c - 0x30);
    i++;
  }
  if (value > 1e15) value = Infinity;
  return sign * value + 0; // `+ 0` turns -0 into 0
}

/** https://html.spec.whatwg.org/#rules-for-parsing-non-negative-integers — NaN on error. */
export function parseNonNegativeInteger(input: string): number {
  const v = parseInteger(input);
  return v >= 0 ? v + 0 : NaN; // `+ 0` normalizes -0
}

/** https://html.spec.whatwg.org/#rules-for-parsing-floating-point-number-values — NaN on error. */
export function parseFloatingPoint(input: string): number {
  // The grammar is a strict subset of what JS accepts after the leading-whitespace skip.
  let i = 0;
  const len = input.length;
  while (i < len && isAsciiWhitespace(input.charCodeAt(i))) i++;
  // Steps 6–8: one optional "-" or "+" (not both: "+-5" is an error), then a digit or ".".
  const m = /^[-+]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][-+]?\d+)?/.exec(i === 0 ? input : input.slice(i));
  if (m === null) return NaN;
  const v = Number(m[0]);
  if (!Number.isFinite(v)) return NaN;
  return v === 0 ? 0 : v;
}

function indexSizeError(message: string): DOMException {
  return new DOMException(message, "IndexSizeError");
}

// --- helpers ------------------------------------------------------------------------------

/** DOMString reflection. */
export function str(C: Ctor, list: string): void {
  for (const [idl, content] of names(list)) {
    defineAccessor(
      C,
      idl,
      function () {
        return contentAttr(this[$impl], content) ?? "";
      },
      function (v) {
        setAttribute(this[$impl], content, String(v));
      },
    );
  }
}

/** `[LegacyNullToEmptyString] DOMString` reflection: setting null stores "". */
export function strNullEmpty(C: Ctor, list: string): void {
  for (const [idl, content] of names(list)) {
    defineAccessor(
      C,
      idl,
      function () {
        return contentAttr(this[$impl], content) ?? "";
      },
      function (v) {
        setAttribute(this[$impl], content, v === null ? "" : String(v));
      },
    );
  }
}

/** Nullable DOMString reflection (`DOMString?`): null when absent; setting null removes. */
export function nullableStr(C: Ctor, list: string): void {
  for (const [idl, content] of names(list)) {
    defineAccessor(
      C,
      idl,
      function () {
        return contentAttr(this[$impl], content);
      },
      function (v) {
        if (v === null || v === undefined) removeAttribute(this[$impl], content);
        else setAttribute(this[$impl], content, String(v));
      },
    );
  }
}

/** boolean reflection: true iff the attribute is present. */
export function bool(C: Ctor, list: string): void {
  for (const [idl, content] of names(list)) {
    defineAccessor(
      C,
      idl,
      function () {
        return contentAttr(this[$impl], content) !== null;
      },
      function (v) {
        if (v) setAttribute(this[$impl], content, "");
        else removeAttribute(this[$impl], content);
      },
    );
  }
}

/** USVString URL reflection: resolved against the document base URL, raw value on failure. */
export function url(C: Ctor, list: string): void {
  for (const [idl, content] of names(list)) {
    defineAccessor(
      C,
      idl,
      function () {
        const impl = this[$impl];
        const v = contentAttr(impl, content);
        if (v === null) return "";
        return resolveURL(impl, v) ?? v;
      },
      function (v) {
        setAttribute(this[$impl], content, String(v));
      },
    );
  }
}

/** https://html.spec.whatwg.org/#encoding-parsing-a-url relative to the node document's base URL. */
export function resolveURL(impl: NodeImpl, value: string): string | null {
  const base = impl.doc.baseURI;
  const parsed = URL.parse(value, base);
  return parsed === null ? null : parsed.href;
}

/** `long` reflection. */
export function long(C: Ctor, list: string, def = 0): void {
  for (const [idl, content] of names(list)) {
    defineAccessor(
      C,
      idl,
      function () {
        const v = contentAttr(this[$impl], content);
        if (v === null) return def;
        const n = parseInteger(v);
        return n >= INT_MIN && n <= INT_MAX ? n : def;
      },
      function (v) {
        setAttribute(this[$impl], content, String(Number(v) | 0));
      },
    );
  }
}

/** `long` limited to only non-negative numbers (e.g. maxLength). */
export function nonNegativeLong(C: Ctor, list: string, def = -1): void {
  for (const [idl, content] of names(list)) {
    defineAccessor(
      C,
      idl,
      function () {
        const v = contentAttr(this[$impl], content);
        if (v === null) return def;
        const n = parseNonNegativeInteger(v);
        return n <= INT_MAX ? n : def;
      },
      function (v) {
        const n = Number(v) | 0;
        if (n < 0) throw indexSizeError(`The value provided (${n}) is negative.`);
        setAttribute(this[$impl], content, String(n));
      },
    );
  }
}

/** `unsigned long` reflection; `positive` = limited to only positive numbers (with fallback). */
export function ulong(C: Ctor, list: string, def = 0, positive = false): void {
  const min = positive ? 1 : 0;
  for (const [idl, content] of names(list)) {
    defineAccessor(
      C,
      idl,
      function () {
        const v = contentAttr(this[$impl], content);
        if (v === null) return def;
        const n = parseNonNegativeInteger(v);
        return n >= min && n <= INT_MAX ? n : def;
      },
      function (v) {
        let n = Number(v) >>> 0;
        if (positive && n === 0) throw indexSizeError("The value provided is 0, which is not a positive number.");
        if (n > INT_MAX) n = def;
        setAttribute(this[$impl], content, String(n));
      },
    );
  }
}

/** `unsigned long` clamped to [min, max] (e.g. colSpan, rowSpan). */
export function clampedUlong(C: Ctor, idl: string, content: string, def: number, min: number, max: number): void {
  defineAccessor(
    C,
    idl,
    function () {
      const v = contentAttr(this[$impl], content);
      if (v === null) return def;
      const n = parseNonNegativeInteger(v);
      if (Number.isNaN(n)) return def;
      return n < min ? min : n > max ? max : n;
    },
    function (v) {
      let n = Number(v) >>> 0;
      if (n > INT_MAX) n = def;
      setAttribute(this[$impl], content, String(n));
    },
  );
}

/** `double` reflection; `positive` = limited to only positive numbers. */
export function double(C: Ctor, list: string, def = 0, positive = false): void {
  for (const [idl, content] of names(list)) {
    defineAccessor(
      C,
      idl,
      function () {
        const v = contentAttr(this[$impl], content);
        if (v === null) return def;
        const n = parseFloatingPoint(v);
        if (Number.isNaN(n) || (positive && n <= 0)) return def;
        return n;
      },
      function (v) {
        const n = Number(v);
        if (!Number.isFinite(n)) throw new TypeError("The provided double value is non-finite.");
        if (positive && n <= 0) return;
        setAttribute(this[$impl], content, String(n));
      },
    );
  }
}

export interface EnumSpec {
  /** Canonical keywords (lowercase). Aliases: "alias:canonical". */
  keywords: string[];
  /** Missing value default; null for nullable reflection (`DOMString?`). Default "". */
  missing?: string | null;
  /** Invalid value default. Default "". */
  invalid?: string;
  /** Empty value default (attribute present with value ""). Default: same as invalid. */
  empty?: string;
}

/** Enumerated attribute reflection (limited to only known values). */
export function enumerated(C: Ctor, list: string, spec: EnumSpec): void {
  const map = new Map<string, string>();
  for (const k of spec.keywords) {
    const colon = k.indexOf(":");
    if (colon === -1) map.set(k, k);
    else map.set(k.slice(0, colon), k.slice(colon + 1));
  }
  const missing = spec.missing === undefined ? "" : spec.missing;
  const invalid = spec.invalid ?? "";
  const empty = spec.empty ?? invalid;
  const nullable = missing === null;
  for (const [idl, content] of names(list)) {
    defineAccessor(
      C,
      idl,
      function () {
        const v = contentAttr(this[$impl], content);
        if (v === null) return missing;
        if (v === "") return map.get("") ?? empty;
        return map.get(lower(v)) ?? invalid;
      },
      function (v) {
        if (nullable && (v === null || v === undefined)) removeAttribute(this[$impl], content);
        else setAttribute(this[$impl], content, String(v));
      },
    );
  }
}

/** Shared enumerated specs. */
export const CROSS_ORIGIN: EnumSpec = { keywords: ["anonymous", "use-credentials"], missing: null, invalid: "anonymous", empty: "anonymous" };
export const REFERRER_POLICY: EnumSpec = {
  keywords: [
    "no-referrer",
    "no-referrer-when-downgrade",
    "same-origin",
    "origin",
    "strict-origin",
    "origin-when-cross-origin",
    "strict-origin-when-cross-origin",
    "unsafe-url",
  ],
};
export const LOADING: EnumSpec = { keywords: ["lazy", "eager"], missing: "eager", invalid: "eager" };
export const FETCH_PRIORITY: EnumSpec = { keywords: ["high", "low", "auto"], missing: "auto", invalid: "auto" };

/** Reflect a DOMTokenList-valued IDL attribute (`relList`, `sandbox`, `sizes`, ...) — [SameObject, PutForwards=value]. */
export function tokenList(C: Ctor, idl: string, content: string, supported: readonly string[] | null = null): void {
  const key = Symbol(idl);
  defineAccessor(
    C,
    idl,
    function () {
      const self = this as unknown as Record<symbol, DOMTokenList | undefined>;
      let list = self[key];
      if (list === undefined) {
        list = new DOMTokenList(this[$impl], content, supported);
        Object.defineProperty(this, key, { value: list });
      }
      return list;
    },
    function (v) {
      setAttribute(this[$impl], content, String(v));
    },
  );
}

/** Whether `impl` is an HTML-namespace element. */
export function isHTMLElement(impl: NodeImpl): boolean {
  return impl.type === 1 && impl.ns === HTML_NS;
}
