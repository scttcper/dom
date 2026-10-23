// CSS Color parsing and serialization for the legacy sRGB forms that tests compare.
// https://drafts.csswg.org/css-color-4/#color-syntax
// https://drafts.csswg.org/css-color-4/#serializing-sRGB-values
//
// Named / hex / rgb() / rgba() / hsl() / hsla() / hwb() are resolved to sRGB and serialized
// as `rgb(r, g, b)` / `rgba(r, g, b, a)` like browsers (and jsdom) do for specified and
// computed values. lab() / lch() / oklab() / oklch() / color() keep their function but have
// their channels canonicalized; color-mix() / light-dark() and relative colors (`rgb(from …)`)
// serialize the colors nested in them the same way. Differentially matched against jsdom
// (@asamuzakjp/css-color), which is what Sentry's / most suites' expectations were written on.

import { COMP_SPACE, type Comp, formatNumber, splitComponents } from "./values.ts";
import { TK_COMMA, TK_DELIM, TK_DIMENSION, TK_FUNCTION, TK_HASH, TK_IDENT, TK_NUMBER, TK_PERCENTAGE } from "./tokenizer.ts";

/** https://drafts.csswg.org/css-color-4/#named-colors — packed 0xRRGGBB. */
const NAMED: Record<string, number> = {
  aliceblue: 0xf0f8ff, antiquewhite: 0xfaebd7, aqua: 0x00ffff, aquamarine: 0x7fffd4, azure: 0xf0ffff,
  beige: 0xf5f5dc, bisque: 0xffe4c4, black: 0x000000, blanchedalmond: 0xffebcd, blue: 0x0000ff,
  blueviolet: 0x8a2be2, brown: 0xa52a2a, burlywood: 0xdeb887, cadetblue: 0x5f9ea0, chartreuse: 0x7fff00,
  chocolate: 0xd2691e, coral: 0xff7f50, cornflowerblue: 0x6495ed, cornsilk: 0xfff8dc, crimson: 0xdc143c,
  cyan: 0x00ffff, darkblue: 0x00008b, darkcyan: 0x008b8b, darkgoldenrod: 0xb8860b, darkgray: 0xa9a9a9,
  darkgreen: 0x006400, darkgrey: 0xa9a9a9, darkkhaki: 0xbdb76b, darkmagenta: 0x8b008b, darkolivegreen: 0x556b2f,
  darkorange: 0xff8c00, darkorchid: 0x9932cc, darkred: 0x8b0000, darksalmon: 0xe9967a, darkseagreen: 0x8fbc8f,
  darkslateblue: 0x483d8b, darkslategray: 0x2f4f4f, darkslategrey: 0x2f4f4f, darkturquoise: 0x00ced1, darkviolet: 0x9400d3,
  deeppink: 0xff1493, deepskyblue: 0x00bfff, dimgray: 0x696969, dimgrey: 0x696969, dodgerblue: 0x1e90ff,
  firebrick: 0xb22222, floralwhite: 0xfffaf0, forestgreen: 0x228b22, fuchsia: 0xff00ff, gainsboro: 0xdcdcdc,
  ghostwhite: 0xf8f8ff, gold: 0xffd700, goldenrod: 0xdaa520, gray: 0x808080, green: 0x008000,
  greenyellow: 0xadff2f, grey: 0x808080, honeydew: 0xf0fff0, hotpink: 0xff69b4, indianred: 0xcd5c5c,
  indigo: 0x4b0082, ivory: 0xfffff0, khaki: 0xf0e68c, lavender: 0xe6e6fa, lavenderblush: 0xfff0f5,
  lawngreen: 0x7cfc00, lemonchiffon: 0xfffacd, lightblue: 0xadd8e6, lightcoral: 0xf08080, lightcyan: 0xe0ffff,
  lightgoldenrodyellow: 0xfafad2, lightgray: 0xd3d3d3, lightgreen: 0x90ee90, lightgrey: 0xd3d3d3, lightpink: 0xffb6c1,
  lightsalmon: 0xffa07a, lightseagreen: 0x20b2aa, lightskyblue: 0x87cefa, lightslategray: 0x778899, lightslategrey: 0x778899,
  lightsteelblue: 0xb0c4de, lightyellow: 0xffffe0, lime: 0x00ff00, limegreen: 0x32cd32, linen: 0xfaf0e6,
  magenta: 0xff00ff, maroon: 0x800000, mediumaquamarine: 0x66cdaa, mediumblue: 0x0000cd, mediumorchid: 0xba55d3,
  mediumpurple: 0x9370db, mediumseagreen: 0x3cb371, mediumslateblue: 0x7b68ee, mediumspringgreen: 0x00fa9a, mediumturquoise: 0x48d1cc,
  mediumvioletred: 0xc71585, midnightblue: 0x191970, mintcream: 0xf5fffa, mistyrose: 0xffe4e1, moccasin: 0xffe4b5,
  navajowhite: 0xffdead, navy: 0x000080, oldlace: 0xfdf5e6, olive: 0x808000, olivedrab: 0x6b8e23,
  orange: 0xffa500, orangered: 0xff4500, orchid: 0xda70d6, palegoldenrod: 0xeee8aa, palegreen: 0x98fb98,
  paleturquoise: 0xafeeee, palevioletred: 0xdb7093, papayawhip: 0xffefd5, peachpuff: 0xffdab9, peru: 0xcd853f,
  pink: 0xffc0cb, plum: 0xdda0dd, powderblue: 0xb0e0e6, purple: 0x800080, rebeccapurple: 0x663399,
  red: 0xff0000, rosybrown: 0xbc8f8f, royalblue: 0x4169e1, saddlebrown: 0x8b4513, salmon: 0xfa8072,
  sandybrown: 0xf4a460, seagreen: 0x2e8b57, seashell: 0xfff5ee, sienna: 0xa0522d, silver: 0xc0c0c0,
  skyblue: 0x87ceeb, slateblue: 0x6a5acd, slategray: 0x708090, slategrey: 0x708090, snow: 0xfffafa,
  springgreen: 0x00ff7f, steelblue: 0x4682b4, tan: 0xd2b48c, teal: 0x008080, thistle: 0xd8bfd8,
  tomato: 0xff6347, turquoise: 0x40e0d0, violet: 0xee82ee, wheat: 0xf5deb3, white: 0xffffff,
  whitesmoke: 0xf5f5f5, yellow: 0xffff00, yellowgreen: 0x9acd32,
};

