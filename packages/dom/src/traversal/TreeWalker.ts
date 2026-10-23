// https://dom.spec.whatwg.org/#traversal
// https://dom.spec.whatwg.org/#interface-nodefilter
// https://dom.spec.whatwg.org/#interface-nodeiterator
// https://dom.spec.whatwg.org/#interface-treewalker
//
// OWNER: dom-core. Both traversers walk NodeImpls; wrappers are touched only to call the
// user's filter and to return results.

import type { Node } from "../nodes/Node.ts";
import type { NodeImpl } from "../nodes/NodeImpl.ts";
import { nextInTree, previousInTree } from "../nodes/traverse.ts";
import { registerNodeIterator, type IteratorState } from "./live.ts";

/** https://dom.spec.whatwg.org/#interface-nodefilter (constants; the interface object is a plain namespace-like object). */
export const NodeFilter = Object.freeze({
  FILTER_ACCEPT: 1,
  FILTER_REJECT: 2,
  FILTER_SKIP: 3,
  SHOW_ALL: 0xffffffff,
  SHOW_ELEMENT: 0x1,
  SHOW_ATTRIBUTE: 0x2,
  SHOW_TEXT: 0x4,
  SHOW_CDATA_SECTION: 0x8,
  SHOW_ENTITY_REFERENCE: 0x10,
  SHOW_ENTITY: 0x20,
  SHOW_PROCESSING_INSTRUCTION: 0x40,
  SHOW_COMMENT: 0x80,
  SHOW_DOCUMENT: 0x100,
  SHOW_DOCUMENT_TYPE: 0x200,
  SHOW_DOCUMENT_FRAGMENT: 0x400,
  SHOW_NOTATION: 0x800,
});

const FILTER_ACCEPT = 1;
const FILTER_REJECT = 2;
const FILTER_SKIP = 3;

export type NodeFilterCallback = (node: Node) => number;
export type NodeFilterArg = NodeFilterCallback | { acceptNode(node: Node): number } | null;

function rootImpl(root: unknown, iface: string): NodeImpl {
  if (root === null || typeof root !== "object" || !("_impl" in root)) {
    throw new TypeError(`Failed to execute 'create${iface}' on 'Document': parameter 1 is not of type 'Node'.`);
  }
  return (root as Node)._impl;
}

/** Shared state + https://dom.spec.whatwg.org/#concept-node-filter */
abstract class Traverser {
  _root: NodeImpl;
  _whatToShow: number;
  _filter: NodeFilterArg;
  _active: boolean;

  constructor(root: NodeImpl, whatToShow: number, filter: NodeFilterArg) {
    this._root = root;
    this._whatToShow = Number(whatToShow) >>> 0;
    this._filter = filter === undefined ? null : filter;
    this._active = false;
  }

  get root(): Node {
    return this._root.node;
  }

  get whatToShow(): number {
    return this._whatToShow;
  }

  get filter(): NodeFilterArg {
    return this._filter;
  }

  /** https://dom.spec.whatwg.org/#concept-node-filter */
  _filterNode(n: NodeImpl): number {
    if (this._active) throw new DOMException("Recursive node filtering is not allowed.", "InvalidStateError");
    if ((this._whatToShow & (1 << (n.type - 1))) === 0) return FILTER_SKIP;
    const filter = this._filter;
    if (filter === null) return FILTER_ACCEPT;
    this._active = true;
    let result: unknown;
    try {
      if (typeof filter === "function") {
        result = filter.call(undefined, n.node);
      } else {
        const accept = (filter as { acceptNode?: unknown }).acceptNode;
        if (typeof accept !== "function") throw new TypeError("NodeFilter.acceptNode is not a function.");
        result = accept.call(filter, n.node);
      }
    } finally {
      this._active = false;
    }
    return (Number(result) >>> 0) & 0xffff;
  }
}

/** https://dom.spec.whatwg.org/#interface-nodeiterator */
export class NodeIterator extends Traverser implements IteratorState {
  /** https://dom.spec.whatwg.org/#nodeiterator-reference */
  _reference: NodeImpl;
  /** https://dom.spec.whatwg.org/#nodeiterator-pointer-before-reference */
  _pointerBeforeReference: boolean;
  _inflight: IteratorState | null;

  /** @internal Use document.createNodeIterator(). */
  constructor(root: Node, whatToShow = 0xffffffff, filter: NodeFilterArg = null) {
    const r = rootImpl(root, "NodeIterator");
    super(r, whatToShow, filter);
    this._reference = r;
    this._pointerBeforeReference = true;
    this._inflight = null;
    registerNodeIterator(this);
  }

  get referenceNode(): Node {
    return this._reference.node;
  }

  get pointerBeforeReferenceNode(): boolean {
    return this._pointerBeforeReference;
  }

  /**
   * https://dom.spec.whatwg.org/#concept-nodeiterator-traverse
   * While the filter runs, the candidate position lives in `_inflight`, which the pre-removing
   * steps retarget like the reference itself, so a filter that removes nodes cannot strand the
   * traversal on a detached node (WPT NodeIterator-removal-during-filtering). `referenceNode`
   * keeps reporting the last accepted node until the candidate is accepted.
   */
  #traverse(next: boolean): Node | null {
    const root = this._root;
    const pos: IteratorState = { _root: root, _reference: this._reference, _pointerBeforeReference: this._pointerBeforeReference, _inflight: null };
    this._inflight = pos;
    try {
      for (;;) {
        let node = pos._reference;
        let before = pos._pointerBeforeReference;
        if (next) {
          if (!before) {
            const n = nextInTree(node, root);
            if (n === null) return null;
            node = n;
          } else {
            before = false;
          }
        } else if (before) {
          const p = previousInTree(node, root);
          if (p === null) return null;
          node = p;
        } else {
          before = true;
        }
        pos._reference = node;
        pos._pointerBeforeReference = before;
        if (this._filterNode(node) === FILTER_ACCEPT) {
          this._reference = pos._reference;
          this._pointerBeforeReference = pos._pointerBeforeReference;
          return node.node;
        }
      }
    } finally {
      this._inflight = null;
    }
  }

  nextNode(): Node | null {
    return this.#traverse(true);
  }

  previousNode(): Node | null {
    return this.#traverse(false);
  }

  /** https://dom.spec.whatwg.org/#dom-nodeiterator-detach — does nothing. */
  detach(): void {}
}

