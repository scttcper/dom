// Layout-lite: an opt-in, deliberately simple box model for the geometry APIs
// (`createWindow({ layout: "lite" })`, docs/layout.md). It is an approximation for virtualizers
// and positioning libraries, not a browser layout engine:
//
// - block-level boxes in normal flow stack vertically (https://drafts.csswg.org/css2/#normal-flow),
//   no margin collapsing, no floats, no line wrapping;
// - width from computed `width` (px/em/rem/%/vw/vh/calc()), `auto` fills the containing block
//   (https://drafts.csswg.org/css2/#blockwidth); height from `height` or the sum of in-flow children;
// - inline content forms one line box per run of inline-level siblings: text is
//   0.5em per collapsed character wide and one `line-height` tall;
// - flex containers lay out one line (no wrapping) with flex-basis/grow/shrink, gaps,
//   justify-content and align-items (https://drafts.csswg.org/css-flexbox-1/#layout-algorithm,
//   heavily simplified); table rows share their width equally between cells;
// - `position: relative` offsets, `absolute` against the nearest positioned ancestor's padding
//   box, `fixed` against the viewport (https://drafts.csswg.org/css2/#absolute-positioning);
//   `translate*()` transforms move getBoundingClientRect() only;
// - scroll offsets are applied at read time, so scrolling never invalidates the layout.
//
// Lazy and version-stamped: the whole document is laid out on the first geometry read after a
// change of `Document._version`, the style version or the viewport size, never on mutation.
// Boxes live in a WeakMap keyed by NodeImpl and stamped with the layout generation, so removed
// subtrees are never kept alive and stale boxes read as "no box".

import type { Document } from "../nodes/Document.ts";
import type { NodeImpl } from "../nodes/NodeImpl.ts";
import {
  CDATA_SECTION_NODE,
  ELEMENT_NODE,
  F_CONNECTED,
  F_HAS_SHADOW,
  F_HAS_STYLE_ATTR,
  F_SHADOW_ROOT,
  HTML_NS,
  SVG_NS,
  TEXT_NODE,
} from "../nodes/constants.ts";
import { T } from "../nodes/tags.ts";
import { attr, asciiLowercase } from "../nodes/attributes.ts";
import { findFlattenedSlottables } from "../nodes/slots.ts";
import {
  type StyleRecord,
  computedDisplay,
  computedValueOf,
  currentStyleVersion,
  hasAuthorStyles,
  styleRecord,
} from "./cascade.ts";
import { layoutEnabled } from "./layout-mode.ts";
import { $impl, $innerHeight, $innerWidth, $options, $shadowRoot, $version, $window } from "../keys.ts";
import type { Window } from "../window/Window.ts";

export const BOX_SCROLLER = 1;
/** position: fixed on the element or an ancestor box: not moved by window scrolling. */
export const BOX_FIXED = 2;
/** Non-replaced inline box: client* are 0 (https://drafts.csswg.org/cssom-view/#dom-element-clientwidth step 1). */
export const BOX_INLINE = 4;
export const BOX_ROOT = 8;
/** Establishes the fixed-position chain cut (the element itself is position: fixed). */
export const BOX_FIXED_SELF = 16;

/** One element's box. All coordinates are document coordinates with no scrolling applied. */
export class Box {
  /** Border-box origin (layout position: what offsetTop/offsetLeft use). */
  x: number;
  y: number;
  /** Border-box origin with translate transforms of the element and its ancestors applied. */
  vx: number;
  vy: number;
  /** Border-box size. */
  w: number;
  h: number;
  mt: number;
  mr: number;
  mb: number;
  ml: number;
  bt: number;
  br: number;
  bb: number;
  bl: number;
  pt: number;
  pr: number;
  pb: number;
  pl: number;
  /** This box's index in the generation's box list, and the end (exclusive) of its subtree's range. */
  idx: number;
  end: number;
  gen: number;
  flags: number;
  constructor() {
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.w = 0;
    this.h = 0;
    this.mt = 0;
    this.mr = 0;
    this.mb = 0;
    this.ml = 0;
    this.bt = 0;
    this.br = 0;
    this.bb = 0;
    this.bl = 0;
    this.pt = 0;
    this.pr = 0;
    this.pb = 0;
    this.pl = 0;
    this.idx = 0;
    this.end = 0;
    this.gen = 0;
    this.flags = 0;
  }
}

class LayoutState {
  version: number;
  styleVersion: number;
  vw: number;
  vh: number;
  gen: number;
  boxes: WeakMap<NodeImpl, Box>;
  styles: WeakMap<NodeImpl, Style>;
  /** Boxes of the current generation in layout order (subtrees are contiguous ranges). */
  list: Box[];
  constructor() {
    this.version = -1;
    this.styleVersion = -1;
    this.vw = -1;
    this.vh = -1;
    this.gen = 0;
    this.boxes = new WeakMap();
    this.styles = new WeakMap();
    this.list = [];
  }
}

const states = new WeakMap<Document, LayoutState>();

/** Set by css/resize-observer.ts: called after a document is laid out again. */
let relayoutListener: ((doc: Document) => void) | null = null;
export function setRelayoutListener(fn: (doc: Document) => void): void {
  relayoutListener = fn;
}

/** Whether layout-lite applies to a document (its window was created with `layout: "lite"`). */
export function layoutOn(doc: Document): boolean {
  if (!layoutEnabled) return false;
  const win = doc[$window];
  return win !== null && win[$options].layout === "lite";
}

/** The document's laid-out state, recomputed if the DOM, styles or viewport changed. */
function ensure(doc: Document): LayoutState {
  let st = states.get(doc);
  if (st === undefined) states.set(doc, (st = new LayoutState()));
  const sv = currentStyleVersion(doc);
  const win = doc[$window] as Window;
  const vw = win[$innerWidth];
  const vh = win[$innerHeight];
  if (st.version === doc[$version] && st.styleVersion === sv && st.vw === vw && st.vh === vh) return st;
  run(st, doc, vw, vh);
  st.version = doc[$version];
  st.styleVersion = sv;
  st.vw = vw;
  st.vh = vh;
  relayoutListener?.(doc);
  return st;
}

/**
 * The element's box, or null when layout-lite is off for its document, the element is not
 * connected, or it generates no box (display: none, inside a replaced element, ...).
 */
export function boxOf(el: NodeImpl): Box | null {
  if (!layoutEnabled || (el.flags & F_CONNECTED) === 0) return null;
  const doc = el.doc;
  if (!layoutOn(doc)) return null;
  const st = ensure(doc);
  const b = st.boxes.get(el);
  return b !== undefined && b.gen === st.gen ? b : null;
}

// --- per-run context ------------------------------------------------------------------------------

let S: LayoutState = new LayoutState();
let authored = false;
let rootFs = 16;
let viewW = 1024;
let viewH = 768;
/** Outer (margin-box) width of the last box laid out by layoutBox. */
let outW = 0;

class PendingAbs {
  el: NodeImpl;
  sx: number;
  sy: number;
  fs: number;
  lh: string;
  fixed: boolean;
  constructor(el: NodeImpl, sx: number, sy: number, fs: number, lh: string, fixed: boolean) {
    this.el = el;
    this.sx = sx;
    this.sy = sy;
    this.fs = fs;
    this.lh = lh;
    this.fixed = fixed;
  }
}

