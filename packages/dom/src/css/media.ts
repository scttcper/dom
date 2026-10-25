// Media queries: parsing, serialization and evaluation against the window's viewport.
// https://drafts.csswg.org/mediaqueries-5/
// https://drafts.csswg.org/cssom/#serializing-media-queries
//
// There is no rendering: the environment is a screen of `width`×`height` CSS px with the
// window's devicePixelRatio, light color scheme, fine pointer that can hover, no reduced
// motion. Callers may override individual features (e.g. "prefers-color-scheme": "dark").

import {
  CSSTokenizer,
  TK_COLON,
  TK_COMMA,
  TK_DELIM,
  TK_DIMENSION,
  TK_EOF,
  TK_FUNCTION,
  TK_IDENT,
  TK_LBRACKET,
  TK_LPAREN,
  TK_NUMBER,
  TK_PERCENTAGE,
  TK_RBRACKET,
  TK_RPAREN,
  TK_WHITESPACE,
  TK_LBRACE,
  TK_RBRACE,
} from "./tokenizer.ts";
import { formatNumber } from "./values.ts";

export interface MediaEnvironment {
  width: number;
  height: number;
  devicePixelRatio: number;
  /** "screen" (default) or "print". */
  mediaType?: string;
  /** Feature overrides, e.g. { "prefers-color-scheme": "dark" }. */
  features?: Record<string, string | number> | null;
}

export const DEFAULT_MEDIA_ENV: MediaEnvironment = {
  width: 1024,
  height: 768,
  devicePixelRatio: 1,
  mediaType: "screen",
};

class Tok {
  type: number;
  text: string;
  lower: string;
  num: number;
  unit: string;
  constructor(type: number, text: string, lower: string, num: number, unit: string) {
    this.type = type;
    this.text = text;
    this.lower = lower;
    this.num = num;
    this.unit = unit;
  }
}

function tokenize(text: string): Tok[] {
  const t = new CSSTokenizer(text);
  const out: Tok[] = [];
  while (true) {
    const type = t.next();
    if (type === TK_EOF) break;
    const lower = type === TK_IDENT || type === TK_FUNCTION ? t.value.toLowerCase() : type === TK_DELIM ? t.value : "";
    out.push(
      new Tok(type, text.slice(t.start, t.end), lower, t.num, type === TK_DIMENSION ? t.unit.toLowerCase() : ""),
    );
  }
  return out;
}

// Condition tree node kinds.
const N_NOT = 1;
const N_AND = 2;
const N_OR = 3;
const N_FEATURE = 4;
const N_UNKNOWN = 5;
const N_TRUE = 6;

class MQNode {
  kind: number;
  children: MQNode[];
  /** Feature name (lowercase) for N_FEATURE. */
  name: string;
  /** Comparison: "" boolean, ":" plain, or "<" "<=" ">" ">=" "=" (feature OP value). */
  op: string;
  value: Tok[] | null;
  /** Second comparison for `a < name < b` ranges (value OP2 feature, normalized as feature op2 value2). */
  op2: string;
  value2: Tok[] | null;
  constructor(kind: number) {
    this.kind = kind;
    this.children = [];
    this.name = "";
    this.op = "";
    this.value = null;
    this.op2 = "";
    this.value2 = null;
  }
}

export class MediaQuery {
  /** Serialization (https://drafts.csswg.org/cssom/#serialize-a-media-query). */
  text: string;
  negated: boolean;
  /** Lowercase media type ("all" when omitted). */
  type: string;
  condition: MQNode | null;
  /** Unparsable query: evaluates false and serializes as "not all". */
  invalid: boolean;
  constructor(text: string, negated: boolean, type: string, condition: MQNode | null, invalid: boolean) {
    this.text = text;
    this.negated = negated;
    this.type = type;
    this.condition = condition;
    this.invalid = invalid;
  }
}

class MQParser {
  toks: Tok[];
  i: number;
  constructor(toks: Tok[]) {
    this.toks = toks;
    this.i = 0;
  }
  ws(): void {
    while (this.i < this.toks.length && this.toks[this.i].type === TK_WHITESPACE) this.i++;
  }
  peek(): Tok | null {
    this.ws();
    return this.i < this.toks.length ? this.toks[this.i] : null;
  }
  ident(word: string): boolean {
    const t = this.peek();
    if (t !== null && t.type === TK_IDENT && t.lower === word) {
      this.i++;
      return true;
    }
    return false;
  }
  atEnd(): boolean {
    return this.peek() === null;
  }