/** https://drafts.csswg.org/css-color-4/#css-system-colors (light scheme values). */
const SYSTEM: Record<string, number> = {
  accentcolor: 0x0075ff, accentcolortext: 0xffffff, activetext: 0xff0000, buttonborder: 0x767676, buttonface: 0xefefef,
  buttontext: 0x000000, canvas: 0xffffff, canvastext: 0x000000, field: 0xffffff, fieldtext: 0x000000,
  graytext: 0x808080, highlight: 0xb5d5ff, highlighttext: 0x000000, linktext: 0x0000ee, mark: 0xffff00,
  marktext: 0x000000, selecteditem: 0x0075ff, selecteditemtext: 0xffffff, visitedtext: 0x551a8b,
};

const OTHER_COLOR_FUNCTIONS = new Set([
  "lab", "lch", "oklab", "oklch", "color", "color-mix", "light-dark", "device-cmyk", "contrast-color",
]);

export function isNamedColor(lowerName: string): boolean {
  return NAMED[lowerName] !== undefined || SYSTEM[lowerName] !== undefined || lowerName === "transparent" || lowerName === "currentcolor";
}

/** Resolved sRGB color: channels 0-255 (unrounded), alpha 0-1. */
export class RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
  constructor(r: number, g: number, b: number, a: number) {
    this.r = r;
    this.g = g;
    this.b = b;
    this.a = a;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** https://drafts.csswg.org/css-color-4/#serializing-alpha-values — shortest of 2/3 decimals that round-trips to the 8-bit value. */
function formatAlpha(a: number): string {
  const byte = Math.round(clamp(a, 0, 1) * 255);
  let v = Math.round((byte / 255) * 100) / 100;
  if (Math.round(v * 255) !== byte) v = Math.round((byte / 255) * 1000) / 1000;
  return String(v);
}

export function serializeRGBA(c: RGBA): string {
  const r = Math.round(clamp(c.r, 0, 255));
  const g = Math.round(clamp(c.g, 0, 255));
  const b = Math.round(clamp(c.b, 0, 255));
  const a = clamp(c.a, 0, 1);
  if (a >= 1) return `rgb(${r}, ${g}, ${b})`;
  return `rgba(${r}, ${g}, ${b}, ${formatAlpha(a)})`;
}

function fromPacked(p: number, a: number): RGBA {
  return new RGBA((p >> 16) & 255, (p >> 8) & 255, p & 255, a);
}

function hexDigit(c: number): number {
  if (c >= 48 && c <= 57) return c - 48;
  if (c >= 97 && c <= 102) return c - 87;
  if (c >= 65 && c <= 70) return c - 55;
  return -1;
}

/** https://drafts.csswg.org/css-color-4/#hex-notation — `hex` without "#". */
export function parseHex(hex: string): RGBA | null {
  const n = hex.length;
  if (n !== 3 && n !== 4 && n !== 6 && n !== 8) return null;
  const d: number[] = [];
  for (let i = 0; i < n; i++) {
    const v = hexDigit(hex.charCodeAt(i));
    if (v === -1) return null;
    d.push(v);
  }
  if (n <= 4) return new RGBA(d[0] * 17, d[1] * 17, d[2] * 17, n === 4 ? (d[3] * 17) / 255 : 1);
  return new RGBA(d[0] * 16 + d[1], d[2] * 16 + d[3], d[4] * 16 + d[5], n === 8 ? (d[6] * 16 + d[7]) / 255 : 1);
}

/**
 * Splits the arguments of an rgb()/hsl()/hwb() function (text between the parens) into
 * channel strings, accepting both legacy comma syntax and modern space + "/" syntax.
 */
function splitArgs(inner: string): string[] | null {
  const s = inner.trim();
  if (s.indexOf(",") !== -1) {
    const parts = s.split(",").map((p) => p.trim());
    for (const p of parts) if (p === "" || /\s/.test(p)) return null;
    return parts;
  }
  const slash = s.indexOf("/");
  const main = (slash === -1 ? s : s.slice(0, slash)).trim().split(/\s+/);
  if (slash !== -1) {
    const alpha = s.slice(slash + 1).trim();
    if (alpha === "" || /\s/.test(alpha)) return null;
    main.push(alpha);
  }
  return main;
}

const NUM_RE = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(%|deg|grad|rad|turn)?$/i;

function parseChannel(s: string, percentScale: number): number | null {
  if (s.toLowerCase() === "none") return 0;
  const m = NUM_RE.exec(s);
  if (m === null) return null;
  const v = Number(m[1]);
  if (m[2] === undefined) return v;
  if (m[2] === "%") return (v / 100) * percentScale;
  return null;
}

function parseAlpha(s: string | undefined): number | null {
  if (s === undefined) return 1;
  const v = parseChannel(s, 1);
  return v === null ? null : clamp(v, 0, 1);
}

function parseHue(s: string): number | null {
  if (s.toLowerCase() === "none") return 0;
  const m = NUM_RE.exec(s);
  if (m === null) return null;
  const v = Number(m[1]);
  const unit = m[2]?.toLowerCase();
  if (unit === undefined || unit === "deg") return v;
  if (unit === "grad") return (v * 360) / 400;
  if (unit === "rad") return (v * 180) / Math.PI;
  if (unit === "turn") return v * 360;
  return null;
}

/** https://drafts.csswg.org/css-color-4/#hsl-to-rgb */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  s = clamp(s, 0, 1);
  l = clamp(l, 0, 1);
  const f = (n: number): number => {
    const k = (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

/** https://drafts.csswg.org/css-color-4/#hwb-to-rgb */
function hwbToRgb(h: number, w: number, b: number): [number, number, number] {
  if (w + b >= 1) {
    const gray = (w / (w + b)) * 255;
    return [gray, gray, gray];
  }
  const rgb = hslToRgb(h, 1, 0.5);
  for (let i = 0; i < 3; i++) rgb[i] = (rgb[i] / 255) * (1 - w - b) * 255 + w * 255;
  return rgb;
}

/**
 * Parses a legacy-sRGB color function given its lowercase name and inner text. Returns null
 * if invalid.
 */
export function parseColorFunction(name: string, inner: string): RGBA | null {
  const args = splitArgs(inner);
  if (args === null) return null;
  if (args.length !== 3 && args.length !== 4) return null;
  if (name === "rgb" || name === "rgba") {
    const r = parseChannel(args[0], 255);
    const g = parseChannel(args[1], 255);
    const b = parseChannel(args[2], 255);
    const a = parseAlpha(args[3]);
    if (r === null || g === null || b === null || a === null) return null;
    return new RGBA(r, g, b, a);
  }
  if (name === "hsl" || name === "hsla" || name === "hwb") {
    const h = parseHue(args[0]);
    const s = parseChannel(args[1], 1);
    const l = parseChannel(args[2], 1);
    const a = parseAlpha(args[3]);
    if (h === null || s === null || l === null || a === null) return null;
    // Unitless saturation/lightness are only valid in modern syntax (treated as percentages).
    const s1 = args[1].endsWith("%") ? s : s / 100;
    const l1 = args[2].endsWith("%") ? l : l / 100;
    const [r, g, b] = name === "hwb" ? hwbToRgb(h, s1, l1) : hslToRgb(h, s1, l1);
    return new RGBA(r, g, b, a);
  }
  return null;
}

/**
 * Normalizes a specified color value (single component text). Returns the serialization
 * (browsers' specified-value form), or null if `text` is not a color.
 */
export function normalizeColor(text: string): string | null {
  const s = text.trim();
  if (s === "") return null;
  const c0 = s.charCodeAt(0);
  if (c0 === 0x23) {
    const rgba = parseHex(s.slice(1));
    return rgba === null ? null : serializeRGBA(rgba);
  }
  const paren = s.indexOf("(");
  if (paren === -1) {
    const lower = s.toLowerCase();
    return isNamedColor(lower) ? lower : null;
  }
  if (!s.endsWith(")")) return null;
  const name = s.slice(0, paren).toLowerCase();
  const inner = s.slice(paren + 1, -1);
  if (RELATIVE_RE.test(inner) && (LEGACY_FUNCTIONS.has(name) || CANONICAL_FUNCTIONS.has(name))) return normalizeRelativeColor(name, inner);
  if (OTHER_COLOR_FUNCTIONS.has(name)) return normalizeOtherColorFunction(name, inner, s);
  const rgba = parseColorFunction(name, inner);
  return rgba === null ? null : serializeRGBA(rgba);
}

// --- color functions other than the legacy sRGB ones ----------------------------------------

const LEGACY_FUNCTIONS = new Set(["rgb", "rgba", "hsl", "hsla", "hwb"]);
const CANONICAL_FUNCTIONS = new Set(["lab", "lch", "oklab", "oklch"]);
const RELATIVE_RE = /^\s*from\s/i;
const MATH_RE = /^(calc|min|max|clamp|round|mod|rem|abs|sign|sin|cos|tan|asin|acos|atan|atan2|pow|sqrt|hypot|log|exp)\(/i;

/**
 * https://drafts.csswg.org/css-color-4/#color-syntax — reference ranges used to resolve
 * percentages (100% = ref) for lab()/lch()/oklab()/oklch() channels.
 * https://drafts.csswg.org/css-color-4/#specifying-lab-lch, #specifying-oklab-oklch
 */
const PERCENT_REF: Record<string, readonly number[]> = {
  lab: [100, 125, 125],
  lch: [100, 150, 0],
  oklab: [1, 0.4, 0.4],
  oklch: [1, 0.4, 0],
};

/** https://drafts.csswg.org/css-color-4/#predefined — `xyz` is an alias of `xyz-d65`. */
const PREDEFINED_SPACES = new Set([
  "srgb", "srgb-linear", "display-p3", "display-p3-linear", "a98-rgb", "prophoto-rgb", "rec2020", "xyz", "xyz-d50", "xyz-d65",
]);

/** https://drafts.csswg.org/css-color-5/#color-mix — <color-interpolation-method> color spaces. */
const POLAR_SPACES = new Set(["hsl", "hwb", "lch", "oklch"]);
const RECTANGULAR_SPACES = new Set([
  "srgb", "srgb-linear", "display-p3", "display-p3-linear", "a98-rgb", "prophoto-rgb", "rec2020", "lab", "oklab", "xyz", "xyz-d50", "xyz-d65",
]);
const HUE_METHODS = new Set(["shorter", "longer", "increasing", "decreasing"]);

/** Rounds to `digits` significant digits and serializes like a CSS <number>. */
function roundSig(n: number, digits: number): string {
  if (n === 0) return "0";
  return formatNumber(Number(n.toPrecision(digits)));
}

/** https://drafts.csswg.org/css-color-4/#serializing-alpha-values (non-legacy functions keep 3 decimals) */
function alphaText(c: Comp): string | null {
  if (c.type === TK_IDENT) return c.lower === "none" ? "none" : null;
  let a: number;
  if (c.type === TK_NUMBER) a = c.num;
  else if (c.type === TK_PERCENTAGE) a = c.num / 100;
  else return null;
  a = clamp(a, 0, 1);
  return a === 1 ? "" : formatNumber(Math.round(a * 1000) / 1000);
}

/** Splits `comps` (spaces dropped) into channel components and an optional alpha after "/". */
function channelsAndAlpha(comps: Comp[]): [Comp[], Comp | null] | null {
  const channels: Comp[] = [];
  let alpha: Comp | null = null;
  let afterSlash = false;
  for (let i = 0; i < comps.length; i++) {
    const c = comps[i];
    if (c.type === COMP_SPACE) continue;
    if (c.type === TK_COMMA) return null;
    if (c.type === TK_DELIM) {
      if (c.value !== "/" || afterSlash) return null;
      afterSlash = true;
      continue;
    }
    if (afterSlash) {
      if (alpha !== null) return null;
      alpha = c;
    } else channels.push(c);
  }
  if (afterSlash && alpha === null) return null;
  return [channels, alpha];
}

function withAlpha(body: string, alpha: Comp | null): string | null {
  if (alpha === null) return body + ")";
  const a = alphaText(alpha);
  if (a === null) return null;
  return a === "" ? body + ")" : body + " / " + a + ")";
}

/**
 * lab() / lch() / oklab() / oklch() specified-value serialization
 * (https://drafts.csswg.org/css-color-4/#serializing-lab-lch, #serializing-oklab-oklch):
 * percentages resolved against the reference ranges, lightness clamped, chroma clamped at 0,
 * hue as <number> degrees in [0, 360), alpha omitted when 1.
 */
function normalizeCanonical(name: string, comps: Comp[]): string | null {
  const parts = channelsAndAlpha(comps);
  if (parts === null || parts[0].length !== 3) return null;
  const [channels, alpha] = parts;
  const ref = PERCENT_REF[name];
  const polar = name === "lch" || name === "oklch";
  const maxL = name === "lab" || name === "lch" ? 100 : 1;
  let body = name + "(";
  for (let i = 0; i < 3; i++) {
    const c = channels[i];
    let text: string;
    if (c.type === TK_IDENT && c.lower === "none") text = "none";
    else if (polar && i === 2) {
      let h: number;
      if (c.type === TK_NUMBER) h = c.num;
      else if (c.type === TK_DIMENSION) {
        const deg = parseHue(c.text);
        if (deg === null) return null;
        h = deg;
      } else return null;
      text = roundSig(((h % 360) + 360) % 360, 6);
    } else {
      let v: number;
      if (c.type === TK_NUMBER) v = c.num;
      else if (c.type === TK_PERCENTAGE) v = (c.num / 100) * ref[i];
      else return null;
      if (i === 0) v = clamp(v, 0, maxL);
      else if (polar && i === 1 && v < 0) v = 0;
      text = roundSig(v, 6);
    }
    body += (i === 0 ? "" : " ") + text;
  }
  return withAlpha(body, alpha);
}

/** color() specified-value serialization (https://drafts.csswg.org/css-color-4/#serializing-color-function-values). */
function normalizeColorFn(comps: Comp[]): string | null {
  let i = 0;
  while (i < comps.length && comps[i].type === COMP_SPACE) i++;
  const space = comps[i];
  if (space === undefined || space.type !== TK_IDENT || !PREDEFINED_SPACES.has(space.lower)) return null;
  const parts = channelsAndAlpha(comps.slice(i + 1));
  if (parts === null || parts[0].length !== 3) return null;
  const [channels, alpha] = parts;
  let body = "color(" + (space.lower === "xyz" ? "xyz-d65" : space.lower);
  for (const c of channels) {
    if (c.type === TK_IDENT && c.lower === "none") body += " none";
    else if (c.type === TK_NUMBER) body += " " + roundSig(c.num, 5);
    else if (c.type === TK_PERCENTAGE) body += " " + roundSig(c.num / 100, 5);
    else return null;
  }
  return withAlpha(body, alpha);
}

/** Splits component values on top-level commas into argument lists (spaces trimmed). */
function commaArgs(comps: Comp[]): Comp[][] {
  const args: Comp[][] = [[]];
  for (const c of comps) {
    if (c.type === TK_COMMA) args.push([]);
    else if (c.type !== COMP_SPACE) args[args.length - 1].push(c);
  }
  return args;
}

/** A single component that is a <color>, serialized; null otherwise. */
function colorComponent(c: Comp): string | null {
  if (c.type === TK_HASH || c.type === TK_IDENT || c.type === TK_FUNCTION) return normalizeColor(c.text);
  return null;
}

/**
 * https://drafts.csswg.org/css-color-5/#color-mix and #serial-color-mix: the interpolation
 * method lower-cased, both colors serialized, percentages normalized (a single 50% — or none —
 * is omitted; a lone second percentage becomes the first's complement), both 0% invalid.
 */
function normalizeColorMix(comps: Comp[]): string | null {
  const args = commaArgs(comps);
  if (args.length !== 3) return null;
  const method = args[0];
  if (method.length < 2 || method[0].type !== TK_IDENT || method[0].lower !== "in" || method[1].type !== TK_IDENT) return null;
  const space = method[1].lower;
  let methodText = "in " + space;
  if (POLAR_SPACES.has(space)) {
    if (method.length === 4) {
      if (method[2].type !== TK_IDENT || !HUE_METHODS.has(method[2].lower) || method[3].type !== TK_IDENT || method[3].lower !== "hue") return null;
      methodText += " " + method[2].lower + " hue";
    } else if (method.length !== 2) return null;
  } else if (!RECTANGULAR_SPACES.has(space) || method.length !== 2) return null;
  const colors: string[] = [];
  const percents: (number | null)[] = [];
  for (let k = 1; k <= 2; k++) {
    const arg = args[k];
    if (arg.length < 1 || arg.length > 2) return null;
    let color: string | null = null;
    let pct: number | null = null;
    for (const c of arg) {
      if (c.type === TK_PERCENTAGE && pct === null) {
        if (c.num < 0 || c.num > 100) return null;
        pct = c.num;
        continue;
      }
      if (color !== null) return null;
      color = colorComponent(c);
      if (color === null) return null;
    }
    if (color === null) return null;
    colors.push(color);
    percents.push(pct);
  }
  const [p1, p2] = percents;
  if (p1 === 0 && p2 === 0) return null;
  let first = colors[0];
  let second = colors[1];
  if (p1 !== null && p2 !== null) {
    first += " " + formatNumber(p1) + "%";
    second += " " + formatNumber(p2) + "%";
  } else if (p1 !== null || p2 !== null) {
    const p = p1 !== null ? p1 : 100 - p2!;
    if (p !== 50) first += " " + formatNumber(p) + "%";
  }
  return "color-mix(" + methodText + ", " + first + ", " + second + ")";
}

/** https://drafts.csswg.org/css-color-5/#light-dark — both colors serialized. */
function normalizeLightDark(comps: Comp[]): string | null {
  const args = commaArgs(comps);
  if (args.length !== 2 || args[0].length !== 1 || args[1].length !== 1) return null;
  const light = colorComponent(args[0][0]);
  const dark = colorComponent(args[1][0]);
  return light === null || dark === null ? null : "light-dark(" + light + ", " + dark + ")";
}

/**
 * Relative color syntax (https://drafts.csswg.org/css-color-5/#relative-colors): the origin
 * color is serialized, keywords lower-cased, everything else kept (channel math is not
 * resolved without a used value).
 */
function normalizeRelativeColor(name: string, inner: string): string | null {
  const comps = splitComponents(inner);
  if (comps === null) return null;
  let out = (name === "rgba" ? "rgb" : name === "hsla" ? "hsl" : name) + "(from";
  let sawOrigin = false;
  for (let i = 0; i < comps.length; i++) {
    const c = comps[i];
    if (c.type === COMP_SPACE) continue;
    if (i === 0 || (c.type === TK_IDENT && c.lower === "from" && !sawOrigin && out.endsWith("(from"))) continue;
    if (!sawOrigin) {
      const origin = colorComponent(c);
      if (origin === null) return null;
      out += " " + origin;
      sawOrigin = true;
      continue;
    }
    out += " " + (c.type === TK_IDENT ? c.lower : c.text);
  }
  return sawOrigin ? out + ")" : null;
}

/** lab()/lch()/oklab()/oklch()/color()/color-mix()/light-dark() and the rest of OTHER_COLOR_FUNCTIONS. */
function normalizeOtherColorFunction(name: string, inner: string, source: string): string | null {
  const comps = splitComponents(inner);
  if (comps === null) return null;
  // Channel math (calc() & co.) needs a resolver we do not have: keep the author's text.
  for (const c of comps) if (c.type === TK_FUNCTION && MATH_RE.test(c.text)) return name + source.slice(name.length);
  switch (name) {
    case "lab":
    case "lch":
    case "oklab":
    case "oklch":
      return normalizeCanonical(name, comps);
    case "color":
      return normalizeColorFn(comps);
    case "color-mix":
      return normalizeColorMix(comps);
    case "light-dark":
      return normalizeLightDark(comps);
    default:
      return name + source.slice(name.length);
  }
}

/**
 * Computed color value (https://drafts.csswg.org/css-color-4/#resolving-color-values):
 * named/system/transparent colors resolve to rgb()/rgba(); `currentcolor` resolves to
 * `currentColor` (the element's computed `color`).
 */
export function computeColor(specified: string, currentColor: string): string {
  const s = specified.trim();
  const lower = s.toLowerCase();
  if (lower === "currentcolor") return currentColor;
  if (lower === "transparent") return "rgba(0, 0, 0, 0)";
  const named = NAMED[lower] ?? SYSTEM[lower];
  if (named !== undefined) return serializeRGBA(fromPacked(named, 1));
  if (s.charCodeAt(0) === 0x23) {
    const rgba = parseHex(s.slice(1));
    return rgba === null ? s : serializeRGBA(rgba);
  }
  const paren = s.indexOf("(");
  if (paren !== -1 && s.endsWith(")")) {
    const rgba = parseColorFunction(s.slice(0, paren).toLowerCase(), s.slice(paren + 1, -1));
    if (rgba !== null) return serializeRGBA(rgba);
  }
  return s;
}
