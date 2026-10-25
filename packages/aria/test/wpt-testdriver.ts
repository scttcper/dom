// `test_driver` for the WPT accessibility suites (wai-aria, accname, html-aam), backed by
// @ctrl/dom/aria. https://web-platform-tests.org/writing-tests/testdriver.html#accessibility
//
// - `get_computed_role(el)` → the role Testing Library's `*ByRole` matches the element
//   against (`tlRole`: first token of the `role` attribute, else the aria-query@5.3.0
//   implicit role), renamed to the strings WPT expects (Chromium's
//   `computedRole`) where the difference is purely a name. Semantic differences (role
//   fallback, presentational conflict resolution, case-insensitive tokens, ...) are NOT
//   papered over here: they are what stock Testing Library users observe, so they stay as
//   known failures (see wpt-aria.test.ts).
// - `get_computed_label(el)` → `computeAccessibleName(el)` (dom-accessibility-api@0.5.16
//   behavior, what `*ByRole({ name })` matches).
//
// Specs: https://w3c.github.io/core-aam/#roleMappingGeneralRules,
//        https://w3c.github.io/aria/#document-handling_author-errors_roles,
//        https://w3c.github.io/accname/#mapping_additional_nd_te

import type { Element } from "@ctrl/dom";
import { computeAccessibleName } from "@ctrl/dom/aria";
import { implOf, tlRole } from "@ctrl/dom/aria/internal";

/**
 * Pure naming differences between Testing Library / aria-query role names and the
 * `computedRole` strings WPT asserts.
 */
const WPT_ROLE_NAME: Record<string, string> = {
  // https://w3c.github.io/aria/#presentation: "presentation" is a synonym of "none"
  // (https://w3c.github.io/aria/#none); Chromium and WPT report the preferred name "none".
  // aria-query/Testing Library keep "presentation" (e.g. <img alt="">).
  presentation: "none",
  // https://w3c.github.io/aria/#image: ARIA 1.3 renamed "img" to "image" and kept "img" as a
  // synonym; WPT expects "image". aria-query@5.3.0 only knows "img".
  img: "image",
};

/** The role string WPT would see for `el` (see module comment). */
export function wptComputedRole(el: Element): string {
  const role = tlRole(implOf(el));
  return WPT_ROLE_NAME[role] ?? role;
}

/** Map an arbitrary Testing Library role string to WPT's name for it. */
export function wptRoleName(role: string): string {
  return WPT_ROLE_NAME[role] ?? role;
}

/** `RunOptions.testdriver` for `defineWPT`/`runWPT`. Unsupported actions reject. */
export function ariaTestDriver(): Record<string, unknown> {
  const unsupported = (name: string) => () => Promise.reject(new Error(`test_driver.${name} is not supported here`));
  return {
    get_computed_role: async (el: Element) => wptComputedRole(el),
    get_computed_label: async (el: Element) => computeAccessibleName(el),
    get_accessibility_properties_for_element: unsupported("get_accessibility_properties_for_element"),
    get_accessibility_properties_for_accessibility_node: unsupported("get_accessibility_properties_for_accessibility_node"),
  };
}