  // <media-condition> (allowOr = false for <media-condition-without-or>)
  condition(allowOr: boolean): MQNode | null {
    if (this.ident("not")) {
      const inner = this.inParens();
      if (inner === null) return null;
      const n = new MQNode(N_NOT);
      n.children.push(inner);
      return n;
    }
    const first = this.inParens();
    if (first === null) return null;
    const t = this.peek();
    if (t === null || t.type !== TK_IDENT || (t.lower !== "and" && t.lower !== "or")) return first;
    const word = t.lower;
    if (word === "or" && !allowOr) return null;
    const n = new MQNode(word === "and" ? N_AND : N_OR);
    n.children.push(first);
    while (this.ident(word)) {
      const next = this.inParens();
      if (next === null) return null;
      n.children.push(next);
    }
    const after = this.peek();
    if (after !== null && after.type === TK_IDENT && (after.lower === "and" || after.lower === "or")) return null;
    return n;
  }

  // <media-in-parens>
  inParens(): MQNode | null {
    const t = this.peek();
    if (t === null) return null;
    if (t.type === TK_FUNCTION) {
      // <general-enclosed>: evaluates to unknown.
      this.i++;
      if (!this.skipToClose()) return null;
      return new MQNode(N_UNKNOWN);
    }
    if (t.type !== TK_LPAREN) return null;
    this.i++;
    const save = this.i;
    // ( <media-condition> )
    const p = this.peek();
    if (p !== null && (p.type === TK_LPAREN || (p.type === TK_IDENT && p.lower === "not") || p.type === TK_FUNCTION)) {
      const cond = this.condition(true);
      if (cond !== null) {
        const close = this.peek();
        if (close !== null && close.type === TK_RPAREN) {
          this.i++;
          return cond;
        }
      }
      this.i = save;
    }
    const feature = this.feature();
    if (feature !== null) {
      const close = this.peek();
      if (close !== null && close.type === TK_RPAREN) {
        this.i++;
        return feature;
      }
    }
    // <general-enclosed>
    this.i = save;
    if (!this.skipToClose()) return null;
    return new MQNode(N_UNKNOWN);
  }

  skipToClose(): boolean {
    let depth = 1;
    while (this.i < this.toks.length) {
      const type = this.toks[this.i++].type;
      if (type === TK_LPAREN || type === TK_FUNCTION || type === TK_LBRACKET || type === TK_LBRACE) depth++;
      else if (type === TK_RPAREN || type === TK_RBRACKET || type === TK_RBRACE) {
        depth--;
        if (depth === 0) return true;
      }
    }
    return false;
  }

  /** Reads a <mf-value>: number, dimension, ident, or ratio `a / b`. */
  value(): Tok[] | null {
    const t = this.peek();
    if (t === null) return null;
    if (t.type === TK_NUMBER) {
      this.i++;
      const save = this.i;
      const slash = this.peek();
      if (slash !== null && slash.type === TK_DELIM && slash.lower === "/") {
        this.i++;
        const b = this.peek();
        if (b !== null && b.type === TK_NUMBER) {
          this.i++;
          return [t, b];
        }
        return null;
      }
      this.i = save;
      return [t];
    }
    if (t.type === TK_DIMENSION || t.type === TK_IDENT || t.type === TK_PERCENTAGE) {
      this.i++;
      return [t];
    }
    return null;
  }

  op(): string {
    const t = this.peek();
    if (t === null || t.type !== TK_DELIM) return "";
    const c = t.lower;
    if (c !== "<" && c !== ">" && c !== "=") return "";
    this.i++;
    if (
      c !== "=" &&
      this.i < this.toks.length &&
      this.toks[this.i].type === TK_DELIM &&
      this.toks[this.i].lower === "="
    ) {
      this.i++;
      return c + "=";
    }
    return c;
  }

