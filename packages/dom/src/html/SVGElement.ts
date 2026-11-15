// SVG element interfaces (minimal: no geometry, no animation).
// https://svgwg.org/svg2-draft/types.html#InterfaceSVGElement
// https://svgwg.org/svg2-draft/types.html#InterfaceSVGGraphicsElement
// https://svgwg.org/svg2-draft/struct.html#InterfaceSVGSVGElement
//
// Enough for React/testing-library: correct interface per tag (instanceof checks), `className`
// as SVGAnimatedString, `style`, `dataset`, `tabIndex`/`focus()`/`blur()`, `ownerSVGElement`,
// `viewBox`/`preserveAspectRatio` (svg-types.ts), and geometry without layout: `getBBox()` is an
// empty DOMRect, `getCTM()`/`getScreenCTM()` the identity DOMMatrix, `getTotalLength()` 0. They
// are real DOMRect/DOMMatrix/DOMPoint objects, because code that finds `createSVGPoint` or
// `getScreenCTM` goes on to call `matrixTransform()` and `inverse()` on them (d3-selection's
// pointer(), visx's localPoint).

import { Element } from "../nodes/Element.ts";
import type { NodeImpl } from "../nodes/NodeImpl.ts";
import { CSSStyleDeclaration } from "../css/CSSStyleDeclaration.ts";
import { setAttribute } from "../nodes/attributes.ts";
import { ELEMENT_NODE, SVG_NS, XLINK_NS } from "../nodes/constants.ts";
import { contentAttr } from "./reflect.ts";
import { installHTMLOrSVGElement } from "./HTMLElement.ts";
import { $attr, $el, $impl, $style } from "../keys.ts";
import { DOMMatrix, DOMPoint, DOMRect } from "../window/geometry.ts";
import { SVGNumber, installFitToViewBox } from "./svg-types.ts";

/** https://svgwg.org/svg2-draft/types.html#InterfaceSVGAnimatedString */
export class SVGAnimatedString {
  [$el]: Element;
  [$attr]: string;
  constructor(el: Element, attr: string) {
    this[$el] = el;
    this[$attr] = attr;
  }
  get baseVal(): string {
    const impl = this[$el][$impl];
    if (this[$attr] === "href") return contentAttr(impl, "href") ?? xlinkHref(impl) ?? "";
    return contentAttr(impl, this[$attr]) ?? "";
  }
  set baseVal(v: string) {
    setAttribute(this[$el][$impl], this[$attr], String(v));
  }
  get animVal(): string {
    return this.baseVal;
  }
}

function xlinkHref(impl: NodeImpl): string | null {
  const attrs = impl.attrs;
  if (attrs === null) return null;
  for (let i = 0; i < attrs.length; i++)
    if (attrs[i].localName === "href" && attrs[i].ns === XLINK_NS) return attrs[i].value;
  return null;
}

const CLASS_NAME = Symbol("className");
const HREF = Symbol("href");

export class SVGElement extends Element {
  get style(): CSSStyleDeclaration {
    return (this[$style] ??= new CSSStyleDeclaration(this));
  }

  set style(value: string) {
    this.style.cssText = String(value);
  }

  /** https://svgwg.org/svg2-draft/types.html#__svg__SVGElement__className */
  override get className(): string {
    const rec = this as unknown as Record<symbol, SVGAnimatedString | undefined>;
    let v = rec[CLASS_NAME];
    if (v === undefined) {
      v = new SVGAnimatedString(this, "class");
      Object.defineProperty(this, CLASS_NAME, { value: v });
    }
    return v as unknown as string;
  }

  override set className(_value: string) {
    // [SameObject] readonly SVGAnimatedString: assignment is ignored (non-strict) as in browsers.
  }

  /** https://svgwg.org/svg2-draft/types.html#__svg__SVGElement__ownerSVGElement */
  get ownerSVGElement(): SVGSVGElement | null {
    for (let p = this[$impl].parent; p !== null && p.type === ELEMENT_NODE; p = p.parent) {
      if (p.ns === SVG_NS && p.name === "svg") return p.node as SVGSVGElement;
    }
    return null;
  }

  get viewportElement(): SVGElement | null {
    return this.ownerSVGElement;
  }
}
installHTMLOrSVGElement(SVGElement);

