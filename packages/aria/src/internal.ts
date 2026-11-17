// NodeImpl-level API for @ctrl/dom/testing-library and @ctrl/dom/jest-dom hot paths.
// Not for end users: no stability guarantees.
//
// Typical `*ByRole` loop (see packages/testing-library):
//   const matchesRole = tlRoleMatcher(role, queryFallbacks);
//   for (let n = root.first; n !== null; n = nextInTree(n, root)) {
//     if (n.type !== ELEMENT_NODE) continue;
//     if (!matchesRole(n)) continue;
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
export { labelsOf, labelMapForTree, inputType, isLabelable } from "./forms.ts";
export { isDisplayNone, isVisibilityHidden, isDisplayInline } from "./style.ts";
export { implOf, queryIdRefs } from "./tree.ts";

import { ELEMENT_NODE, T, tagId, type NodeImpl } from "@ctrl/dom/internal";
import { ROLE_TAGS } from "./data/aria-query.generated.ts";
import { implicitRole, roleAttribute, anyTag } from "./role.ts";

// Index only the requested roles. Most elements can be accepted or skipped by tag alone.
// Conditional tags (e.g. input) need the full implicit-role check.
const FIXED = 1;
const CONDITIONAL = 2;
const tagsByRole = new Map<string, number[]>();
const noTags: number[] = [];
// The empty-string query also matches elements with no implicit role.
tagsByRole.set("", new Array<number>(Object.keys(T).length).fill(CONDITIONAL));

function implicitRoleTags(role: string): number[] {
  const cached = tagsByRole.get(role);
  if (cached !== undefined) return cached;
  const names = ROLE_TAGS.get(role);
  if (names === undefined) return noTags;
  const tags: number[] = [];
  const [fixed, conditional] = names;
  for (const name of fixed) tags[tagId(name)] = FIXED;
  for (const name of conditional) tags[tagId(name)] = CONDITIONAL;
  tagsByRole.set(role, tags);
  return tags;
}

/** Resolve the tag table once for a query over element descendants. */
export function tlRoleMatcher(role: string, queryFallbacks: boolean): (impl: NodeImpl) => boolean {
  const tags = implicitRoleTags(role);
  return (impl) => matchesElementRole(impl, role, queryFallbacks, tags);
}

/**
 * Testing Library's role filter for one element: with a `role` attribute, its first " "-token
 * (or any non-empty token with `queryFallbacks`) must equal `role`; otherwise the implicit
 * role must.
 */
export function tlRoleMatches(impl: NodeImpl, role: string, queryFallbacks: boolean): boolean {
  if (impl.type !== ELEMENT_NODE) return role === "";
  return matchesElementRole(impl, role, queryFallbacks, implicitRoleTags(role));
}

function matchesElementRole(impl: NodeImpl, role: string, queryFallbacks: boolean, tags: number[]): boolean {
  const value = roleAttribute(impl);
  if (value !== null) return explicitRoleMatches(value, role, queryFallbacks);
  const match = tags[anyTag(impl)];
  return match === FIXED || (match === CONDITIONAL && implicitRole(impl) === role);
}

function explicitRoleMatches(value: string, role: string, queryFallbacks: boolean): boolean {
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
