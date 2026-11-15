// SVG value interfaces that reflect attributes: SVGNumber, SVGAnimatedRect (viewBox) and
// SVGAnimatedPreserveAspectRatio / SVGPreserveAspectRatio (preserveAspectRatio), plus the
// SVGFitToViewBox mixin that puts `viewBox` and `preserveAspectRatio` on <svg>, <symbol>,
// <marker>, <pattern> and <view>.
// https://svgwg.org/svg2-draft/types.html#InterfaceSVGNumber
// https://svgwg.org/svg2-draft/types.html#InterfaceSVGAnimatedRect
// https://svgwg.org/svg2-draft/coords.html#InterfaceSVGFitToViewBox
// https://svgwg.org/svg2-draft/coords.html#InterfaceSVGPreserveAspectRatio
//
// The viewBox and preserveAspectRatio parsing and reserialization follow jsdom's
// lib/jsdom/living/svg (MIT, https://github.com/jsdom/jsdom), which code written for jsdom expects.

import type { Element } from "../nodes/Element.ts";
import { setAttribute } from "../nodes/attributes.ts";
import { DOMRect, DOMRectReadOnly } from "../window/geometry.ts";
import { defineConstants, defineInterfaceShape, exposeMembers } from "../webidl-runtime.ts";
import { contentAttr } from "./reflect.ts";
import { $impl } from "../keys.ts";

/** https://svgwg.org/svg2-draft/types.html#InterfaceSVGNumber — a standalone number (createSVGNumber()). */
export class SVGNumber {
  #value = 0;

  get value(): number {
    return this.#value;
  }
  set value(v: number) {
    // WebIDL `float`: https://webidl.spec.whatwg.org/#es-float
    const n = Number(v);
    if (!Number.isFinite(n)) {
      throw new TypeError("Failed to set the 'value' property on 'SVGNumber': The provided float value is non-finite.");
    }
    this.#value = Math.fround(n);
  }
}

// --- viewBox -----------------------------------------------------------------------------------

const WS = "[ \\t\\n\\r\\f]";
const NUM = "[+-]?(?:\\d*\\.)?\\d+(?:[eE][+-]?\\d+)?";
const SEP = `(?:${WS}*,${WS}*|${WS}+)`;
const VIEW_BOX = new RegExp(`^${WS}*(${NUM})${SEP}(${NUM})${SEP}(${NUM})${SEP}(${NUM})${WS}*$`);

/**
 * https://svgwg.org/svg2-draft/coords.html#ViewBoxAttribute — four numbers separated by
 * whitespace and/or a comma. A missing or invalid value, or a negative width or height, is the
 * zero rect.
 */
function parseViewBox(el: Element, attr: string): [number, number, number, number] {
  const m = VIEW_BOX.exec(contentAttr(el[$impl], attr) ?? "");
  if (m !== null) {
    const width = Number(m[3]);
    const height = Number(m[4]);
    if (width >= 0 && height >= 0) return [Number(m[1]), Number(m[2]), width, height];
  }
  return [0, 0, 0, 0];
}

function writeViewBox(el: Element, attr: string, index: number, value: number): void {
  const r = parseViewBox(el, attr);
  r[index] = Number(value);
  setAttribute(el[$impl], attr, `${r[0]} ${r[1]} ${r[2]} ${r[3]}`);
}

/**
 * `viewBox.baseVal`: a DOMRect whose members read the attribute and whose setters reserialize it
 * (https://svgwg.org/svg2-draft/types.html#TermReserialize). It is a DOMRect (so also the
 * legacy SVGRect), with `constructor` pointing at DOMRect; only its prototype object is internal.
 */
