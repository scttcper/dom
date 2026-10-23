// Port of @testing-library/dom src/role-helpers.js (MIT).
// https://github.com/testing-library/dom-testing-library/blob/main/src/role-helpers.js
//
// Roles, names and descriptions come from the accessibility backend (./aria.ts); the
// visibility checks (`isInaccessible`, `isSubtreeInaccessible`) and ARIA state readers are
// testing-library's own semantics and are ported here over NodeImpl.

import { attr, ELEMENT_NODE, HTML_NS, T, type NodeImpl } from "@rtd/dom/internal";
import { aria, isVisibilityHidden, styleOverride } from "./aria.ts";
import { prettyDOM } from "./pretty-dom.ts";
import { getConfig } from "./config.ts";
import { implOf } from "./helpers.ts";

/** `element.parentElement` */
function parentElement(el: NodeImpl): NodeImpl | null {
  const p = el.parent;
  return p !== null && p.type === ELEMENT_NODE ? p : null;
}

/** true if `element` and its subtree are inaccessible (`hidden`, `aria-hidden="true"`, `display: none`) */
export function isSubtreeInaccessibleImpl(element: NodeImpl): boolean {
  return aria.isSubtreeInaccessible(element);
}

/**
 * Partial implementation https://www.w3.org/TR/wai-aria-1.2/#tree_exclusion
 * which should only be used for elements with a non-presentational role i.e.
 * `role="none"` and `role="presentation"` will not be excluded.
 *
 * Implements aria-hidden semantics (i.e. parent overrides child)
 * Ignores "Child Presentational: True" characteristics
 *
 * The default subtree check is memoized per element by @rtd/aria (stamped with the document
 * version), which covers upstream's per-query `subtreeIsInaccessibleCache` and more.
 */
export function isInaccessibleImpl(element: NodeImpl): boolean {
  return aria.isInaccessible(element);
}

/**
 * `isInaccessible(element)` for one-off callers (suggestions): honors a user-replaced
 * `window.getComputedStyle` like upstream, at the cost of one check per call.
 */
export function isInaccessibleChecked(element: NodeImpl): boolean {
  const gcs = styleOverride(element);
  return gcs === null ? aria.isInaccessible(element) : aria.isInaccessibleWithStyle(element, gcs, null);
}

export function isSubtreeInaccessible(element: any): boolean {
  const impl = implOf(element);
  const gcs = styleOverride(impl);
  if (gcs === null) return isSubtreeInaccessibleImpl(impl);
  if (impl.ns === HTML_NS && attr(impl, "hidden") !== null) return true;
  if (attr(impl, "aria-hidden") === "true") return true;
  return gcs(element).display === "none";
}

export function isInaccessible(element: any, options: { isSubtreeInaccessible?: (element: any) => boolean } = {}): boolean {
  const impl = implOf(element);
  const custom = options.isSubtreeInaccessible;
  const gcs = styleOverride(impl);
  if (custom === undefined) return gcs === null ? isInaccessibleImpl(impl) : aria.isInaccessibleWithStyle(impl, gcs, null);
  // since visibility is inherited we can exit early
  if (gcs !== null ? gcs(element).visibility === "hidden" : isVisibilityHidden(impl)) return true;
  for (let current: NodeImpl | null = impl; current !== null; current = parentElement(current)) {
    if (custom(current.node)) return true;
  }
  return false;
}

/** Explicit role token or implicit role, as `getRoles` groups them ("" for `role=""`). */
export function getImplicitAriaRolesImpl(el: NodeImpl): string[] {
  const role = aria.implicitRole(el);
  return role === null ? [] : [role];
}

export function getImplicitAriaRoles(currentNode: any): string[] {
  return getImplicitAriaRolesImpl(implOf(currentNode));
}

export function getRoles(container: any, { hidden = false }: { hidden?: boolean } = {}): Record<string, any[]> {
  const root = implOf(container);
  const roles: Record<string, any[]> = {};
  const gcs = hidden !== false ? null : styleOverride(root);
  const memo = gcs !== null ? new Map<NodeImpl, boolean>() : null;
  const visit = (node: NodeImpl) => {
    if (hidden !== false || (gcs === null ? isInaccessibleImpl(node) : aria.isInaccessibleWithStyle(node, gcs, memo)) === false) {
      // TODO: This violates html-aria which does not allow any role on every element
      const explicit = attr(node, "role");
      const nodeRoles = explicit !== null ? explicit.split(" ").slice(0, 1) : getImplicitAriaRolesImpl(node);
      for (const role of nodeRoles) {
        const list = roles[role];
        if (Array.isArray(list)) list.push(node.node);
        else roles[role] = [node.node];
      }
    }
    for (let c = node.first; c !== null; c = c.next) {
      if (c.type === ELEMENT_NODE) visit(c);
    }
  };
  visit(root);
  return roles;
}

