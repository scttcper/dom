// Style reads needed by the accessibility computations: `display: none`, computed
// `visibility`, whether an element's computed `display` is `inline` (accname uses it to
// decide whether children are separated by a space), and `::before`/`::after` content.
//
// Specs:
//   https://drafts.csswg.org/css-display/#the-display-properties
//   https://drafts.csswg.org/css-display/#visibility (visibility is inherited)
//   https://drafts.csswg.org/css-content-3/#content-property
//
// All reads go through the css area's fast API (`@ctrl/dom/internal`, src/css/internal.ts):
// per-element records stamped with Document._version/_styleVersion, and with no author
// styles a plain inline-style + UA-default check without rule matching.

//
// The UA defaults are the css area's, which follow the HTML and SVG rendering rules
// (https://html.spec.whatwg.org/#rendering, https://svgwg.org/svg2-draft/styling.html#UAStyleSheet):
// SVG's title/desc/defs/… and (with scripting) noscript are display:none, and select, textarea,
// meter and progress are inline-block, so accname separates them with spaces. jsdom ≤30's
// stylesheet differed on all of these, and jsdom 31 still renders an SVG title and leaves
// textarea/meter/progress inline (docs/deviations.md "Accessibility").

import {
  computedValue,
  computedVisibility,
  pseudoContent,
  styledDisplay,
  uaDisplay,
  type NodeImpl,
} from "@ctrl/dom/internal";

/** Computed `display` is `none` (the element itself; `display` is not inherited). */
export function isDisplayNone(impl: NodeImpl): boolean {
  return (styledDisplay(impl) ?? uaDisplay(impl)) === "none";
}

/** Computed `display` is exactly `inline` (accname: inline children are not space-separated). */
export function isDisplayInline(impl: NodeImpl): boolean {
  return (styledDisplay(impl) ?? uaDisplay(impl)) === "inline";
}

/**
 * Computed `visibility` is exactly `hidden` (inherited). `collapse` does not count: Testing
 * Library and dom-accessibility-api compare against "hidden" only.
 */
export function isVisibilityHidden(impl: NodeImpl): boolean {
  return computedVisibility(impl) === "hidden";
}

/**
 * Textual `content` of `::before` / `::after` as dom-accessibility-api extracts it from
 * `getComputedStyle(el, pseudo).getPropertyValue("content")`: a value that starts and ends
 * with a quote, with the outer quotes sliced off; anything else is "".
 */
export function pseudoText(impl: NodeImpl, pseudo: "::before" | "::after"): string {
  // Cheap guard: no author rule targets this pseudo-element → no generated text.
  if (pseudoContent(impl, pseudo) === "") {
    // `content: ""` and attr()-only values with empty attributes also land here; both yield
    // "" under dom-accessibility-api's extraction too.
    return "";
  }
  const content = computedValue(impl, "content", pseudo);
  if (/^["'].*["']$/.test(content)) return content.slice(1, -1);
  return "";
}

/** Whether author style sheets (`<style>`, `<link rel=stylesheet>`) are applied. */
export const AUTHOR_STYLES_SUPPORTED: boolean = true;