/** Elements with an `href` (SVGURIReference). */
function installURIReference(C: { prototype: object }): void {
  Object.defineProperty(C.prototype, "href", {
    get(this: SVGElement) {
      const rec = this as unknown as Record<symbol, SVGAnimatedString | undefined>;
      let v = rec[HREF];
      if (v === undefined) {
        v = new SVGAnimatedString(this, "href");
        Object.defineProperty(this, HREF, { value: v });
      }
      return v;
    },
    configurable: true,
    enumerable: true,
  });
}

export class SVGGraphicsElement extends SVGElement {
  /** https://svgwg.org/svg2-draft/types.html#__svg__SVGGraphicsElement__getBBox — no layout: an empty box. */
  getBBox(): DOMRect {
    return new DOMRect();
  }
  /** https://svgwg.org/svg2-draft/types.html#__svg__SVGGraphicsElement__getCTM — no layout: the identity. */
  getCTM(): DOMMatrix | null {
    return new DOMMatrix();
  }
  /** https://svgwg.org/svg2-draft/types.html#__svg__SVGGraphicsElement__getScreenCTM */
  getScreenCTM(): DOMMatrix | null {
    return new DOMMatrix();
  }
}

export class SVGGeometryElement extends SVGGraphicsElement {
  isPointInFill(): boolean {
    return false;
  }
  isPointInStroke(): boolean {
    return false;
  }
  getTotalLength(): number {
    return 0;
  }
  /** https://svgwg.org/svg2-draft/types.html#__svg__SVGGeometryElement__getPointAtLength */
  getPointAtLength(): DOMPoint {
    return new DOMPoint();
  }
}

export class SVGSVGElement extends SVGGraphicsElement {
  /** https://svgwg.org/svg2-draft/struct.html#__svg__SVGSVGElement__createSVGNumber */
  createSVGNumber(): SVGNumber {
    return new SVGNumber();
  }
  createSVGLength(): object {
    return { unitType: 0, value: 0, valueInSpecifiedUnits: 0, valueAsString: "0" };
  }
  createSVGAngle(): object {
    return { unitType: 0, value: 0, valueInSpecifiedUnits: 0, valueAsString: "0" };
  }
  /** https://svgwg.org/svg2-draft/struct.html#__svg__SVGSVGElement__createSVGPoint */
  createSVGPoint(): DOMPoint {
    return new DOMPoint();
  }
  /** https://svgwg.org/svg2-draft/struct.html#__svg__SVGSVGElement__createSVGMatrix */
  createSVGMatrix(): DOMMatrix {
    return new DOMMatrix();
  }
  /** https://svgwg.org/svg2-draft/struct.html#__svg__SVGSVGElement__createSVGRect */
  createSVGRect(): DOMRect {
    return new DOMRect();
  }
  // SVGLength, SVGAngle and SVGTransform are not implemented: plain records, with a real matrix.
  createSVGTransform(): object {
    return { type: 0, matrix: new DOMMatrix(), angle: 0 };
  }
  getIntersectionList(): unknown[] {
    return [];
  }
  getEnclosureList(): unknown[] {
    return [];
  }
  checkIntersection(): boolean {
    return false;
  }
  checkEnclosure(): boolean {
    return false;
  }
  deselectAll(): void {}
  suspendRedraw(): number {
    return 0;
  }
  unsuspendRedraw(): void {}
  unsuspendRedrawAll(): void {}
  forceRedraw(): void {}
  pauseAnimations(): void {}
  unpauseAnimations(): void {}
  animationsPaused(): boolean {
    return false;
  }
  getCurrentTime(): number {
    return 0;
  }
  setCurrentTime(): void {}
  getElementById(id: string): Element | null {
    const root = this[$impl];
    for (let n = root.first; n !== null; n = nextEl(n, root))
      if (n.type === ELEMENT_NODE && n.id === String(id)) return n.node as Element;
    return null;
  }
}

installFitToViewBox(SVGSVGElement);

function nextEl(n: NodeImpl, root: NodeImpl): NodeImpl | null {
  if (n.first !== null) return n.first;
  for (let c: NodeImpl | null = n; c !== null && c !== root; c = c.parent) if (c.next !== null) return c.next;
  return null;
}