class ReflectedRect extends DOMRect {
  #el: Element;
  #attr: string;
  constructor(el: Element, attr: string) {
    super();
    this.#el = el;
    this.#attr = attr;
  }
  override get x(): number {
    return parseViewBox(this.#el, this.#attr)[0];
  }
  override set x(v: number) {
    writeViewBox(this.#el, this.#attr, 0, v);
  }
  override get y(): number {
    return parseViewBox(this.#el, this.#attr)[1];
  }
  override set y(v: number) {
    writeViewBox(this.#el, this.#attr, 1, v);
  }
  override get width(): number {
    return parseViewBox(this.#el, this.#attr)[2];
  }
  override set width(v: number) {
    writeViewBox(this.#el, this.#attr, 2, v);
  }
  override get height(): number {
    return parseViewBox(this.#el, this.#attr)[3];
  }
  override set height(v: number) {
    writeViewBox(this.#el, this.#attr, 3, v);
  }
  override get top(): number {
    const r = parseViewBox(this.#el, this.#attr);
    return Math.min(r[1], r[1] + r[3]);
  }
  override get right(): number {
    const r = parseViewBox(this.#el, this.#attr);
    return Math.max(r[0], r[0] + r[2]);
  }
  override get bottom(): number {
    const r = parseViewBox(this.#el, this.#attr);
    return Math.max(r[1], r[1] + r[3]);
  }
  override get left(): number {
    const r = parseViewBox(this.#el, this.#attr);
    return Math.min(r[0], r[0] + r[2]);
  }
  override toJSON(): Record<string, number> {
    return new DOMRectReadOnly(this.x, this.y, this.width, this.height).toJSON();
  }
}

/** `viewBox.animVal`: the read-only view of the same attribute (no animation, so equal to baseVal). */
class ReflectedRectReadOnly extends DOMRectReadOnly {
  #el: Element;
  #attr: string;
  constructor(el: Element, attr: string) {
    super();
    this.#el = el;
    this.#attr = attr;
  }
  override get x(): number {
    return parseViewBox(this.#el, this.#attr)[0];
  }
  override get y(): number {
    return parseViewBox(this.#el, this.#attr)[1];
  }
  override get width(): number {
    return parseViewBox(this.#el, this.#attr)[2];
  }
  override get height(): number {
    return parseViewBox(this.#el, this.#attr)[3];
  }
  override get top(): number {
    const r = parseViewBox(this.#el, this.#attr);
    return Math.min(r[1], r[1] + r[3]);
  }
  override get right(): number {
    const r = parseViewBox(this.#el, this.#attr);
    return Math.max(r[0], r[0] + r[2]);
  }
  override get bottom(): number {
    const r = parseViewBox(this.#el, this.#attr);
    return Math.max(r[1], r[1] + r[3]);
  }
  override get left(): number {
    const r = parseViewBox(this.#el, this.#attr);
    return Math.min(r[0], r[0] + r[2]);
  }
  override toJSON(): Record<string, number> {
    return new DOMRectReadOnly(this.x, this.y, this.width, this.height).toJSON();
  }
}

// Attributes are enumerable as on DOMRect (WebIDL), and `constructor` is the public interface.
exposeMembers(ReflectedRect, ReflectedRectReadOnly);
Object.defineProperty(ReflectedRect.prototype, "constructor", { value: DOMRect, configurable: true, writable: true });
Object.defineProperty(ReflectedRectReadOnly.prototype, "constructor", {
  value: DOMRectReadOnly,
  configurable: true,
  writable: true,
});

/** https://svgwg.org/svg2-draft/types.html#InterfaceSVGAnimatedRect */
export class SVGAnimatedRect {
  #el: Element;
  #attr: string;
  #base: DOMRect | null = null;
  #anim: DOMRectReadOnly | null = null;

  constructor(el: Element, attr: string) {
    this.#el = el;
    this.#attr = attr;
  }

  /** [SameObject] */
  get baseVal(): DOMRect {
    return (this.#base ??= new ReflectedRect(this.#el, this.#attr));
  }

  /** [SameObject] */
  get animVal(): DOMRectReadOnly {
    return (this.#anim ??= new ReflectedRectReadOnly(this.#el, this.#attr));
  }
}

// --- preserveAspectRatio -----------------------------------------------------------------------

const ALIGN = [
  "unknown",
  "none",
  "xMinYMin",
  "xMidYMin",
  "xMaxYMin",
  "xMinYMid",
  "xMidYMid",
  "xMaxYMid",
  "xMinYMax",
  "xMidYMax",
  "xMaxYMax",
];
const MEET_OR_SLICE = ["unknown", "meet", "slice"];
// https://svgwg.org/svg2-draft/coords.html#PreserveAspectRatioAttribute
const PRESERVE_ASPECT_RATIO = /^(none|x(?:Min|Mid|Max)Y(?:Min|Mid|Max))(?: +(meet|slice))?$/;

/** The parsed attribute: `xMidYMid meet` when missing or invalid. */
function parsePreserveAspectRatio(el: Element): [string, string] {
  const m = PRESERVE_ASPECT_RATIO.exec(contentAttr(el[$impl], "preserveAspectRatio") ?? "");
  return m === null ? ["xMidYMid", "meet"] : [m[1], m[2] ?? "meet"];
}

/** https://svgwg.org/svg2-draft/coords.html#InterfaceSVGPreserveAspectRatio */
export class SVGPreserveAspectRatio {
  // WebIDL constants, on the interface object and the prototype: defineConstants below.
  declare static readonly SVG_PRESERVEASPECTRATIO_UNKNOWN: number;
  declare static readonly SVG_PRESERVEASPECTRATIO_NONE: number;
  declare static readonly SVG_PRESERVEASPECTRATIO_XMINYMIN: number;
  declare static readonly SVG_PRESERVEASPECTRATIO_XMIDYMIN: number;
  declare static readonly SVG_PRESERVEASPECTRATIO_XMAXYMIN: number;
  declare static readonly SVG_PRESERVEASPECTRATIO_XMINYMID: number;
  declare static readonly SVG_PRESERVEASPECTRATIO_XMIDYMID: number;
  declare static readonly SVG_PRESERVEASPECTRATIO_XMAXYMID: number;
  declare static readonly SVG_PRESERVEASPECTRATIO_XMINYMAX: number;
  declare static readonly SVG_PRESERVEASPECTRATIO_XMIDYMAX: number;
  declare static readonly SVG_PRESERVEASPECTRATIO_XMAXYMAX: number;
  declare static readonly SVG_MEETORSLICE_UNKNOWN: number;
  declare static readonly SVG_MEETORSLICE_MEET: number;
  declare static readonly SVG_MEETORSLICE_SLICE: number;
  declare readonly SVG_PRESERVEASPECTRATIO_UNKNOWN: number;
  declare readonly SVG_PRESERVEASPECTRATIO_NONE: number;
  declare readonly SVG_PRESERVEASPECTRATIO_XMINYMIN: number;
  declare readonly SVG_PRESERVEASPECTRATIO_XMIDYMIN: number;
  declare readonly SVG_PRESERVEASPECTRATIO_XMAXYMIN: number;
  declare readonly SVG_PRESERVEASPECTRATIO_XMINYMID: number;
  declare readonly SVG_PRESERVEASPECTRATIO_XMIDYMID: number;
  declare readonly SVG_PRESERVEASPECTRATIO_XMAXYMID: number;
  declare readonly SVG_PRESERVEASPECTRATIO_XMINYMAX: number;
  declare readonly SVG_PRESERVEASPECTRATIO_XMIDYMAX: number;
  declare readonly SVG_PRESERVEASPECTRATIO_XMAXYMAX: number;
  declare readonly SVG_MEETORSLICE_UNKNOWN: number;
  declare readonly SVG_MEETORSLICE_MEET: number;
  declare readonly SVG_MEETORSLICE_SLICE: number;

  #el: Element;
  #readOnly: boolean;

  constructor(el: Element, readOnly: boolean) {
    this.#el = el;
    this.#readOnly = readOnly;
  }

  get align(): number {
    return ALIGN.indexOf(parsePreserveAspectRatio(this.#el)[0]);
  }
  set align(value: number) {
    this.#write(ALIGN, value, 0, "Invalid alignment");
  }

  get meetOrSlice(): number {
    return MEET_OR_SLICE.indexOf(parsePreserveAspectRatio(this.#el)[1]);
  }
  set meetOrSlice(value: number) {
    this.#write(MEET_OR_SLICE, value, 1, "Invalid meet-or-slice value");
  }

  #write(names: string[], value: number, index: 0 | 1, error: string): void {
    if (this.#readOnly) {
      throw new DOMException("Attempting to modify a read-only SVGPreserveAspectRatio", "NoModificationAllowedError");
    }
    // `unsigned short`: https://webidl.spec.whatwg.org/#es-unsigned-short
    const name = names[Number(value) & 0xffff];
    if (name === undefined || name === "unknown") throw new TypeError(error);
    const parts = parsePreserveAspectRatio(this.#el);
    parts[index] = name;
    setAttribute(this.#el[$impl], "preserveAspectRatio", `${parts[0]} ${parts[1]}`);
  }
}

defineConstants(SVGPreserveAspectRatio, {
  SVG_PRESERVEASPECTRATIO_UNKNOWN: 0,
  SVG_PRESERVEASPECTRATIO_NONE: 1,
  SVG_PRESERVEASPECTRATIO_XMINYMIN: 2,
  SVG_PRESERVEASPECTRATIO_XMIDYMIN: 3,
  SVG_PRESERVEASPECTRATIO_XMAXYMIN: 4,
  SVG_PRESERVEASPECTRATIO_XMINYMID: 5,
  SVG_PRESERVEASPECTRATIO_XMIDYMID: 6,
  SVG_PRESERVEASPECTRATIO_XMAXYMID: 7,
  SVG_PRESERVEASPECTRATIO_XMINYMAX: 8,
  SVG_PRESERVEASPECTRATIO_XMIDYMAX: 9,
  SVG_PRESERVEASPECTRATIO_XMAXYMAX: 10,
  SVG_MEETORSLICE_UNKNOWN: 0,
  SVG_MEETORSLICE_MEET: 1,
  SVG_MEETORSLICE_SLICE: 2,
});

/** https://svgwg.org/svg2-draft/types.html#InterfaceSVGAnimatedPreserveAspectRatio */
export class SVGAnimatedPreserveAspectRatio {
  #el: Element;
  #base: SVGPreserveAspectRatio | null = null;
  #anim: SVGPreserveAspectRatio | null = null;

  constructor(el: Element) {
    this.#el = el;
  }

  /** [SameObject] */
  get baseVal(): SVGPreserveAspectRatio {
    return (this.#base ??= new SVGPreserveAspectRatio(this.#el, false));
  }

  /** [SameObject] */
  get animVal(): SVGPreserveAspectRatio {
    return (this.#anim ??= new SVGPreserveAspectRatio(this.#el, true));
  }
}

// --- SVGFitToViewBox ---------------------------------------------------------------------------

const VIEW_BOX_KEY = Symbol("viewBox");
const PRESERVE_ASPECT_RATIO_KEY = Symbol("preserveAspectRatio");

type Cache = Record<symbol, unknown>;

/** Install the SVGFitToViewBox mixin's [SameObject] `viewBox` and `preserveAspectRatio`. */
export function installFitToViewBox(C: { prototype: object }): void {
  Object.defineProperty(C.prototype, "viewBox", {
    get(this: Element): SVGAnimatedRect {
      let v = (this as unknown as Cache)[VIEW_BOX_KEY] as SVGAnimatedRect | undefined;
      if (v === undefined) {
        v = new SVGAnimatedRect(this, "viewBox");
        Object.defineProperty(this, VIEW_BOX_KEY, { value: v });
      }
      return v;
    },
    configurable: true,
    enumerable: true,
  });
  Object.defineProperty(C.prototype, "preserveAspectRatio", {
    get(this: Element): SVGAnimatedPreserveAspectRatio {
      let v = (this as unknown as Cache)[PRESERVE_ASPECT_RATIO_KEY] as SVGAnimatedPreserveAspectRatio | undefined;
      if (v === undefined) {
        v = new SVGAnimatedPreserveAspectRatio(this);
        Object.defineProperty(this, PRESERVE_ASPECT_RATIO_KEY, { value: v });
      }
      return v;
    },
    configurable: true,
    enumerable: true,
  });
}

exposeMembers(SVGNumber, SVGAnimatedRect, SVGPreserveAspectRatio, SVGAnimatedPreserveAspectRatio);
for (const C of [SVGNumber, SVGAnimatedRect, SVGPreserveAspectRatio, SVGAnimatedPreserveAspectRatio]) {
  defineInterfaceShape(C);
}
