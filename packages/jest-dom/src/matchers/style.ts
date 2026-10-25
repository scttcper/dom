// Ports of @testing-library/jest-dom@7.0.1:
// https://github.com/testing-library/jest-dom/blob/v7.0.1/src/to-be-visible.js
// https://github.com/testing-library/jest-dom/blob/v7.0.1/src/to-have-style.js

import { sameColor } from "../color.ts";
import { checkHtmlElement, parseCSS, picoRed, type DOMNode, type MatcherContext, type MatcherResult } from "../utils.ts";

// --- toBeVisible ------------------------------------------------------------------------

// TODO(jest-dom): when src/css/internal.ts lands (css agent), use `isDisplayNone(impl)`,
// `isVisibilityHidden(impl)` and `computedValue(impl, "opacity")` for @ctrl/dom elements
// (`element._impl`) instead of building a full CSSStyleDeclaration per ancestor.
function isStyleVisible(element: DOMNode): boolean {
  const { getComputedStyle } = element.ownerDocument.defaultView;

  const { display, visibility, opacity } = getComputedStyle(element);
  return display !== "none" && visibility !== "hidden" && visibility !== "collapse" && opacity !== "0" && opacity !== 0;
}

function isAttributeVisible(element: DOMNode, previousElement: DOMNode | undefined): boolean {
  let detailsVisibility: boolean;

  if (previousElement) {
    detailsVisibility = element.nodeName === "DETAILS" && previousElement.nodeName !== "SUMMARY" ? element.hasAttribute("open") : true;
  } else {
    detailsVisibility = element.nodeName === "DETAILS" ? element.hasAttribute("open") : true;
  }

  return !element.hasAttribute("hidden") && detailsVisibility;
}

function isElementVisible(element: DOMNode, previousElement?: DOMNode): boolean {
  return (
    isStyleVisible(element) &&
    isAttributeVisible(element, previousElement) &&
    (!element.parentElement || isElementVisible(element.parentElement, element))
  );
}

export function toBeVisible(this: MatcherContext, element: DOMNode): MatcherResult {
  checkHtmlElement(element, toBeVisible, this);
  const isInDocument = element.ownerDocument === element.getRootNode({ composed: true });
  const isVisible = isInDocument && isElementVisible(element);
  return {
    pass: isVisible,
    message: () => {
      const is = isVisible ? "is" : "is not";
      return [
        this.utils.matcherHint(`${this.isNot ? ".not" : ""}.toBeVisible`, "element", ""),
        "",
        `Received element ${is} visible${isInDocument ? "" : " (element is not in the document)"}:`,
        `  ${this.utils.printReceived(element.cloneNode(false))}`,
      ].join("\n");
    },
  };
}

// --- toHaveStyle ------------------------------------------------------------------------

function getStyleDeclaration(document: DOMNode, css: Record<string, unknown>): Record<string, string> {
  const styles: Record<string, string> = {};

  // The next block is necessary to normalize colors
  const copy = document.createElement("div");
  for (const property of Object.keys(css)) {
    copy.style[property] = css[property];
    styles[property] = copy.style[property];
  }

  return styles;
}

// Upstream compares strings only. Divergence (same pass/fail whenever upstream's DOM and
// ours serialize a color the same way): when the expected value is a single color, a received
// value that is the same color in another serialization (`red` vs `rgb(255, 0, 0)`) also
// matches. Failure messages still print the raw values, exactly like upstream.
function valueMatches(received: unknown, value: string): boolean {
  return received === value || sameColor(value, received);
}

function isSubset(styles: Record<string, string>, computedStyle: DOMNode): boolean {
  const entries = Object.entries(styles);
  if (entries.length === 0) return false;
  for (const [prop, value] of entries) {
    const isCustomProperty = prop.startsWith("--");
    if (valueMatches(computedStyle[prop], value) || valueMatches(computedStyle.getPropertyValue(prop), value)) continue;
    if (!isCustomProperty) {
      const lower = prop.toLowerCase();
      if (valueMatches(computedStyle[lower], value) || valueMatches(computedStyle.getPropertyValue(lower), value)) continue;
    }
    return false;
  }
  return true;
}

function printoutStyles(styles: Record<string, string>): string {
  return Object.keys(styles)
    .sort()
    .map((prop) => `${prop}: ${styles[prop]};`)
    .join("\n");
}

// Highlights only style rules that were expected but were not found in the received computed
// styles
function expectedDiff(diffFn: MatcherContext["utils"]["diff"], expected: Record<string, string>, computedStyles: DOMNode): string {
  const received: Record<string, string> = {};
  for (const prop of Array.from(computedStyles as ArrayLike<string>)) {
    if (expected[prop] !== undefined) received[prop] = computedStyles.getPropertyValue(prop);
  }
  const diffOutput = diffFn(printoutStyles(expected), printoutStyles(received)) as string;
  // Remove the "+ Received" annotation because this is a one-way diff
  return diffOutput.replace(`${picoRed("+ Received")}\n`, "");
}

export function toHaveStyle(this: MatcherContext, htmlElement: DOMNode, css: string | Record<string, unknown>): MatcherResult {
  checkHtmlElement(htmlElement, toHaveStyle, this);
  const parsedCSS = typeof css === "object" ? css : parseCSS(css, toHaveStyle, this);
  const { getComputedStyle } = htmlElement.ownerDocument.defaultView;

  const expected = getStyleDeclaration(htmlElement.ownerDocument, parsedCSS);
  // TODO(jest-dom): for @ctrl/dom elements read only the expected properties through
  // css/internal.ts `computedValue(impl, prop)` on the pass path (css agent).
  const received = getComputedStyle(htmlElement);

  return {
    pass: isSubset(expected, received),
    message: () => {
      const matcher = `${this.isNot ? ".not" : ""}.toHaveStyle`;
      return [this.utils.matcherHint(matcher, "element", ""), expectedDiff(this.utils.diff, expected, received)].join("\n\n");
    },
  };
}
