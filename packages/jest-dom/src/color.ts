// Canonical color comparison for toHaveStyle: `red`, `#f00`, `rgb(255 0 0)` and
// `hsl(0 100% 50%)` all canonicalize to the same key, so a test passes whether the DOM
// serializes colors as authored (jsdom <= 26, happy-dom, @ctrl/dom) or as rgb() (jsdom 30).
// Legacy sRGB forms only: https://drafts.csswg.org/css-color-4/#color-syntax
// The named-color table mirrors @ctrl/dom src/css/colors.ts (kept local: this module also
// runs against foreign DOMs in the oracle runs).

/** https://drafts.csswg.org/css-color-4/#named-colors — packed 0xRRGGBB. */
const NAMED: Record<string, number> = {
  aliceblue: 0xf0f8ff,
  antiquewhite: 0xfaebd7,
  aqua: 0x00ffff,
  aquamarine: 0x7fffd4,
  azure: 0xf0ffff,
  beige: 0xf5f5dc,
  bisque: 0xffe4c4,
  black: 0x000000,
  blanchedalmond: 0xffebcd,
  blue: 0x0000ff,
  blueviolet: 0x8a2be2,
  brown: 0xa52a2a,
  burlywood: 0xdeb887,
  cadetblue: 0x5f9ea0,
  chartreuse: 0x7fff00,
  chocolate: 0xd2691e,
  coral: 0xff7f50,
  cornflowerblue: 0x6495ed,
  cornsilk: 0xfff8dc,
  crimson: 0xdc143c,
  cyan: 0x00ffff,
  darkblue: 0x00008b,
  darkcyan: 0x008b8b,
  darkgoldenrod: 0xb8860b,
  darkgray: 0xa9a9a9,
  darkgreen: 0x006400,
  darkgrey: 0xa9a9a9,
  darkkhaki: 0xbdb76b,
  darkmagenta: 0x8b008b,
  darkolivegreen: 0x556b2f,
  darkorange: 0xff8c00,
  darkorchid: 0x9932cc,
  darkred: 0x8b0000,
  darksalmon: 0xe9967a,
  darkseagreen: 0x8fbc8f,
  darkslateblue: 0x483d8b,
  darkslategray: 0x2f4f4f,
  darkslategrey: 0x2f4f4f,
  darkturquoise: 0x00ced1,
  darkviolet: 0x9400d3,
  deeppink: 0xff1493,
  deepskyblue: 0x00bfff,
  dimgray: 0x696969,
  dimgrey: 0x696969,
  dodgerblue: 0x1e90ff,
  firebrick: 0xb22222,
  floralwhite: 0xfffaf0,
  forestgreen: 0x228b22,
  fuchsia: 0xff00ff,
  gainsboro: 0xdcdcdc,
  ghostwhite: 0xf8f8ff,
  gold: 0xffd700,
  goldenrod: 0xdaa520,
  gray: 0x808080,
  green: 0x008000,
  greenyellow: 0xadff2f,
  grey: 0x808080,
  honeydew: 0xf0fff0,
  hotpink: 0xff69b4,
  indianred: 0xcd5c5c,
  indigo: 0x4b0082,
  ivory: 0xfffff0,
  khaki: 0xf0e68c,
  lavender: 0xe6e6fa,
  lavenderblush: 0xfff0f5,
  lawngreen: 0x7cfc00,
  lemonchiffon: 0xfffacd,
  lightblue: 0xadd8e6,
  lightcoral: 0xf08080,
  lightcyan: 0xe0ffff,
  lightgoldenrodyellow: 0xfafad2,
  lightgray: 0xd3d3d3,
  lightgreen: 0x90ee90,
  lightgrey: 0xd3d3d3,
  lightpink: 0xffb6c1,
  lightsalmon: 0xffa07a,
  lightseagreen: 0x20b2aa,
  lightskyblue: 0x87cefa,
  lightslategray: 0x778899,
  lightslategrey: 0x778899,
  lightsteelblue: 0xb0c4de,
  lightyellow: 0xffffe0,
  lime: 0x00ff00,
  limegreen: 0x32cd32,
  linen: 0xfaf0e6,
  magenta: 0xff00ff,
  maroon: 0x800000,
  mediumaquamarine: 0x66cdaa,
  mediumblue: 0x0000cd,
  mediumorchid: 0xba55d3,
  mediumpurple: 0x9370db,
  mediumseagreen: 0x3cb371,
  mediumslateblue: 0x7b68ee,
  mediumspringgreen: 0x00fa9a,
  mediumturquoise: 0x48d1cc,
  mediumvioletred: 0xc71585,
  midnightblue: 0x191970,
  mintcream: 0xf5fffa,
  mistyrose: 0xffe4e1,
  moccasin: 0xffe4b5,
  navajowhite: 0xffdead,
  navy: 0x000080,
  oldlace: 0xfdf5e6,
  olive: 0x808000,
  olivedrab: 0x6b8e23,
  orange: 0xffa500,
  orangered: 0xff4500,
  orchid: 0xda70d6,
  palegoldenrod: 0xeee8aa,
  palegreen: 0x98fb98,
  paleturquoise: 0xafeeee,
  palevioletred: 0xdb7093,
  papayawhip: 0xffefd5,
  peachpuff: 0xffdab9,
  peru: 0xcd853f,
  pink: 0xffc0cb,
  plum: 0xdda0dd,
  powderblue: 0xb0e0e6,
  purple: 0x800080,
  rebeccapurple: 0x663399,
  red: 0xff0000,
  rosybrown: 0xbc8f8f,
  royalblue: 0x4169e1,
  saddlebrown: 0x8b4513,
  salmon: 0xfa8072,
  sandybrown: 0xf4a460,
  seagreen: 0x2e8b57,
  seashell: 0xfff5ee,
  sienna: 0xa0522d,
  silver: 0xc0c0c0,
  skyblue: 0x87ceeb,
  slateblue: 0x6a5acd,
  slategray: 0x708090,
  slategrey: 0x708090,
  snow: 0xfffafa,
  springgreen: 0x00ff7f,
  steelblue: 0x4682b4,
  tan: 0xd2b48c,
  teal: 0x008080,
  thistle: 0xd8bfd8,
  tomato: 0xff6347,
  turquoise: 0x40e0d0,
  violet: 0xee82ee,
  wheat: 0xf5deb3,
  white: 0xffffff,
  whitesmoke: 0xf5f5f5,
  yellow: 0xffff00,
  yellowgreen: 0x9acd32,
};

