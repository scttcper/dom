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
import { $active, $current, $filter, $impl, $inflight, $pointerBeforeReference, $reference, $root, $whatToShow } from "../keys.ts";

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
  if (root === null || typeof root !== "object" || !($impl in root)) {
    throw new TypeError(`Failed to execute 'create${iface}' on 'Document': parameter 1 is not of type 'Node'.`);
  }
  return (root as Node)[$impl];
}

/** Shared state + https://dom.spec.whatwg.org/#concept-node-filter */
abstract class Traverser {
  [$root]: NodeImpl;
  [$whatToShow]: number;
  [$filter]: NodeFilterArg;
  [$active]: boolean;

  constructor(root: NodeImpl, whatToShow: number, filter: NodeFilterArg) {
    this[$root] = root;
    this[$whatToShow] = Number(whatToShow) >>> 0;
    this[$filter] = filter === undefined ? null : filter;
    this[$active] = false;
  }

  get root(): Node {
    return this[$root].node;
  }

  get whatToShow(): number {
    return this[$whatToShow];
  }

  get filter(): NodeFilterArg {
    return this[$filter];
  }

  /** https://dom.spec.whatwg.org/#concept-node-filter */
  _filterNode(n: NodeImpl): number {
    if (this[$active]) throw new DOMException("Recursive node filtering is not allowed.", "InvalidStateError");
    if ((this[$whatToShow] & (1 << (n.type - 1))) === 0) return FILTER_SKIP;
    const filter = this[$filter];
    if (filter === null) return FILTER_ACCEPT;
    this[$active] = true;
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
      this[$active] = false;
    }
    return (Number(result) >>> 0) & 0xffff;
  }
}

/** https://dom.spec.whatwg.org/#interface-nodeiterator */
export class NodeIterator extends Traverser implements IteratorState {
  /** https://dom.spec.whatwg.org/#nodeiterator-reference */
  [$reference]: NodeImpl;
  /** https://dom.spec.whatwg.org/#nodeiterator-pointer-before-reference */
  [$pointerBeforeReference]: boolean;
  [$inflight]: IteratorState | null;

  /** @internal Use document.createNodeIterator(). */
  constructor(root: Node, whatToShow = 0xffffffff, filter: NodeFilterArg = null) {
    const r = rootImpl(root, "NodeIterator");
    super(r, whatToShow, filter);
    this[$reference] = r;
    this[$pointerBeforeReference] = true;
    this[$inflight] = null;
    registerNodeIterator(this);
  }

  get referenceNode(): Node {
    return this[$reference].node;
  }

  get pointerBeforeReferenceNode(): boolean {
    return this[$pointerBeforeReference];
  }

  /**
   * https://dom.spec.whatwg.org/#concept-nodeiterator-traverse
   * While the filter runs, the candidate position lives in `_inflight`, which the pre-removing
   * steps retarget like the reference itself, so a filter that removes nodes cannot strand the
   * traversal on a detached node (WPT NodeIterator-removal-during-filtering). `referenceNode`
   * keeps reporting the last accepted node until the candidate is accepted.
   */
  #traverse(next: boolean): Node | null {
    const root = this[$root];
    const pos: IteratorState = { [$root]: root, [$reference]: this[$reference], [$pointerBeforeReference]: this[$pointerBeforeReference], [$inflight]: null };
    this[$inflight] = pos;
    try {
      for (;;) {
        let node = pos[$reference];
        let before = pos[$pointerBeforeReference];
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
        pos[$reference] = node;
        pos[$pointerBeforeReference] = before;
        if (this._filterNode(node) === FILTER_ACCEPT) {
          this[$reference] = pos[$reference];
          this[$pointerBeforeReference] = pos[$pointerBeforeReference];
          return node.node;
        }
      }
    } finally {
      this[$inflight] = null;
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
  [$current]: NodeImpl;

  /** @internal Use document.createTreeWalker(). */
  constructor(root: Node, whatToShow = 0xffffffff, filter: NodeFilterArg = null) {
    const r = rootImpl(root, "TreeWalker");
    super(r, whatToShow, filter);
    this[$current] = r;
  }

  get currentNode(): Node {
    return this[$current].node;
  }

  set currentNode(node: Node) {
    if (node === null || typeof node !== "object" || !($impl in node)) {
      throw new TypeError("Failed to set the 'currentNode' property on 'TreeWalker': The provided value is not of type 'Node'.");
    }
    this[$current] = node[$impl];
  }

  /** https://dom.spec.whatwg.org/#dom-treewalker-parentnode */
  parentNode(): Node | null {
    let node: NodeImpl | null = this[$current];
    while (node !== null && node !== this[$root]) {
      node = node.parent;
      if (node !== null && this._filterNode(node) === FILTER_ACCEPT) {
        this[$current] = node;
        return node.node;
      }
    }
    return null;
  }

  /** https://dom.spec.whatwg.org/#concept-traverse-children */
  #traverseChildren(first: boolean): Node | null {
    let node: NodeImpl | null = first ? this[$current].first : this[$current].last;
    while (node !== null) {
      const result = this._filterNode(node);
      if (result === FILTER_ACCEPT) {
        this[$current] = node;
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
        if (parent === null || parent === this[$root] || parent === this[$current]) return null;
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
    let node: NodeImpl = this[$current];
    if (node === this[$root]) return null;
    for (;;) {
      let sibling: NodeImpl | null = next ? node.next : node.prev;
      while (sibling !== null) {
        node = sibling;
        const result = this._filterNode(node);
        if (result === FILTER_ACCEPT) {
          this[$current] = node;
          return node.node;
        }
        sibling = next ? node.first : node.last;
        if (result === FILTER_REJECT || sibling === null) sibling = next ? node.next : node.prev;
      }
      const parent: NodeImpl | null = node.parent;
      if (parent === null || parent === this[$root]) return null;
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
    let node: NodeImpl = this[$current];
    while (node !== this[$root]) {
      let sibling: NodeImpl | null = node.prev;
      while (sibling !== null) {
        node = sibling;
        let result = this._filterNode(node);
        while (result !== FILTER_REJECT && node.first !== null) {
          node = node.last!;
          result = this._filterNode(node);
        }
        if (result === FILTER_ACCEPT) {
          this[$current] = node;
          return node.node;
        }
        sibling = node.prev;
      }
      const parent: NodeImpl | null = node.parent;
      if (node === this[$root] || parent === null) return null;
      node = parent;
      if (this._filterNode(node) === FILTER_ACCEPT) {
        this[$current] = node;
        return node.node;
      }
    }
    return null;
  }

  /** https://dom.spec.whatwg.org/#dom-treewalker-nextnode */
  nextNode(): Node | null {
    let node: NodeImpl = this[$current];
    let result = FILTER_ACCEPT;
    for (;;) {
      while (result !== FILTER_REJECT && node.first !== null) {
        node = node.first;
        result = this._filterNode(node);
        if (result === FILTER_ACCEPT) {
          this[$current] = node;
          return node.node;
        }
      }
      let sibling: NodeImpl | null = null;
      let temporary: NodeImpl | null = node;
      while (temporary !== null) {
        if (temporary === this[$root]) return null;
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
        this[$current] = node;
        return node.node;
      }
    }
  }
}

Object.defineProperty(NodeIterator.prototype, Symbol.toStringTag, { value: "NodeIterator", configurable: true });
Object.defineProperty(TreeWalker.prototype, Symbol.toStringTag, { value: "TreeWalker", configurable: true });
