import {
  DOCUMENT_POSITION_CONTAINED_BY,
  DOCUMENT_POSITION_CONTAINS,
  DOCUMENT_POSITION_DISCONNECTED,
  DOCUMENT_POSITION_FOLLOWING,
  DOCUMENT_POSITION_PRECEDING,
  ELEMENT_NODE,
} from "./constants.ts";
import type { NodeImpl } from "./NodeImpl.ts";

// Allocation-free tree-order (preorder) iteration helpers over NodeImpl.
// https://dom.spec.whatwg.org/#concept-tree-order
//
// Typical loop over the descendants of `root` (excluding root):
//   for (let n = root.first; n !== null; n = nextInTree(n, root)) { ... }

/** Next node in tree order within `root`'s subtree, or null. */
export function nextInTree(n: NodeImpl, root: NodeImpl): NodeImpl | null {
  const first = n.first;
  if (first !== null) return first;
  return nextSkippingChildren(n, root);
}

/** Next node in tree order within `root`'s subtree that is not a descendant of `n`, or null. */
export function nextSkippingChildren(n: NodeImpl, root: NodeImpl): NodeImpl | null {
  let cur: NodeImpl | null = n;
  while (cur !== null && cur !== root) {
    const next: NodeImpl | null = cur.next;
    if (next !== null) return next;
    cur = cur.parent;
  }
  return null;
}

/** Previous node in tree order within `root`'s subtree (root itself included), or null. */
export function previousInTree(n: NodeImpl, root: NodeImpl): NodeImpl | null {
  if (n === root) return null;
  let prev = n.prev;
  if (prev === null) return n.parent;
  while (prev.last !== null) prev = prev.last;
  return prev;
}

/** Next element in tree order within `root`'s subtree, or null. */
export function nextElementInTree(n: NodeImpl, root: NodeImpl): NodeImpl | null {
  let cur = nextInTree(n, root);
  while (cur !== null && cur.type !== ELEMENT_NODE) cur = nextInTree(cur, root);
  return cur;
}

export function firstElementChild(n: NodeImpl): NodeImpl | null {
  let c = n.first;
  while (c !== null && c.type !== ELEMENT_NODE) c = c.next;
  return c;
}

export function lastElementChild(n: NodeImpl): NodeImpl | null {
  let c = n.last;
  while (c !== null && c.type !== ELEMENT_NODE) c = c.prev;
  return c;
}

export function nextElementSibling(n: NodeImpl): NodeImpl | null {
  let c = n.next;
  while (c !== null && c.type !== ELEMENT_NODE) c = c.next;
  return c;
}

export function previousElementSibling(n: NodeImpl): NodeImpl | null {
  let c = n.prev;
  while (c !== null && c.type !== ELEMENT_NODE) c = c.prev;
  return c;
}

/** Whether a precedes b, given two distinct children of the same parent. */
export function siblingPrecedes(a: NodeImpl, b: NodeImpl): boolean {
  if (b.next === null) return true;
  if (b.prev === null) return false;
  // Search outward from a. Reaching an end rules out that whole direction.
  let following = a.next;
  let preceding = a.prev;
  while (following !== null && preceding !== null) {
    if (following === b) return true;
    if (preceding === b) return false;
    following = following.next;
    preceding = preceding.prev;
  }
  return preceding === null;
}

/** Root of the tree containing `n` (not shadow-including). https://dom.spec.whatwg.org/#concept-tree-root */
export function treeRoot(n: NodeImpl): NodeImpl {
  let cur = n;
  while (cur.parent !== null) cur = cur.parent;
  return cur;
}

/** Whether `a` is an inclusive ancestor of `b`. */
export function isInclusiveAncestor(a: NodeImpl, b: NodeImpl): boolean {
  let cur: NodeImpl | null = b;
  while (cur !== null) {
    if (cur === a) return true;
    cur = cur.parent;
  }
  return false;
}

/** Index of `n` among its siblings. https://dom.spec.whatwg.org/#concept-tree-index */
export function indexOf(n: NodeImpl): number {
  let i = 0;
  for (let c = n.prev; c !== null; c = c.prev) i++;
  return i;
}

/** Child at `index`, walking from whichever end is closer. */
export function childAt(parent: NodeImpl, index: number): NodeImpl | null {
  const count = parent.childCount;
  if (index < 0 || index >= count) return null;
  if (index < count >> 1) {
    let c = parent.first;
    for (let i = 0; i < index; i++) c = c!.next;
    return c;
  }
  let c = parent.last;
  for (let i = count - 1; i > index; i--) c = c!.prev;
  return c;
}

/** Position of b relative to a in the ordinary (not shadow-including) tree. */
export function relativeTreePosition(a: NodeImpl, b: NodeImpl): number {
  if (a === b) return 0;
  if (a.parent !== b.parent) {
    // Align the depths before looking for the children of the common ancestor.
    let difference = 0;
    for (let n = a.parent; n !== null; n = n.parent) {
      if (n === b) return DOCUMENT_POSITION_CONTAINS | DOCUMENT_POSITION_PRECEDING;
      difference++;
    }
    for (let n = b.parent; n !== null; n = n.parent) {
      if (n === a) return DOCUMENT_POSITION_CONTAINED_BY | DOCUMENT_POSITION_FOLLOWING;
      difference--;
    }
    for (; difference > 0; difference--) a = a.parent!;
    for (; difference < 0; difference++) b = b.parent!;
    while (a.parent !== b.parent) {
      a = a.parent!;
      b = b.parent!;
    }
  }
  if (a.parent === null) return DOCUMENT_POSITION_DISCONNECTED;
  return siblingPrecedes(a, b) ? DOCUMENT_POSITION_FOLLOWING : DOCUMENT_POSITION_PRECEDING;
}

/** Negative if a precedes b in tree order (https://dom.spec.whatwg.org/#concept-tree-order). */
export function compareTreeOrder(a: NodeImpl, b: NodeImpl): number {
  const position = relativeTreePosition(a, b);
  return position === 0 ? 0 : position & DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
}