const pendingAbs: PendingAbs[] = [];
const pendingFixed: PendingAbs[] = [];

function run(st: LayoutState, doc: Document, vw: number, vh: number): void {
  st.gen++;
  st.list.length = 0;
  S = st;
  viewW = vw;
  viewH = vh;
  authored = hasAuthorStyles(doc);
  pendingAbs.length = 0;
  pendingFixed.length = 0;
  let root: NodeImpl | null = null;
  for (let c = doc[$impl].first; c !== null; c = c.next) if (c.type === ELEMENT_NODE) root = c;
  if (root === null) return;
  rootFs = 16;
  rootFs = fontSize(root, 16);
  try {
    // The root element's containing block is the initial containing block: the viewport at 0,0.
    // https://drafts.csswg.org/css2/#containing-block-details
    const d = computedDisplay(root);
    if (d !== "none" && d !== "contents") {
      layoutBox(root, 0, 0, vw, vh, 16, "normal", NaN, NaN, false, BOX_ROOT);
    }
    // Absolutely positioned boxes whose containing block is the initial containing block.
    flushPending(0, 0, 0, vw, vh, true);
    while (pendingFixed.length !== 0) {
      const items = pendingFixed.splice(0);
      for (let i = 0; i < items.length; i++) layoutAbs(items[i], 0, 0, vw, vh);
    }
  } finally {
    REC = null as unknown as StyleRecord;
    poolDepth = 0;
    pendingAbs.length = 0;
    pendingFixed.length = 0;
  }
}

// --- style helpers --------------------------------------------------------------------------------

/** No inline style and no author sheets: every property has its UA/initial value. */
function plain(el: NodeImpl): boolean {
  return !authored && (el.flags & F_HAS_STYLE_ATTR) === 0;
}

/**
 * The computed values layout-lite reads, resolved once per element per layout run (reused across
 * runs). Reading them through computedValue() each time dominated layout time: flex items are
 * visited several times per run.
 */
class Style {
  gen: number;
  position: string;
  transform: string;
  borderBox: boolean;
  scroller: boolean;
  mt: string;
  mr: string;
  mb: string;
  ml: string;
  bt: string;
  br: string;
  bb: string;
  bl: string;
  pt: string;
  pr: string;
  pb: string;
  pl: string;
  width: string;
  height: string;
  minW: string;
  maxW: string;
  minH: string;
  maxH: string;
  top: string;
  right: string;
  bottom: string;
  left: string;
  flexDir: string;
  grow: number;
  shrink: number;
  basis: string;
  alignSelf: string;
  alignItems: string;
  justify: string;
  rowGap: string;
  colGap: string;
  /** Font size in px, NaN to inherit the parent's. */
  fs: number;
  /** Computed line-height, "" to inherit the parent's. */
  lh: string;
  constructor() {
    this.gen = -1;
    this.position = "static";
    this.transform = "none";
    this.borderBox = false;
    this.scroller = false;
    this.mt = this.mr = this.mb = this.ml = "0px";
    this.bt = this.br = this.bb = this.bl = "0px";
    this.pt = this.pr = this.pb = this.pl = "0px";
    this.width = this.height = this.minW = this.minH = "auto";
    this.maxW = this.maxH = "none";
    this.top = this.right = this.bottom = this.left = "auto";
    this.flexDir = "row";
    this.grow = 0;
    this.shrink = 1;
    this.basis = "auto";
    this.alignSelf = "auto";
    this.alignItems = "normal";
    this.justify = "normal";
    this.rowGap = this.colGap = "normal";
    this.fs = NaN;
    this.lh = "";
  }
}

/** Initial values everywhere: elements without author styles (and no UA font size). */
const PLAIN = new Style();

function sty(el: NodeImpl): Style {
  if (plain(el) && !hasUAFontSize(el)) return PLAIN;
  let s = S.styles.get(el);
  if (s === undefined) S.styles.set(el, (s = new Style()));
  if (s.gen !== S.gen) fillStyle(el, s);
  return s;
}

let REC: StyleRecord = null as unknown as StyleRecord;

/**
 * A computed value of a non-inherited property: its initial value when nothing (author, inline or
 * UA) declares it, without computing it.
 */
function g(name: string, initial: string): string {
  const decls = REC.decls;
  if (decls === null || !decls.has(name)) return initial;
  return computedValueOf(REC, name);
}

/** border-*-width: computed `medium` (3px) when only the style is declared, 0 when neither is. */
function gBorder(width: string, style: string): string {
  const decls = REC.decls;
  if (decls === null || (!decls.has(width) && !decls.has(style))) return "0px";
  return computedValueOf(REC, width);
}

function fillStyle(el: NodeImpl, s: Style): void {
  s.gen = S.gen;
  REC = styleRecord(el);
  s.position = g("position", "static");
  s.transform = g("transform", "none");
  s.borderBox = g("box-sizing", "content-box") === "border-box";
  const ox = g("overflow-x", "visible");
  const oy = g("overflow-y", "visible");
  s.scroller = (ox !== "visible" && ox !== "clip" && ox !== "") || (oy !== "visible" && oy !== "clip" && oy !== "");
  s.mt = g("margin-top", "0px");
  s.mr = g("margin-right", "0px");
  s.mb = g("margin-bottom", "0px");
  s.ml = g("margin-left", "0px");
  s.bt = gBorder("border-top-width", "border-top-style");
  s.br = gBorder("border-right-width", "border-right-style");
  s.bb = gBorder("border-bottom-width", "border-bottom-style");
  s.bl = gBorder("border-left-width", "border-left-style");
  s.pt = g("padding-top", "0px");
  s.pr = g("padding-right", "0px");
  s.pb = g("padding-bottom", "0px");
  s.pl = g("padding-left", "0px");
  s.width = g("width", "auto");
  s.height = g("height", "auto");
  s.minW = g("min-width", "auto");
  s.maxW = g("max-width", "none");
  s.minH = g("min-height", "auto");
  s.maxH = g("max-height", "none");
  s.top = g("top", "auto");
  s.right = g("right", "auto");
  s.bottom = g("bottom", "auto");
  s.left = g("left", "auto");
  s.flexDir = g("flex-direction", "row");
  s.grow = Number(g("flex-grow", "0")) || 0;
  const shrink = Number(g("flex-shrink", "1"));
  s.shrink = Number.isFinite(shrink) ? shrink : 1;
  s.basis = g("flex-basis", "auto");
  s.alignSelf = g("align-self", "auto");
  s.alignItems = g("align-items", "normal");
  s.justify = g("justify-content", "normal");
  s.rowGap = g("row-gap", "normal");
  s.colGap = g("column-gap", "normal");
  // Inherited: computed values (font-size is already absolute px).
  const fs = parseFloat(computedValueOf(REC, "font-size"));
  s.fs = Number.isFinite(fs) ? fs : NaN;
  s.lh = computedValueOf(REC, "line-height");
}

function hasUAFontSize(el: NodeImpl): boolean {
  if (el.ns !== HTML_NS) return false;
  switch (el.tag) {
    case T.h1:
    case T.h2:
    case T.h3:
    case T.h5:
    case T.h6:
    case T.small:
    case T.big:
    case T.sub:
    case T.sup:
      return true;
  }
  return false;
}

