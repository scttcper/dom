// Element-state pseudo-class predicates over NodeImpl.
//
// https://html.spec.whatwg.org/#pseudo-classes
// https://drafts.csswg.org/selectors-4/#useraction-pseudos
// https://drafts.csswg.org/selectors-4/#input-pseudos
//
// The HTML areas own the real element state. `predicates` maps pseudo-class names to functions;
// the ones backed by html/forms/state.ts, html/focus.ts, html/top-layer.ts and
// html/custom-elements.ts are installed by ./html-predicates.ts, which src/index.ts imports LAST:
// importing html from here would make html classes (which extend Element) evaluate before
// Element itself, since Element imports the selector engine. Until then they match nothing.
// State no other area models (:hover/:active pointer state, links, :target, media, :lang/:dir)
// is implemented here.

import { DOCUMENT_NODE, ELEMENT_NODE, F_HTML, F_SHADOW_ROOT, TEXT_NODE, XML_NS } from "../nodes/constants.ts";
import type { NodeImpl } from "../nodes/NodeImpl.ts";
import { T } from "../nodes/tags.ts";
import { attr, asciiLowercase } from "../nodes/attributes.ts";
import { nextInTree, nextSkippingChildren } from "../nodes/traverse.ts";
import { clearSelectorCaches } from "./index.ts";

export type Predicate = (el: NodeImpl) => boolean;

type Wrapper = Record<string, unknown>;

function wrapperProp(el: NodeImpl, name: string): unknown {
  return (el.node as unknown as Wrapper)[name];
}

// --- interaction state hooks (:hover / :active / :focus-visible) --------------------------

/**
 * Pointer state set by user-event / html-elements. `:hover` and `:active` match the target and
 * its flat-tree ancestors (https://drafts.csswg.org/selectors-4/#the-hover-pseudo). There is no
 * pointer by default, so they match nothing (as in jsdom).
 */
export const interaction = {
  hovered: null as NodeImpl | null,
  active: null as NodeImpl | null,
};

export function setHoverTarget(el: NodeImpl | null): void {
  interaction.hovered = el;
}

export function setActiveTarget(el: NodeImpl | null): void {
  interaction.active = el;
}

/** Host element of a shadow root impl, or null. */
export function shadowHost(sr: NodeImpl): NodeImpl | null {
  const host = wrapperProp(sr, "_host") as { _impl: NodeImpl } | null | undefined;
  return host === null || host === undefined ? null : host._impl;
}

/** Parent in the flat tree approximation: parent element, or the host of a shadow root. */
export function parentOrHost(n: NodeImpl): NodeImpl | null {
  const p = n.parent;
  if (p === null) return null;
  if ((p.flags & F_SHADOW_ROOT) !== 0) return shadowHost(p);
  return p;
}

function isShadowIncludingInclusiveAncestor(ancestor: NodeImpl, n: NodeImpl | null): boolean {
  for (; n !== null; n = parentOrHost(n)) if (n === ancestor) return true;
  return false;
}

function hover(el: NodeImpl): boolean {
  const h = interaction.hovered;
  return h !== null && isShadowIncludingInclusiveAncestor(el, h);
}

function active(el: NodeImpl): boolean {
  const a = interaction.active;
  return a !== null && isShadowIncludingInclusiveAncestor(el, a);
}

// --- links / target -----------------------------------------------------------------------

/** https://html.spec.whatwg.org/#selector-link — a/area elements with an href attribute. */
function anyLink(el: NodeImpl): boolean {
  return (el.tag === T.a || el.tag === T.area) && attr(el, "href") !== null;
}

function never(_el: NodeImpl): boolean {
  return false;
}

/** https://html.spec.whatwg.org/#the-indicated-part-of-the-document (id, then a[name]). */
function targetElement(el: NodeImpl): NodeImpl | null {
  const url = el.doc._url;
  const hash = url.indexOf("#");
  if (hash === -1 || hash === url.length - 1) return null;
  let fragment = url.slice(hash + 1);
  try {
    fragment = decodeURIComponent(fragment);
  } catch {}
  const doc = el.doc;
  const byId = doc._idLookup(fragment);
  if (byId !== null) return byId;
  const root = doc._impl;
  for (let n = root.first; n !== null; n = nextInTree(n, root)) {
    if (n.type === ELEMENT_NODE && n.tag === T.a && attr(n, "name") === fragment) return n;
  }
  return null;
}

function target(el: NodeImpl): boolean {
  if (el.doc._url.indexOf("#") === -1) return false;
  return targetElement(el) === el;
}

function targetWithin(el: NodeImpl): boolean {
  if (el.doc._url.indexOf("#") === -1) return false;
  const t = targetElement(el);
  return t !== null && isShadowIncludingInclusiveAncestor(el, t);
}

// --- form helpers (for :dir) ----------------------------------------------------

