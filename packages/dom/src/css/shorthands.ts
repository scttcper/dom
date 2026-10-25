// Shorthand expansion and serialization for the shorthands this implementation expands
// into longhands (the same set jsdom expands: margin, padding, border*, flex, background,
// font). Other shorthands (overflow, gap, inset, transition, animation, grid-*, ...) are
// stored as single declarations, which is what jsdom does and keeps `toHaveStyle`
// comparisons exact.
// https://drafts.csswg.org/cssom/#concept-shorthands-preferred-order
// https://drafts.csswg.org/cssom/#serialize-a-css-value (shorthand serialization)

import {
  COMP_SPACE,
  type Comp,
  grammarFor,
  isCSSWideKeyword,
  normalizeComponent,
  normalizeLonghand,
  splitComponents,
  TK_COMMA,
  TK_DELIM,
  TK_FUNCTION,
  TK_IDENT,
  TK_NUMBER,
  TK_STRING,
  TK_URL,
  formatNumber,
  serializeUrl,
} from "./values.ts";
import { normalizeColor } from "./colors.ts";

const SIDES = ["top", "right", "bottom", "left"];

function box(prefix: string, suffix: string): string[] {
  return SIDES.map((s) => prefix + s + suffix);
}

const BORDER_WIDTHS = box("border-", "-width");
const BORDER_STYLES = box("border-", "-style");
const BORDER_COLORS = box("border-", "-color");

/** Expanded shorthand → longhands (in serialization order). */
export const SHORTHANDS = new Map<string, string[]>([
  ["margin", box("margin-", "")],
  ["padding", box("padding-", "")],
  ["border-width", BORDER_WIDTHS],
  ["border-style", BORDER_STYLES],
  ["border-color", BORDER_COLORS],
  ["border-top", ["border-top-width", "border-top-style", "border-top-color"]],
  ["border-right", ["border-right-width", "border-right-style", "border-right-color"]],
  ["border-bottom", ["border-bottom-width", "border-bottom-style", "border-bottom-color"]],
  ["border-left", ["border-left-width", "border-left-style", "border-left-color"]],
  ["border", [...BORDER_WIDTHS, ...BORDER_STYLES, ...BORDER_COLORS, "border-image"]],
  ["flex", ["flex-grow", "flex-shrink", "flex-basis"]],
  [
    "background",
    [
      "background-image",
      "background-position-x",
      "background-position-y",
      "background-size",
      "background-repeat",
      "background-origin",
      "background-clip",
      "background-attachment",
      "background-color",
    ],
  ],
  ["background-position", ["background-position-x", "background-position-y"]],
  ["font", ["font-style", "font-variant", "font-weight", "font-size", "line-height", "font-family"]],
]);

/** Longhand → expanded shorthands containing it, largest first (preferred order). */
const SHORTHANDS_OF = new Map<string, string[]>();
for (const [sh, longhands] of SHORTHANDS) {
  for (const l of longhands) {
    let list = SHORTHANDS_OF.get(l);
    if (list === undefined) SHORTHANDS_OF.set(l, (list = []));
    list.push(sh);
  }
}
for (const list of SHORTHANDS_OF.values()) list.sort((a, b) => SHORTHANDS.get(b)!.length - SHORTHANDS.get(a)!.length);

export function isExpandedShorthand(name: string): boolean {
  return SHORTHANDS.has(name);
}

export function longhandsOf(name: string): string[] | undefined {
  return SHORTHANDS.get(name);
}

/** Shorthands that contain `longhand`, in preferred (largest-first) order. */
export function shorthandsContaining(longhand: string): string[] | undefined {
  return SHORTHANDS_OF.get(longhand);
}

// --- expansion ----------------------------------------------------------------------------

/** Groups top-level components into space-separated items (commas/slashes are their own items). */
function items(value: string): Comp[] | null {
  const comps = splitComponents(value);
  if (comps === null) return null;
  const out: Comp[] = [];
  for (const c of comps) if (c.type !== COMP_SPACE) out.push(c);
  return out;
}

