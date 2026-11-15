/**
 * SVG geometry, viewBox and preserveAspectRatio.
 *
 * Specs:
 *   SVG 2 SVGGraphicsElement — https://svgwg.org/svg2-draft/types.html#InterfaceSVGGraphicsElement
 *   SVG 2 SVGSVGElement — https://svgwg.org/svg2-draft/struct.html#InterfaceSVGSVGElement
 *   SVG 2 SVGNumber — https://svgwg.org/svg2-draft/types.html#InterfaceSVGNumber
 *   SVG 2 SVGAnimatedRect — https://svgwg.org/svg2-draft/types.html#InterfaceSVGAnimatedRect
 *   SVG 2 viewBox — https://svgwg.org/svg2-draft/coords.html#ViewBoxAttribute
 *   SVG 2 SVGFitToViewBox — https://svgwg.org/svg2-draft/coords.html#InterfaceSVGFitToViewBox
 *   SVG 2 SVGPreserveAspectRatio — https://svgwg.org/svg2-draft/coords.html#InterfaceSVGPreserveAspectRatio
 *   Geometry legacy alias SVGRect — https://drafts.csswg.org/geometry/#DOMRect
 *
 * Without layout, geometry is an empty box and the identity matrix, but as real DOMRect /
 * DOMMatrix / DOMPoint objects: libraries that find `createSVGPoint` / `getScreenCTM` go on to
 * call `matrixTransform()` and `inverse()` on them (d3-selection's pointer(), visx's localPoint),
 * and fall back only where the methods are missing (jsdom).
 */
import { beforeEach, describe, expect, test } from "vitest";
import {
  createWindow,
  DOMMatrix,
  DOMPoint,
  DOMRect,
  DOMRectReadOnly,
  SVGPreserveAspectRatio,
  SVGRect,
  type Document,
} from "@ctrl/dom";

const SVG_NS = "http://www.w3.org/2000/svg";
let document: Document;

beforeEach(() => {
  document = createWindow().document;
});

function svg(markup: string): any {
  document.body!.innerHTML = markup;
  return document.body!.firstElementChild!;
}

describe("geometry without layout — https://svgwg.org/svg2-draft/types.html#InterfaceSVGGraphicsElement", () => {
  test("getBBox() is an empty DOMRect; getCTM()/getScreenCTM() the identity DOMMatrix; getPointAtLength() a DOMPoint", () => {
    const root = svg(`<svg><circle r="2"/><path d="M0 0"/></svg>`) as any;
    const circle = root.firstElementChild;
    expect(circle.getBBox()).toBeInstanceOf(DOMRect);
    expect(circle.getBBox().toJSON()).toMatchObject({ x: 0, y: 0, width: 0, height: 0 });
    for (const m of [circle.getCTM(), circle.getScreenCTM()]) {
      expect(m).toBeInstanceOf(DOMMatrix);
      expect(m.isIdentity).toBe(true);
      expect(m.is2D).toBe(true);
    }
    expect(root.lastElementChild.getPointAtLength(1)).toBeInstanceOf(DOMPoint);
  });

  test("createSVGPoint/Matrix/Rect return DOMPoint/DOMMatrix/DOMRect (https://svgwg.org/svg2-draft/struct.html#InterfaceSVGSVGElement)", () => {
    const root = svg(`<svg/>`) as any;
    expect(root.createSVGPoint()).toBeInstanceOf(DOMPoint);
    expect(root.createSVGMatrix()).toBeInstanceOf(DOMMatrix);
    expect(root.createSVGMatrix().isIdentity).toBe(true);
    expect(root.createSVGRect()).toBeInstanceOf(DOMRect);
    expect(root.createSVGRect()).toBeInstanceOf(SVGRect);
    expect(root.createSVGTransform().matrix).toBeInstanceOf(DOMMatrix);
  });

  test("d3-selection pointer(): point.matrixTransform(node.getScreenCTM().inverse()) works", () => {
    const root = svg(`<svg><circle r="2"/></svg>`) as any;
    const node = root.firstElementChild;
    // https://github.com/d3/d3-selection/blob/main/src/pointer.js
    let point = root.createSVGPoint();
    point.x = 5;
    point.y = 6;
    point = point.matrixTransform(node.getScreenCTM().inverse());
    expect([point.x, point.y]).toEqual([5, 6]);
  });

  test("createSVGNumber() is an SVGNumber whose value is a WebIDL float (https://svgwg.org/svg2-draft/types.html#InterfaceSVGNumber)", () => {
    const n = (svg(`<svg/>`) as any).createSVGNumber();
    expect(Object.prototype.toString.call(n)).toBe("[object SVGNumber]");
    expect(n.value).toBe(0);
    n.value = 1.1;
    expect(n.value).toBe(Math.fround(1.1));
    expect(() => {
      n.value = Number.NaN;
    }).toThrow(TypeError);
  });
});

