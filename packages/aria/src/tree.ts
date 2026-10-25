// Small NodeImpl helpers shared by the role, name and state computations.

import {
  DOCUMENT_NODE,
  ELEMENT_NODE,
  TEXT_NODE,
  CDATA_SECTION_NODE,
  treeRoot,
  type NodeImpl,
} from "@ctrl/dom/internal";
import type { Element, Node } from "@ctrl/dom";
import { $impl } from "@ctrl/dom/internal";

/** The NodeImpl behind a public wrapper. */
export function implOf(node: Node | Element): NodeImpl {
  const impl = (node as unknown as { [$impl]?: NodeImpl })[$impl];
  if (impl === undefined) throw new TypeError("Expected a node created by @ctrl/dom.");
  return impl;
}

function nextInTreeWithin(n: NodeImpl, root: NodeImpl): NodeImpl | null {
  if (n.first !== null) return n.first;
  let cur: NodeImpl | null = n;
  while (cur !== null && cur !== root) {
    if (cur.next !== null) return cur.next;
    cur = cur.parent;
  }
  return null;
}

/**
 * `root.getElementById(id)` for a Document or DocumentFragment/ShadowRoot root.
 * https://dom.spec.whatwg.org/#dom-nonelementparentnode-getelementbyid
 */
export function elementByIdInRoot(root: NodeImpl, id: string): NodeImpl | null {
  if (id === "") return null;
  if (root.type === DOCUMENT_NODE) {
    return (root.node as unknown as { _idLookup(id: string): NodeImpl | null })._idLookup(id);
  }
  for (let n = root.first; n !== null; n = nextInTreeWithin(n, root)) {
    if (n.type === ELEMENT_NODE && n.id === id) return n;
  }
  return null;
}

/**
 * dom-accessibility-api's `queryIdRefs(node, attributeName)`: split the attribute on " "
 * and resolve each token with `node.getRootNode().getElementById(token)`.
 * https://w3c.github.io/aria/#valuetype_idref_list
 *
 * Deviation: when the root is a detached element (which has no getElementById, so
 * dom-accessibility-api throws a TypeError), this returns no elements.
 */
export function queryIdRefs(impl: NodeImpl, value: string | null, out: NodeImpl[]): NodeImpl[] {
  if (value === null) return out;
  const root = treeRoot(impl);
  if (root.type === ELEMENT_NODE) return out;
  let start = 0;
  const len = value.length;
  while (start <= len) {
    let end = value.indexOf(" ", start);
    if (end === -1) end = len;
    if (end > start) {
      const el = elementByIdInRoot(root, value.slice(start, end));
      if (el !== null) out.push(el);
    }
    start = end + 1;
  }
  return out;
}

/** https://dom.spec.whatwg.org/#dom-node-textcontent for an element (descendant text, tree order). */
export function textContent(impl: NodeImpl): string {
  let s = "";
  for (let n = impl.first; n !== null; n = nextInTreeWithin(n, impl)) {
    if (n.type === TEXT_NODE || n.type === CDATA_SECTION_NODE) s += n.data;
  }
  return s;
}