  // <media-feature>
  feature(): MQNode | null {
    const t = this.peek();
    if (t === null) return null;
    if (t.type === TK_IDENT) {
      const save = this.i;
      this.i++;
      const n = new MQNode(N_FEATURE);
      n.name = t.lower;
      const next = this.peek();
      if (next !== null && next.type === TK_RPAREN) return n; // <mf-boolean>
      if (next !== null && next.type === TK_COLON) {
        this.i++;
        const v = this.value();
        if (v === null) return null;
        n.op = ":";
        n.value = v;
        return n;
      }
      const op = this.op();
      if (op !== "") {
        const v = this.value();
        if (v === null) return null;
        n.op = op;
        n.value = v;
        return n;
      }
      this.i = save;
    }
    // <mf-value> <op> <mf-name> [ <op> <mf-value> ]?
    const left = this.value();
    if (left === null) return null;
    const op1 = this.op();
    if (op1 === "") return null;
    const name = this.peek();
    if (name === null || name.type !== TK_IDENT) return null;
    this.i++;
    const n = new MQNode(N_FEATURE);
    n.name = name.lower;
    n.op = flip(op1);
    n.value = left;
    const op2 = this.op();
    if (op2 !== "") {
      if (op1[0] !== op2[0] || op1 === "=" || op2 === "=") return null;
      const right = this.value();
      if (right === null) return null;
      n.op2 = op2;
      n.value2 = right;
    }
    return n;
  }
}

function flip(op: string): string {
  switch (op) {
    case "<":
      return ">";
    case "<=":
      return ">=";
    case ">":
      return "<";
    case ">=":
      return "<=";
  }
  return op;
}

const MEDIA_TYPES = new Set([
  "all",
  "screen",
  "print",
  "speech",
  "tty",
  "tv",
  "projection",
  "handheld",
  "braille",
  "embossed",
  "aural",
]);

/** Serializes tokens of a query: collapsed whitespace, lowercase idents, `: ` after colons. */
function serializeTokens(toks: Tok[]): string {
  let out = "";
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    switch (t.type) {
      case TK_WHITESPACE:
        if (out !== "" && !out.endsWith(" ") && !out.endsWith("(")) out += " ";
        break;
      case TK_IDENT:
        out += t.lower;
        break;
      case TK_COLON:
        out = out.trimEnd() + ": ";
        while (i + 1 < toks.length && toks[i + 1].type === TK_WHITESPACE) i++;
        break;
      case TK_RPAREN:
        out = out.trimEnd() + ")";
        break;
      case TK_NUMBER:
        out += formatNumber(t.num);
        break;
      case TK_DIMENSION:
        out += formatNumber(t.num) + t.unit;
        break;
      case TK_DELIM:
        if (t.lower === "/") {
          out = out.trimEnd() + " / ";
          while (i + 1 < toks.length && toks[i + 1].type === TK_WHITESPACE) i++;
        } else out += t.text;
        break;
      default:
        out += t.text;
    }
  }
  return out.trim();
}

/** Parses one <media-query> from its tokens. */
function parseQuery(toks: Tok[]): MediaQuery {
  const p = new MQParser(toks);
  const text = serializeTokens(toks);
  const invalid = new MediaQuery("not all", false, "all", null, true);
  if (p.atEnd()) return invalid;
  const first = p.peek()!;
  if (
    first.type === TK_IDENT &&
    first.lower !== "not" &&
    first.lower !== "only" &&
    first.lower !== "and" &&
    first.lower !== "or"
  ) {
    // [ not | only ]? <media-type> [ and <media-condition-without-or> ]?
    const type = first.lower;
    p.i++;
    let cond: MQNode | null = null;
    if (p.ident("and")) {
      cond = p.condition(false);
      if (cond === null) return invalid;
    }
    if (!p.atEnd()) return invalid;
    if (type === "layer") return invalid;
    return new MediaQuery(text, false, type, cond, false);
  }
  if (first.type === TK_IDENT && (first.lower === "not" || first.lower === "only")) {
    const save = p.i;
    const word = first.lower;
    p.i++;
    const t = p.peek();
    if (
      t !== null &&
      t.type === TK_IDENT &&
      t.lower !== "and" &&
      t.lower !== "or" &&
      t.lower !== "not" &&
      t.lower !== "only"
    ) {
      p.i++;
      let cond: MQNode | null = null;
      if (p.ident("and")) {
        cond = p.condition(false);
        if (cond === null) return invalid;
      }
      if (!p.atEnd()) return invalid;
      return new MediaQuery(text, word === "not", t.lower, cond, false);
    }
    p.i = save;
  }
  const cond = p.condition(true);
  if (cond === null || !p.atEnd()) return invalid;
  return new MediaQuery(text, false, "all", cond, false);
}

const listCache = new Map<string, MediaQuery[]>();

