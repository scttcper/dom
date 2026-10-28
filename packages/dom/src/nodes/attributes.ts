// Element attribute algorithms over NodeImpl.attrs.
// https://dom.spec.whatwg.org/#concept-element-attribute

import {
  F_ARIA_ATTRS,
  F_ATTR_HOOK,
  F_CONNECTED,
  F_CONTENTEDITABLE_ATTR,
  F_DATA_ATTRS,
  F_HAS_STYLE_ATTR,
  F_HTML,
  F_INERT_ATTR,
  F_TABINDEX_ATTR,
} from "./constants.ts";
import type { Element } from "./Element.ts";
import { AttrRecord, type NodeImpl } from "./NodeImpl.ts";
import { noteInlineStyle } from "../css/inline-count.ts";
import { activeObservers, queueAttributeMutationRecord } from "../observers/queue.ts";
import { slotAssignmentActive, slotsAttributeChanged } from "./slots.ts";
import { ceReactionsPending, flushCEReactions } from "./create.ts";
import { $style, $version } from "../keys.ts";

/** ASCII-lowercase without allocating when the input is already lowercase (the common case). */
export function asciiLowercase(s: string): string {
  const len = s.length;
  for (let i = 0; i < len; i++) {
    const c = s.charCodeAt(i);
    if (c >= 65 && c <= 90) return asciiLowercaseFrom(s, i);
  }
  return s;
}

function asciiLowercaseFrom(s: string, start: number): string {
  // String.prototype.toLowerCase is Unicode-aware ("Ç" → "ç"); the DOM wants ASCII only.
  let ascii = true;
  const len = s.length;
  for (let i = start; i < len; i++) {
    if (s.charCodeAt(i) >= 0x80) {
      ascii = false;
      break;
    }
  }
  if (ascii) return s.toLowerCase();
  let out = s.slice(0, start);
  for (let i = start; i < len; i++) {
    const c = s.charCodeAt(i);
    out += c >= 65 && c <= 90 ? String.fromCharCode(c + 32) : s[i];
  }
  return out;
}

/**
 * https://dom.spec.whatwg.org/#valid-attribute-local-name — at least one code point and no
 * ASCII whitespace, U+0000, "/", "=" or ">".
 */
export function isValidAttributeLocalName(name: string): boolean {
  const len = name.length;
  if (len === 0) return false;
  for (let i = 0; i < len; i++) {
    const c = name.charCodeAt(i);
    if (
      c === 0x20 ||
      c === 0x09 ||
      c === 0x0a ||
      c === 0x0c ||
      c === 0x0d ||
      c === 0x00 ||
      c === 0x2f ||
      c === 0x3d ||
      c === 0x3e
    ) {
      return false;
    }
  }
  return true;
}

/** https://dom.spec.whatwg.org/#concept-element-attributes-get-by-name (name already normalized). */
export function findAttributeByName(el: NodeImpl, qualifiedName: string): AttrRecord | null {
  const attrs = el.attrs;
  if (attrs === null) return null;
  for (let i = 0; i < attrs.length; i++) {
    const a = attrs[i];
    // Hot loops read the record's fields directly: `rare === null` means no namespace/prefix,
    // so the qualified name is the local name (AttrRecord's getters, without the calls).
    const r = a.rare;
    if ((r === null ? a.localName : r.name) === qualifiedName) return a;
  }
  return null;
}

/** https://dom.spec.whatwg.org/#concept-element-attributes-get-by-namespace */
export function findAttributeByNamespace(el: NodeImpl, ns: string | null, localName: string): AttrRecord | null {
  const attrs = el.attrs;
  if (attrs === null) return null;
  for (let i = 0; i < attrs.length; i++) {
    const a = attrs[i];
    const r = a.rare;
    if (a.localName === localName && (r === null ? ns === null : r.ns === ns)) return a;
  }
  return null;
}

/** getAttribute(qualifiedName). Lowercases for HTML elements in HTML documents. */
export function getAttribute(el: NodeImpl, qualifiedName: string): string | null {
  const attrs = el.attrs;
  if (attrs === null) return null;
  const name = (el.flags & F_HTML) !== 0 ? asciiLowercase(qualifiedName) : qualifiedName;
  for (let i = 0; i < attrs.length; i++) {
    const a = attrs[i];
    const r = a.rare;
    if ((r === null ? a.localName : r.name) === name) return a.value;
  }
  return null;
}

/**
 * The presence bit an attribute local name sets on its element: F_ARIA_ATTRS / F_DATA_ATTRS for
 * names starting with `aria-` / `data-`, F_TABINDEX_ATTR, F_CONTENTEDITABLE_ATTR or F_INERT_ATTR
 * for those names, else 0.
 */
