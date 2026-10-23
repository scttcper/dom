// Declaration value parsing, validation and specified-value serialization.
// https://drafts.csswg.org/cssom/#parse-a-css-value
// https://drafts.csswg.org/cssom/#serialize-a-css-value
// https://drafts.csswg.org/css-values-4/
//
// Behavior is modeled on jsdom's (differentially tested): properties with a known grammar
// (lengths, colors, keywords, numbers — the ones React and tests set) are validated and
// normalized (`10PX` → `10px`, `0` → `0px`, `#f00` → `rgb(255, 0, 0)`, `FLEX` → `flex`);
// properties with complex grammars keep the trimmed source text after a token-level sanity
// check (balanced blocks, no bad strings/urls, no top-level `!` / `;`).

import {
  CSSTokenizer,
  TK_BAD_STRING,
  TK_BAD_URL,
  TK_COMMA,
  TK_DELIM,
  TK_DIMENSION,
  TK_EOF,
  TK_FUNCTION,
  TK_HASH,
  TK_IDENT,
  TK_LBRACE,
  TK_LBRACKET,
  TK_LPAREN,
  TK_NUMBER,
  TK_PERCENTAGE,
  TK_RBRACE,
  TK_RBRACKET,
  TK_RPAREN,
  TK_SEMICOLON,
  TK_STRING,
  TK_URL,
  TK_WHITESPACE,
} from "./tokenizer.ts";
import { normalizeColor } from "./colors.ts";

// --- components ---------------------------------------------------------------------------

/** One top-level component value of a declaration value. */
export class Comp {
  type: number;
  /** Source text of the whole component (a function includes its arguments). */
  text: string;
  /** Lowercased ident / function name / unit; "" otherwise. */
  lower: string;
  num: number;
  isInteger: boolean;
  /** Decoded string/url value. */
  value: string;

  constructor(type: number, text: string, lower: string, num: number, isInteger: boolean, value: string) {
    this.type = type;
    this.text = text;
    this.lower = lower;
    this.num = num;
    this.isInteger = isInteger;
    this.value = value;
  }
}

/** Separator pseudo-type for whitespace between components (kept so callers can rebuild text). */
export const COMP_SPACE = 100;

/**
 * Splits a value into top-level components. Whitespace runs become a single COMP_SPACE;
 * commas and "/" are kept as their own components. Returns null when the value can never be
 * valid (bad tokens, unbalanced closers, top-level `;`, `!` or `{}` blocks).
 */
export function splitComponents(value: string): Comp[] | null {
  const t = new CSSTokenizer(value);
  const out: Comp[] = [];
  const stack: number[] = [];
  while (true) {
    const type = t.next();
    if (type === TK_EOF) break;
    switch (type) {
      case TK_WHITESPACE:
        if (out.length !== 0 && out[out.length - 1].type !== COMP_SPACE) out.push(new Comp(COMP_SPACE, " ", "", 0, true, ""));
        continue;
      case TK_BAD_STRING:
      case TK_BAD_URL:
      case TK_SEMICOLON:
      case TK_RPAREN:
      case TK_RBRACKET:
      case TK_RBRACE:
      case TK_LBRACE:
        return null;
      case TK_DELIM:
        if (t.value === "!") return null;
        out.push(new Comp(TK_DELIM, t.value, t.value, 0, true, t.value));
        continue;
      case TK_FUNCTION:
      case TK_LPAREN:
      case TK_LBRACKET: {
        const start = t.start;
        const lower = type === TK_FUNCTION ? t.value.toLowerCase() : "";
        stack.length = 0;
        stack.push(type === TK_LBRACKET ? TK_RBRACKET : TK_RPAREN);
        while (stack.length > 0) {
          const inner = t.next();
          if (inner === TK_EOF) break;
          if (inner === TK_BAD_STRING || inner === TK_BAD_URL) return null;
          if (inner === stack[stack.length - 1]) stack.pop();
          else if (inner === TK_FUNCTION || inner === TK_LPAREN) stack.push(TK_RPAREN);
          else if (inner === TK_LBRACKET) stack.push(TK_RBRACKET);
          else if (inner === TK_LBRACE) stack.push(TK_RBRACE);
          else if (inner === TK_RPAREN || inner === TK_RBRACKET || inner === TK_RBRACE) return null;
        }
        // Auto-close an unterminated block (https://drafts.csswg.org/css-syntax-3/#consume-simple-block).
        let text = value.slice(start, t.end);
        for (let i = stack.length - 1; i >= 0; i--) text += stack[i] === TK_RPAREN ? ")" : stack[i] === TK_RBRACKET ? "]" : "}";
        out.push(new Comp(type, text, lower, 0, true, ""));
        continue;
      }
      default:
        out.push(new Comp(type, value.slice(t.start, t.end), type === TK_IDENT ? t.value.toLowerCase() : type === TK_DIMENSION ? t.unit.toLowerCase() : "", t.num, t.isInteger, t.value));
    }
  }
  if (out.length !== 0 && out[out.length - 1].type === COMP_SPACE) out.pop();
  return out;
}