const NUM_RE = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(%|deg|grad|rad|turn)?$/i;

function channel(s: string, percentScale: number): number | null {
  if (s.toLowerCase() === "none") return 0;
  const m = NUM_RE.exec(s);
  if (m === null) return null;
  const v = Number(m[1]);
  if (m[2] === undefined) return v;
  return m[2] === "%" ? (v / 100) * percentScale : null;
}

function hue(s: string): number | null {
  const m = NUM_RE.exec(s);
  if (m === null) return s.toLowerCase() === "none" ? 0 : null;
  const v = Number(m[1]);
  switch (m[2]?.toLowerCase()) {
    case undefined:
    case "deg":
      return v;
    case "grad":
      return (v * 360) / 400;
    case "rad":
      return (v * 180) / Math.PI;
    case "turn":
      return v * 360;
    default:
      return null;
  }
}

/** Arguments of rgb()/hsl(): legacy comma syntax or modern space + "/" syntax. */
function args(inner: string): string[] | null {
  const s = inner.trim();
  if (s.includes(",")) {
    const parts = s.split(",").map((p) => p.trim());
    return parts.some((p) => p === "" || /\s/.test(p)) ? null : parts;
  }
  const slash = s.indexOf("/");
  const main = (slash === -1 ? s : s.slice(0, slash)).trim().split(/\s+/);
  if (slash !== -1) main.push(s.slice(slash + 1).trim());
  return main;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** https://drafts.csswg.org/css-color-4/#hsl-to-rgb */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  s = clamp(s, 0, 1);
  l = clamp(l, 0, 1);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    return (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255;
  };
  return [f(0), f(8), f(4)];
}

function key(r: number, g: number, b: number, a: number): string {
  return `${Math.round(clamp(r, 0, 255))},${Math.round(clamp(g, 0, 255))},${Math.round(clamp(b, 0, 255))},${Math.round(clamp(a, 0, 1) * 1000)}`;
}

/** Canonical "r,g,b,alpha*1000" key for a single color value, or null if `text` is not one. */
export function canonicalColor(text: unknown): string | null {
  if (typeof text !== "string") return null;
  const s = text.trim().toLowerCase();
  if (s === "") return null;
  if (s === "transparent") return key(0, 0, 0, 0);
  if (s.charCodeAt(0) === 0x23) {
    const hex = s.slice(1);
    if (!/^[0-9a-f]+$/.test(hex)) return null;
    const n = hex.length;
    const d = (i: number, len: number) => parseInt(hex.slice(i, i + len), 16) * (len === 1 ? 17 : 1);
    if (n === 3 || n === 4) return key(d(0, 1), d(1, 1), d(2, 1), n === 4 ? d(3, 1) / 255 : 1);
    if (n === 6 || n === 8) return key(d(0, 2), d(2, 2), d(4, 2), n === 8 ? d(6, 2) / 255 : 1);
    return null;
  }
  const paren = s.indexOf("(");
  if (paren === -1) {
    const packed = NAMED[s];
    return packed === undefined ? null : key(packed >> 16, (packed >> 8) & 0xff, packed & 0xff, 1);
  }
  if (!s.endsWith(")")) return null;
  const name = s.slice(0, paren);
  const parts = args(s.slice(paren + 1, -1));
  if (parts === null || (parts.length !== 3 && parts.length !== 4)) return null;
  const alpha = parts.length === 4 ? channel(parts[3], 1) : 1;
  if (alpha === null) return null;
  if (name === "rgb" || name === "rgba") {
    const r = channel(parts[0], 255);
    const g = channel(parts[1], 255);
    const b = channel(parts[2], 255);
    return r === null || g === null || b === null ? null : key(r, g, b, alpha);
  }
  if (name === "hsl" || name === "hsla") {
    const h = hue(parts[0]);
    const sat = channel(parts[1], 1);
    const light = channel(parts[2], 1);
    if (h === null || sat === null || light === null) return null;
    const [r, g, b] = hslToRgb(
      h,
      parts[1].endsWith("%") ? sat : sat / 100,
      parts[2].endsWith("%") ? light : light / 100,
    );
    return key(r, g, b, alpha);
  }
  return null;
}

/** Whether two style values are the same single color in different serializations. */
export function sameColor(expected: unknown, received: unknown): boolean {
  const a = canonicalColor(expected);
  return a !== null && a === canonicalColor(received);
}