/** Used font size in px (computed values already resolve font-size to px). */
function fontSize(el: NodeImpl, parentFs: number): number {
  const fs = sty(el).fs;
  return Number.isNaN(fs) ? parentFs : fs;
}

/** https://drafts.csswg.org/css-inline-3/#line-height-property — `normal` is 1.2. */
function lineHeightPx(v: string, fs: number): number {
  if (v === "normal" || v === "") return (fs * 6) / 5; // not fs * 1.2: 16 * 1.2 is 19.200000000000003
  const n = Number(v);
  if (Number.isFinite(n)) return n * fs;
  const l = length(v, fs, fs);
  return Number.isNaN(l) ? fs * 1.2 : l;
}

/** Computed line-height, or the parent's. */
function lineHeightOf(el: NodeImpl, parent: string): string {
  const lh = sty(el).lh;
  return lh === "" ? parent : lh;
}

// --- lengths --------------------------------------------------------------------------------------

/**
 * A computed length in px: px/em/rem/ex/ch/%/vw/vh/vmin/vmax/absolute units and calc(), min(),
 * max(), clamp() over them. NaN for `auto`, `none`, keywords, or a percentage without a base
 * (`pct` NaN). https://drafts.csswg.org/css-values-4/#lengths
 */
export function length(v: string, pct: number, fs: number): number {
  const n = v.length;
  if (n === 0) return NaN;
  if (n > 2 && v.charCodeAt(n - 1) === 120 /* x */ && v.charCodeAt(n - 2) === 112 /* p */) {
    const f = Number(v.slice(0, -2));
    if (Number.isFinite(f)) return f;
  }
  if (v === "0") return 0;
  if (v === "auto" || v === "none" || v === "normal") return NaN;
  P_SRC = v;
  P_POS = 0;
  P_PCT = pct;
  P_FS = fs;
  const r = parseSum();
  skipWs();
  return P_POS === v.length ? r : NaN;
}

let P_SRC = "";
let P_POS = 0;
let P_PCT = NaN;
let P_FS = 16;

function skipWs(): void {
  while (P_POS < P_SRC.length && P_SRC.charCodeAt(P_POS) <= 32) P_POS++;
}

function parseSum(): number {
  let r = parseProduct();
  for (;;) {
    skipWs();
    const c = P_SRC[P_POS];
    if (c !== "+" && c !== "-") return r;
    P_POS++;
    const rhs = parseProduct();
    r = c === "+" ? r + rhs : r - rhs;
  }
}

function parseProduct(): number {
  let r = parseValue();
  for (;;) {
    skipWs();
    const c = P_SRC[P_POS];
    if (c !== "*" && c !== "/") return r;
    P_POS++;
    const rhs = parseValue();
    r = c === "*" ? r * rhs : r / rhs;
  }
}