/** https://html.spec.whatwg.org/#attr-input-type (lowercased keyword, "text" for missing/invalid). */
export function inputTypeName(el: NodeImpl): string {
  const t = attr(el, "type");
  if (t === null) return "text";
  const v = asciiLowercase(t);
  switch (v) {
    case "hidden": case "text": case "search": case "tel": case "url": case "email": case "password":
    case "date": case "month": case "week": case "time": case "datetime-local": case "number":
    case "range": case "color": case "checkbox": case "radio": case "file": case "submit":
    case "image": case "reset": case "button":
      return v;
  }
  return "text";
}

function isHTML(el: NodeImpl): boolean {
  return el.tag !== 0;
}

/** Current value of a text control: the wrapper's value (dirty value) if exposed, else its default. */
function controlValue(el: NodeImpl): string {
  const v = wrapperProp(el, "value");
  if (typeof v === "string") return v;
  if (el.tag === T.textarea) {
    let s = "";
    for (let c = el.first; c !== null; c = c.next) if (c.type === TEXT_NODE) s += c.data;
    return s;
  }
  return attr(el, "value") ?? "";
}

// --- misc element state -------------------------------------------------------------------

/** https://html.spec.whatwg.org/#selector-open — details/dialog with open; select/input pickers are never open here. */
function open(el: NodeImpl): boolean {
  return (el.tag === T.details || el.tag === T.dialog) && attr(el, "open") !== null;
}

function isMedia(el: NodeImpl): boolean {
  return el.tag === T.audio || el.tag === T.video;
}

/** https://html.spec.whatwg.org/#selector-paused */
function paused(el: NodeImpl): boolean {
  return isMedia(el) && wrapperProp(el, "paused") !== false;
}

/** https://html.spec.whatwg.org/#selector-playing */
function playing(el: NodeImpl): boolean {
  return isMedia(el) && wrapperProp(el, "paused") === false;
}

/** https://html.spec.whatwg.org/#selector-muted */
function muted(el: NodeImpl): boolean {
  if (!isMedia(el)) return false;
  const m = wrapperProp(el, "muted");
  return typeof m === "boolean" ? m : attr(el, "muted") !== null;
}

/** :state(x) — https://html.spec.whatwg.org/#selector-custom (ElementInternals.states). */
export function customState(el: NodeImpl, name: string): boolean {
  const internals = wrapperProp(el, "_internals") as { states?: { has(v: string): boolean } } | null | undefined;
  return internals !== undefined && internals !== null && internals.states !== undefined && internals.states.has(name);
}

// --- :lang() / :dir() ---------------------------------------------------------------------

/** https://html.spec.whatwg.org/#language — inclusive ancestors' xml:lang / lang, else "unknown" (null). */
export function elementLanguage(el: NodeImpl): string | null {
  for (let n: NodeImpl | null = el; n !== null; n = parentOrHost(n)) {
    if (n.type !== ELEMENT_NODE) continue;
    const attrs = n.attrs;
    if (attrs === null) continue;
    let lang: string | null = null;
    for (let i = 0; i < attrs.length; i++) {
      const a = attrs[i];
      if (a.ns === XML_NS && a.localName === "lang") return a.value;
      if (a.ns === null && a.localName === "lang" && (n.flags & F_HTML) !== 0) lang = a.value;
      else if (a.ns === null && a.localName === "lang" && n.tag !== 0) lang = a.value;
    }
    if (lang !== null) return lang;
  }
  // TODO(selectors): pragma-set default language (<meta http-equiv="content-language">).
  return null;
}

/** RFC 4647 §3.3.2 extended filtering, as used by https://drafts.csswg.org/selectors-4/#the-lang-pseudo */
export function extendedFilter(range: string, tag: string): boolean {
  if (range === "") return tag === "";
  if (tag === "") return false;
  const r = asciiLowercase(range).split("-");
  const t = asciiLowercase(tag).split("-");
  // A language tag with a subtag longer than 8 characters is not well-formed (BCP 47 §2.1) and matches nothing.
  for (let k = 0; k < t.length; k++) if (t[k].length > 8 || t[k].length === 0) return false;
  if (r[0] !== "*" && r[0] !== t[0]) return false;
  let i = 1;
  let j = 1;
  while (i < r.length) {
    if (r[i] === "*") {
      i++;
      continue;
    }
    if (j >= t.length) return false;
    if (r[i] === t[j]) {
      i++;
      j++;
      continue;
    }
    if (t[j].length === 1) return false;
    j++;
  }
  return true;
}

export function matchesLang(el: NodeImpl, ranges: string[]): boolean {
  const lang = elementLanguage(el);
  if (lang === null) return false;
  for (let i = 0; i < ranges.length; i++) if (extendedFilter(ranges[i], lang)) return true;
  return false;
}