/** Splits components on COMP_SPACE (top-level whitespace) into groups; commas/slashes stay as their own groups' members. */
export function significant(comps: Comp[]): Comp[] {
  const out: Comp[] = [];
  for (let i = 0; i < comps.length; i++) if (comps[i].type !== COMP_SPACE) out.push(comps[i]);
  return out;
}

// --- numbers ------------------------------------------------------------------------------

/** https://drafts.csswg.org/cssom/#serialize-a-css-component-value (<number>) */
export function formatNumber(n: number): string {
  if (Object.is(n, -0)) return "0";
  const s = String(n);
  if (s.indexOf("e") === -1) return s;
  // Avoid exponent notation like browsers.
  if (Math.abs(n) < 1e-6) return "0";
  return n.toFixed(0);
}

const LENGTH_UNITS = new Set([
  "px", "em", "rem", "ex", "rex", "ch", "rch", "cap", "rcap", "ic", "ric", "lh", "rlh",
  "vw", "vh", "vi", "vb", "vmin", "vmax", "svw", "svh", "svi", "svb", "svmin", "svmax",
  "lvw", "lvh", "lvi", "lvb", "lvmin", "lvmax", "dvw", "dvh", "dvi", "dvb", "dvmin", "dvmax",
  "cqw", "cqh", "cqi", "cqb", "cqmin", "cqmax", "cm", "mm", "q", "in", "pt", "pc",
]);
const TIME_UNITS = new Set(["s", "ms"]);
const ANGLE_UNITS = new Set(["deg", "grad", "rad", "turn"]);
const MATH_FUNCTIONS = new Set([
  "calc", "min", "max", "clamp", "round", "mod", "rem", "sin", "cos", "tan", "asin", "acos", "atan", "atan2",
  "pow", "sqrt", "hypot", "log", "exp", "abs", "sign", "env", "-webkit-calc", "-moz-calc", "calc-size", "anchor", "anchor-size",
]);

export function isLengthUnit(lowerUnit: string): boolean {
  return LENGTH_UNITS.has(lowerUnit);
}

// --- grammars -----------------------------------------------------------------------------

export const G_LENGTH = 1;
export const G_PERCENT = 2;
export const G_NUMBER = 4;
export const G_INTEGER = 8;
export const G_COLOR = 16;
export const G_TIME = 32;
export const G_ANGLE = 64;
export const G_STRING = 128;
export const G_URL = 256;
export const G_NONNEG = 1024;
/** Any value that passes the token sanity check; kept verbatim. */
export const G_ANY = 2048;
/** Comma-separated list of values (each up to `max` components). */
export const G_LIST = 4096;

/** Per-property value grammar for single-component (or N-component repeated) values. */
export class Grammar {
  types: number;
  keywords: Set<string>;
  /** Allowed (lowercase) function names besides math functions. */
  fns: Set<string>;
  /** Maximum number of space-separated components (each matching this grammar). */
  max: number;
  /** For max > 1: collapse repeated values like jsdom (`auto auto` is still invalid for width since max is 1). */
  constructor(types: number, keywords: Set<string>, fns: Set<string>, max: number) {
    this.types = types;
    this.keywords = keywords;
    this.fns = fns;
    this.max = max;
  }
}