function expandBox(longhands: string[], value: string): string[] | null {
  const parts = items(value);
  if (parts === null || parts.length < 1 || parts.length > 4) return null;
  const g = grammarFor(longhands[0]);
  const vals: string[] = [];
  for (const p of parts) {
    if (p.type === TK_COMMA || p.type === TK_DELIM) return null;
    const v = normalizeComponent(p, g);
    if (v === null) return null;
    vals.push(v);
  }
  const t = vals[0];
  const r = vals[1] ?? t;
  const b = vals[2] ?? t;
  const l = vals[3] ?? r;
  return [t, r, b, l];
}

const STYLE_KEYWORDS = new Set([
  "none",
  "hidden",
  "dotted",
  "dashed",
  "solid",
  "double",
  "groove",
  "ridge",
  "inset",
  "outset",
]);

/** <line-width> || <line-style> || <color> → [width, style, color] (missing = initial). */
function parseBorderSide(value: string): string[] | null {
  const parts = items(value);
  if (parts === null || parts.length < 1 || parts.length > 3) return null;
  let width = "";
  let style = "";
  let color = "";
  const gw = grammarFor("border-top-width");
  for (const p of parts) {
    if (p.type === TK_IDENT && STYLE_KEYWORDS.has(p.lower)) {
      if (style !== "") return null;
      style = p.lower;
      continue;
    }
    const w = normalizeComponent(p, gw);
    if (w !== null) {
      if (width !== "") return null;
      width = w;
      continue;
    }
    const c = normalizeColor(p.text);
    if (c !== null && p.type !== TK_NUMBER) {
      if (color !== "") return null;
      color = c;
      continue;
    }
    return null;
  }
  return [width || "medium", style || "none", color || "currentcolor"];
}

const FLEX_BASIS_KEYWORDS = new Set(["auto", "content", "min-content", "max-content", "fit-content"]);

/** https://drafts.csswg.org/css-flexbox-1/#flex-property */
function expandFlex(value: string): string[] | null {
  const parts = items(value);
  if (parts === null || parts.length < 1 || parts.length > 3) return null;
  if (parts.length === 1 && parts[0].type === TK_IDENT) {
    if (parts[0].lower === "none") return ["0", "0", "auto"];
    if (parts[0].lower === "auto") return ["1", "1", "auto"];
  }
  const gb = grammarFor("flex-basis");
  const num = (p: Comp | undefined): string | null =>
    p !== undefined && p.type === TK_NUMBER && p.num >= 0 ? formatNumber(p.num) : null;
  const basisOf = (p: Comp): string | null => {
    if (p.type === TK_IDENT && !FLEX_BASIS_KEYWORDS.has(p.lower)) return null;
    return normalizeComponent(p, gb);
  };
  let grow: string | null;
  let shrink: string | null = null;
  let basis: string | null = null;
  let i = 0;
  if ((grow = num(parts[0])) !== null) {
    i = 1;
    if ((shrink = num(parts[1])) !== null) i = 2;
    if (i < parts.length) {
      basis = basisOf(parts[i]);
      if (basis === null) return null;
      i++;
    }
  } else {
    basis = basisOf(parts[0]);
    if (basis === null) return null;
    i = 1;
    if ((grow = num(parts[1])) !== null) {
      i = 2;
      if ((shrink = num(parts[2])) !== null) i = 3;
    }
  }
  if (i !== parts.length) return null;
  if (grow === null) return ["1", "1", basis!];
  return [grow, shrink ?? "1", basis ?? "0%"];
}

const POSITION_KEYWORDS = new Set(["left", "center", "right", "top", "bottom"]);
const REPEAT_KEYWORDS = new Set(["repeat-x", "repeat-y", "repeat", "space", "round", "no-repeat"]);
const ATTACHMENT_KEYWORDS = new Set(["scroll", "fixed", "local"]);
const BOX_KEYWORDS = new Set(["border-box", "padding-box", "content-box"]);
const IMAGE_FUNCTIONS = new Set([
  "linear-gradient",
  "radial-gradient",
  "conic-gradient",
  "repeating-linear-gradient",
  "repeating-radial-gradient",
  "repeating-conic-gradient",
  "image-set",
  "-webkit-image-set",
  "image",
  "cross-fade",
  "element",
  "paint",
  "-webkit-linear-gradient",
  "-webkit-radial-gradient",
  "-webkit-gradient",
  "-moz-linear-gradient",
  "-moz-radial-gradient",
]);