const NUMBER_RE = /[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/iy;
const UNIT_RE = /[a-z]+|%/iy;

function parseValue(): number {
  skipWs();
  const src = P_SRC;
  if (src[P_POS] === "(") {
    P_POS++;
    const r = parseSum();
    skipWs();
    if (src[P_POS] !== ")") return NaN;
    P_POS++;
    return r;
  }
  const lower = src.slice(P_POS, P_POS + 6).toLowerCase();
  for (const fn of FUNCTIONS) {
    if (lower.startsWith(fn)) {
      P_POS += fn.length;
      const args: number[] = [parseSum()];
      skipWs();
      while (src[P_POS] === ",") {
        P_POS++;
        args.push(parseSum());
        skipWs();
      }
      if (src[P_POS] !== ")") return NaN;
      P_POS++;
      if (fn === "calc(") return args.length === 1 ? args[0] : NaN;
      if (fn === "min(") return Math.min(...args);
      if (fn === "max(") return Math.max(...args);
      return args.length === 3 ? Math.max(args[0], Math.min(args[1], args[2])) : NaN;
    }
  }
  NUMBER_RE.lastIndex = P_POS;
  const m = NUMBER_RE.exec(src);
  if (m === null) return NaN;
  P_POS += m[0].length;
  const num = Number(m[0]);
  UNIT_RE.lastIndex = P_POS;
  const u = UNIT_RE.exec(src);
  if (u === null) return num; // a bare number (inside calc() multiplications)
  P_POS += u[0].length;
  return unitPx(num, u[0].toLowerCase());
}

const FUNCTIONS = ["calc(", "min(", "max(", "clamp("];

function unitPx(num: number, unit: string): number {
  switch (unit) {
    case "px":
      return num;
    case "%":
      return (num * P_PCT) / 100;
    case "em":
      return num * P_FS;
    case "rem":
      return num * rootFs;
    case "ex":
    case "ch":
      return num * P_FS * 0.5;
    case "lh":
      return num * P_FS * 1.2;
    case "vw":
    case "svw":
    case "lvw":
    case "dvw":
      return (num * viewW) / 100;
    case "vh":
    case "svh":
    case "lvh":
    case "dvh":
      return (num * viewH) / 100;
    case "vmin":
      return (num * Math.min(viewW, viewH)) / 100;
    case "vmax":
      return (num * Math.max(viewW, viewH)) / 100;
    case "in":
      return num * 96;
    case "cm":
      return (num * 96) / 2.54;
    case "mm":
      return (num * 96) / 25.4;
    case "q":
      return (num * 96) / 101.6;
    case "pt":
      return (num * 96) / 72;
    case "pc":
      return num * 16;
  }
  return NaN;
}

function lenOr0(v: string, pct: number, fs: number): number {
  const n = length(v, pct, fs);
  return Number.isNaN(n) ? 0 : n;
}

// --- edges ----------------------------------------------------------------------------------------

/** Margins (auto → 0), borders and padding into the box. Percentages refer to the containing block width. */
function edges(el: NodeImpl, b: Box, cbW: number, fs: number): void {
  const s = sty(el);
  if (s === PLAIN) {
    b.mt = b.mr = b.mb = b.ml = 0;
    b.bt = b.br = b.bb = b.bl = 0;
    b.pt = b.pr = b.pb = b.pl = 0;
    return;
  }
  b.mt = lenOr0(s.mt, cbW, fs);
  b.mr = lenOr0(s.mr, cbW, fs);
  b.mb = lenOr0(s.mb, cbW, fs);
  b.ml = lenOr0(s.ml, cbW, fs);
  b.bt = lenOr0(s.bt, cbW, fs);
  b.br = lenOr0(s.br, cbW, fs);
  b.bb = lenOr0(s.bb, cbW, fs);
  b.bl = lenOr0(s.bl, cbW, fs);
  b.pt = Math.max(0, lenOr0(s.pt, cbW, fs));
  b.pr = Math.max(0, lenOr0(s.pr, cbW, fs));
  b.pb = Math.max(0, lenOr0(s.pb, cbW, fs));
  b.pl = Math.max(0, lenOr0(s.pl, cbW, fs));
}

function borderBox(el: NodeImpl): boolean {
  return sty(el).borderBox;
}

/** Converts a specified width/height to a content size. */
function toContent(spec: number, el: NodeImpl, pb: number): number {
  return Math.max(0, borderBox(el) ? spec - pb : spec);
}

function clampSize(
  el: NodeImpl,
  content: number,
  minV: string,
  maxV: string,
  base: number,
  fs: number,
  pb: number,
): number {
  if (minV === "auto" && maxV === "none") return content;
  const max = length(maxV, base, fs);
  if (!Number.isNaN(max)) content = Math.min(content, toContent(max, el, pb));
  const min = length(minV, base, fs);
  if (!Number.isNaN(min)) content = Math.max(content, toContent(min, el, pb));
  return content;
}

// --- box kinds ------------------------------------------------------------------------------------

function isReplaced(el: NodeImpl): boolean {
  if (el.ns === SVG_NS) return el.name === "svg";
  if (el.ns !== HTML_NS) return false;
  switch (el.tag) {
    case T.img:
    case T.canvas:
    case T.video:
    case T.iframe:
    case T.embed:
    case T.object:
    case T.audio:
    case T.input:
    case T.textarea:
    case T.select:
      return true;
  }
  return false;
}

function intAttr(el: NodeImpl, name: string, fallback: number): number {
  const v = attr(el, name);
  if (v === null) return fallback;
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

let intrinsicH = 0;
/** Intrinsic content width of a replaced element (height in `intrinsicH`). */
function intrinsicW(el: NodeImpl, fs: number, lh: number): number {
  if (el.ns === SVG_NS) {
    intrinsicH = intAttr(el, "height", 150);
    return intAttr(el, "width", 300);
  }
  switch (el.tag) {
    case T.img:
      intrinsicH = intAttr(el, "height", 0);
      return intAttr(el, "width", 0);
    case T.audio:
      intrinsicH = 54;
      return 300;
    case T.input: {
      const type = asciiLowercase(attr(el, "type") ?? "text");
      if (type === "checkbox" || type === "radio") {
        intrinsicH = 13;
        return 13;
      }
      intrinsicH = lh;
      if (type === "submit" || type === "reset" || type === "button") {
        return textWidth(attr(el, "value") ?? (type === "submit" ? "Submit" : type === "reset" ? "Reset" : ""), fs);
      }
      return intAttr(el, "size", 20) * fs * 0.5;
    }
    case T.textarea:
      intrinsicH = intAttr(el, "rows", 2) * lh;
      return intAttr(el, "cols", 20) * fs * 0.5;
    case T.select: {
      const multiple = attr(el, "multiple") !== null;
      intrinsicH = (multiple || intAttr(el, "size", 1) > 1 ? intAttr(el, "size", 4) : 1) * lh;
      let w = 0;
      for (let c = el.first; c !== null; c = c.next) {
        if (c.type === ELEMENT_NODE) w = Math.max(w, textWidth(textContent(c), fs));
      }
      return w + 20;
    }
  }
  intrinsicH = intAttr(el, "height", 150);
  return intAttr(el, "width", 300);
}

function textContent(n: NodeImpl): string {
  let s = "";
  for (let c = n.first; c !== null; c = c.next) {
    if (c.type === TEXT_NODE || c.type === CDATA_SECTION_NODE) s += c.data;
    else if (c.type === ELEMENT_NODE) s += textContent(c);
  }
  return s;
}

/** Width of a text run: 0.5em per character after collapsing white space. */
function textWidth(data: string, fs: number): number {
  let count = 0;
  let space = true; // leading white space collapses away
  for (let i = 0; i < data.length; i++) {
    const c = data.charCodeAt(i);
    if (c === 32 || c === 9 || c === 10 || c === 13 || c === 12) {
      if (!space) {
        count++;
        space = true;
      }
    } else {
      count++;
      space = false;
    }
  }
  if (space && count > 0) count--; // trailing white space
  return count * fs * 0.5;
}

function isBlank(data: string): boolean {
  for (let i = 0; i < data.length; i++) {
    const c = data.charCodeAt(i);
    if (c !== 32 && c !== 9 && c !== 10 && c !== 13 && c !== 12) return false;
  }
  return true;
}

const K_NONE = 0;
const K_BLOCK = 1;
const K_INLINE = 2;
const K_ATOMIC = 3;

/** Outer display kind of a child (https://drafts.csswg.org/css-display-3/#outer-role). */
function kindOf(el: NodeImpl, d: string): number {
  switch (d) {
    case "none":
      return K_NONE;
    case "inline":
      if (isReplaced(el)) return K_ATOMIC;
      return hasBlockChild(el) ? K_BLOCK : K_INLINE;
    case "inline-block":
    case "inline-flex":
    case "inline-grid":
    case "inline-table":
    case "inline flow-root":
    case "inline flex":
    case "inline grid":
      return K_ATOMIC;
  }
  if (isReplaced(el) && d !== "block") return K_ATOMIC;
  return K_BLOCK;
}

/** An inline element containing block-level children is treated as a block (no block-in-inline splitting). */
function hasBlockChild(el: NodeImpl): boolean {
  for (let c = el.first; c !== null; c = c.next) {
    if (c.type !== ELEMENT_NODE) continue;
    const d = computedDisplay(c);
    if (d === "contents" ? hasBlockChild(c) : d !== "none" && d !== "inline" && kindOf(c, d) === K_BLOCK) return true;
  }
  return false;
}

function isFlex(d: string): boolean {
  return d === "flex" || d === "inline-flex" || d === "inline flex" || d === "block flex";
}

// --- children (flat tree) -------------------------------------------------------------------------

const childPool: NodeImpl[][] = [];
let poolDepth = 0;

/** The element's layout children: flat-tree children with display: contents flattened. */
function collect(el: NodeImpl, out: NodeImpl[]): void {
  let start: NodeImpl = el;
  if ((el.flags & F_HAS_SHADOW) !== 0) {
    const sr = (el.node as unknown as { [$shadowRoot]?: { [$impl]: NodeImpl } | null })[$shadowRoot];
    if (sr != null) start = sr[$impl];
  }
  for (let c = start.first; c !== null; c = c.next) collectNode(c, out);
}

function collectNode(c: NodeImpl, out: NodeImpl[]): void {
  if (c.type === TEXT_NODE || c.type === CDATA_SECTION_NODE) {
    out.push(c);
  } else if (c.type === ELEMENT_NODE) {
    if (c.ns === HTML_NS && c.tag === T.slot && c.parent !== null && isInShadowTree(c)) {
      if (computedDisplay(c) !== "contents") {
        out.push(c);
        return;
      }
      const assigned = findFlattenedSlottables(c);
      for (let i = 0; i < assigned.length; i++) collectNode(assigned[i], out);
      return;
    }
    if (computedDisplay(c) === "contents") collect(c, out);
    else out.push(c);
  }
}

function isInShadowTree(n: NodeImpl): boolean {
  let top = n;
  while (top.parent !== null) top = top.parent;
  return (top.flags & F_SHADOW_ROOT) !== 0;
}

function children(el: NodeImpl): NodeImpl[] {
  const out = childPool[poolDepth] ?? (childPool[poolDepth] = []);
  poolDepth++;
  out.length = 0;
  collect(el, out);
  return out;
}

function releaseChildren(out: NodeImpl[]): void {
  out.length = 0;
  poolDepth--;
}

// --- box allocation and shifting ------------------------------------------------------------------

function newBox(el: NodeImpl, flags: number): Box {
  let b = S.boxes.get(el);
  if (b === undefined) S.boxes.set(el, (b = new Box()));
  b.gen = S.gen;
  b.idx = S.list.length;
  b.end = b.idx + 1;
  b.flags = flags;
  S.list.push(b);
  return b;
}

/** Moves a laid-out subtree (its box range); `visualOnly` moves only the transformed position. */
function shift(b: Box, dx: number, dy: number, visualOnly: boolean): void {
  if (dx === 0 && dy === 0) return;
  const list = S.list;
  for (let i = b.idx; i < b.end; i++) {
    const d = list[i];
    d.vx += dx;
    d.vy += dy;
    if (!visualOnly) {
      d.x += dx;
      d.y += dy;
    }
  }
}

/** Translation of a computed `transform` (translate/translateX/Y/3d, matrix()); other functions are ignored. */
function translation(v: string, w: number, h: number, fs: number): void {
  TX = 0;
  TY = 0;
  const re = /(translate3d|translatex|translatey|translate|matrix)\(([^)]*)\)/gi;
  for (let m = re.exec(v); m !== null; m = re.exec(v)) {
    const fn = m[1].toLowerCase();
    const args = m[2].split(",").map((s) => s.trim());
    if (fn === "matrix") {
      if (args.length === 6) {
        TX += Number(args[4]) || 0;
        TY += Number(args[5]) || 0;
      }
    } else if (fn === "translatex") TX += lenOr0(args[0], w, fs);
    else if (fn === "translatey") TY += lenOr0(args[0], h, fs);
    else {
      TX += lenOr0(args[0], w, fs);
      if (args.length > 1) TY += lenOr0(args[1], h, fs);
    }
  }
}
let TX = 0;
let TY = 0;

// --- layout ---------------------------------------------------------------------------------------

/**
 * Lays out one box at (x, y) (its margin edge) in a containing block of width `availW` and height
 * `cbH` (NaN when indefinite). `forcedW`/`forcedH` impose a border-box size (flex items, absolute
 * boxes); `shrink` sizes an auto width to fit the content (inline-blocks, flex row items).
 * Returns the margin-box height; the margin-box width is left in `outW`.
 */
function layoutBox(
  el: NodeImpl,
  x: number,
  y: number,
  availW: number,
  cbH: number,
  pfs: number,
  plh: string,
  forcedW: number,
  forcedH: number,
  shrink: boolean,
  flags: number,
): number {
  const b = newBox(el, flags);
  const d = computedDisplay(el);
  const fs = fontSize(el, pfs);
  const lhStr = lineHeightOf(el, plh);
  const lh = lineHeightPx(lhStr, fs);
  const position = plain(el) ? "static" : sty(el).position;
  const transform = plain(el) ? "none" : sty(el).transform;
  edges(el, b, availW, fs);
  const hpb = b.pl + b.pr + b.bl + b.br;
  const vpb = b.pt + b.pb + b.bt + b.bb;
  const replaced = isReplaced(el);

  // Width: https://drafts.csswg.org/css2/#blockwidth (auto margins center a definite width).
  let cw: number;
  const specW = plain(el) ? NaN : length(sty(el).width, availW, fs);
  let autoW = false;
  if (!Number.isNaN(forcedW)) cw = Math.max(0, forcedW - hpb);
  else if (!Number.isNaN(specW)) cw = toContent(specW, el, hpb);
  else if (replaced) cw = replacedWidth(el, fs, lh, cbH);
  else if (shrink) {
    cw = Math.min(maxContent(el, pfs) - hpb, availW - b.ml - b.mr - hpb);
    autoW = true;
  } else {
    cw = availW - b.ml - b.mr - hpb;
    autoW = true;
  }
  if (Number.isNaN(forcedW)) cw = clampSize(el, Math.max(0, cw), sty(el).minW, sty(el).maxW, availW, fs, hpb);
  if (!autoW && Number.isNaN(forcedW) && !shrink && !plain(el)) {
    const autoL = sty(el).ml === "auto";
    const autoR = sty(el).mr === "auto";
    const free = availW - cw - hpb - b.ml - b.mr;
    if (autoL && autoR) b.ml += Math.max(0, free / 2);
    else if (autoL) b.ml += Math.max(0, free);
  }
  b.x = b.vx = x + b.ml;
  b.y = b.vy = y + b.mt;
  b.w = cw + hpb;

  // Height: specified, forced, or the content's (https://drafts.csswg.org/css2/#normal-block).
  const specH = plain(el) ? NaN : length(sty(el).height, cbH, fs);
  let defH = NaN;
  if (!Number.isNaN(forcedH)) defH = Math.max(0, forcedH - vpb);
  else if (!Number.isNaN(specH))
    defH = clampSize(el, toContent(specH, el, vpb), sty(el).minH, sty(el).maxH, cbH, fs, vpb);
  else if (replaced) defH = replacedHeight(el, fs, lh, cw);

  const isCB = position !== "static" || transform !== "none" || (flags & BOX_ROOT) !== 0;
  const mark = pendingAbs.length;
  const cx = b.x + b.bl + b.pl;
  const cy = b.y + b.bt + b.pt;
  let inner = 0;
  if (!replaced) {
    if (isFlex(d)) inner = layoutFlex(el, cx, cy, cw, defH, fs, lhStr, lh, false);
    else if (d === "table-row") inner = layoutFlex(el, cx, cy, cw, defH, fs, lhStr, lh, true);
    else inner = flow(el, cx, cy, cw, defH, fs, lhStr, lh);
  }
  let ch = Number.isNaN(defH) ? clampSize(el, inner, sty(el).minH, sty(el).maxH, cbH, fs, vpb) : defH;
  if (Number.isNaN(ch)) ch = 0;
  b.h = ch + vpb;

  if (sty(el).scroller) b.flags |= BOX_SCROLLER;
  if ((flags & BOX_ROOT) !== 0) b.flags |= BOX_SCROLLER;

  if (isCB && (flags & BOX_ROOT) === 0)
    flushPending(mark, b.x + b.bl, b.y + b.bt, b.w - b.bl - b.br, b.h - b.bt - b.bb, false);
  b.end = S.list.length;

  // https://drafts.csswg.org/css2/#relative-positioning (sticky boxes stay in place)
  if (position === "relative") {
    const left = length(sty(el).left, availW, fs);
    const top = length(sty(el).top, cbH, fs);
    const dx = !Number.isNaN(left) ? left : -lenOr0(sty(el).right, availW, fs);
    const dy = !Number.isNaN(top) ? top : -lenOr0(sty(el).bottom, cbH, fs);
    shift(b, dx, dy, false);
  }
  if (transform !== "none") {
    translation(transform, b.w, b.h, fs);
    shift(b, TX, TY, true);
  }
  outW = b.w + b.ml + b.mr;
  return b.h + b.mt + b.mb;
}

function replacedWidth(el: NodeImpl, fs: number, lh: number, cbH: number): number {
  const w = intrinsicW(el, fs, lh);
  const ih = intrinsicH;
  // A definite height scales the intrinsic width by the intrinsic ratio (img/svg/canvas/video).
  if (w > 0 && ih > 0 && !plain(el)) {
    const specH = length(sty(el).height, cbH, fs);
    if (!Number.isNaN(specH) && (el.tag === T.img || el.tag === T.canvas || el.tag === T.video || el.ns === SVG_NS))
      return (specH * w) / ih;
  }
  return w;
}

function replacedHeight(el: NodeImpl, fs: number, lh: number, cw: number): number {
  const w = intrinsicW(el, fs, lh);
  const ih = intrinsicH;
  if (
    w > 0 &&
    ih > 0 &&
    cw !== w &&
    (el.tag === T.img || el.tag === T.canvas || el.tag === T.video || el.ns === SVG_NS)
  )
    return (cw * ih) / w;
  return ih;
}

/** Queues an absolutely positioned child at its static position. */
function deferAbs(el: NodeImpl, position: string, sx: number, sy: number, fs: number, lh: string): void {
  pendingAbs.push(new PendingAbs(el, sx, sy, fs, lh, position === "fixed"));
}

/** Lays out the absolutely positioned descendants queued since `mark` against a containing block. */
function flushPending(mark: number, cbx: number, cby: number, cbw: number, cbh: number, viewport: boolean): void {
  if (pendingAbs.length <= mark) return;
  const items = pendingAbs.splice(mark);
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.fixed && !viewport) pendingFixed.push(item);
    else if (item.fixed) layoutAbs(item, 0, 0, viewW, viewH);
    else layoutAbs(item, cbx, cby, cbw, cbh);
  }
}