const ANY = new Grammar(G_ANY, new Set(), new Set(), 1);

/**
 * Compiles a grammar spec: space-separated items. Type codes: L length, P percentage, N
 * number, I integer, C color, T time, A angle, S string, U url, `+` suffix = non-negative;
 * `name()` = allowed function; `*N` = up to N components; `#` = comma-separated list;
 * anything else is a keyword.
 */
export function grammar(spec: string): Grammar {
  let types = 0;
  const keywords = new Set<string>();
  const fns = new Set<string>();
  let max = 1;
  for (const item of spec.split(" ")) {
    if (item === "") continue;
    const code = item.endsWith("+") ? item.slice(0, -1) : item;
    if (item.endsWith("+") && code.length === 1) types |= G_NONNEG;
    switch (code) {
      case "L": types |= G_LENGTH; continue;
      case "P": types |= G_PERCENT; continue;
      case "N": types |= G_NUMBER; continue;
      case "I": types |= G_INTEGER; continue;
      case "C": types |= G_COLOR; continue;
      case "T": types |= G_TIME; continue;
      case "A": types |= G_ANGLE; continue;
      case "S": types |= G_STRING; continue;
      case "U": types |= G_URL; continue;
    }
    if (item === "#") types |= G_LIST;
    else if (item.startsWith("*")) max = Number(item.slice(1));
    else if (item.endsWith("()")) fns.add(item.slice(0, -2));
    else keywords.add(item);
  }
  return new Grammar(types, keywords, fns, max);
}

const SIZE = "L+ P+ auto min-content max-content fit-content stretch -webkit-fill-available -moz-available -webkit-min-content -webkit-max-content -webkit-fit-content fit-content()";
const MAX_SIZE = "L+ P+ none min-content max-content fit-content stretch -webkit-fill-available -moz-available fit-content()";
const INSET = "L P auto";
const MARGIN = "L P auto";
const PADDING = "L+ P+";
const BORDER_STYLE = "none hidden dotted dashed solid double groove ridge inset outset";
const BORDER_WIDTH = "L+ thin medium thick";
const COLOR = "C";
const RADIUS = "L+ P+ *2";
const OVERFLOW = "visible hidden clip scroll auto overlay -webkit-paged-x -webkit-paged-y";