function isPositionComp(p: Comp): boolean {
  if (p.type === TK_IDENT) return POSITION_KEYWORDS.has(p.lower);
  return normalizeComponent(p, grammarFor("margin-top")) !== null && !(p.type === TK_IDENT);
}

function positionComp(p: Comp): string {
  if (p.type === TK_IDENT) return p.lower;
  return normalizeComponent(p, grammarFor("margin-top"))!;
}

/** https://drafts.csswg.org/css-backgrounds-3/#typedef-bg-position → [x, y]. */
export function parsePosition(parts: Comp[]): string[] | null {
  if (parts.length < 1 || parts.length > 4) return null;
  const v = parts.map(positionComp);
  const isY = (s: string): boolean => s === "top" || s === "bottom";
  const isX = (s: string): boolean => s === "left" || s === "right";
  if (v.length === 1) {
    if (isY(v[0])) return ["center", v[0]];
    return [v[0], "center"];
  }
  if (v.length === 2) {
    if (isY(v[0]) || isX(v[1])) {
      if (isY(v[1]) || isX(v[0])) return null;
      return [v[1], v[0]];
    }
    return [v[0], v[1]];
  }
  let x: string;
  let y: string;
  if (v.length === 3) {
    if (!POSITION_KEYWORDS.has(v[1])) {
      x = v[0] + " " + v[1];
      y = v[2];
    } else {
      x = v[0];
      y = v[1] + " " + v[2];
    }
  } else {
    x = v[0] + " " + v[1];
    y = v[2] + " " + v[3];
  }
  if (isY(x.split(" ")[0])) return [y, x];
  return [x, y];
}

const BACKGROUND_INITIAL = ["none", "0%", "0%", "auto", "repeat", "padding-box", "border-box", "scroll", "transparent"];

/** One <bg-layer> / <final-bg-layer> → background longhand values. */
function parseBackgroundLayer(parts: Comp[], final: boolean): string[] | null {
  let image = "";
  let posX = "";
  let posY = "";
  let size = "";
  let repeat = "";
  let origin = "";
  let clip = "";
  let attachment = "";
  let color = "";
  let i = 0;
  while (i < parts.length) {
    const p = parts[i];
    if (p.type === TK_IDENT && p.lower === "none" && image === "") {
      image = "none";
      i++;
      continue;
    }
    if (p.type === TK_URL || (p.type === TK_FUNCTION && (p.lower === "url" || IMAGE_FUNCTIONS.has(p.lower)))) {
      if (image !== "") return null;
      image =
        p.type === TK_URL ? serializeUrl(p.value) : (normalizeComponent(p, grammarFor("background-image")) ?? p.text);
      i++;
      continue;
    }
    if (isPositionComp(p) && posX === "") {
      let j = i;
      while (j < parts.length && j - i < 4 && isPositionComp(parts[j])) j++;
      const pos = parsePosition(parts.slice(i, j));
      if (pos === null) return null;
      posX = pos[0];
      posY = pos[1];
      i = j;
      if (i < parts.length && parts[i].type === TK_DELIM && parts[i].value === "/") {
        i++;
        const gs = grammarFor("background-size");
        const sz: string[] = [];
        while (i < parts.length && sz.length < 2) {
          const s = normalizeComponent(parts[i], gs);
          if (s === null) break;
          sz.push(s);
          i++;
          if (s === "cover" || s === "contain") break;
        }
        if (sz.length === 0) return null;
        size = sz.join(" ");
      }
      continue;
    }
    if (p.type === TK_IDENT && REPEAT_KEYWORDS.has(p.lower) && repeat === "") {
      repeat = p.lower;
      if (p.lower !== "repeat-x" && p.lower !== "repeat-y" && i + 1 < parts.length) {
        const n = parts[i + 1];
        if (n.type === TK_IDENT && REPEAT_KEYWORDS.has(n.lower) && n.lower !== "repeat-x" && n.lower !== "repeat-y") {
          repeat += " " + n.lower;
          i++;
        }
      }
      i++;
      continue;
    }
    if (p.type === TK_IDENT && ATTACHMENT_KEYWORDS.has(p.lower) && attachment === "") {
      attachment = p.lower;
      i++;
      continue;
    }
    if (p.type === TK_IDENT && BOX_KEYWORDS.has(p.lower)) {
      if (origin === "") origin = p.lower;
      else if (clip === "") clip = p.lower;
      else return null;
      i++;
      continue;
    }
    if (final && color === "") {
      const c = normalizeColor(p.text);
      if (c !== null && p.type !== TK_NUMBER) {
        color = c;
        i++;
        continue;
      }
    }
    return null;
  }
  if (clip === "" && origin !== "") clip = origin;
  const vals = [image, posX, posY, size, repeat, origin, clip, attachment, color];
  for (let k = 0; k < vals.length; k++) if (vals[k] === "") vals[k] = BACKGROUND_INITIAL[k];
  return vals;
}