/** https://drafts.csswg.org/css2/#abs-non-replaced-width (simplified: shrink-to-fit, no over-constraint rules). */
function layoutAbs(item: PendingAbs, cbx: number, cby: number, cbw: number, cbh: number): void {
  const el = item.el;
  const fs = fontSize(el, item.fs);
  edges(el, TMP, cbw, fs);
  const hpb = TMP.pl + TMP.pr + TMP.bl + TMP.br;
  const vpb = TMP.pt + TMP.pb + TMP.bt + TMP.bb;
  const mh = TMP.ml + TMP.mr;
  const mv = TMP.mt + TMP.mb;
  const left = length(sty(el).left, cbw, fs);
  const right = length(sty(el).right, cbw, fs);
  const top = length(sty(el).top, cbh, fs);
  const bottom = length(sty(el).bottom, cbh, fs);
  const specW = length(sty(el).width, cbw, fs);
  const specH = length(sty(el).height, cbh, fs);
  let forcedW = NaN;
  if (Number.isNaN(specW) && !isReplaced(el)) {
    if (!Number.isNaN(left) && !Number.isNaN(right)) forcedW = Math.max(hpb, cbw - left - right - mh);
    else forcedW = Math.max(hpb, Math.min(maxContent(el, item.fs), cbw - (Number.isNaN(left) ? 0 : left) - mh));
  }
  let forcedH = NaN;
  if (Number.isNaN(specH) && !Number.isNaN(top) && !Number.isNaN(bottom))
    forcedH = Math.max(vpb, cbh - top - bottom - mv);
  // Provisional position; right/bottom anchoring is applied once the size is known.
  const x = !Number.isNaN(left) ? cbx + left : item.sx;
  const y = !Number.isNaN(top) ? cby + top : item.sy;
  const flags = item.fixed ? BOX_FIXED | BOX_FIXED_SELF : 0;
  layoutBox(el, x, y, cbw, cbh, item.fs, item.lh, forcedW, forcedH, false, flags);
  const b = S.boxes.get(el)!;
  let dx = 0;
  let dy = 0;
  if (Number.isNaN(left) && !Number.isNaN(right)) dx = cbx + cbw - right - b.mr - b.w - b.x;
  if (Number.isNaN(top) && !Number.isNaN(bottom)) dy = cby + cbh - bottom - b.mb - b.h - b.y;
  shift(b, dx, dy, false);
  if (item.fixed) for (let i = b.idx; i < b.end; i++) S.list[i].flags |= BOX_FIXED;
}