/** https://drafts.csswg.org/cssom/#parse-a-media-query-list */
export function parseMediaQueryList(text: string): MediaQuery[] {
  let cached = listCache.get(text);
  if (cached !== undefined) return cached;
  const toks = tokenize(text);
  const out: MediaQuery[] = [];
  let start = 0;
  let depth = 0;
  let any = false;
  for (let i = 0; i <= toks.length; i++) {
    const t = i < toks.length ? toks[i] : null;
    if (t !== null) {
      if (t.type === TK_LPAREN || t.type === TK_FUNCTION || t.type === TK_LBRACKET) depth++;
      else if (t.type === TK_RPAREN || t.type === TK_RBRACKET) depth--;
      if (t.type !== TK_WHITESPACE) any = true;
    }
    if (t === null || (t.type === TK_COMMA && depth === 0)) {
      const slice = toks.slice(start, i);
      if (t !== null || any) out.push(parseQuery(slice));
      start = i + 1;
    }
  }
  // An empty list ("" or only whitespace) is an empty MediaList.
  if (out.length === 1 && out[0].invalid && toks.every((t) => t.type === TK_WHITESPACE)) out.length = 0;
  if (listCache.size > 500) listCache.clear();
  listCache.set(text, out);
  return out;
}

/** https://drafts.csswg.org/cssom/#serialize-a-media-query-list */
export function serializeMediaQueryList(list: MediaQuery[]): string {
  let out = "";
  for (let i = 0; i < list.length; i++) out += (i === 0 ? "" : ", ") + list[i].text;
  return out;
}

// --- evaluation -----------------------------------------------------------------------------

function lengthPx(t: Tok): number | null {
  if (t.type === TK_NUMBER) return t.num === 0 ? 0 : null;
  if (t.type !== TK_DIMENSION) return null;
  switch (t.unit) {
    case "px":
      return t.num;
    case "em":
    case "rem":
      return t.num * 16;
    case "in":
      return t.num * 96;
    case "cm":
      return (t.num * 96) / 2.54;
    case "mm":
      return (t.num * 96) / 25.4;
    case "pt":
      return (t.num * 96) / 72;
    case "pc":
      return t.num * 16;
    case "q":
      return (t.num * 96) / 101.6;
    case "vw":
      return null;
  }
  return null;
}

function resolutionDppx(t: Tok): number | null {
  if (t.type !== TK_DIMENSION) return null;
  switch (t.unit) {
    case "dppx":
    case "x":
      return t.num;
    case "dpi":
      return t.num / 96;
    case "dpcm":
      return (t.num * 2.54) / 96;
  }
  return null;
}

function compare(a: number, op: string, b: number): boolean {
  const eps = 1e-9;
  switch (op) {
    case ":":
    case "=":
      return Math.abs(a - b) < eps;
    case "<":
      return a < b - eps;
    case "<=":
      return a <= b + eps;
    case ">":
      return a > b + eps;
    case ">=":
      return a >= b - eps;
  }
  return false;
}

const DISCRETE_DEFAULTS: Record<string, string> = {
  orientation: "",
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
  "overflow-block": "scroll",
  "overflow-inline": "scroll",
  "color-gamut": "srgb",
  "dynamic-range": "standard",
  "video-dynamic-range": "standard",
};

/** Kleene logic: 1 true, 0 false, -1 unknown. */
function evalNode(n: MQNode, env: MediaEnvironment): number {
  switch (n.kind) {
    case N_TRUE:
      return 1;
    case N_UNKNOWN:
      return -1;
    case N_NOT: {
      const v = evalNode(n.children[0], env);
      return v === -1 ? -1 : 1 - v;
    }
    case N_AND: {
      let result = 1;
      for (const c of n.children) {
        const v = evalNode(c, env);
        if (v === 0) return 0;
        if (v === -1) result = -1;
      }
      return result;
    }
    case N_OR: {
      let result = 0;
      for (const c of n.children) {
        const v = evalNode(c, env);
        if (v === 1) return 1;
        if (v === -1) result = -1;
      }
      return result;
    }
    case N_FEATURE:
      return evalFeature(n, env);
  }
  return -1;
}

