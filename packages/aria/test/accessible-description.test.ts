/**
 * Accessible description computation and `isDisabled`.
 *
 * Specs:
 *   https://w3c.github.io/accname/#mapping_additional_nd_description
 *   https://w3c.github.io/aria/#aria-describedby, https://w3c.github.io/aria/#aria-description
 *   https://www.w3.org/TR/html-aam-1.0/#accessible-name-and-description-computation (title)
 *   https://www.w3.org/TR/html-aam-1.0/#html-attribute-state-and-property-mappings (disabled)
 *
 * Originals (MIT):
 *   https://github.com/eps1lon/dom-accessibility-api/blob/main/sources/__tests__/accessible-description.js
 *   https://github.com/eps1lon/dom-accessibility-api/blob/main/sources/__tests__/is-disabled.js
 * `aria-description` support arrived in dom-accessibility-api 0.6.1: those cases are asserted
 * on `daa06` (jest-dom 7); the default export matches 0.5.16 (Testing Library 10.4).
 */
import { afterEach, describe, expect, test } from "vitest";
import { computeAccessibleDescription, daa06, isDisabled } from "@rtd/aria";
import type { Element } from "@rtd/dom";
import { makeDocument } from "./helpers.ts";

const { document, renderIntoDocument, cleanup } = makeDocument();

afterEach(cleanup);

function testNodeOf(markup: string): Element {
  return renderIntoDocument(markup).querySelector("[data-test]") as Element;
}

describe("wpt copies — https://w3c.github.io/accname/#mapping_additional_nd_description", () => {
  test.each([
    [`<img src="foo.jpg" data-test alt="test" aria-describedby="t1"><span id="t1" role="presentation">foo</span>`, "foo"],
    [`<img src="foo.jpg" data-test alt="test" aria-describedby="t1"><span id="t1" role="none">foo</span>`, "foo"],
    [`<a data-test href="#" aria-label="California" title="San Francisco" >United States</a>`, "San Francisco"],
    [`<button data-test href="#" aria-description="Paid feature">Deploy</button>`, "Paid feature"],
    [
      `<img src="foo.jpg" data-test alt="test" aria-description="bar" aria-describedby="t1"><span id="t1" role="presentation">foo</span>`,
      "foo",
    ],
  ])(`#%# (0.6.3)`, (markup, expected) => {
    expect(daa06.computeAccessibleDescription(testNodeOf(markup))).toBe(expected);
  });

  test("0.5.16 ignores aria-description (falls back to title / empty)", () => {
    expect(computeAccessibleDescription(testNodeOf(`<button data-test aria-description="Paid feature">Deploy</button>`))).toBe("");
    expect(
      computeAccessibleDescription(testNodeOf(`<button data-test aria-description="Paid feature" title="t">Deploy</button>`)),
    ).toBe("t");
  });

  test("multiple aria-describedby references are joined with a space", () => {
    expect(
      computeAccessibleDescription(
        testNodeOf(`<button data-test aria-describedby="a b">x</button><p id="a">first</p><p id="b">second <em>part</em></p>`),
      ),
    ).toBe("first second part");
  });

  test("hidden referenced elements still contribute (2A does not apply to referenced roots)", () => {
    expect(
      computeAccessibleDescription(testNodeOf(`<button data-test aria-describedby="a">x</button><p id="a" hidden>secret</p>`)),
    ).toBe("secret");
  });
});

describe("content in shadow DOM — https://w3c.github.io/accname/#mapping_additional_nd_description", () => {
  test("works for aria-describedby on elements in same shadow root", () => {
    const container = renderIntoDocument("<div></div>");
    const div = container.querySelector("div")!;
    div.attachShadow({ mode: "open" }).innerHTML = `
			<div id="theDescription">This is a button</div>
			<button aria-describedby="theDescription">Click me</button>
		`;
    const button = div.shadowRoot!.querySelector("button");
    expect(computeAccessibleDescription(button as Element)).toEqual("This is a button");
  });
});

describe("isDisabled — https://www.w3.org/TR/html-aam-1.0/#html-attribute-state-and-property-mappings", () => {
  test.each([
    ["<button data-test />", false],
    ['<button data-test aria-disabled="true" />', true],
    ['<button data-test disabled="true" />', true],
    ["<button data-test disabled />", true],
    ['<button data-test aria-disabled="false" />', false],
    ["<div data-test disabled />", false],
  ])("markup #%#", (markup, expected) => {
    expect(isDisabled(testNodeOf(markup))).toBe(expected);
  });
});

void document;