const TMP = new Box();

/**
 * Block formatting of an element's children inside its content box at (cx, cy), width cw.
 * Runs of inline-level children form one line box each. Returns the content height.
 */
function flow(
  el: NodeImpl,
  cx: number,
  cy: number,
  cw: number,
  defH: number,
  fs: number,
  lhStr: string,
  lh: number,
): number {
  const kids = children(el);
  // Heights accumulate from 0 (not from cy) so content heights carry no float noise.
  let h = 0;
  let lineOpen = false;
  let lineX = cx;
  let lineH = 0;
  for (let i = 0; i < kids.length; i++) {
    const c = kids[i];
    if (c.type !== ELEMENT_NODE) {
      if (isBlank(c.data)) continue;
      if (!lineOpen) {
        lineOpen = true;
        lineX = cx;
        lineH = lh;
      }
      lineX += textWidth(c.data, fs);
      continue;
    }
    const d = computedDisplay(c);
    const kind = kindOf(c, d);
    if (kind === K_NONE) continue;
    const position = plain(c) ? "static" : sty(c).position;
    if (position === "absolute" || position === "fixed") {
      deferAbs(c, position, lineOpen ? lineX : cx, cy + h, fs, lhStr);
      continue;
    }
    if (c.ns === HTML_NS && c.tag === T.br) {
      if (!lineOpen) lineH = lh;
      const br = newBox(c, BOX_INLINE);
      br.x = br.vx = lineX;
      br.y = br.vy = cy + h;
      br.w = 0;
      br.h = lineH;
      br.mt = br.mr = br.mb = br.ml = br.bt = br.br = br.bb = br.bl = br.pt = br.pr = br.pb = br.pl = 0;
      h += lineH;
      lineOpen = false;
      lineH = 0;
      continue;
    }
    if (kind === K_BLOCK) {
      if (lineOpen) {
        h += lineH;
        lineOpen = false;
        lineH = 0;
      }
      h += layoutBox(c, cx, cy + h, cw, defH, fs, lhStr, NaN, NaN, false, 0);
      continue;
    }
    if (!lineOpen) {
      lineOpen = true;
      lineX = cx;
      lineH = lh;
    }
    if (kind === K_ATOMIC) {
      const ih = layoutBox(c, lineX, cy + h, cw, defH, fs, lhStr, NaN, NaN, true, 0);
      lineX += outW;
      if (ih > lineH) lineH = ih;
    } else {
      const ih = layoutInline(c, lineX, cy + h, cw, fs, lhStr);
      lineX += outW;
      if (ih > lineH) lineH = ih;
    }
  }
  if (lineOpen) h += lineH;
  releaseChildren(kids);
  return h;
}

/** A non-replaced inline box on the current line: its content laid out left to right. */
function layoutInline(el: NodeImpl, x: number, y: number, cw: number, pfs: number, plh: string): number {
  const b = newBox(el, BOX_INLINE);
  const fs = fontSize(el, pfs);
  const lhStr = lineHeightOf(el, plh);
  const lh = lineHeightPx(lhStr, fs);
  edges(el, b, cw, fs);
  b.x = b.vx = x + b.ml;
  b.y = b.vy = y;
  let lineH = lh;
  let cursor = b.x + b.bl + b.pl;
  const kids = children(el);
  for (let i = 0; i < kids.length; i++) {
    const c = kids[i];
    if (c.type !== ELEMENT_NODE) {
      cursor += textWidth(c.data, fs);
      continue;
    }
    const d = computedDisplay(c);
    const kind = kindOf(c, d);
    if (kind === K_NONE) continue;
    const position = plain(c) ? "static" : sty(c).position;
    if (position === "absolute" || position === "fixed") {
      deferAbs(c, position, cursor, y, fs, lhStr);
      continue;
    }
    const h =
      kind === K_INLINE
        ? layoutInline(c, cursor, y, cw, fs, lhStr)
        : layoutBox(c, cursor, y, cw, NaN, fs, lhStr, NaN, NaN, true, 0);
    cursor += outW;
    if (h > lineH) lineH = h;
  }
  releaseChildren(kids);
  b.w = cursor + b.pr + b.br - b.x;
  b.h = lineH + b.pt + b.pb + b.bt + b.bb;
  b.end = S.list.length;
  const position = plain(el) ? "static" : sty(el).position;
  if (position === "relative") {
    const left = length(sty(el).left, cw, fs);
    const top = length(sty(el).top, NaN, fs);
    shift(b, Number.isNaN(left) ? 0 : left, Number.isNaN(top) ? 0 : top, false);
  }
  outW = b.w + b.ml + b.mr;
  return lineH;
}

