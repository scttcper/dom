// @rtd/aria — roles, accessible names/descriptions, states and accessibility-tree
// exclusion for @rtd/dom. Replaces aria-query + dom-accessibility-api for
// @rtd/testing-library and @rtd/jest-dom.
//
// Specs: https://w3c.github.io/accname/, https://www.w3.org/TR/html-aam-1.0/,
//        https://w3c.github.io/aria/, https://w3c.github.io/core-aam/
//
// Surfaces:
// - dom-accessibility-api@0.5.16-compatible (what @testing-library/dom@10.4.2 uses):
//   `computeAccessibleName`, `computeAccessibleDescription`, `getRole`, `isInaccessible`,
//   `isSubtreeInaccessible`.
// - dom-accessibility-api@0.6.3-compatible (what @testing-library/jest-dom@7 uses): `daa06`.
// - aria-query@5.3.0-shaped data: `roles`, `elementRoles`, `roleElements`, `aria`, `dom`.
// - Testing Library role-helpers: `getImplicitAriaRoles`, `getRoles`, `prettyRoles`,
//   `computeAria*`, `computeHeadingLevel`.
// - NodeImpl-level hot-path API: `@rtd/aria/internal`.

import type { Element, Node } from "@rtd/dom";
import {
  computeAccessibleNameImpl,
  computeAccessibleDescriptionImpl,
  withStyleOverride,
  type ComputeTextAlternativeOptions,
} from "./accname.ts";
import { daaGetRole, getImplicitRoles, implicitRole, implicitRoleJestDom } from "./role.ts";
import { isDisabledImpl } from "./states.ts";
import * as S from "./states.ts";
import { implOf } from "./tree.ts";
import { isInaccessible, isSubtreeInaccessible } from "./hidden.ts";

export type { ComputeTextAlternativeOptions, GetComputedStyle, StyleLike } from "./accname.ts";
export type { IsInaccessibleOptions, IsSubtreeInaccessibleOptions } from "./hidden.ts";
export { isInaccessible, isSubtreeInaccessible } from "./hidden.ts";
export { getRoles, prettyRoles, type PrettyRolesOptions } from "./roles-list.ts";
export {
  roles,
  elementRoles,
  roleElements,
  aria,
  dom,
  roleSupportsProp,
  implicitRoleElementNames,
  superClassRoles,
  AriaQueryMap,
  type ARIARoleDefinition,
  type ARIARoleRelationConcept,
} from "./data/aria-query.ts";

// --- dom-accessibility-api@0.5.16 ------------------------------------------------------

/** https://w3c.github.io/accname/#mapping_additional_nd_name */
export function computeAccessibleName(root: Element, options?: ComputeTextAlternativeOptions): string {
  const impl = implOf(root);
  return computeAccessibleNameImpl(impl, withStyleOverride(impl, options), 5);
}

/** https://w3c.github.io/accname/#mapping_additional_nd_description */
export function computeAccessibleDescription(root: Element, options?: ComputeTextAlternativeOptions): string {
  const impl = implOf(root);
  return computeAccessibleDescriptionImpl(impl, withStyleOverride(impl, options), 5);
}

/** dom-accessibility-api `getRole`: explicit role (first token) or the html-aria implicit role, or null. */
export function getRole(element: Element): string | null {
  return daaGetRole(implOf(element), 5);
}

/** dom-accessibility-api@0.6 `isDisabled`. */
export function isDisabled(element: Element): boolean {
  return isDisabledImpl(implOf(element));
}

/** dom-accessibility-api@0.6.3 behavior (aria-description, role="none" ≡ presentation), as used by jest-dom@7. */
export const daa06 = {
  computeAccessibleName(root: Element, options?: ComputeTextAlternativeOptions): string {
    const impl = implOf(root);
  return computeAccessibleNameImpl(impl, withStyleOverride(impl, options), 6);
  },
  computeAccessibleDescription(root: Element, options?: ComputeTextAlternativeOptions): string {
    const impl = implOf(root);
  return computeAccessibleDescriptionImpl(impl, withStyleOverride(impl, options), 6);
  },
  getRole(element: Element): string | null {
    return daaGetRole(implOf(element), 6);
  },
  isDisabled,
  isInaccessible,
  isSubtreeInaccessible,
};

// --- Testing Library role-helpers ------------------------------------------------------

/** Testing Library's `getImplicitAriaRoles(element)` (aria-query@5.3.0 elementRoles semantics). */
export function getImplicitAriaRoles(element: Element | Node): string[] {
  return getImplicitRoles(implOf(element));
}

/** The implicit role Testing Library computes (`getImplicitAriaRoles(el)[0]`), or null. */
export function getImplicitRole(element: Element | Node): string | null {
  const r = implicitRole(implOf(element));
  return r === "" ? null : r;
}

/** jest-dom@7's `getImplicitAriaRoles` variant (used by `toHaveRole`). */
export function getImplicitAriaRolesJestDom(element: Element | Node): string[] {
  const r = implicitRoleJestDom(implOf(element));
  return r === "" ? [] : [r];
}

export function computeAriaSelected(element: Element): boolean | undefined {
  return S.computeAriaSelected(implOf(element));
}
export function computeAriaBusy(element: Element): boolean {
  return S.computeAriaBusy(implOf(element));
}
export function computeAriaChecked(element: Element): boolean | undefined {
  return S.computeAriaChecked(implOf(element));
}
export function computeAriaPressed(element: Element): boolean | undefined {
  return S.computeAriaPressed(implOf(element));
}
export function computeAriaCurrent(element: Element): boolean | string {
  return S.computeAriaCurrent(implOf(element));
}
export function computeAriaExpanded(element: Element): boolean | undefined {
  return S.computeAriaExpanded(implOf(element));
}
export function computeHeadingLevel(element: Element): number | undefined {
  return S.computeHeadingLevel(implOf(element));
}
export function computeAriaValueNow(element: Element): number | undefined {
  return S.computeAriaValueNow(implOf(element));
}
export function computeAriaValueMax(element: Element): number | undefined {
  return S.computeAriaValueMax(implOf(element));
}
export function computeAriaValueMin(element: Element): number | undefined {
  return S.computeAriaValueMin(implOf(element));
}
export function computeAriaValueText(element: Element): string | undefined {
  return S.computeAriaValueText(implOf(element));
}
/** Tri-state `aria-checked` / checkedness: true, false, "mixed" or undefined. */
export function ariaCheckedState(element: Element): boolean | "mixed" | undefined {
  return S.ariaCheckedState(implOf(element));
}
/** Tri-state `aria-pressed`: true, false, "mixed" or undefined. */
export function ariaPressedState(element: Element): boolean | "mixed" | undefined {
  return S.ariaPressedState(implOf(element));
}