/** https://dom.spec.whatwg.org/#interface-treewalker */
export class TreeWalker extends Traverser {
  _current: NodeImpl;

  /** @internal Use document.createTreeWalker(). */
  constructor(root: Node, whatToShow = 0xffffffff, filter: NodeFilterArg = null) {
    const r = rootImpl(root, "TreeWalker");
    super(r, whatToShow, filter);
    this._current = r;
  }

  get currentNode(): Node {
    return this._current.node;
  }

  set currentNode(node: Node) {
    if (node === null || typeof node !== "object" || !("_impl" in node)) {
      throw new TypeError("Failed to set the 'currentNode' property on 'TreeWalker': The provided value is not of type 'Node'.");
    }
    this._current = node._impl;
  }

  /** https://dom.spec.whatwg.org/#dom-treewalker-parentnode */
  parentNode(): Node | null {
    let node: NodeImpl | null = this._current;
    while (node !== null && node !== this._root) {
      node = node.parent;
      if (node !== null && this._filterNode(node) === FILTER_ACCEPT) {
        this._current = node;
        return node.node;
      }
    }
    return null;
  }

  /** https://dom.spec.whatwg.org/#concept-traverse-children */
  #traverseChildren(first: boolean): Node | null {
    let node: NodeImpl | null = first ? this._current.first : this._current.last;
    while (node !== null) {
      const result = this._filterNode(node);
      if (result === FILTER_ACCEPT) {
        this._current = node;
        return node.node;
      }
      if (result === FILTER_SKIP) {
        const child: NodeImpl | null = first ? node.first : node.last;
        if (child !== null) {
          node = child;
          continue;
        }
      }
      while (node !== null) {
        const sibling: NodeImpl | null = first ? node.next : node.prev;
        if (sibling !== null) {
          node = sibling;
          break;
        }
        const parent: NodeImpl | null = node.parent;
        if (parent === null || parent === this._root || parent === this._current) return null;
        node = parent;
      }
    }
    return null;
  }

  firstChild(): Node | null {
    return this.#traverseChildren(true);
  }

  lastChild(): Node | null {
    return this.#traverseChildren(false);
  }

  /** https://dom.spec.whatwg.org/#concept-traverse-siblings */
  #traverseSiblings(next: boolean): Node | null {
    let node: NodeImpl = this._current;
    if (node === this._root) return null;
    for (;;) {
      let sibling: NodeImpl | null = next ? node.next : node.prev;
      while (sibling !== null) {
        node = sibling;
        const result = this._filterNode(node);
        if (result === FILTER_ACCEPT) {
          this._current = node;
          return node.node;
        }
        sibling = next ? node.first : node.last;
        if (result === FILTER_REJECT || sibling === null) sibling = next ? node.next : node.prev;
      }
      const parent: NodeImpl | null = node.parent;
      if (parent === null || parent === this._root) return null;
      node = parent;
      if (this._filterNode(node) === FILTER_ACCEPT) return null;
    }
  }

  nextSibling(): Node | null {
    return this.#traverseSiblings(true);
  }

  previousSibling(): Node | null {
    return this.#traverseSiblings(false);
  }

  /** https://dom.spec.whatwg.org/#dom-treewalker-previousnode */
  previousNode(): Node | null {
    let node: NodeImpl = this._current;
    while (node !== this._root) {
      let sibling: NodeImpl | null = node.prev;
      while (sibling !== null) {
        node = sibling;
        let result = this._filterNode(node);
        while (result !== FILTER_REJECT && node.first !== null) {
          node = node.last!;
          result = this._filterNode(node);
        }
        if (result === FILTER_ACCEPT) {
          this._current = node;
          return node.node;
        }
        sibling = node.prev;
      }
      const parent: NodeImpl | null = node.parent;
      if (node === this._root || parent === null) return null;
      node = parent;
      if (this._filterNode(node) === FILTER_ACCEPT) {
        this._current = node;
        return node.node;
      }
    }
    return null;
  }

  /** https://dom.spec.whatwg.org/#dom-treewalker-nextnode */
  nextNode(): Node | null {
    let node: NodeImpl = this._current;
    let result = FILTER_ACCEPT;
    for (;;) {
      while (result !== FILTER_REJECT && node.first !== null) {
        node = node.first;
        result = this._filterNode(node);
        if (result === FILTER_ACCEPT) {
          this._current = node;
          return node.node;
        }
      }
      let sibling: NodeImpl | null = null;
      let temporary: NodeImpl | null = node;
      while (temporary !== null) {
        if (temporary === this._root) return null;
        sibling = temporary.next;
        if (sibling !== null) {
          node = sibling;
          break;
        }
        temporary = temporary.parent;
      }
      if (temporary === null) return null;
      result = this._filterNode(node);
      if (result === FILTER_ACCEPT) {
        this._current = node;
        return node.node;
      }
    }
  }
}

Object.defineProperty(NodeIterator.prototype, Symbol.toStringTag, { value: "NodeIterator", configurable: true });
Object.defineProperty(TreeWalker.prototype, Symbol.toStringTag, { value: "TreeWalker", configurable: true });