// --- flex -----------------------------------------------------------------------------------------

class FlexItem {
  el: NodeImpl | null;
  text: string;
  grow: number;
  shrink: number;
  /** Hypothetical then final main size (border box). */
  main: number;
  /** Main-axis margins. */
  m0: number;
  m1: number;
  /** Measured outer cross size. */
  cross: number;
  autoCross: boolean;
  align: string;
  constructor() {
    this.el = null;
    this.text = "";
    this.grow = 0;
    this.shrink = 1;
    this.main = 0;
    this.m0 = 0;
    this.m1 = 0;
    this.cross = 0;
    this.autoCross = true;
    this.align = "stretch";
  }
}

/**
 * One flex line (https://drafts.csswg.org/css-flexbox-1/#layout-algorithm, simplified): flex base
 * sizes from flex-basis / width|height / content, grow or shrink to the container's definite main
 * size, then stretch or align on the cross axis. Items that change size are laid out a second
 * time with the final size. `equal` lays out a table row: cells share the width equally.
 */
function layoutFlex(
  el: NodeImpl,
  cx: number,
  cy: number,
  cw: number,
  defH: number,
  fs: number,
  lhStr: string,
  lh: number,
  equal: boolean,
): number {
  const dir = equal || plain(el) ? "row" : sty(el).flexDir;
  const column = dir === "column" || dir === "column-reverse";
  const reverse = dir === "row-reverse" || dir === "column-reverse";
  const gapV = equal || plain(el) ? "normal" : column ? sty(el).rowGap : sty(el).colGap;
  const gap = Math.max(0, lenOr0(gapV, column ? defH : cw, fs));
  const alignItems = equal || plain(el) ? "normal" : sty(el).alignItems;
  const justify = equal || plain(el) ? "normal" : sty(el).justify;
  const kids = children(el);
  const items: FlexItem[] = [];
  for (let i = 0; i < kids.length; i++) {
    const c = kids[i];
    if (c.type !== ELEMENT_NODE) {
      if (isBlank(c.data)) continue;
      const it = new FlexItem();
      it.text = c.data;
      it.main = column ? lh : textWidth(c.data, fs);
      it.cross = column ? textWidth(c.data, fs) : lh;
      it.shrink = 0;
      items.push(it);
      continue;
    }
    const d = computedDisplay(c);
    if (d === "none") continue;
    const position = plain(c) ? "static" : sty(c).position;
    if (position === "absolute" || position === "fixed") {
      deferAbs(c, position, cx, cy, fs, lhStr);
      continue;
    }
    const it = new FlexItem();
    it.el = c;
    const cfs = fontSize(c, fs);
    edges(c, TMP, cw, cfs);
    const hpb = TMP.pl + TMP.pr + TMP.bl + TMP.br;
    const vpb = TMP.pt + TMP.pb + TMP.bt + TMP.bb;
    it.m0 = column ? TMP.mt : TMP.ml;
    it.m1 = column ? TMP.mb : TMP.mr;
    const p = plain(c);
    if (equal) {
      it.grow = 1;
      it.shrink = 1;
      it.main = 0;
    } else {
      it.grow = p ? 0 : sty(c).grow;
      it.shrink = sty(c).shrink;
      const basis = p ? "auto" : sty(c).basis;
      const mainBase = column ? defH : cw;
      const pb = column ? vpb : hpb;
      let size = basis === "auto" || basis === "content" ? NaN : length(basis, mainBase, cfs);
      if (!Number.isNaN(size)) size = toContent(size, c, pb) + pb;
      else {
        const spec = p ? NaN : length(column ? sty(c).height : sty(c).width, mainBase, cfs);
        if (!Number.isNaN(spec)) size = toContent(spec, c, pb) + pb;
      }
      it.main = size; // NaN: content-sized, measured below
    }
    const align = p ? "auto" : sty(c).alignSelf;
    it.align = align === "auto" || align === "normal" ? (alignItems === "normal" ? "stretch" : alignItems) : align;
    const crossSpec = p ? "auto" : column ? sty(c).width : sty(c).height;
    it.autoCross = crossSpec === "auto" && !isReplaced(c);
    items.push(it);
  }
  releaseChildren(kids);

  const listMark = S.list.length;
  const absMark = pendingAbs.length;
  const crossAvail = column ? cw : defH;

  // Pass 1: lay out content-sized items to measure them (and everything else at its base size).
  let pos = column ? cy : cx;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.el === null) {
      pos += it.main + gap;
      continue;
    }
    const stretchW = column && it.autoCross && it.align === "stretch" ? cw - crossMargins(it.el, cw, fs, true) : NaN;
    if (column) {
      const h = layoutBox(it.el, cx, pos, cw, defH, fs, lhStr, stretchW, it.main, Number.isNaN(stretchW), 0);
      const b = S.boxes.get(it.el)!;
      if (Number.isNaN(it.main)) it.main = b.h;
      it.cross = outW;
      pos += h + gap;
    } else {
      const forcedH =
        it.autoCross && it.align === "stretch" && !Number.isNaN(defH) ? defH - crossMargins(it.el, cw, fs, false) : NaN;
      layoutBox(it.el, pos, cy, cw, defH, fs, lhStr, it.main, forcedH, Number.isNaN(it.main), 0);
      const b = S.boxes.get(it.el)!;
      if (Number.isNaN(it.main)) it.main = b.w;
      it.cross = b.h + b.mt + b.mb;
      pos += outW + gap;
    }
  }

  // Resolve flexible lengths against a definite main size.
  const mainSize = column ? defH : cw;
  let used = gap * Math.max(0, items.length - 1);
  let grow = 0;
  let shrinkWeight = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    used += it.main + it.m0 + it.m1;
    grow += it.grow;
    shrinkWeight += it.shrink * it.main;
  }
  let changed = false;
  let free = Number.isNaN(mainSize) ? 0 : mainSize - used;
  if (free > 0 && grow > 0) {
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.grow > 0) {
        it.main += (free * it.grow) / grow;
        changed = true;
      }
    }
    free = 0;
  } else if (free < 0 && shrinkWeight > 0) {
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.shrink > 0 && it.main > 0) {
        it.main = Math.max(0, it.main + (free * it.shrink * it.main) / shrinkWeight);
        changed = true;
      }
    }
    free = 0;
  }
  // Cross size of the line: the container's definite cross size, else the largest item.
  let lineCross = crossAvail;
  if (Number.isNaN(lineCross)) {
    lineCross = 0;
    for (let i = 0; i < items.length; i++) if (items[i].cross > lineCross) lineCross = items[i].cross;
  }
  // Row items stretched to an indefinite line need their final height too.
  if (!column && Number.isNaN(defH)) {
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.el !== null && it.autoCross && it.align === "stretch" && it.cross < lineCross) changed = true;
    }
  }

  // justify-content distributes leftover space (https://drafts.csswg.org/css-align-3/#distribution-values).
  let lead = 0;
  let between = gap;
  if (free > 0 && items.length > 0) {
    switch (justify) {
      case "center":
        lead = free / 2;
        break;
      case "flex-end":
      case "end":
        lead = free;
        break;
      case "space-between":
        between += items.length > 1 ? free / (items.length - 1) : 0;
        break;
      case "space-around":
        lead = free / items.length / 2;
        between += free / items.length;
        break;
      case "space-evenly":
        lead = free / (items.length + 1);
        between += free / (items.length + 1);
        break;
    }
    if (reverse && (justify === "normal" || justify === "flex-start" || justify === "start")) lead = free;
  }

  // Pass 2: final sizes and positions.
  if (changed) {
    S.list.length = listMark;
    pendingAbs.length = absMark;
  }
  pos = (column ? cy : cx) + lead;
  let total = 0;
  const order = reverse ? items.slice().reverse() : items;
  for (let i = 0; i < order.length; i++) {
    const it = order[i];
    if (it.el === null) {
      pos += it.main + between;
      total += it.main + between;
      continue;
    }
    const b = S.boxes.get(it.el)!;
    if (column) {
      const stretchW = it.autoCross && it.align === "stretch" ? cw - crossMargins(it.el, cw, fs, true) : NaN;
      if (changed) layoutBox(it.el, cx, pos, cw, defH, fs, lhStr, stretchW, it.main, Number.isNaN(stretchW), 0);
      else shift(b, 0, pos + b.mt - b.y, false);
      const off = crossOffset(it.align, cw, b.w + b.ml + b.mr);
      shift(b, off, 0, false);
      pos += b.h + b.mt + b.mb + between;
      total += b.h + b.mt + b.mb + between;
    } else {
      const forcedH = it.autoCross && it.align === "stretch" ? lineCross - crossMargins(it.el, cw, fs, false) : NaN;
      if (changed) layoutBox(it.el, pos, cy, it.main, defH, fs, lhStr, it.main, forcedH, false, 0);
      else shift(b, pos + b.ml - b.x, 0, false);
      const off = crossOffset(it.align, lineCross, b.h + b.mt + b.mb);
      shift(b, 0, off, false);
      pos += b.w + b.ml + b.mr + between;
    }
  }
  if (column) return Number.isNaN(defH) ? Math.max(0, total - between) : defH;
  return lineCross;
}

