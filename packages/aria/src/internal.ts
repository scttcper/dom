// NodeImpl-level API for @ctrl/dom/testing-library and @ctrl/dom/jest-dom hot paths. No wrappers, no
// allocation on the role/hidden paths. Not for end users: no stability guarantees.
//
// Typical `*ByRole` loop (see packages/testing-library):
//   for (let n = root.first; n !== null; n = nextInTree(n, root)) {
//     if (n.type !== ELEMENT_NODE) continue;
//     if (tlRole(n) !== role) continue;            // or tlRoleMatches(n, role, queryFallbacks)
//     if (!hidden && isInaccessibleImpl(n)) continue;
//     if (name !== undefined && !matches(computeAccessibleNameImpl(n, undefined, 5), ...)) continue;
//   }

export {
  implicitRole,
  implicitRoleJestDom,
  getImplicitRoles,
  tlRole,
  daaGetRole,
  daaExplicitRole,
  daaImplicitRole,
  anyTag,
  type Flavor,
} from "./role.ts";
export {
  computeAccessibleNameImpl,
  computeAccessibleDescriptionImpl,
  computeTextAlternativeImpl,
  withStyleOverride,
} from "./accname.ts";
export { isInaccessibleImpl, isSubtreeInaccessibleImpl, isInaccessibleWithStyle } from "./hidden.ts";
export { getRolesImpl } from "./roles-list.ts";
export {
  computeAriaSelected,
  computeAriaBusy,
  computeAriaChecked,
  computeAriaPressed,
  computeAriaCurrent,
  computeAriaExpanded,
  computeHeadingLevel,
  computeAriaValueNow,
  computeAriaValueMax,
  computeAriaValueMin,
  computeAriaValueText,
  ariaCheckedState,
  ariaPressedState,
  isDisabledImpl,
} from "./states.ts";
export { labelsOf, inputType, isLabelable } from "./forms.ts";
export { isDisplayNone, isVisibilityHidden, isDisplayInline } from "./style.ts";
export { implOf, queryIdRefs } from "./tree.ts";

import { attr, type NodeImpl } from "@ctrl/dom/internal";
import { implicitRole } from "./role.ts";

/**
 * Testing Library's role filter for one element: with a `role` attribute, its first " "-token
 * (or any non-empty token with `queryFallbacks`) must equal `role`; otherwise the implicit
 * role must.
 */
export function tlRoleMatches(impl: NodeImpl, role: string, queryFallbacks: boolean): boolean {
  const value = attr(impl, "role");
  if (value !== null) {
    if (!queryFallbacks) {
      const sp = value.indexOf(" ");
      return sp === -1 ? value === role : sp === role.length && value.startsWith(role);
    }
    let start = 0;
    const len = value.length;
    while (start <= len) {
      let end = value.indexOf(" ", start);
      if (end === -1) end = len;
      if (end > start && end - start === role.length && value.startsWith(role, start)) return true;
      start = end + 1;
    }
    return false;
  }
  return implicitRole(impl) === role;
}