/** Grammar specs for longhands whose values tests and frameworks commonly set or read. */
const GRAMMAR_SPECS: Record<string, string> = {
  width: SIZE, height: SIZE, "min-width": SIZE, "min-height": SIZE, "inline-size": SIZE, "block-size": SIZE,
  "min-inline-size": SIZE, "min-block-size": SIZE,
  "max-width": MAX_SIZE, "max-height": MAX_SIZE, "max-inline-size": MAX_SIZE, "max-block-size": MAX_SIZE,
  top: INSET, right: INSET, bottom: INSET, left: INSET,
  "inset-block-start": INSET, "inset-block-end": INSET, "inset-inline-start": INSET, "inset-inline-end": INSET,
  "margin-top": MARGIN, "margin-right": MARGIN, "margin-bottom": MARGIN, "margin-left": MARGIN,
  "margin-block-start": MARGIN, "margin-block-end": MARGIN, "margin-inline-start": MARGIN, "margin-inline-end": MARGIN,
  "padding-top": PADDING, "padding-right": PADDING, "padding-bottom": PADDING, "padding-left": PADDING,
  "padding-block-start": PADDING, "padding-block-end": PADDING, "padding-inline-start": PADDING, "padding-inline-end": PADDING,
  "border-top-width": BORDER_WIDTH, "border-right-width": BORDER_WIDTH, "border-bottom-width": BORDER_WIDTH, "border-left-width": BORDER_WIDTH,
  "outline-width": BORDER_WIDTH, "column-rule-width": BORDER_WIDTH,
  "border-top-style": BORDER_STYLE, "border-right-style": BORDER_STYLE, "border-bottom-style": BORDER_STYLE, "border-left-style": BORDER_STYLE,
  "outline-style": BORDER_STYLE + " auto", "column-rule-style": BORDER_STYLE,
  "border-block-start-color": COLOR, "border-block-end-color": COLOR, "border-inline-start-color": COLOR, "border-inline-end-color": COLOR,
  "border-top-color": COLOR, "border-right-color": COLOR, "border-bottom-color": COLOR, "border-left-color": COLOR,
  color: COLOR, "background-color": COLOR, "outline-color": COLOR + " invert", "caret-color": COLOR + " auto",
  "text-decoration-color": COLOR, "column-rule-color": COLOR, "accent-color": COLOR + " auto", "flood-color": COLOR,
  "lighting-color": COLOR, "stop-color": COLOR, "text-emphasis-color": COLOR, "-webkit-text-fill-color": COLOR, "-webkit-text-stroke-color": COLOR,
  "border-top-left-radius": RADIUS, "border-top-right-radius": RADIUS, "border-bottom-right-radius": RADIUS, "border-bottom-left-radius": RADIUS,
  opacity: "N P", "fill-opacity": "N P", "stroke-opacity": "N P", "flood-opacity": "N P", "stop-opacity": "N P",
  "z-index": "I auto", order: "I", "flex-grow": "N+", "flex-shrink": "N+",
  "flex-basis": "L+ P+ auto content min-content max-content fit-content",
  "line-height": "N+ L+ P+ normal",
  "font-size": "L+ P+ xx-small x-small small medium large x-large xx-large xxx-large larger smaller math",
  "font-weight": "N+ normal bold bolder lighter",
  "font-style": "normal italic oblique",
  "font-variant": "normal none small-caps all-small-caps petite-caps all-petite-caps unicase titling-caps",
  "font-stretch": "P+ normal ultra-condensed extra-condensed condensed semi-condensed semi-expanded expanded extra-expanded ultra-expanded",
  visibility: "visible hidden collapse",
  "pointer-events": "auto none visiblepainted visiblefill visiblestroke visible painted fill stroke all bounding-box",
  position: "static relative absolute fixed sticky -webkit-sticky",
  float: "left right none inline-start inline-end",
  clear: "none left right both inline-start inline-end",
  "box-sizing": "content-box border-box",
  "overflow-x": OVERFLOW, "overflow-y": OVERFLOW, "overflow-block": OVERFLOW, "overflow-inline": OVERFLOW,
  "text-align": "start end left right center justify match-parent justify-all -webkit-left -webkit-right -webkit-center -moz-left -moz-right -moz-center",
  "white-space": "normal pre nowrap pre-wrap break-spaces pre-line",
  "user-select": "auto text none contain all", "-webkit-user-select": "auto text none contain all",
  "background-image": "U none # linear-gradient() radial-gradient() conic-gradient() repeating-linear-gradient() repeating-radial-gradient() repeating-conic-gradient() image-set() -webkit-image-set() url() image() cross-fade() element() paint() -webkit-linear-gradient() -webkit-radial-gradient() -webkit-gradient()",
  "background-attachment": "# scroll fixed local",
  "background-origin": "# border-box padding-box content-box",
  "background-clip": "# border-box padding-box content-box text border-area",
  "background-repeat": "# repeat-x repeat-y repeat space round no-repeat *2",
  "background-size": "# L+ P+ auto cover contain *2",
  "list-style-type": "*1",
  "text-transform": "none capitalize uppercase lowercase full-width full-size-kana math-auto",
  "word-break": "normal keep-all break-all break-word auto-phrase",
  "text-overflow": "clip ellipsis",
  "vertical-align": "L P baseline sub super text-top text-bottom middle top bottom",
  "table-layout": "auto fixed",
  "border-collapse": "collapse separate",
  "empty-cells": "show hide",
  "caption-side": "top bottom",
  "list-style-position": "inside outside",
  resize: "none both horizontal vertical block inline",
  "object-fit": "fill contain cover none scale-down",
  "isolation": "auto isolate",
  "mix-blend-mode": "normal multiply screen overlay darken lighten color-dodge color-burn hard-light soft-light difference exclusion hue saturation color luminosity plus-darker plus-lighter",
  "backface-visibility": "visible hidden",
  "flex-direction": "row row-reverse column column-reverse",
  "flex-wrap": "nowrap wrap wrap-reverse",
  "animation-duration": "# T+ auto", "transition-duration": "# T+",
  "animation-delay": "# T", "transition-delay": "# T",
  "animation-iteration-count": "# N+ infinite",
  "animation-direction": "# normal reverse alternate alternate-reverse",
  "animation-fill-mode": "# none forwards backwards both",
  "animation-play-state": "# running paused",
  "tab-size": "N+ L+",
  "row-gap": "L+ P+ normal", "column-gap": "L+ P+ normal",
  "outline-offset": "L",
  "letter-spacing": "L P normal", "word-spacing": "L P normal",
  "text-indent": "L P",
  "aspect-ratio": "*1",
  inset: "L P auto *4",
  cursor: "# U N *3 auto default none context-menu help pointer progress wait cell crosshair text vertical-text alias copy move no-drop not-allowed grab grabbing e-resize n-resize ne-resize nw-resize s-resize se-resize sw-resize w-resize ew-resize ns-resize nesw-resize nwse-resize col-resize row-resize all-scroll zoom-in zoom-out -webkit-grab -webkit-grabbing -webkit-zoom-in -webkit-zoom-out hand",
  "unicode-bidi": "normal embed isolate bidi-override isolate-override plaintext",
  direction: "ltr rtl",
  "writing-mode": "horizontal-tb vertical-rl vertical-lr sideways-rl sideways-lr",
  "content-visibility": "visible auto hidden",
  "scroll-behavior": "auto smooth",
  "touch-action": "*1",
  "will-change": "*1",
  appearance: "none auto menulist-button textfield base-select button checkbox listbox menulist meter progress-bar push-button radio searchfield slider-horizontal square-button textarea",
  "-webkit-appearance": "*1",
};

