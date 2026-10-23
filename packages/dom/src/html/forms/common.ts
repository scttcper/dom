// Shared helpers for the forms area (https://html.spec.whatwg.org/#forms): small reflection
// readers used by internal algorithms, event firing and string utilities. IDL attribute
// reflection itself uses src/html/reflect.ts.

import type { NodeImpl } from "../../nodes/NodeImpl.ts";
import { contentAttr, parseNonNegativeInteger } from "../reflect.ts";
import { Event, setTrusted } from "../../events/Event.ts";
import { dispatch } from "../../events/dispatch.ts";
import { setAttribute } from "../../nodes/attributes.ts";
import type { EventTarget } from "../../events/EventTarget.ts";
import { $impl } from "../../keys.ts";

const INT_MAX = 2147483647;

/** Read a `long` limited to only non-negative numbers (maxlength/minlength); `def` when absent/invalid. */
export function readNonNegativeLong(impl: NodeImpl, name: string, def: number): number {
  const v = contentAttr(impl, name);
  if (v === null) return def;
  const n = parseNonNegativeInteger(v);
  return n <= INT_MAX ? n : def;
}

/** Read an `unsigned long` limited to only positive numbers (with fallback). */
export function readPositiveUnsigned(impl: NodeImpl, name: string, def: number): number {
  const v = contentAttr(impl, name);
  if (v === null) return def;
  const n = parseNonNegativeInteger(v);
  return n >= 1 && n <= INT_MAX ? n : def;
}

/**
 * Reflect `unsigned long` attributes "limited to only positive numbers with fallback"
 * (input.size, textarea.rows/cols): 0 or out-of-range values read and write the default.
 * https://html.spec.whatwg.org/#reflecting-content-attributes-in-idl-attributes
 */
export function positiveWithFallback(C: { prototype: object }, idl: string, content: string, def: number): void {
  Object.defineProperty(C.prototype, idl, {
    get(this: { [$impl]: NodeImpl }) {
      return readPositiveUnsigned(this[$impl], content, def);
    },
    set(this: { [$impl]: NodeImpl }, v: unknown) {
      const n = toUnsignedLong(v);
      setAttribute(this[$impl], content, String(n >= 1 && n <= INT_MAX ? n : def));
    },
    enumerable: true,
    configurable: true,
  });
}

/** WebIDL `unsigned long` conversion. */
export function toUnsignedLong(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n) >>> 0;
}

/**
 * URL reflection for `action`/`formAction`: the attribute resolved against the base URL, or the
 * document URL when the attribute is missing or empty
 * (https://html.spec.whatwg.org/#dom-fs-action).
 */
export function reflectActionURL(impl: NodeImpl, name: string): string {
  const v = contentAttr(impl, name);
  if (v === null || v === "") return impl.doc.URL;
  const url = URL.parse(v, impl.doc.baseURI);
  return url === null ? v : url.href;
}

// --- strings ------------------------------------------------------------------------------

export function isWS(c: number): boolean {
  return c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0c || c === 0x0d;
}

/** https://infra.spec.whatwg.org/#strip-newlines — returns the input when there is nothing to strip. */
export function stripNewlines(s: string): string {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x0a || c === 0x0d) return s.replace(/[\r\n]/g, "");
  }
  return s;
}

/** https://infra.spec.whatwg.org/#strip-leading-and-trailing-ascii-whitespace */
export function trimASCII(s: string): string {
  let start = 0;
  let end = s.length;
  while (start < end && isWS(s.charCodeAt(start))) start++;
  while (end > start && isWS(s.charCodeAt(end - 1))) end--;
  return start === 0 && end === s.length ? s : s.slice(start, end);
}

/** https://infra.spec.whatwg.org/#strip-and-collapse-ascii-whitespace */
export function stripAndCollapseWS(s: string): string {
  return trimASCII(s).replace(/[\t\n\f\r ]+/g, " ");
}

/** https://infra.spec.whatwg.org/#normalize-newlines */
export function normalizeNewlines(s: string): string {
  return s.indexOf("\r") === -1 ? s : s.replace(/\r\n?/g, "\n");
}

// --- events -------------------------------------------------------------------------------

/** https://dom.spec.whatwg.org/#concept-event-fire — a trusted plain Event. Returns false when canceled. */
export function fireEvent(target: EventTarget, type: string, bubbles: boolean, cancelable: boolean, composed = false): boolean {
  const event = new Event(type, { bubbles, cancelable, composed });
  setTrusted(event);
  return dispatch(event, target);
}

/** Dispatch a UA-constructed event (marked trusted). */
export function dispatchTrusted(target: EventTarget, event: Event): boolean {
  setTrusted(event);
  return dispatch(event, target);
}