const SYSTEM_FONTS = new Set(["caption", "icon", "menu", "message-box", "small-caption", "status-bar"]);
const FONT_STYLE = new Set(["italic", "oblique"]);
const FONT_VARIANT = new Set(["small-caps"]);
const FONT_WEIGHT = new Set(["bold", "bolder", "lighter"]);
const FONT_STRETCH = new Set([
  "ultra-condensed",
  "extra-condensed",
  "condensed",
  "semi-condensed",
  "semi-expanded",
  "expanded",
  "extra-expanded",
  "ultra-expanded",
]);

/** https://drafts.csswg.org/css-fonts-4/#font-prop → [style, variant, weight, size, line-height, family]. */
function expandFont(value: string): string[] | null {
  const parts = items(value);
  if (parts === null || parts.length < 2) return null;
  if (parts.length === 1 && parts[0].type === TK_IDENT && SYSTEM_FONTS.has(parts[0].lower)) return null;
  let style = "";
  let variant = "";
  let weight = "";
  let i = 0;
  let normals = 0;
  for (; i < parts.length && i < 4; i++) {
    const p = parts[i];
    if (p.type === TK_IDENT) {
      if (p.lower === "normal") {
        normals++;
        continue;
      }
      if (FONT_STYLE.has(p.lower) && style === "") {
        style = p.lower;
        continue;
      }
      if (FONT_VARIANT.has(p.lower) && variant === "") {
        variant = p.lower;
        continue;
      }
      if (FONT_WEIGHT.has(p.lower) && weight === "") {
        weight = p.lower;
        continue;
      }
      if (FONT_STRETCH.has(p.lower)) continue;
      break;
    }
    if (p.type === TK_NUMBER && weight === "" && p.num >= 1 && p.num <= 1000) {
      weight = formatNumber(p.num);
      continue;
    }
    break;
  }
  if (i >= parts.length) return null;
  const size = normalizeComponent(parts[i], grammarFor("font-size"));
  if (size === null) return null;
  i++;
  let lineHeight = "normal";
  if (i < parts.length && parts[i].type === TK_DELIM && parts[i].value === "/") {
    i++;
    if (i >= parts.length) return null;
    const lh = normalizeComponent(parts[i], grammarFor("line-height"));
    if (lh === null) return null;
    lineHeight = lh;
    i++;
  }
  if (i >= parts.length) return null;
  // The rest is the family list, kept verbatim (normalized separators).
  let family = "";
  for (; i < parts.length; i++) {
    const p = parts[i];
    if (p.type === TK_COMMA) {
      family += ",";
      continue;
    }
    if (p.type === TK_NUMBER || p.type === TK_DELIM) return null;
    const text = p.type === 5 /* string */ ? '"' + p.value.replace(/(["\\])/g, "\\$1") + '"' : p.text;
    family += family === "" || family.endsWith(",") ? (family === "" ? text : " " + text) : " " + text;
  }
  if (normals > 3) return null;
  return [style || "normal", variant || "normal", weight || "normal", size, lineHeight, family];
}

/**
 * Expands a shorthand value into longhand values aligned with `longhandsOf(name)`. Returns
 * null if invalid. (CSS-wide keywords and var() are handled by the caller.)
 */
export function expandShorthand(name: string, value: string): string[] | null {
  switch (name) {
    case "margin":
    case "padding":
    case "border-width":
    case "border-style":
    case "border-color":
      return expandBox(SHORTHANDS.get(name)!, value);
    case "border-top":
    case "border-right":
    case "border-bottom":
    case "border-left":
      return parseBorderSide(value);
    case "border": {
      const side = parseBorderSide(value);
      if (side === null) return null;
      return [
        side[0],
        side[0],
        side[0],
        side[0],
        side[1],
        side[1],
        side[1],
        side[1],
        side[2],
        side[2],
        side[2],
        side[2],
        "none",
      ];
    }
    case "flex":
      return expandFlex(value);
    case "background-position": {
      const parts = items(value);
      if (parts === null) return null;
      for (const p of parts) if (!isPositionComp(p)) return null;
      return parsePosition(parts);
    }
    case "background": {
      const parts = items(value);
      if (parts === null || parts.length === 0) return null;
      // Multiple layers: validate each, report "multi" so the caller stores the value as-is.
      let start = 0;
      let layers = 0;
      let last: string[] | null = null;
      for (let i = 0; i <= parts.length; i++) {
        if (i === parts.length || parts[i].type === TK_COMMA) {
          const layer = parseBackgroundLayer(parts.slice(start, i), i === parts.length);
          if (layer === null) return null;
          last = layer;
          layers++;
          start = i + 1;
        }
      }
      if (layers > 1) return MULTI_LAYER;
      return last;
    }
    case "font":
      return expandFont(value);
  }
  return null;
}

// --- cascade-only shorthands ----------------------------------------------------------------

/**
 * Shorthands that declaration blocks keep as one declaration (jsdom-compatible `cssText` /
 * `style.overflow` behavior, see the module comment) but that the cascade expands so computed
 * longhands are right (`outline: solid green` → `outline-color: rgb(0, 128, 0)`,
 * `overflow: hidden` → `overflow-x: hidden`). https://drafts.csswg.org/css-cascade-5/#shorthand
 */
const CASCADE_SHORTHANDS = new Map<string, string[]>([
  ["outline", ["outline-color", "outline-style", "outline-width"]],
  ["overflow", ["overflow-x", "overflow-y"]],
  ["gap", ["row-gap", "column-gap"]],
  ["inset", ["top", "right", "bottom", "left"]],
  ["list-style", ["list-style-position", "list-style-image", "list-style-type"]],
  ["flex-flow", ["flex-direction", "flex-wrap"]],
]);

/** One map of every shorthand the cascade records per longhand (expanded and cascade-only). */
export function pendingLonghandsMap(): Map<string, string[]> {
  return new Map([...SHORTHANDS, ...CASCADE_SHORTHANDS]);
}

/** Longhands the cascade records for a declaration of `name` (expanded or cascade-only shorthand), else undefined. */
export function cascadeLonghandsOf(name: string): string[] | undefined {
  return SHORTHANDS.get(name) ?? CASCADE_SHORTHANDS.get(name);
}

export function isCascadeOnlyShorthand(name: string): boolean {
  return CASCADE_SHORTHANDS.has(name);
}

const OVERFLOW_KEYWORDS = new Set(["visible", "hidden", "clip", "scroll", "auto", "overlay"]);
const FLEX_DIRECTIONS = new Set(["row", "row-reverse", "column", "column-reverse"]);
const FLEX_WRAPS = new Set(["nowrap", "wrap", "wrap-reverse"]);

/** Expands a cascade-only shorthand into values aligned with `cascadeLonghandsOf(name)`, or null if invalid. */
export function expandCascadeShorthand(name: string, value: string): string[] | null {
  switch (name) {
    case "outline": {
      // https://drafts.csswg.org/css-ui-4/#outline: <outline-color> || <outline-line-style> || <outline-line-width>
      const parts = items(value);
      if (parts === null || parts.length < 1 || parts.length > 3) return null;
      let width = "";
      let style = "";
      let color = "";
      const gw = grammarFor("outline-width");
      for (const p of parts) {
        if (p.type === TK_IDENT && (STYLE_KEYWORDS.has(p.lower) || p.lower === "auto") && p.lower !== "hidden") {
          if (style !== "") return null;
          style = p.lower;
          continue;
        }
        const w = normalizeComponent(p, gw);
        if (w !== null) {
          if (width !== "") return null;
          width = w;
          continue;
        }
        const c = normalizeColor(p.text);
        if (c !== null && p.type !== TK_NUMBER) {
          if (color !== "") return null;
          color = c;
          continue;
        }
        return null;
      }
      return [color || "currentcolor", style || "none", width || "medium"];
    }
    case "overflow":
    case "flex-flow": {
      // https://drafts.csswg.org/css-overflow-3/#propdef-overflow: <'overflow-block'>{1,2}
      // https://drafts.csswg.org/css-flexbox-1/#flex-flow-property: <'flex-direction'> || <'flex-wrap'>
      const parts = items(value);
      if (parts === null || parts.length < 1 || parts.length > 2) return null;
      for (const p of parts) if (p.type !== TK_IDENT) return null;
      if (name === "overflow") {
        for (const p of parts) if (!OVERFLOW_KEYWORDS.has(p.lower)) return null;
        return [parts[0].lower, (parts[1] ?? parts[0]).lower];
      }
      let dir = "";
      let wrap = "";
      for (const p of parts) {
        if (FLEX_DIRECTIONS.has(p.lower) && dir === "") dir = p.lower;
        else if (FLEX_WRAPS.has(p.lower) && wrap === "") wrap = p.lower;
        else return null;
      }
      return [dir || "row", wrap || "nowrap"];
    }
    case "gap": {
      // https://drafts.csswg.org/css-align-3/#gap-shorthand: <'row-gap'> <'column-gap'>?
      const parts = items(value);
      if (parts === null || parts.length < 1 || parts.length > 2) return null;
      const g = grammarFor("row-gap");
      const vals: string[] = [];
      for (const p of parts) {
        const v = normalizeComponent(p, g);
        if (v === null) return null;
        vals.push(v);
      }
      return [vals[0], vals[1] ?? vals[0]];
    }
    case "inset":
      // https://drafts.csswg.org/css-position-3/#inset-shorthands: <'top'>{1,4}
      return expandBox(CASCADE_SHORTHANDS.get("inset")!, value);
    case "list-style": {
      // https://drafts.csswg.org/css-lists-3/#list-style-property:
      // <'list-style-position'> || <'list-style-image'> || <'list-style-type'>; `none` sets
      // whichever of image/type is otherwise unset.
      const parts = items(value);
      if (parts === null || parts.length < 1 || parts.length > 3) return null;
      let position = "";
      let image = "";
      let type = "";
      let nones = 0;
      for (const p of parts) {
        if (p.type === TK_IDENT && (p.lower === "inside" || p.lower === "outside") && position === "")
          position = p.lower;
        else if (p.type === TK_IDENT && p.lower === "none") nones++;
        else if ((p.type === TK_URL || (p.type === TK_FUNCTION && IMAGE_FUNCTIONS.has(p.lower))) && image === "")
          image = p.type === TK_URL ? serializeUrl(p.value) : p.text;
        else if (
          (p.type === TK_IDENT || p.type === TK_STRING || (p.type === TK_FUNCTION && p.lower === "symbols")) &&
          type === ""
        )
          type = p.type === TK_IDENT ? p.lower : p.text;
        else return null;
      }
      if (nones > (image === "" ? 1 : 0) + (type === "" ? 1 : 0)) return null;
      if (nones !== 0) {
        if (image === "") image = "none";
        if (type === "") type = "none";
      }
      return [position || "outside", image || "none", type || "disc"];
    }
  }
  return null;
}

/** Computed-value serialization of a cascade-only shorthand from its computed longhands (Blink's order). */
export function serializeCascadeShorthand(name: string, v: string[]): string {
  switch (name) {
    case "overflow":
    case "gap":
      return v[0] === v[1] ? v[0] : v[0] + " " + v[1];
    case "inset":
      return serializeBox(v);
    case "outline":
    case "list-style":
    case "flex-flow":
      return v.join(" ");
  }
  return "";
}

/** Sentinel: a valid value that is stored unexpanded (multi-layer backgrounds). */
export const MULTI_LAYER: string[] = [];

// --- serialization ------------------------------------------------------------------------

function serializeBox(v: string[]): string {
  const [t, r, b, l] = v;
  if (l === r) {
    if (b === t) return r === t ? t : t + " " + r;
    return t + " " + r + " " + b;
  }
  return t + " " + r + " " + b + " " + l;
}

function serializeSide(w: string, s: string, c: string, computed: boolean): string {
  if (computed) return w + " " + s + " " + c;
  const parts: string[] = [];
  if (w !== "medium") parts.push(w);
  if (s !== "none") parts.push(s);
  if (c !== "currentcolor") parts.push(c);
  return parts.length === 0 ? w : parts.join(" ");
}

/**
 * Serializes an expanded shorthand from its longhand values (aligned with
 * `longhandsOf(name)`), or returns "" if the longhands cannot be represented.
 * `computed` selects computed-style serialization (no omission of initial values).
 */
export function serializeShorthand(name: string, v: string[], computed: boolean): string {
  // All longhands must agree on CSS-wide keywords.
  let wide = 0;
  for (const x of v) if (isCSSWideKeyword(x)) wide++;
  if (wide !== 0) {
    if (wide !== v.length) return "";
    for (const x of v) if (x !== v[0]) return "";
    return v[0];
  }
  switch (name) {
    case "margin":
    case "padding":
    case "border-width":
    case "border-style":
    case "border-color":
      return serializeBox(v);
    case "border-top":
    case "border-right":
    case "border-bottom":
    case "border-left":
      return serializeSide(v[0], v[1], v[2], computed);
    case "border":
      for (let i = 0; i < 3; i++) {
        const k = i * 4;
        if (v[k] !== v[k + 1] || v[k] !== v[k + 2] || v[k] !== v[k + 3]) return "";
      }
      if (v[12] !== "none") return "";
      return serializeSide(v[0], v[4], v[8], computed);
    case "flex":
      return v[0] + " " + v[1] + " " + v[2];
    case "background-position":
      return v[0] + " " + v[1];
    case "background": {
      if (computed) {
        return `${v[8]} ${v[0]} ${v[7]} ${v[4]} ${v[1]} ${v[2]} / ${v[3]} ${v[5]} ${v[6]}`.replace(/\s+/g, " ");
      }
      const parts: string[] = [];
      if (v[0] !== "none") parts.push(v[0]);
      const posDefault = v[1] === "0%" && v[2] === "0%";
      if (!posDefault || v[3] !== "auto") {
        parts.push(v[1] + " " + v[2] + (v[3] !== "auto" ? " / " + v[3] : ""));
      }
      if (v[4] !== "repeat") parts.push(v[4]);
      if (v[7] !== "scroll") parts.push(v[7]);
      if (v[5] !== "padding-box" || v[6] !== "border-box") {
        parts.push(v[5] === v[6] ? v[5] : v[5] + " " + v[6]);
      }
      if (v[8] !== "transparent" && v[8] !== "rgba(0, 0, 0, 0)") parts.push(v[8]);
      return parts.length === 0 ? "none" : parts.join(" ");
    }
    case "font": {
      const parts: string[] = [];
      if (v[0] !== "normal") parts.push(v[0]);
      if (v[1] !== "normal") parts.push(v[1]);
      if (v[2] !== "normal" && !(computed && v[2] === "400")) parts.push(v[2]);
      parts.push(v[3] + (v[4] !== "normal" ? " / " + v[4] : ""));
      parts.push(v[5]);
      return parts.join(" ");
    }
  }
  return "";
}

/** Normalizes a single longhand value from a shorthand component list (helper for callers). */
export function normalizeLonghandValue(name: string, value: string): string | null {
  return normalizeLonghand(name, value);
}
