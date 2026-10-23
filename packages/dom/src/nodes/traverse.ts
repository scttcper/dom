import { ELEMENT_NODE } from "./constants.ts";
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