export function prettyRoles(dom: any, { hidden, includeDescription }: { hidden?: boolean; includeDescription?: boolean }): string {
  const roles = getRoles(dom, { hidden });
  const pseudo = getConfig().computedStyleSupportsPseudoElements;
  const gcs = styleOverride(implOf(dom));
  // We prefer to skip generic role, we don't recommend it
  return Object.entries(roles)
    .filter(([role]) => role !== "generic")
    .map(([role, elements]) => {
      const delimiterBar = "-".repeat(50);
      const elementsString = elements
        .map((el) => {
          const impl = implOf(el);
          const nameString = `Name "${aria.computeAccessibleName(impl, pseudo, gcs)}":\n`;
          const domString = prettyDOM(el.cloneNode(false));
          if (includeDescription) {
            const descriptionString = `Description "${aria.computeAccessibleDescription(impl, pseudo, gcs)}":\n`;
            return `${nameString}${descriptionString}${domString}`;
          }
          return `${nameString}${domString}`;
        })
        .join("\n\n");
      return `${role}:\n\n${elementsString}\n\n${delimiterBar}`;
    })
    .join("\n");
}

export const logRoles = (dom: any, { hidden = false }: { hidden?: boolean } = {}): void => console.log(prettyRoles(dom, { hidden }));

function checkBooleanAttribute(element: NodeImpl, attribute: string): boolean | undefined {
  const attributeValue = attr(element, attribute);
  if (attributeValue === "true") return true;
  if (attributeValue === "false") return false;
  return undefined;
}

/** false/true if (not)selected, undefined if not selectable */
export function computeAriaSelected(element: NodeImpl): boolean | undefined {
  // implicit value from html-aam mappings: https://www.w3.org/TR/html-aam-1.0/#html-attribute-state-and-property-mappings
  // https://www.w3.org/TR/html-aam-1.0/#details-id-97
  if (element.tag === T.option && element.ns === HTML_NS) {
    return (element.node as any).selected;
  }
  // explicit value
  return checkBooleanAttribute(element, "aria-selected");
}

export function computeAriaBusy(element: NodeImpl): boolean {
  // https://www.w3.org/TR/wai-aria-1.1/#aria-busy
  return attr(element, "aria-busy") === "true";
}

/** false/true if (not)checked, undefined if not checked-able */
export function computeAriaChecked(element: NodeImpl): boolean | undefined {
  // implicit value from html-aam mappings: https://www.w3.org/TR/html-aam-1.0/#html-attribute-state-and-property-mappings
  // https://www.w3.org/TR/html-aam-1.0/#details-id-56
  // https://www.w3.org/TR/html-aam-1.0/#details-id-67
  const node = element.node as any;
  if ("indeterminate" in node && node.indeterminate) {
    return undefined;
  }
  if ("checked" in node) {
    return node.checked;
  }
  // explicit value
  return checkBooleanAttribute(element, "aria-checked");
}

export function computeAriaPressed(element: NodeImpl): boolean | undefined {
  // https://www.w3.org/TR/wai-aria-1.1/#aria-pressed
  return checkBooleanAttribute(element, "aria-pressed");
}

export function computeAriaCurrent(element: NodeImpl): boolean | string {
  // https://www.w3.org/TR/wai-aria-1.1/#aria-current
  return checkBooleanAttribute(element, "aria-current") ?? attr(element, "aria-current") ?? false;
}

export function computeAriaExpanded(element: NodeImpl): boolean | undefined {
  // https://www.w3.org/TR/wai-aria-1.1/#aria-expanded
  return checkBooleanAttribute(element, "aria-expanded");
}

/** number if implicit heading or aria-level present, otherwise undefined */
function computeHeadingLevelImpl(element: NodeImpl): number | undefined {
  // https://w3c.github.io/html-aam/#el-h1-h6
  // explicit aria-level value https://www.w3.org/TR/wai-aria-1.2/#aria-level
  const level = attr(element, "aria-level");
  const ariaLevelAttribute = level && Number(level);
  if (ariaLevelAttribute) return ariaLevelAttribute;
  // `implicitHeadingLevels[element.tagName]`: only HTML h1-h6 have an uppercase tagName.
  if (element.ns !== HTML_NS) return undefined;
  switch (element.tag) {
    case T.h1:
      return 1;
    case T.h2:
      return 2;
    case T.h3:
      return 3;
    case T.h4:
      return 4;
    case T.h5:
      return 5;
    case T.h6:
      return 6;
  }
  return undefined;
}

export { computeHeadingLevelImpl };

export function computeHeadingLevel(element: any): number | undefined {
  return computeHeadingLevelImpl(implOf(element));
}

export function computeAriaValueNow(element: NodeImpl): number | undefined {
  const valueNow = attr(element, "aria-valuenow");
  return valueNow === null ? undefined : +valueNow;
}

export function computeAriaValueMax(element: NodeImpl): number | undefined {
  const valueMax = attr(element, "aria-valuemax");
  return valueMax === null ? undefined : +valueMax;
}

export function computeAriaValueMin(element: NodeImpl): number | undefined {
  const valueMin = attr(element, "aria-valuemin");
  return valueMin === null ? undefined : +valueMin;
}

export function computeAriaValueText(element: NodeImpl): string | undefined {
  const valueText = attr(element, "aria-valuetext");
  return valueText === null ? undefined : valueText;
}