describe("viewBox — https://svgwg.org/svg2-draft/types.html#InterfaceSVGAnimatedRect", () => {
  test("viewBox is a [SameObject] SVGAnimatedRect whose baseVal is a [SameObject] DOMRect (legacy SVGRect) reflecting the attribute", () => {
    const root = svg(`<svg viewBox="0 0 10 20"/>`) as any;
    const vb = root.viewBox;
    expect(Object.prototype.toString.call(vb)).toBe("[object SVGAnimatedRect]");
    expect(root.viewBox).toBe(vb);
    expect(vb.baseVal).toBe(vb.baseVal);
    expect(vb.baseVal).toBeInstanceOf(DOMRect);
    expect(vb.baseVal).toBeInstanceOf(SVGRect);
    expect(vb.baseVal.constructor).toBe(DOMRect);
    expect(vb.baseVal.toJSON()).toEqual({ x: 0, y: 0, width: 10, height: 20, top: 0, right: 10, bottom: 20, left: 0 });
    root.setAttribute("viewBox", "1,2 3 4");
    expect([vb.baseVal.x, vb.baseVal.y, vb.baseVal.width, vb.baseVal.height]).toEqual([1, 2, 3, 4]);
  });

  test("d3-zoom defaultExtent reads viewBox.baseVal", () => {
    const e = svg(`<svg viewBox="0 0 10 20"/>`) as any;
    // https://github.com/d3/d3-zoom/blob/main/src/zoom.js
    const extent = e.hasAttribute("viewBox")
      ? [
          [e.viewBox.baseVal.x, e.viewBox.baseVal.y],
          [e.viewBox.baseVal.x + e.viewBox.baseVal.width, e.viewBox.baseVal.y + e.viewBox.baseVal.height],
        ]
      : null;
    expect(extent).toEqual([
      [0, 0],
      [10, 20],
    ]);
  });

  test("setting baseVal members reserializes the attribute (https://svgwg.org/svg2-draft/types.html#TermReserialize)", () => {
    const root = svg(`<svg viewBox="0 0 10 20"/>`) as any;
    root.viewBox.baseVal.width = 30;
    expect(root.getAttribute("viewBox")).toBe("0 0 30 20");
  });

  test("a missing or invalid value, or a negative width or height, is the zero rect (https://svgwg.org/svg2-draft/coords.html#ViewBoxAttribute)", () => {
    for (const value of [null, "", "0 0 10", "0 0 -1 5", "0 0 1 2 junk", "a b c d"]) {
      const root = document.createElementNS(SVG_NS, "svg") as any;
      if (value !== null) root.setAttribute("viewBox", value);
      expect(root.viewBox.baseVal.toJSON()).toMatchObject({ x: 0, y: 0, width: 0, height: 0 });
    }
  });

  test("animVal is a read-only DOMRectReadOnly view of the same attribute", () => {
    const root = svg(`<svg viewBox="1 2 3 4"/>`) as any;
    const anim = root.viewBox.animVal;
    expect(anim).toBeInstanceOf(DOMRectReadOnly);
    expect(anim).not.toBeInstanceOf(DOMRect);
    expect(anim.width).toBe(3);
    expect(Object.keys(anim)).toEqual([]);
  });

  test("the SVGFitToViewBox hosts are svg, symbol, marker, pattern and view (https://svgwg.org/svg2-draft/coords.html#InterfaceSVGFitToViewBox)", () => {
    for (const name of ["svg", "symbol", "marker", "pattern", "view"]) {
      expect("viewBox" in document.createElementNS(SVG_NS, name)).toBe(true);
    }
    expect("viewBox" in document.createElementNS(SVG_NS, "g")).toBe(false);
  });
});

describe("preserveAspectRatio — https://svgwg.org/svg2-draft/coords.html#InterfaceSVGPreserveAspectRatio", () => {
  test("baseVal reads the attribute, defaulting to xMidYMid meet", () => {
    const root = svg(`<svg preserveAspectRatio="xMinYMax slice"/>`) as any;
    const par = root.preserveAspectRatio.baseVal;
    expect(par.align).toBe(SVGPreserveAspectRatio.SVG_PRESERVEASPECTRATIO_XMINYMAX);
    expect(par.meetOrSlice).toBe(par.SVG_MEETORSLICE_SLICE);
    root.removeAttribute("preserveAspectRatio");
    expect(par.align).toBe(SVGPreserveAspectRatio.SVG_PRESERVEASPECTRATIO_XMIDYMID);
    expect(par.meetOrSlice).toBe(SVGPreserveAspectRatio.SVG_MEETORSLICE_MEET);
  });

  test("setting align/meetOrSlice rewrites the attribute; unknown values are a TypeError; animVal is read-only", () => {
    const root = svg(`<svg/>`) as any;
    const par = root.preserveAspectRatio.baseVal;
    par.align = SVGPreserveAspectRatio.SVG_PRESERVEASPECTRATIO_NONE;
    expect(root.getAttribute("preserveAspectRatio")).toBe("none meet");
    par.meetOrSlice = SVGPreserveAspectRatio.SVG_MEETORSLICE_SLICE;
    expect(root.getAttribute("preserveAspectRatio")).toBe("none slice");
    expect(() => {
      par.align = 0;
    }).toThrow(TypeError);
    expect(() => {
      root.preserveAspectRatio.animVal.align = 2;
    }).toThrow(expect.objectContaining({ name: "NoModificationAllowedError" }));
  });

  test("the constants are on the interface object and the prototype (https://webidl.spec.whatwg.org/#es-constants)", () => {
    const d = Object.getOwnPropertyDescriptor(SVGPreserveAspectRatio.prototype, "SVG_PRESERVEASPECTRATIO_XMAXYMAX");
    expect(d).toEqual({ value: 10, writable: false, enumerable: true, configurable: false });
    expect(SVGPreserveAspectRatio.SVG_MEETORSLICE_UNKNOWN).toBe(0);
  });
});