export function prefixFlag(localName: string): number {
  switch (localName.length) {
    case 5:
      if (localName === "inert") return F_INERT_ATTR;
      break;
    case 8:
      if (localName === "tabindex") return F_TABINDEX_ATTR;
      break;
    case 15:
      if (localName === "contenteditable") return F_CONTENTEDITABLE_ATTR;
      break;
  }
  if (localName.length < 5 || localName.charCodeAt(4) !== 0x2d) return 0;
  const c = localName.charCodeAt(0);
  if (c === 0x61)
    return localName.charCodeAt(1) === 0x72 && localName.charCodeAt(2) === 0x69 && localName.charCodeAt(3) === 0x61
      ? F_ARIA_ATTRS
      : 0;
  if (c === 0x64)
    return localName.charCodeAt(1) === 0x61 && localName.charCodeAt(2) === 0x74 && localName.charCodeAt(3) === 0x61
      ? F_DATA_ATTRS
      : 0;
  return 0;
}

/**
 * Hot-path read for internal callers that pass an already-lowercase, no-namespace name
 * literal (e.g. "role", "aria-label", "type"). Skips normalization.
 */
export function attr(el: NodeImpl, lowerName: string): string | null {
  const attrs = el.attrs;
  if (attrs === null) return null;
  for (let i = 0; i < attrs.length; i++) {
    const a = attrs[i];
    // Namespace-null match (an unprefixed namespaced attribute has the same qualified name).
    const r = a.rare;
    if (r === null ? a.localName === lowerName : r.ns === null && r.name === lowerName) return a.value;
  }
  return null;
}

/** `attr` for an `aria-*` name: null without a scan when the element has no aria-* attribute (F_ARIA_ATTRS). */
export function ariaAttr(el: NodeImpl, lowerName: string): string | null {
  return (el.flags & F_ARIA_ATTRS) === 0 ? null : attr(el, lowerName);
}

export function hasAttr(el: NodeImpl, lowerName: string): boolean {
  return attr(el, lowerName) !== null;
}

// Only strings are retained: repeated property setting reuses validated, normalized names.
const attributeNames = new Map<string, string>();

/** setAttribute(qualifiedName, value) — https://dom.spec.whatwg.org/#dom-element-setattribute */
export function setAttribute(el: NodeImpl, qualifiedName: string, value: string): void {
  let lower = attributeNames.get(qualifiedName);
  if (lower === undefined) {
    if (!isValidAttributeLocalName(qualifiedName)) {
      throw new DOMException(`"${qualifiedName}" is not a valid attribute name.`, "InvalidCharacterError");
    }
    lower = asciiLowercase(qualifiedName);
    if (attributeNames.size === 1024) attributeNames.clear();
    attributeNames.set(qualifiedName, lower);
  }
  const name = (el.flags & F_HTML) !== 0 ? lower : qualifiedName;
  const existing = findAttributeByName(el, name);
  if (existing === null) appendAttribute(el, new AttrRecord(name, value, null, null));
  else changeAttribute(el, existing, value);
}

/** https://dom.spec.whatwg.org/#concept-element-attributes-change */
export function changeAttribute(el: NodeImpl, a: AttrRecord, value: string): void {
  const oldValue = a.value;
  a.value = value;
  handleAttributeChanges(el, a, oldValue, value);
}

/**
 * Attribute lists are kept at their exact size. V8 gives an array that is pushed onto ~16 slots
 * of slack (a one-attribute list cost 184 B instead of 56 B, two attributes 200 B instead of
 * 64 B), and most elements carry 1–4 attributes, so appending copies into a new exact-length
 * array (~7 ns; `concat` was ~48 ns). Every list is created with `new Array(n)` (as cloning
 * does) so all of them share one elements kind and the read loops stay monomorphic. Long lists
 * (rare) fall back to push.
 */
function addRecord(el: NodeImpl, a: AttrRecord): void {
  const flag = prefixFlag(a.localName);
  if (flag !== 0) el.flags |= flag;
  const attrs = el.attrs;
  if (attrs === null) {
    const list: AttrRecord[] = new Array(1);
    list[0] = a;
    el.attrs = list;
    return;
  }
  const n = attrs.length;
  if (n >= 16) {
    attrs.push(a);
    return;
  }
  const next: AttrRecord[] = new Array(n + 1);
  for (let i = 0; i < n; i++) next[i] = attrs[i];
  next[n] = a;
  el.attrs = next;
}

/** https://dom.spec.whatwg.org/#concept-element-attributes-append */
export function appendAttribute(el: NodeImpl, a: AttrRecord): void {
  addRecord(el, a);
  handleAttributeChanges(el, a, null, a.value);
}