/** 0 = neutral, 1 = ltr, 2 = rtl — https://html.spec.whatwg.org/#auto-directionality (Bidi_Class approximation). */
function strongDirection(cp: number): number {
  if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a)) return 1;
  if (cp < 0xc0) return 0;
  if ((cp >= 0x0590 && cp <= 0x08ff) || (cp >= 0xfb1d && cp <= 0xfdff) || (cp >= 0xfe70 && cp <= 0xfefe) || (cp >= 0x10800 && cp <= 0x10fff) || (cp >= 0x1e800 && cp <= 0x1efff)) return 2;
  if (cp === 0xd7 || cp === 0xf7) return 0;
  if (cp >= 0x2000 && cp <= 0x2bff) return 0; // punctuation, symbols, arrows
  if (cp >= 0x3000 && cp <= 0x303f) return 0;
  if (cp >= 0xfe00 && cp <= 0xfe6f) return 0;
  return 1;
}

function textDirection(s: string): number {
  for (let i = 0; i < s.length; i++) {
    const cp = s.codePointAt(i)!;
    if (cp > 0xffff) i++;
    const d = strongDirection(cp);
    if (d !== 0) return d;
  }
  return 0;
}

/** dir attribute in the ltr, rtl or auto state (invalid values are the undefined state). */
function hasValidDir(n: NodeImpl): boolean {
  const d = attr(n, "dir");
  if (d === null) return false;
  const v = asciiLowercase(d);
  return v === "ltr" || v === "rtl" || v === "auto";
}

/** https://html.spec.whatwg.org/#contained-text-auto-directionality */
function autoDirectionality(el: NodeImpl): number {
  if (el.tag === T.input || el.tag === T.textarea) {
    const d = textDirection(controlValue(el));
    return d === 0 ? 1 : d;
  }
  for (let n = el.first; n !== null; ) {
    if (n.type === ELEMENT_NODE) {
      if (n.tag === T.bdi || n.tag === T.script || n.tag === T.style || n.tag === T.textarea || hasValidDir(n)) {
        n = nextSkippingChildren(n, el);
        continue;
      }
    } else if (n.type === TEXT_NODE) {
      const d = textDirection(n.data);
      if (d !== 0) return d;
    }
    n = nextInTree(n, el);
  }
  return 0;
}

/** https://html.spec.whatwg.org/#the-directionality — 1 = ltr, 2 = rtl. */
export function directionality(el: NodeImpl): number {
  for (let n: NodeImpl | null = el; n !== null; ) {
    if (n.type !== ELEMENT_NODE) break;
    const raw = isHTML(n) ? attr(n, "dir") : null;
    // Invalid dir values are ignored (https://html.spec.whatwg.org/#the-dir-attribute), except on bdi (auto).
    let dir = raw === null ? null : asciiLowercase(raw);
    if (dir !== null && dir !== "ltr" && dir !== "rtl" && dir !== "auto") dir = n.tag === T.bdi ? "auto" : null;
    if (dir !== null) {
      const v = dir;
      if (v === "ltr") return 1;
      if (v === "rtl") return 2;
      if (v === "auto") {
        const d = autoDirectionality(n);
        if (d !== 0) return d;
        if (n.tag === T.input || n.tag === T.textarea) return 1;
        // fall through to the parent's directionality
      }
    } else if (n.tag === T.bdi) {
      const d = autoDirectionality(n);
      return d === 0 ? 1 : d;
    } else if (n.tag === T.input && inputTypeName(n) === "tel") {
      return 1;
    }
    const p = parentOrHost(n);
    if (p === null || p.type === DOCUMENT_NODE) break;
    n = p;
  }
  return 1;
}

// --- registry -----------------------------------------------------------------------------

/**
 * Predicates by pseudo-class name. The compiler reads `predicates[name]` at compile time and
 * captures the function, so registering after a selector was compiled affects only new
 * compilations (call `clearSelectorCaches()` after registering if that matters).
 */
export const predicates: Record<string, Predicate> = {
  hover,
  active,
  focus: never,
  "focus-within": never,
  "focus-visible": never,
  link: anyLink,
  "any-link": anyLink,
  visited: never,
  target,
  "target-within": targetWithin,
  defined: never,
  checked: never,
  indeterminate: never,
  default: never,
  disabled: never,
  enabled: never,
  required: never,
  optional: never,
  "read-only": never,
  "read-write": never,
  "placeholder-shown": never,
  valid: never,
  invalid: never,
  "in-range": never,
  "out-of-range": never,
  "user-valid": never,
  "user-invalid": never,
  autofill: never,
  "-webkit-autofill": never,
  open,
  "popover-open": never,
  modal: never,
  fullscreen: never,
  "picture-in-picture": never,
  playing,
  paused,
  muted,
  seeking: never,
  buffering: never,
  stalled: never,
  "volume-locked": never,
  current: never,
  past: never,
  future: never,
  "has-slotted": never,
  "target-current": never,
};

/**
 * Replace the predicate for an element-state pseudo-class (e.g. html-forms registers `checked`,
 * html-elements registers `focus`, `popover-open`, `defined`). Name without the colon.
 */
export function setPseudoClassPredicate(name: string, fn: Predicate): void {
  predicates[name] = fn;
  clearSelectorCaches();
}