export class SVGGElement extends SVGGraphicsElement {}
export class SVGDefsElement extends SVGGraphicsElement {}
export class SVGDescElement extends SVGElement {}
export class SVGMetadataElement extends SVGElement {}
export class SVGTitleElement extends SVGElement {}
export class SVGSymbolElement extends SVGGraphicsElement {}
installFitToViewBox(SVGSymbolElement);
export class SVGUseElement extends SVGGraphicsElement {}
installURIReference(SVGUseElement);
export class SVGSwitchElement extends SVGGraphicsElement {}
export class SVGImageElement extends SVGGraphicsElement {}
installURIReference(SVGImageElement);
export class SVGForeignObjectElement extends SVGGraphicsElement {}
export class SVGAElement extends SVGGraphicsElement {}
installURIReference(SVGAElement);
export class SVGPathElement extends SVGGeometryElement {}
export class SVGRectElement extends SVGGeometryElement {}
export class SVGCircleElement extends SVGGeometryElement {}
export class SVGEllipseElement extends SVGGeometryElement {}
export class SVGLineElement extends SVGGeometryElement {}
export class SVGPolylineElement extends SVGGeometryElement {}
export class SVGPolygonElement extends SVGGeometryElement {}
export class SVGTextContentElement extends SVGGraphicsElement {
  getNumberOfChars(): number {
    return (this.textContent ?? "").length;
  }
  getComputedTextLength(): number {
    return 0;
  }
  getSubStringLength(): number {
    return 0;
  }
}
export class SVGTextPositioningElement extends SVGTextContentElement {}
export class SVGTextElement extends SVGTextPositioningElement {}
export class SVGTSpanElement extends SVGTextPositioningElement {}
export class SVGTextPathElement extends SVGTextContentElement {}
installURIReference(SVGTextPathElement);
export class SVGMarkerElement extends SVGElement {}
installFitToViewBox(SVGMarkerElement);
export class SVGClipPathElement extends SVGElement {}
export class SVGMaskElement extends SVGElement {}
export class SVGPatternElement extends SVGElement {}
installFitToViewBox(SVGPatternElement);
installURIReference(SVGPatternElement);
export class SVGGradientElement extends SVGElement {}
installURIReference(SVGGradientElement);
export class SVGLinearGradientElement extends SVGGradientElement {}
export class SVGRadialGradientElement extends SVGGradientElement {}
export class SVGStopElement extends SVGElement {}
export class SVGStyleElement extends SVGElement {}
export class SVGScriptElement extends SVGElement {}
installURIReference(SVGScriptElement);
export class SVGViewElement extends SVGElement {}
installFitToViewBox(SVGViewElement);
export class SVGFilterElement extends SVGElement {}

/** SVG local name → interface. Unknown SVG names are SVGElement. */
export const svgElements: ReadonlyMap<string, new (...args: any[]) => Element> = new Map<
  string,
  new (...args: any[]) => Element
>([
  ["svg", SVGSVGElement],
  ["g", SVGGElement],
  ["defs", SVGDefsElement],
  ["desc", SVGDescElement],
  ["metadata", SVGMetadataElement],
  ["title", SVGTitleElement],
  ["symbol", SVGSymbolElement],
  ["use", SVGUseElement],
  ["switch", SVGSwitchElement],
  ["image", SVGImageElement],
  ["foreignObject", SVGForeignObjectElement],
  ["a", SVGAElement],
  ["path", SVGPathElement],
  ["rect", SVGRectElement],
  ["circle", SVGCircleElement],
  ["ellipse", SVGEllipseElement],
  ["line", SVGLineElement],
  ["polyline", SVGPolylineElement],
  ["polygon", SVGPolygonElement],
  ["text", SVGTextElement],
  ["tspan", SVGTSpanElement],
  ["textPath", SVGTextPathElement],
  ["marker", SVGMarkerElement],
  ["clipPath", SVGClipPathElement],
  ["mask", SVGMaskElement],
  ["pattern", SVGPatternElement],
  ["linearGradient", SVGLinearGradientElement],
  ["radialGradient", SVGRadialGradientElement],
  ["stop", SVGStopElement],
  ["style", SVGStyleElement],
  ["script", SVGScriptElement],
  ["view", SVGViewElement],
  ["filter", SVGFilterElement],
]);