const grammarCache = new Map<string, Grammar>();

/** Grammar for a property name (ANY when we do not validate the property). */
export function grammarFor(name: string): Grammar {
  let g = grammarCache.get(name);
  if (g !== undefined) return g;
  const spec = GRAMMAR_SPECS[name];
  g = spec === undefined || spec === "*1" ? ANY : grammar(spec);
  grammarCache.set(name, g);
  return g;
}

// --- normalization ------------------------------------------------------------------------

export function isCSSWideKeyword(lower: string): boolean {
  return lower === "inherit" || lower === "initial" || lower === "unset" || lower === "revert" || lower === "revert-layer";
}

/** Normalizes one component against a grammar; null if it does not match. */
export function normalizeComponent(c: Comp, g: Grammar): string | null {
  const types = g.types;
  const nonneg = (types & G_NONNEG) !== 0;
  switch (c.type) {
    case TK_IDENT:
      if (g.keywords.has(c.lower)) return c.lower;
      if ((types & G_COLOR) !== 0) return normalizeColor(c.text);
      return null;
    case TK_NUMBER:
      if ((types & G_INTEGER) !== 0 && c.isInteger && (!nonneg || c.num >= 0)) return formatNumber(c.num);
      if ((types & G_NUMBER) !== 0 && (!nonneg || c.num >= 0)) return formatNumber(c.num);
      if (c.num === 0 && (types & G_LENGTH) !== 0) return "0px";
      return null;
    case TK_PERCENTAGE:
      if ((types & G_PERCENT) !== 0 && (!nonneg || c.num >= 0)) return formatNumber(c.num) + "%";
      return null;
    case TK_DIMENSION:
      if (nonneg && c.num < 0) return null;
      if ((types & G_LENGTH) !== 0 && LENGTH_UNITS.has(c.lower)) return formatNumber(c.num) + c.lower;
      if ((types & G_TIME) !== 0 && TIME_UNITS.has(c.lower)) return formatNumber(c.num) + c.lower;
      if ((types & G_ANGLE) !== 0 && ANGLE_UNITS.has(c.lower)) return formatNumber(c.num) + c.lower;
      return null;
    case TK_HASH:
      if ((types & G_COLOR) !== 0) return normalizeColor(c.text);
      return null;
    case TK_STRING:
      if ((types & G_STRING) !== 0) return serializeString(c.value);
      return null;
    case TK_URL:
      if ((types & G_URL) !== 0) return serializeUrl(c.value);
      return null;
    case TK_FUNCTION: {
      const name = c.lower;
      if (name === "url" && (types & G_URL) !== 0) {
        const inner = splitComponents(c.text.slice(4, -1));
        if (inner !== null && inner.length === 1 && inner[0].type === TK_STRING) return serializeUrl(inner[0].value);
        return c.text;
      }
      if ((types & (G_LENGTH | G_PERCENT | G_NUMBER | G_INTEGER | G_TIME | G_ANGLE)) !== 0 && MATH_FUNCTIONS.has(name)) return c.text;
      if ((types & G_COLOR) !== 0) {
        const color = normalizeColor(c.text);
        if (color !== null) return color;
      }
      if (g.fns.has(name)) return c.text;
      return null;
    }
  }
  return null;
}

