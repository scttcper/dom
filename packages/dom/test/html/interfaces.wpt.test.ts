/**
 * Element interfaces.
 *
 * Spec: HTML Standard §3.2.2 "Elements in the DOM" and the element index
 *   https://html.spec.whatwg.org/#elements-in-the-dom
 *   https://html.spec.whatwg.org/#element-interfaces
 * DOM Standard "create an element" (HTMLUnknownElement vs HTMLElement for custom element names)
 *   https://dom.spec.whatwg.org/#concept-create-element
 * WebIDL class strings: https://webidl.spec.whatwg.org/#dfn-class-string
 *
 * Ported from web-platform-tests html/semantics/interfaces.html; the element table is the
 * vendored interfaces.js (./wpt/semantics/interfaces.js, BSD-3-Clause).
 *   https://github.com/web-platform-tests/wpt/blob/master/html/semantics/interfaces.html
 */
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { createWindow } from "@ctrl/dom";

const table: [string, string][] = new Function(readFileSync(new URL("./wpt/semantics/interfaces.js", import.meta.url), "utf8") + "\nreturn elements;")();

// Elements with special parser insertion modes are skipped by the original test's parser variant.
const SKIP_PARSER = ["foo-BAR", "tbody", "td", "tfoot", "th", "thead", "tr", "å-bar", "caption", "col", "colgroup", "frame", "image", "frameset"];

const window = createWindow() as any;
const document = window.document;

function check(e: any, iface: string): void {
  const name = `HTML${iface}Element`;
  expect(Object.prototype.toString.call(e)).toBe(`[object ${name}]`);
  expect(e).toBeInstanceOf(window[name]);
  expect(e).toBeInstanceOf(window.HTMLElement);
  expect(e).toBeInstanceOf(window.Element);
  expect(e).toBeInstanceOf(window.Node);
}

describe("element interfaces — https://html.spec.whatwg.org/#element-interfaces", () => {
  for (const [localName, iface] of table) {
    test(`Interfaces for ${localName}: useNS`, () => {
      check(document.createElementNS("http://www.w3.org/1999/xhtml", localName), iface);
    });
    if (!SKIP_PARSER.includes(localName)) {
      test(`Interfaces for ${localName}: useParser`, () => {
        const doc = new window.DOMParser().parseFromString(`<${localName}>`, "text/html");
        check(doc.querySelector(localName), iface);
      });
    }
    if (localName === localName.toLowerCase()) {
      test(`Interfaces for ${localName.toUpperCase()}: createElement`, () => {
        check(document.createElement(localName.toUpperCase()), iface);
      });
    }
  }
});

describe("non-HTML namespaces — https://dom.spec.whatwg.org/#concept-create-element", () => {
  test("SVG elements get their SVG interface, unknown SVG names SVGElement", () => {
    const svg = "http://www.w3.org/2000/svg";
    expect(document.createElementNS(svg, "svg")).toBeInstanceOf(window.SVGSVGElement);
    expect(document.createElementNS(svg, "rect")).toBeInstanceOf(window.SVGGeometryElement);
    expect(document.createElementNS(svg, "g")).toBeInstanceOf(window.SVGGraphicsElement);
    expect(Object.prototype.toString.call(document.createElementNS(svg, "nope"))).toBe("[object SVGElement]");
  });

  test("MathML elements are MathMLElement; other namespaces plain Element", () => {
    expect(document.createElementNS("http://www.w3.org/1998/Math/MathML", "mi")).toBeInstanceOf(window.MathMLElement);
    const other = document.createElementNS("urn:x", "foo");
    expect(Object.getPrototypeOf(other)).toBe(window.Element.prototype);
  });

  test("the parser creates SVG elements with SVG interfaces", () => {
    document.body.innerHTML = "<svg><circle></circle><foreignObject><div></div></foreignObject></svg>";
    const svg = document.body.firstChild;
    expect(svg).toBeInstanceOf(window.SVGSVGElement);
    expect(svg.firstChild).toBeInstanceOf(window.SVGCircleElement);
    expect(svg.lastChild.firstChild).toBeInstanceOf(window.HTMLDivElement);
  });
});