function crossMargins(c: NodeImpl, cw: number, fs: number, column: boolean): number {
  edges(c, TMP, cw, fontSize(c, fs));
  return column ? TMP.ml + TMP.mr : TMP.mt + TMP.mb;
}

function crossOffset(align: string, line: number, outer: number): number {
  if (Number.isNaN(line)) return 0;
  switch (align) {
    case "center":
      return (line - outer) / 2;
    case "flex-end":
    case "end":
    case "self-end":
      return line - outer;
  }
  return 0;
}

// --- intrinsic sizes ------------------------------------------------------------------------------

/**
 * Max-content border-box width (https://drafts.csswg.org/css-sizing-3/#max-content), estimated:
 * text runs at 0.5em per character, inline runs summed, blocks the widest child.
 */
function maxContent(el: NodeImpl, pfs: number): number {
  const fs = fontSize(el, pfs);
  edges(el, TMP, NaN, fs);
  const hpb = TMP.pl + TMP.pr + TMP.bl + TMP.br;
  if (isReplaced(el)) {
    const lh = lineHeightPx(lineHeightOf(el, "normal"), fs);
    return intrinsicW(el, fs, lh) + hpb;
  }
  if (!plain(el)) {
    const spec = length(sty(el).width, NaN, fs);
    if (!Number.isNaN(spec)) return toContent(spec, el, hpb) + hpb;
  }
  const d = computedDisplay(el);
  const row = isFlex(d) && (plain(el) || !sty(el).flexDir.startsWith("column"));
  const rowGap = row && !plain(el) ? Math.max(0, lenOr0(sty(el).colGap, NaN, fs)) : 0;
  const kids = children(el);
  let best = 0;
  let line = 0;
  let count = 0;
  for (let i = 0; i < kids.length; i++) {
    const c = kids[i];
    if (c.type !== ELEMENT_NODE) {
      line += textWidth(c.data, fs);
      continue;
    }
    const cd = computedDisplay(c);
    const kind = kindOf(c, cd);
    if (kind === K_NONE) continue;
    if (!plain(c)) {
      const position = sty(c).position;
      if (position === "absolute" || position === "fixed") continue;
    }
    if (c.ns === HTML_NS && c.tag === T.br) {
      best = Math.max(best, line);
      line = 0;
      continue;
    }
    const w = maxContent(c, fs);
    edges(c, TMP, NaN, fontSize(c, fs));
    const outer = w + TMP.ml + TMP.mr;
    if (row) {
      line += outer + (count > 0 ? rowGap : 0);
      count++;
    } else if (kind === K_BLOCK) {
      best = Math.max(best, line, outer);
      line = 0;
    } else line += outer;
  }
  releaseChildren(kids);
  return Math.max(best, line) + hpb;
}

// --- reads ----------------------------------------------------------------------------------------

/** Layout viewport size of the element's window. */
export function viewport(el: NodeImpl): Window {
  return el.doc[$window] as Window;
}

/** Content extent of a box's subtree (for scrollWidth/scrollHeight), relative to its padding edge. */
export function scrollExtent(el: NodeImpl, b: Box, vertical: boolean): number {
  const list = states.get(el.doc)!.list;
  const originX = b.vx + b.bl;
  const originY = b.vy + b.bt;
  let max = 0;
  for (let i = b.idx + 1; i < b.end; i++) {
    const d = list[i];
    if ((d.flags & BOX_FIXED_SELF) !== 0 && (b.flags & BOX_ROOT) === 0) {
      i = d.end - 1;
      continue;
    }
    const e = vertical ? d.vy + d.h + d.mb - originY : d.vx + d.w + d.mr - originX;
    if (e > max) max = e;
    if ((d.flags & BOX_SCROLLER) !== 0) i = d.end - 1;
  }
  // Snapped to 1/64 px (browsers' layout unit) so subtraction noise does not leak into scrollHeight.
  return Math.round((max + (vertical ? b.pb : b.pr)) * 64) / 64;
}

export function clientWidthOf(b: Box, el: NodeImpl): number {
  if ((b.flags & BOX_INLINE) !== 0) return 0;
  if ((b.flags & BOX_ROOT) !== 0) return viewport(el)[$innerWidth];
  return b.w - b.bl - b.br;
}

export function clientHeightOf(b: Box, el: NodeImpl): number {
  if ((b.flags & BOX_INLINE) !== 0) return 0;
  if ((b.flags & BOX_ROOT) !== 0) return viewport(el)[$innerHeight];
  return b.h - b.bt - b.bb;
}

/** The box of an element of a document boxOf() just validated (no revalidation: for ancestor walks). */
export function knownBox(el: NodeImpl): Box | null {
  const st = states.get(el.doc);
  if (st === undefined) return null;
  const b = st.boxes.get(el);
  return b !== undefined && b.gen === st.gen ? b : null;
}