/** https://drafts.csswg.org/cssom/#serialize-a-string */
export function serializeString(s: string): string {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0) out += "�";
    else if ((c >= 1 && c <= 0x1f) || c === 0x7f) out += "\\" + c.toString(16) + " ";
    else if (c === 0x22 || c === 0x5c) out += "\\" + s[i];
    else out += s[i];
  }
  return out + '"';
}

/** https://drafts.csswg.org/cssom/#serialize-a-url */
export function serializeUrl(s: string): string {
  return "url(" + serializeString(s) + ")";
}

/** Value contains a var() reference anywhere (pending-substitution value). */
export function containsVar(value: string): boolean {
  const i = value.indexOf("(");
  if (i === -1) return false;
  return /var\(/i.test(value) || /env\(/i.test(value) || /attr\(/i.test(value);
}

/**
 * Collapses the whitespace of a pending-substitution / unvalidated value like jsdom does
 * (trimmed, otherwise verbatim).
 */
function verbatim(value: string): string {
  return value.trim();
}

/** Grammar-specific normalizers for longhands that need more than the generic matcher. */
type Special = (comps: Comp[]) => string | null;

const DISPLAY_OUTSIDE = new Set(["block", "inline", "run-in"]);
const DISPLAY_INSIDE = new Set(["flow", "flow-root", "table", "flex", "grid", "ruby", "math"]);
const DISPLAY_SINGLE = new Set([
  "none", "contents", "block", "inline", "inline-block", "flex", "inline-flex", "grid", "inline-grid", "flow-root",
  "list-item", "table", "inline-table", "table-row", "table-cell", "table-column", "table-column-group",
  "table-header-group", "table-footer-group", "table-row-group", "table-caption", "run-in", "ruby", "ruby-text",
  "ruby-base", "ruby-base-container", "ruby-text-container", "flow", "math", "-webkit-box", "-webkit-inline-box",
  "-moz-box", "-moz-inline-box", "inline-list-item", "-webkit-flex", "-webkit-inline-flex", "-ms-flexbox", "-ms-inline-flexbox", "-ms-grid", "-ms-inline-grid",
]);

/** https://drafts.csswg.org/css-display-3/#the-display-properties — multi-keyword values serialize to their short forms. */
function normalizeDisplay(comps: Comp[]): string | null {
  const words: string[] = [];
  for (const c of comps) {
    if (c.type === COMP_SPACE) continue;
    if (c.type !== TK_IDENT) return null;
    words.push(c.lower);
  }
  if (words.length === 1) return DISPLAY_SINGLE.has(words[0]) ? words[0] : null;
  if (words.length > 3) return null;
  let outside = "";
  let inside = "";
  let listItem = false;
  for (const w of words) {
    if (DISPLAY_OUTSIDE.has(w) && outside === "") outside = w;
    else if (DISPLAY_INSIDE.has(w) && inside === "") inside = w;
    else if (w === "list-item" && !listItem) listItem = true;
    else return null;
  }
  if (listItem && inside !== "" && inside !== "flow" && inside !== "flow-root") return null;
  if (outside === "") outside = "block";
  if (inside === "") inside = "flow";
  if (listItem) {
    const base = outside === "block" ? "" : outside + " ";
    return base + (inside === "flow-root" ? "flow-root " : "") + "list-item";
  }
  if (outside === "block") {
    if (inside === "flow") return "block";
    return inside;
  }
  if (outside === "inline") {
    if (inside === "flow") return "inline";
    if (inside === "flow-root") return "inline-block";
    if (inside === "table" || inside === "flex" || inside === "grid") return "inline-" + inside;
    return "inline " + inside;
  }
  return outside + (inside === "flow" ? "" : " " + inside);
}

/** https://drafts.csswg.org/css-content-3/#content-property — strings re-serialized, the rest verbatim. */
function normalizeContent(comps: Comp[]): string | null {
  let out = "";
  for (const c of comps) {
    if (c.type === COMP_SPACE) {
      out += " ";
      continue;
    }
    if (c.type === TK_COMMA) return null;
    if (c.type === TK_STRING) out += serializeString(c.value);
    else if (c.type === TK_URL) out += serializeUrl(c.value);
    else if (c.type === TK_IDENT) out += isCSSWideKeyword(c.lower) || c.lower === "none" || c.lower === "normal" || c.lower.endsWith("-quote") ? c.lower : c.text;
    else out += c.text;
  }
  return out === "" ? null : out;
}

const SPECIAL: Record<string, Special> = {
  display: normalizeDisplay,
  content: normalizeContent,
};

/**
 * Parses and normalizes a longhand value. Returns the specified-value serialization or null
 * if the value is invalid for the property. `name` must be a lowercase property name (or a
 * custom property).
 */
export function normalizeLonghand(name: string, value: string): string | null {
  const v = value.trim();
  if (v === "") return null;
  const comps = splitComponents(v);
  if (comps === null) return null;
  if (comps.length === 1 && comps[0].type === TK_IDENT && isCSSWideKeyword(comps[0].lower)) return comps[0].lower;
  if (containsVar(v)) return verbatim(v);
  const special = SPECIAL[name];
  if (special !== undefined) return special(comps);
  const g = grammarFor(name);
  if (g.types === G_ANY) return verbatim(v);
  return normalizeComps(comps, g);
}

/** Matches a component list against a (possibly repeated) grammar. */
export function normalizeComps(comps: Comp[], g: Grammar): string | null {
  let out = "";
  let n = 0;
  let sep = "";
  for (let i = 0; i < comps.length; i++) {
    const c = comps[i];
    if (c.type === COMP_SPACE) continue;
    if (c.type === TK_COMMA && (g.types & G_LIST) !== 0) {
      if (n === 0) return null;
      n = 0;
      sep = ", ";
      continue;
    }
    if (++n > g.max) return null;
    if (c.type === TK_COMMA || c.type === TK_DELIM) return null;
    const s = normalizeComponent(c, g);
    if (s === null) return null;
    out = out === "" ? s : out + (n === 1 ? sep : " ") + s;
  }
  return n === 0 ? null : out;
}

/** Custom property values are kept verbatim (trimmed) — https://drafts.csswg.org/css-variables-2/#serializing-custom-props */
export function normalizeCustom(value: string): string | null {
  const v = value.trim();
  if (v === "") return null;
  if (splitComponents(v) === null) {
    // Custom properties accept `!`/`;`-free arbitrary tokens, including blocks.
    if (/[;!]/.test(v)) return null;
  }
  return v;
}

/** Re-exported token type ids used by shorthand parsers. */
export { TK_COMMA, TK_DELIM, TK_DIMENSION, TK_FUNCTION, TK_HASH, TK_IDENT, TK_NUMBER, TK_PERCENTAGE, TK_STRING, TK_URL };
