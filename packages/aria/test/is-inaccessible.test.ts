/**
 * Accessibility tree exclusion (`isInaccessible`, `isSubtreeInaccessible`).
 *
 * Spec: WAI-ARIA 1.2 §7.1 "Excluding Elements from the Accessibility Tree"
 *   https://www.w3.org/TR/wai-aria-1.2/#tree_exclusion
 *   https://html.spec.whatwg.org/multipage/interaction.html#the-hidden-attribute
 *   https://drafts.csswg.org/css-display/#visibility (visibility is inherited)
 *
 * Original: https://github.com/eps1lon/dom-accessibility-api/blob/main/sources/__tests__/is-inaccessible.js
 * (MIT). Assertions kept; `jest` → `vi`.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { isInaccessible, isSubtreeInaccessible } from "@ctrl/dom/aria";
import type { Element } from "@ctrl/dom";
import { makeDocument } from "./helpers.ts";

const { document, renderIntoDocument, cleanup } = makeDocument();

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

function testNodeOf(markup: string): Element {
  const container = renderIntoDocument(markup);
  expect(container).not.toBe(null);
  return container.querySelector("[data-test]") as Element;
}

describe("isInaccessible — https://www.w3.org/TR/wai-aria-1.2/#tree_exclusion", () => {
  test.each([
    ["<div data-test />", false],
    ['<div data-test aria-hidden="false" />', false],
    ['<div data-test style="visibility: visible" />', false],
    ['<div style="visibility: hidden;"><div data-test style="visibility: visible;"/></div>', false],
    ["<div data-test hidden />", true],
    ['<div data-test style="display: none;"/>', true],
    ['<div data-test style="visibility: hidden;"/>', true],
    ['<div data-test aria-hidden="true" />', true],
  ])("markup #%#", (markup, expectedIsInaccessible) => {
    expect(isInaccessible(testNodeOf(markup))).toBe(expectedIsInaccessible);
  });

  test("isSubtreeInaccessible implementation can be injected", () => {
    const testNode = testNodeOf(`<div style="display: none;"><button data-test /></div>`);
    // accessible since we ignored styles
    expect(isInaccessible(testNode, { isSubtreeInaccessible: () => false })).toBe(false);
  });

  test("window.getComputedStyle implementation can be injected", () => {
    const testNode = testNodeOf(`<button data-test style="display: none;" />`);
    // accessible since we ignored styles: mock `getComputedStyle` with an empty declaration
    const fake = vi.fn(() => ({ getPropertyValue: () => "" }));
    expect(isInaccessible(testNode, { getComputedStyle: fake })).toBe(false);
    expect(fake).toHaveBeenCalled();
  });

  test("throws if ownerDocument is not associated to a window", () => {
    expect(() => isInaccessible(document.createElement("div"), { getComputedStyle: null })).toThrowError(
      "Owner document of the element needs to have an associated window.",
    );
  });

  test("an ancestor's aria-hidden excludes descendants (parent overrides child)", () => {
    const testNode = testNodeOf(
      '<div aria-hidden="true"><div aria-hidden="false"><span data-test>x</span></div></div>',
    );
    expect(isInaccessible(testNode)).toBe(true);
  });

  test("the memoized answer is invalidated by a mutation (Document[$version])", () => {
    const testNode = testNodeOf('<section id="s"><span data-test>x</span></section>');
    expect(isInaccessible(testNode)).toBe(false);
    document.getElementById("s")!.setAttribute("hidden", "");
    expect(isInaccessible(testNode)).toBe(true);
    document.getElementById("s")!.removeAttribute("hidden");
    expect(isInaccessible(testNode)).toBe(false);
  });
});

describe("isSubtreeInaccessible — https://www.w3.org/TR/wai-aria-1.2/#tree_exclusion", () => {
  test.each([
    ["<div data-test />", false],
    ['<div data-test aria-hidden="false" />', false],
    ['<div data-test style="visibility: hidden" />', false],
    ['<div style="visibility: hidden;"><div data-test style="visibility: visible;"/></div>', false],
    ["<div data-test hidden />", true],
    ['<div data-test style="display: none;"/>', true],
    ['<div data-test aria-hidden="true" />', true],
  ])("markup #%#", (markup, expectedIsInaccessible) => {
    expect(isSubtreeInaccessible(testNodeOf(markup))).toBe(expectedIsInaccessible);
  });

  test("window.getComputedStyle implementation can be injected", () => {
    const testNode = testNodeOf(`<button data-test style="display: none;" />`);
    expect(isSubtreeInaccessible(testNode, { getComputedStyle: () => ({ getPropertyValue: () => "" }) })).toBe(false);
  });

  test("throws if ownerDocument is not associated to a window", () => {
    expect(() => isSubtreeInaccessible(document.createElement("div"), { getComputedStyle: null })).toThrowError(
      "Owner document of the element needs to have an associated window.",
    );
  });
});
