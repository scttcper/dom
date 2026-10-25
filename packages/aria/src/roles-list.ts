// `getRoles` / `prettyRoles` data as Testing Library 10.4 builds it (role-helpers.js), on
// NodeImpl. Used by `logRoles` and the `*ByRole` "Unable to find role" error message.
//
// Specs: https://www.w3.org/TR/html-aam-1.0/#html-element-role-mappings,
//        https://www.w3.org/TR/wai-aria-1.2/#tree_exclusion

import { ELEMENT_NODE, attr, getComputedStyleOverride, type NodeImpl } from "@ctrl/dom/internal";
import type { Element } from "@ctrl/dom";
import { implicitRole } from "./role.ts";
import { isInaccessibleImpl, isInaccessibleWithStyle } from "./hidden.ts";
import { computeAccessibleNameImpl, computeAccessibleDescriptionImpl, type GetComputedStyle } from "./accname.ts";
import { implOf } from "./tree.ts";

/** Role → elements (tree order), keyed in order of first appearance. Implicit role "" elements are skipped. */
export function getRolesImpl(container: NodeImpl, hidden: boolean): Map<string, NodeImpl[]> {
  const out = new Map<string, NodeImpl[]>();
  // A user-replaced window.getComputedStyle is what role-helpers.js reads (checked once per call).
  const gcs = hidden ? null : (getComputedStyleOverride(container) as unknown as GetComputedStyle | null);
  const memo = gcs !== null ? new Map<NodeImpl, boolean>() : null;
  // flattenDOM: the container followed by its element descendants, preorder.
  for (let n: NodeImpl | null = container; n !== null; ) {
    if (n.type === ELEMENT_NODE && (hidden || !(gcs === null ? isInaccessibleImpl(n) : isInaccessibleWithStyle(n, gcs, memo)))) {
      const roleAttr = attr(n, "role");
      let role: string;
      if (roleAttr !== null) {
        const sp = roleAttr.indexOf(" ");
        role = sp === -1 ? roleAttr : roleAttr.slice(0, sp);
      } else {
        role = implicitRole(n);
      }
      if (roleAttr !== null || role !== "") {
        const list = out.get(role);
        if (list === undefined) out.set(role, [n]);
        else list.push(n);
      }
    }
    // next element in preorder within container (Testing Library walks `children`)
    let next: NodeImpl | null = null;
    for (let c: NodeImpl | null = n.first; c !== null; c = c.next) {
      if (c.type === ELEMENT_NODE) {
        next = c;
        break;
      }
    }
    if (next === null) {
      let cur: NodeImpl | null = n;
      while (cur !== null && cur !== container) {
        for (let s: NodeImpl | null = cur.next; s !== null; s = s.next) {
          if (s.type === ELEMENT_NODE) {
            next = s;
            break;
          }
        }
        if (next !== null) break;
        cur = cur.parent;
      }
    }
    n = next;
  }
  return out;
}

/** Testing Library's `getRoles(container, { hidden })`. */
export function getRoles(container: Element, options: { hidden?: boolean } = {}): Record<string, Element[]> {
  const map = getRolesImpl(implOf(container), options.hidden ?? false);
  const out: Record<string, Element[]> = {};
  for (const [role, list] of map) out[role] = list.map((n) => n.node as unknown as Element);
  return out;
}

export interface PrettyRolesOptions {
  hidden?: boolean;
  includeDescription?: boolean;
  computedStyleSupportsPseudoElements?: boolean;
}

/**
 * Testing Library's `prettyRoles(dom, { hidden, includeDescription })`. `prettyDOM` formats
 * `el.cloneNode(false)` (it lives in @ctrl/dom/testing-library, which passes its own).
 */
export function prettyRoles(dom: Element, options: PrettyRolesOptions, prettyDOM: (node: Element) => string): string {
  const root = implOf(dom);
  const map = getRolesImpl(root, options.hidden ?? false);
  const gcs = getComputedStyleOverride(root) as unknown as GetComputedStyle | null;
  const pseudo = options.computedStyleSupportsPseudoElements ?? false;
  const nameOptions = gcs === null ? { computedStyleSupportsPseudoElements: pseudo } : { computedStyleSupportsPseudoElements: pseudo, getComputedStyle: gcs };
  const delimiterBar = "-".repeat(50);
  const parts: string[] = [];
  for (const [role, elements] of map) {
    // We prefer to skip generic role, we don't recommend it
    if (role === "generic") continue;
    const elementsString = elements
      .map((el) => {
        const nameString = `Name "${computeAccessibleNameImpl(el, nameOptions, 5)}":\n`;
        const domString = prettyDOM((el.node as unknown as Element).cloneNode(false) as Element);
        if (options.includeDescription) {
          const descriptionString = `Description "${computeAccessibleDescriptionImpl(el, nameOptions, 5)}":\n`;
          return `${nameString}${descriptionString}${domString}`;
        }
        return `${nameString}${domString}`;
      })
      .join("\n\n");
    parts.push(`${role}:\n\n${elementsString}\n\n${delimiterBar}`);
  }
  return parts.join("\n");
}
