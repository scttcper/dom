// Accessibility backend used by ByRole, role helpers and suggestions: @rtd/aria's
// NodeImpl-level API (roles via integer tag switches, accessible names and the
// accessibility-tree exclusion check cached per node, stamped with the document version).
// It reproduces the exact libraries @testing-library/dom@10.4.2 uses (aria-query 5.3.0
// element roles, dom-accessibility-api 0.5.16 names/descriptions).

import type { NodeImpl } from "@rtd/dom/internal";
import { roleSupportsProp } from "@rtd/aria";
import {
  implicitRole as ariaImplicitRole,
  tlRoleMatches,
  computeAccessibleNameImpl,
  computeAccessibleDescriptionImpl,
  isInaccessibleImpl,
  isSubtreeInaccessibleImpl,
  isDisplayNone,
  isVisibilityHidden,
} from "@rtd/aria/internal";

const PSEUDO_OPTIONS = { computedStyleSupportsPseudoElements: true };

/** dom-accessibility-api 0.5 options for testing-library's `computedStyleSupportsPseudoElements` config. */
function nameOptions(computedStyleSupportsPseudoElements: boolean) {
  // `undefined` ≡ `{computedStyleSupportsPseudoElements: false}` (the library default) and
  // lets @rtd/aria serve the name from its per-node cache.
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
  computeAccessibleName(el: NodeImpl, computedStyleSupportsPseudoElements: boolean): string {
    return computeAccessibleNameImpl(el, nameOptions(computedStyleSupportsPseudoElements), 5);
  },
  computeAccessibleDescription(el: NodeImpl, computedStyleSupportsPseudoElements: boolean): string {
    return computeAccessibleDescriptionImpl(el, nameOptions(computedStyleSupportsPseudoElements), 5);
  },
  /** Testing Library's `isInaccessible(element)` (default subtree check, memoized per node). */
  isInaccessible: isInaccessibleImpl,
  isSubtreeInaccessible: isSubtreeInaccessibleImpl,
};

export { isDisplayNone, isVisibilityHidden };