function evalFeature(n: MQNode, env: MediaEnvironment): number {
  let name = n.name;
  let op = n.op;
  // The vendor prefix comes before min-/max- (`-webkit-min-device-pixel-ratio`), so strip it
  // first (https://compat.spec.whatwg.org/#css-media-queries-webkit-device-pixel-ratio).
  if (name.startsWith("-webkit-")) name = name.slice(8);
  if (op === ":" && (name.startsWith("min-") || name.startsWith("max-"))) {
    op = name.startsWith("min-") ? ">=" : "<=";
    name = name.slice(4);
  } else if (name.startsWith("min-") || name.startsWith("max-")) {
    return -1;
  }
  const overrides = env.features;
  const rawOverride = overrides != null ? overrides[name] : undefined;
  const override = rawOverride === undefined ? undefined : String(rawOverride);
  let actual: number | null = null;
  let kind = "range";
  switch (name) {
    case "width":
    case "device-width":
      actual = env.width;
      break;
    case "height":
    case "device-height":
      actual = env.height;
      break;
    case "aspect-ratio":
    case "device-aspect-ratio":
      actual = env.height === 0 ? 0 : env.width / env.height;
      kind = "ratio";
      break;
    case "resolution":
    case "device-pixel-ratio":
      actual = env.devicePixelRatio;
      kind = name === "resolution" ? "resolution" : "number";
      break;
    case "color":
      actual = 8;
      kind = "integer";
      break;
    case "color-index":
    case "monochrome":
    case "grid":
      actual = 0;
      kind = "integer";
      break;
    default:
      kind = "discrete";
  }
  if (override !== undefined && kind !== "discrete") {
    const num = Number(override);
    if (!Number.isNaN(num)) actual = num;
  }
  if (kind === "discrete") {
    if (op !== "" && op !== ":") return -1;
    let current = override ?? DISCRETE_DEFAULTS[name];
    if (name === "orientation") current = override ?? (env.height >= env.width ? "portrait" : "landscape");
    if (current === undefined) return -1;
    if (op === "") return current !== "none" && current !== "no-preference" ? 1 : 0;
    const v = n.value!;
    if (v.length !== 1 || v[0].type !== TK_IDENT) return 0;
    return v[0].lower === current ? 1 : 0;
  }
  if (actual === null) return -1;
  if (op === "") return actual !== 0 ? 1 : 0;
  const check = (value: Tok[], cmp: string): number => {
    let expected: number | null = null;
    if (kind === "range") expected = value.length === 1 ? lengthPx(value[0]) : null;
    else if (kind === "ratio") {
      if (value.length === 2) expected = value[1].num === 0 ? Infinity : value[0].num / value[1].num;
      else if (value.length === 1 && value[0].type === TK_NUMBER) expected = value[0].num;
    } else if (kind === "resolution") expected = value.length === 1 ? resolutionDppx(value[0]) : null;
    else if (value.length === 1 && value[0].type === TK_NUMBER) expected = value[0].num;
    if (expected === null) return -1;
    return compare(actual!, cmp, expected) ? 1 : 0;
  };
  const a = check(n.value!, op);
  if (n.value2 === null || a !== 1) return a;
  return check(n.value2, n.op2);
}

/** https://drafts.csswg.org/mediaqueries-5/#evaluating — one query. */
export function evaluateMediaQuery(q: MediaQuery, env: MediaEnvironment): boolean {
  if (q.invalid) return false;
  const mediaType = env.mediaType ?? "screen";
  let typeMatches = q.type === "all" || q.type === mediaType;
  if (!MEDIA_TYPES.has(q.type)) typeMatches = false;
  let result = typeMatches;
  if (result && q.condition !== null) result = evalNode(q.condition, env) === 1;
  return q.negated ? !result : result;
}

/** A media query list matches if empty or if any query matches. */
export function evaluateMediaQueryList(list: MediaQuery[], env: MediaEnvironment): boolean {
  if (list.length === 0) return true;
  for (let i = 0; i < list.length; i++) if (evaluateMediaQuery(list[i], env)) return true;
  return false;
}

/** Text-level helper for matchMedia(): https://drafts.csswg.org/cssom-view/#dom-window-matchmedia */
export function matchMediaText(text: string, env: MediaEnvironment): boolean {
  const list = parseMediaQueryList(text);
  // matchMedia("") matches (empty list), unlike an invalid query.
  return evaluateMediaQueryList(list, env);
}

/** Serialization used by MediaQueryList.media. */
export function normalizeMediaText(text: string): string {
  return serializeMediaQueryList(parseMediaQueryList(text));
}