/** https://dom.spec.whatwg.org/#concept-element-attributes-remove */
export function removeAttributeRecord(el: NodeImpl, a: AttrRecord): void {
  const attrs = el.attrs!;
  const i = attrs.indexOf(a);
  attrs.splice(i, 1);
  const flag = prefixFlag(a.localName);
  if (flag !== 0) {
    let still = false;
    for (let j = 0; j < attrs.length && !still; j++) still = prefixFlag(attrs[j].localName) === flag;
    if (!still) el.flags &= ~flag;
  }
  // A materialized Attr node keeps its value but loses its element.
  if (a.attr !== null) a.attr._detach();
  handleAttributeChanges(el, a, a.value, null);
}

/** removeAttribute(qualifiedName) */
export function removeAttribute(el: NodeImpl, qualifiedName: string): AttrRecord | null {
  if (el.attrs === null) return null;
  const name = (el.flags & F_HTML) !== 0 ? asciiLowercase(qualifiedName) : qualifiedName;
  const a = findAttributeByName(el, name);
  if (a !== null) removeAttributeRecord(el, a);
  return a;
}

/**
 * https://dom.spec.whatwg.org/#handle-attribute-changes plus this implementation's core
 * attribute bookkeeping (id index, class token cache, style flag, document version).
 */
export function handleAttributeChanges(
  el: NodeImpl,
  a: AttrRecord,
  oldValue: string | null,
  newValue: string | null,
): void {
  if (activeObservers !== 0) queueAttributeMutationRecord(el, a.localName, a.ns, oldValue);
  if (a.ns === null) {
    coreAttributeSteps(el, a.localName, newValue);
    if (slotAssignmentActive !== 0) slotsAttributeChanged(el, a.localName, oldValue, newValue);
  }
  if ((el.flags & F_ATTR_HOOK) !== 0) {
    (el.node as Element)._attributeChangedSteps(a.localName, oldValue, newValue, a.ns);
  }
  el.doc[$version]++;
  if (ceReactionsPending) flushCEReactions(); // custom element reactions (html agent; see create.ts)
}

function coreAttributeSteps(el: NodeImpl, localName: string, value: string | null): void {
  switch (localName) {
    case "id": {
      const connected = (el.flags & F_CONNECTED) !== 0;
      if (connected && el.id !== "") el.doc._idRemove(el);
      el.id = value ?? "";
      if (connected && el.id !== "") el.doc._idAdd(el);
      break;
    }
    case "class":
      el.classes = null;
      break;
    case "style":
      if (value === null || value === "") {
        if ((el.flags & F_HAS_STYLE_ATTR) !== 0) noteInlineStyle(el.doc, -1);
        el.flags &= ~F_HAS_STYLE_ATTR;
      } else {
        if ((el.flags & F_HAS_STYLE_ATTR) === 0) noteInlineStyle(el.doc, 1);
        el.flags |= F_HAS_STYLE_ATTR;
      }
      (el.node as Element)[$style]?._attributeChanged(value);
      break;
  }
}

/**
 * Parser/clone fast path: append an attribute to a DETACHED element without mutation
 * records, hooks or version bumps, but with core bookkeeping (id mirror, style flag).
 * The caller guarantees no attribute with this name exists yet.
 */
export function appendAttributeDetached(
  el: NodeImpl,
  localName: string,
  value: string,
  ns: string | null,
  prefix: string | null,
): void {
  addRecord(el, new AttrRecord(localName, value, ns, prefix));
  if (ns === null) {
    if (localName === "id") el.id = value;
    else if (localName === "style" && value !== "" && (el.flags & F_HAS_STYLE_ATTR) === 0) {
      el.flags |= F_HAS_STYLE_ATTR;
      noteInlineStyle(el.doc, 1);
    }
  }
}

const EMPTY: string[] = [];

/** Class attribute split on ASCII whitespace, cached until the class attribute changes. */
export function classTokens(el: NodeImpl): string[] {
  let c = el.classes;
  if (c !== null) return c;
  const value = attr(el, "class");
  if (value === null || value === "") c = EMPTY;
  else c = splitOnAsciiWhitespace(value);
  el.classes = c;
  return c;
}

/** https://infra.spec.whatwg.org/#split-on-ascii-whitespace (ordered set semantics NOT applied). */
export function splitOnAsciiWhitespace(s: string): string[] {
  const out: string[] = [];
  const len = s.length;
  let i = 0;
  while (i < len) {
    while (i < len && isAsciiWhitespace(s.charCodeAt(i))) i++;
    if (i >= len) break;
    const start = i;
    while (i < len && !isAsciiWhitespace(s.charCodeAt(i))) i++;
    out.push(start === 0 && i === len ? s : s.slice(start, i));
  }
  return out;
}

export function isAsciiWhitespace(c: number): boolean {
  return c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0c || c === 0x0d;
}
