// Accessibility backend used by ByRole, role helpers and suggestions: @ctrl/dom/aria's
// NodeImpl-level API (roles via integer tag switches, accessible names and the
// accessibility-tree exclusion check cached per node, stamped with the document version).
// It reproduces the exact libraries @testing-library/dom@10.4.2 uses (aria-query 5.3.0
// element roles, dom-accessibility-api 0.5.16 names/descriptions).

import { getComputedStyleOverride, type NodeImpl } from "@ctrl/dom/internal";
import { roleSupportsProp, type GetComputedStyle } from "@ctrl/dom/aria";
import {
  implicitRole as ariaImplicitRole,
  tlRoleMatches,
  computeAccessibleNameImpl,
  computeAccessibleDescriptionImpl,
  isInaccessibleImpl,
  isSubtreeInaccessibleImpl,
  isInaccessibleWithStyle,
  isDisplayNone,
  isVisibilityHidden,
} from "@ctrl/dom/aria/internal";

const PSEUDO_OPTIONS = { computedStyleSupportsPseudoElements: true };

/**
 * The user-replaced `window.getComputedStyle` of `el`'s window, or null (the fast path).
 * Upstream reads every style through `window.getComputedStyle`, so test setups that replace it
 * (Sentry: `el => el.style`) change what ByRole considers hidden and how names are computed.
 * Callers check once per query/call and pass the result to the functions below.
 */
export function styleOverride(el: NodeImpl): GetComputedStyle | null {
  return getComputedStyleOverride(el) as unknown as GetComputedStyle | null;
}

/** dom-accessibility-api 0.5 options for testing-library's `computedStyleSupportsPseudoElements` config. */
function nameOptions(computedStyleSupportsPseudoElements: boolean, gcs: GetComputedStyle | null) {
  // dom-accessibility-api defaults getComputedStyle to `window.getComputedStyle.bind(window)`.
  if (gcs !== null) return { computedStyleSupportsPseudoElements, getComputedStyle: gcs };
  // `undefined` ≡ `{computedStyleSupportsPseudoElements: false}` (the library default) and
  // lets @ctrl/dom/aria serve the name from its per-node cache.
  return computedStyleSupportsPseudoElements ? PSEUDO_OPTIONS : undefined;
}

export const aria = {
  /** First implicit ARIA role (aria-query 5.3.0 `elementRoles` semantics), or null. */
  implicitRole(el: NodeImpl): string | null {
    const r = ariaImplicitRole(el);
    return r === "" ? null : r;
  },
  /** Testing Library's role filter (explicit first token / any token with queryFallbacks / implicit). */
  roleMatches: tlRoleMatches,
  /** `roles.get(role)?.props[prop] !== undefined` (aria-query 5.3.0). */
  roleSupportsProp(role: unknown, prop: string): boolean {
    return typeof role === "string" && roleSupportsProp(role, prop);
  },
  /** `gcs`: `styleOverride(el)` (or null), checked once by the caller. */
  computeAccessibleName(el: NodeImpl, computedStyleSupportsPseudoElements: boolean, gcs: GetComputedStyle | null): string {
    return computeAccessibleNameImpl(el, nameOptions(computedStyleSupportsPseudoElements, gcs), 5);
  },
  computeAccessibleDescription(el: NodeImpl, computedStyleSupportsPseudoElements: boolean, gcs: GetComputedStyle | null): string {
    return computeAccessibleDescriptionImpl(el, nameOptions(computedStyleSupportsPseudoElements, gcs), 5);
  },
  /** Testing Library's `isInaccessible(element)` (default subtree check, memoized per node). */
  isInaccessible: isInaccessibleImpl,
  /**
   * `isInaccessible(element, { isSubtreeInaccessible: cached })` reading styles through a
   * user-replaced getComputedStyle; `memo` is the per-query subtree cache (or null).
   */
  isInaccessibleWithStyle,
  isSubtreeInaccessible: isSubtreeInaccessibleImpl,
};

export { isDisplayNone, isVisibilityHidden };
