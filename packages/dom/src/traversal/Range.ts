// https://dom.spec.whatwg.org/#ranges
// https://dom.spec.whatwg.org/#interface-abstractrange
// https://dom.spec.whatwg.org/#interface-staticrange
// https://dom.spec.whatwg.org/#interface-range
//
// OWNER: dom-core. Boundary points are stored as NodeImpls (`_sc/_so/_ec/_eo`). Live ranges
// register themselves (weakly) in traversal/live.ts; the mutation algorithms update them only
// while at least one exists.

import {
  ATTRIBUTE_NODE,
  CDATA_SECTION_NODE,
  COMMENT_NODE,
  DOCUMENT_FRAGMENT_NODE,
  DOCUMENT_NODE,
  DOCUMENT_TYPE_NODE,
  ELEMENT_NODE,
  F_HTML,
  HTML_NS,
  PROCESSING_INSTRUCTION_NODE,
  TEXT_NODE,
} from "../nodes/constants.ts";
import type { Document } from "../nodes/Document.ts";
import type { DocumentFragment } from "../nodes/DocumentFragment.ts";
import type { Node } from "../nodes/Node.ts";
import type { NodeImpl } from "../nodes/NodeImpl.ts";
import { childAt, indexOf, isInclusiveAncestor, nextInTree, nextSkippingChildren, treeRoot } from "../nodes/traverse.ts";
import { append, ensurePreInsertionValidity, preInsert, remove, replaceAll } from "../nodes/tree.ts";
import { cloneNode } from "../nodes/clone.ts";
import { replaceData, splitText } from "../nodes/character-data.ts";
import { currentDocument } from "../window/current.ts";
import { parseFragment } from "../parser/index.ts";
import { DOMRect, DOMRectList } from "../window/geometry.ts";
import { refileRange, registerLiveRange } from "./live.ts";

export const START_TO_START = 0;
export const START_TO_END = 1;
export const END_TO_END = 2;
export const END_TO_START = 3;

function isCharacterData(n: NodeImpl): boolean {
  const t = n.type;
  return t === TEXT_NODE || t === CDATA_SECTION_NODE || t === COMMENT_NODE || t === PROCESSING_INSTRUCTION_NODE;
}

function isText(n: NodeImpl): boolean {
  return n.type === TEXT_NODE || n.type === CDATA_SECTION_NODE;
}

/** https://dom.spec.whatwg.org/#concept-node-length */
export function nodeLength(n: NodeImpl): number {
  switch (n.type) {
    case DOCUMENT_TYPE_NODE:
    case ATTRIBUTE_NODE:
      return 0;
    case TEXT_NODE:
    case CDATA_SECTION_NODE:
    case COMMENT_NODE:
    case PROCESSING_INSTRUCTION_NODE:
      return n.data.length;
    default:
      return n.childCount;
  }
}

function toNodeImpl(node: unknown, method: string, iface = "Range"): NodeImpl {
  if (node === null || typeof node !== "object" || !("_impl" in node)) {
    throw new TypeError(`Failed to execute '${method}' on '${iface}': parameter 1 is not of type 'Node'.`);
  }
  return (node as Node)._impl;
}

/**
 * Position of boundary point (a, oa) relative to (b, ob): -1 before, 0 equal, 1 after.
 * https://dom.spec.whatwg.org/#concept-range-bp-position — computed from the two ancestor
 * chains (O(depth)) rather than by scanning tree order. The points must share a root.
 */
export function compareBoundaryPoints(a: NodeImpl, oa: number, b: NodeImpl, ob: number): number {
  if (a === b) return oa === ob ? 0 : oa < ob ? -1 : 1;
  let da = 0;
  for (let n = a.parent; n !== null; n = n.parent) da++;
  let db = 0;
  for (let n = b.parent; n !== null; n = n.parent) db++;
  let x = a;
  let y = b;
  let childX: NodeImpl | null = null;
  let childY: NodeImpl | null = null;
  while (da > db) {
    childX = x;
    x = x.parent!;
    da--;
  }
  while (db > da) {
    childY = y;
    y = y.parent!;
    db--;
  }
  while (x !== y) {
    childX = x;
    x = x.parent!;
    childY = y;
    y = y.parent!;
  }
  // Step 4: a is an ancestor of b.
  if (x === a) return indexOf(childY!) < oa ? 1 : -1;
  // Mirror of step 4 (step 3 + 4): b is an ancestor of a.
  if (x === b) return indexOf(childX!) < ob ? -1 : 1;
  // Disjoint subtrees: sibling order of the children of the common ancestor.
  for (let n = childX!.next; n !== null; n = n.next) if (n === childY) return -1;
  return 1;
}

/** The child of `ancestor` that is an inclusive ancestor of `node` (node must be a descendant). */
function childOfAncestor(node: NodeImpl, ancestor: NodeImpl): NodeImpl {
  let n = node;
  while (n.parent !== ancestor) n = n.parent!;
  return n;
}

function commonAncestor(a: NodeImpl, b: NodeImpl): NodeImpl {
  let c = a;
  while (!isInclusiveAncestor(c, b)) c = c.parent!;
  return c;
}

/** https://dom.spec.whatwg.org/#interface-abstractrange */
export abstract class AbstractRange {
  /** @internal start container / offset, end container / offset */
  _sc: NodeImpl;
  _so: number;
  _ec: NodeImpl;
  _eo: number;

  /** @internal live.ts bookkeeping (null for StaticRange). */
  _home: object | null;

  constructor(sc: NodeImpl, so: number, ec: NodeImpl, eo: number) {
    this._sc = sc;
    this._so = so;
    this._ec = ec;
    this._eo = eo;
    this._home = null;
  }

  get startContainer(): Node {
    return this._sc.node;
  }

  get startOffset(): number {
    return this._so;
  }

  get endContainer(): Node {
    return this._ec.node;
  }

  get endOffset(): number {
    return this._eo;
  }

  /** https://dom.spec.whatwg.org/#range-collapsed */
  get collapsed(): boolean {
    return this._sc === this._ec && this._so === this._eo;
  }
}

export interface StaticRangeInit {
  startContainer: Node;
  startOffset: number;
  endContainer: Node;
  endOffset: number;
}

/** https://dom.spec.whatwg.org/#interface-staticrange */
export class StaticRange extends AbstractRange {
  constructor(init: StaticRangeInit) {
    if (init === null || typeof init !== "object") throw new TypeError("Failed to construct 'StaticRange': 1 argument required.");
    for (const k of ["startContainer", "startOffset", "endContainer", "endOffset"] as const) {
      if (init[k] === undefined) throw new TypeError(`Failed to construct 'StaticRange': required member ${k} is undefined.`);
    }
    const sc = toNodeImpl(init.startContainer, "constructor", "StaticRange");
    const ec = toNodeImpl(init.endContainer, "constructor", "StaticRange");
    if (sc.type === DOCUMENT_TYPE_NODE || sc.type === ATTRIBUTE_NODE || ec.type === DOCUMENT_TYPE_NODE || ec.type === ATTRIBUTE_NODE) {
      throw new DOMException("Failed to construct 'StaticRange': Invalid boundary container.", "InvalidNodeTypeError");
    }
    super(sc, Number(init.startOffset) >>> 0, ec, Number(init.endOffset) >>> 0);
  }
}

/** https://dom.spec.whatwg.org/#interface-range */
export class Range extends AbstractRange {
  static readonly START_TO_START = START_TO_START;
  static readonly START_TO_END = START_TO_END;
  static readonly END_TO_END = END_TO_END;
  static readonly END_TO_START = END_TO_START;
  declare readonly START_TO_START: number;
  declare readonly START_TO_END: number;
  declare readonly END_TO_END: number;
  declare readonly END_TO_START: number;

  /** https://dom.spec.whatwg.org/#dom-range-range */
  constructor(doc?: Document) {
    const d = (doc ?? currentDocument())._impl;
    super(d, 0, d, 0);
    registerLiveRange(this);
  }

  /** @internal Create a live range in `doc` with the given boundary points. */
  static _create(doc: Document, sc: NodeImpl, so: number, ec: NodeImpl, eo: number): Range {
    const r = new Range(doc);
    r._sc = sc;
    r._so = so;
    r._ec = ec;
    r._eo = eo;
    refileRange(r);
    return r;
  }

  /** https://dom.spec.whatwg.org/#concept-range-root */
  _root(): NodeImpl {
    return treeRoot(this._sc);
  }

  /** https://dom.spec.whatwg.org/#dom-range-commonancestorcontainer */
  get commonAncestorContainer(): Node {
    return commonAncestor(this._sc, this._ec).node;
  }

  /** https://dom.spec.whatwg.org/#concept-range-bp-set */
  _setStart(node: NodeImpl, offset: number): void {
    if (node.type === DOCUMENT_TYPE_NODE) throw new DOMException("DocumentType Node can't be used as boundary point.", "InvalidNodeTypeError");
    if (offset > nodeLength(node)) throw new DOMException(`There is no child at offset ${offset}.`, "IndexSizeError");
    if (treeRoot(node) !== this._root() || compareBoundaryPoints(node, offset, this._ec, this._eo) > 0) {
      this._ec = node;
      this._eo = offset;
    }
    this._sc = node;
    this._so = offset;
    refileRange(this);
  }

  _setEnd(node: NodeImpl, offset: number): void {
    if (node.type === DOCUMENT_TYPE_NODE) throw new DOMException("DocumentType Node can't be used as boundary point.", "InvalidNodeTypeError");
    if (offset > nodeLength(node)) throw new DOMException(`There is no child at offset ${offset}.`, "IndexSizeError");
    if (treeRoot(node) !== this._root() || compareBoundaryPoints(node, offset, this._sc, this._so) < 0) {
      this._sc = node;
      this._so = offset;
    }
    this._ec = node;
    this._eo = offset;
    refileRange(this);
  }

  setStart(node: Node, offset: number): void {
    this._setStart(toNodeImpl(node, "setStart"), Number(offset) >>> 0);
  }

  setEnd(node: Node, offset: number): void {
    this._setEnd(toNodeImpl(node, "setEnd"), Number(offset) >>> 0);
  }

  setStartBefore(node: Node): void {
    const n = toNodeImpl(node, "setStartBefore");
    const parent = n.parent;
    if (parent === null) throw new DOMException("The given Node has no parent.", "InvalidNodeTypeError");
    this._setStart(parent, indexOf(n));
  }

  setStartAfter(node: Node): void {
    const n = toNodeImpl(node, "setStartAfter");
    const parent = n.parent;
    if (parent === null) throw new DOMException("The given Node has no parent.", "InvalidNodeTypeError");
    this._setStart(parent, indexOf(n) + 1);
  }

  setEndBefore(node: Node): void {
    const n = toNodeImpl(node, "setEndBefore");
    const parent = n.parent;
    if (parent === null) throw new DOMException("The given Node has no parent.", "InvalidNodeTypeError");
    this._setEnd(parent, indexOf(n));
  }

  setEndAfter(node: Node): void {
    const n = toNodeImpl(node, "setEndAfter");
    const parent = n.parent;
    if (parent === null) throw new DOMException("The given Node has no parent.", "InvalidNodeTypeError");
    this._setEnd(parent, indexOf(n) + 1);
  }

  /** https://dom.spec.whatwg.org/#dom-range-collapse */
  collapse(toStart = false): void {
    if (toStart) {
      this._ec = this._sc;
      this._eo = this._so;
    } else {
      this._sc = this._ec;
      this._so = this._eo;
    }
  }

  /** https://dom.spec.whatwg.org/#concept-range-select */
  _select(n: NodeImpl): void {
    const parent = n.parent;
    if (parent === null) throw new DOMException("The given Node has no parent.", "InvalidNodeTypeError");
    const index = indexOf(n);
    this._sc = parent;
    this._so = index;
    this._ec = parent;
    this._eo = index + 1;
    refileRange(this);
  }

  selectNode(node: Node): void {
    this._select(toNodeImpl(node, "selectNode"));
  }

  /** https://dom.spec.whatwg.org/#dom-range-selectnodecontents */
  _selectContents(n: NodeImpl): void {
    if (n.type === DOCUMENT_TYPE_NODE) throw new DOMException("DocumentType Node can't be used as boundary point.", "InvalidNodeTypeError");
    this._sc = n;
    this._so = 0;
    this._ec = n;
    this._eo = nodeLength(n);
    refileRange(this);
  }

  selectNodeContents(node: Node): void {
    this._selectContents(toNodeImpl(node, "selectNodeContents"));
  }

  /** https://dom.spec.whatwg.org/#dom-range-compareboundarypoints */
  compareBoundaryPoints(how: number, sourceRange: Range): number {
    const h = (Number(how) >>> 0) & 0xffff;
    if (h > 3) {
      throw new DOMException(
        "The comparison method provided must be one of 'START_TO_START', 'START_TO_END', 'END_TO_END', or 'END_TO_START'.",
        "NotSupportedError",
      );
    }
    if (!(sourceRange instanceof Range)) {
      throw new TypeError("Failed to execute 'compareBoundaryPoints' on 'Range': parameter 2 is not of type 'Range'.");
    }
    if (this._root() !== sourceRange._root()) throw new DOMException("The two Ranges are not in the same tree.", "WrongDocumentError");
    switch (h) {
      case START_TO_START:
        return compareBoundaryPoints(this._sc, this._so, sourceRange._sc, sourceRange._so);
      case START_TO_END:
        return compareBoundaryPoints(this._ec, this._eo, sourceRange._sc, sourceRange._so);
      case END_TO_END:
        return compareBoundaryPoints(this._ec, this._eo, sourceRange._ec, sourceRange._eo);
      default:
        return compareBoundaryPoints(this._sc, this._so, sourceRange._ec, sourceRange._eo);
    }
  }

  /** https://dom.spec.whatwg.org/#contained */
  _contains(n: NodeImpl): boolean {
    return compareBoundaryPoints(n, 0, this._sc, this._so) > 0 && compareBoundaryPoints(n, nodeLength(n), this._ec, this._eo) < 0;
  }

  /** https://dom.spec.whatwg.org/#dom-range-deletecontents */
  deleteContents(): void {
    if (this.collapsed) return;
    const osn = this._sc;
    const oso = this._so;
    const oen = this._ec;
    const oeo = this._eo;
    // Step 3.
    if (osn === oen && isCharacterData(osn)) {
      replaceData(osn, oso, oeo - oso, "");
      return;
    }
    // Step 4: contained nodes whose parent is not contained.
    const nodesToRemove = containedNodes(this, true);
    // Steps 5-6.
    let newNode: NodeImpl;
    let newOffset: number;
    if (isInclusiveAncestor(osn, oen)) {
      newNode = osn;
      newOffset = oso;
    } else {
      let ref = osn;
      while (ref.parent !== null && !isInclusiveAncestor(ref.parent, oen)) ref = ref.parent;
      newNode = ref.parent!;
      newOffset = indexOf(ref) + 1;
    }
    // Step 7.
    if (isCharacterData(osn)) replaceData(osn, oso, osn.data.length - oso, "");
    // Step 8.
    for (let i = 0; i < nodesToRemove.length; i++) {
      const n = nodesToRemove[i];
      if (n.parent !== null) remove(n, false);
    }
    // Step 9.
    if (isCharacterData(oen)) replaceData(oen, 0, oeo, "");
    // Step 10.
    this._sc = this._ec = newNode;
    this._so = this._eo = newOffset;
  }

  /** https://dom.spec.whatwg.org/#dom-range-extractcontents */
  extractContents(): DocumentFragment {
    return extract(this, this._sc, this._so, this._ec, this._eo).node as DocumentFragment;
  }

  /** https://dom.spec.whatwg.org/#dom-range-clonecontents */
  cloneContents(): DocumentFragment {
    return cloneContents(this._sc, this._so, this._ec, this._eo).node as DocumentFragment;
  }

  /** https://dom.spec.whatwg.org/#dom-range-insertnode */
  insertNode(node: Node): void {
    insertIntoRange(this, toNodeImpl(node, "insertNode"));
  }

  /** https://dom.spec.whatwg.org/#dom-range-surroundcontents */
  surroundContents(newParent: Node): void {
    const np = toNodeImpl(newParent, "surroundContents");
    // Step 1: a non-Text node partially contained in the range.
    const ca = commonAncestor(this._sc, this._ec);
    for (let n: NodeImpl = this._sc; n !== ca; n = n.parent!) {
      if (!isText(n) && !isInclusiveAncestor(n, this._ec)) {
        throw new DOMException("The Range has partially selected a non-Text node.", "InvalidStateError");
      }
    }
    for (let n: NodeImpl = this._ec; n !== ca; n = n.parent!) {
      if (!isText(n) && !isInclusiveAncestor(n, this._sc)) {
        throw new DOMException("The Range has partially selected a non-Text node.", "InvalidStateError");
      }
    }
    // Step 2.
    const t = np.type;
    if (t === DOCUMENT_NODE || t === DOCUMENT_TYPE_NODE || t === DOCUMENT_FRAGMENT_NODE) {
      throw new DOMException("The node provided is a Document, DocumentType or DocumentFragment.", "InvalidNodeTypeError");
    }
    // Steps 3-7.
    const fragment = extract(this, this._sc, this._so, this._ec, this._eo);
    if (np.first !== null) replaceAll(null, np);
    insertIntoRange(this, np);
    append(fragment, np);
    this._select(np);
  }

  /** https://dom.spec.whatwg.org/#dom-range-clonerange */
  cloneRange(): Range {
    return Range._create(this._sc.doc, this._sc, this._so, this._ec, this._eo);
  }

  /** https://dom.spec.whatwg.org/#dom-range-detach — does nothing. */
  detach(): void {}

  /** https://dom.spec.whatwg.org/#dom-range-ispointinrange */
  isPointInRange(node: Node, offset: number): boolean {
    const n = toNodeImpl(node, "isPointInRange");
    const o = Number(offset) >>> 0;
    if (treeRoot(n) !== this._root()) return false;
    if (n.type === DOCUMENT_TYPE_NODE) throw new DOMException("DocumentType Node can't be used as boundary point.", "InvalidNodeTypeError");
    if (o > nodeLength(n)) throw new DOMException(`There is no child at offset ${o}.`, "IndexSizeError");
    return compareBoundaryPoints(n, o, this._sc, this._so) >= 0 && compareBoundaryPoints(n, o, this._ec, this._eo) <= 0;
  }

  /** https://dom.spec.whatwg.org/#dom-range-comparepoint */
  comparePoint(node: Node, offset: number): number {
    const n = toNodeImpl(node, "comparePoint");
    const o = Number(offset) >>> 0;
    if (treeRoot(n) !== this._root()) throw new DOMException("The node provided and the Range are not in the same tree.", "WrongDocumentError");
    if (n.type === DOCUMENT_TYPE_NODE) throw new DOMException("DocumentType Node can't be used as boundary point.", "InvalidNodeTypeError");
    if (o > nodeLength(n)) throw new DOMException(`There is no child at offset ${o}.`, "IndexSizeError");
    if (compareBoundaryPoints(n, o, this._sc, this._so) < 0) return -1;
    if (compareBoundaryPoints(n, o, this._ec, this._eo) > 0) return 1;
    return 0;
  }

  /** https://dom.spec.whatwg.org/#dom-range-intersectsnode */
  intersectsNode(node: Node): boolean {
    const n = toNodeImpl(node, "intersectsNode");
    if (treeRoot(n) !== this._root()) return false;
    const parent = n.parent;
    if (parent === null) return true;
    const offset = indexOf(n);
    return compareBoundaryPoints(parent, offset, this._ec, this._eo) < 0 && compareBoundaryPoints(parent, offset + 1, this._sc, this._so) > 0;
  }

  /** https://dom.spec.whatwg.org/#dom-range-stringifier */
  toString(): string {
    const sc = this._sc;
    const ec = this._ec;
    if (sc === ec && isText(sc)) return sc.data.slice(this._so, this._eo);
    let s = "";
    if (isText(sc)) s += sc.data.slice(this._so);
    const root = treeRoot(sc);
    const end = isCharacterData(ec) ? ec : afterBoundary(ec, this._eo, root);
    for (let n = afterBoundary(sc, this._so, root); n !== null && n !== end; n = nextInTree(n, root)) {
      // Every Text node strictly between the boundary points is contained.
      if (isText(n)) s += n.data;
    }
    if (isText(ec)) s += ec.data.slice(0, this._eo);
    return s;
  }

  /** https://html.spec.whatwg.org/#dom-range-createcontextualfragment */
  createContextualFragment(fragment: string): DocumentFragment {
    const node = this._sc;
    let element: NodeImpl | null;
    switch (node.type) {
      case DOCUMENT_NODE:
      case DOCUMENT_FRAGMENT_NODE:
        element = null;
        break;
      case ELEMENT_NODE:
        element = node;
        break;
      default: {
        const p = node.parent;
        element = p !== null && p.type === ELEMENT_NODE ? p : null;
      }
    }
    if (element === null || (element.name === "html" && element.ns === HTML_NS && (element.flags & F_HTML) !== 0)) {
      element = node.doc.createElement("body")._impl;
    }
    return parseFragment(String(fragment), element).node as DocumentFragment;
  }

  /** CSSOM View: no layout, so always an empty list. */
  getClientRects(): DOMRectList {
    return new DOMRectList();
  }

  /** CSSOM View: no layout, so always a zero rect. */
  getBoundingClientRect(): DOMRect {
    return new DOMRect();
  }
}

for (const [k, v] of [
  ["START_TO_START", START_TO_START],
  ["START_TO_END", START_TO_END],
  ["END_TO_END", END_TO_END],
  ["END_TO_START", END_TO_START],
] as const) {
  Object.defineProperty(Range.prototype, k, { value: v, enumerable: true });
}
Object.defineProperty(AbstractRange.prototype, Symbol.toStringTag, { value: "AbstractRange", configurable: true });
Object.defineProperty(Range.prototype, Symbol.toStringTag, { value: "Range", configurable: true });
Object.defineProperty(StaticRange.prototype, Symbol.toStringTag, { value: "StaticRange", configurable: true });

/** First node in tree order at or after boundary point (node, offset) (null at the end of the tree). */
function afterBoundary(node: NodeImpl, offset: number, root: NodeImpl): NodeImpl | null {
  if (!isCharacterData(node)) {
    const child = childAt(node, offset);
    if (child !== null) return child;
  }
  return nextSkippingChildren(node, root);
}

/** Nodes contained in the range in tree order; with `outermost`, omit nodes whose parent is contained. */
function containedNodes(range: AbstractRange & { _contains(n: NodeImpl): boolean }, outermost: boolean): NodeImpl[] {
  const out: NodeImpl[] = [];
  const root = treeRoot(range._sc);
  const end = isCharacterData(range._ec) ? range._ec : afterBoundary(range._ec, range._eo, root);
  let n = afterBoundary(range._sc, range._so, root);
  while (n !== null && n !== end) {
    if (range._contains(n)) {
      out.push(n);
      n = outermost ? nextSkippingChildren(n, root) : nextInTree(n, root);
    } else {
      n = nextInTree(n, root);
    }
  }
  return out;
}

/** Steps 5-10 of extract / clone: the partially contained children and the contained children of the common ancestor. */
function rangeContents(sc: NodeImpl, so: number, ec: NodeImpl, eo: number) {
  const ca = commonAncestor(sc, ec);
  const first = isInclusiveAncestor(sc, ec) ? null : childOfAncestor(sc, ca);
  const last = isInclusiveAncestor(ec, sc) ? null : childOfAncestor(ec, ca);
  const contained: NodeImpl[] = [];
  let child = first === null ? childAt(ca, so) : first.next;
  const stop = last === null ? childAt(ca, eo) : last;
  for (; child !== null && child !== stop; child = child.next) {
    if (child.type === DOCUMENT_TYPE_NODE) throw new DOMException("A DocumentType node cannot be extracted.", "HierarchyRequestError");
    contained.push(child);
  }
  return { first, last, contained };
}

function cloneWithData(n: NodeImpl, data: string): NodeImpl {
  const copy = cloneNode(n, n.doc, false);
  copy.data = data;
  return copy;
}

/** https://dom.spec.whatwg.org/#concept-range-extract (`range` is the live range to collapse, or null for a subrange). */
function extract(range: Range | null, osn: NodeImpl, oso: number, oen: NodeImpl, oeo: number): NodeImpl {
  const fragment = osn.doc.createDocumentFragment()._impl;
  if (osn === oen && oso === oeo) return fragment;
  // Step 4.
  if (osn === oen && isCharacterData(osn)) {
    append(cloneWithData(osn, osn.data.slice(oso, oeo)), fragment);
    replaceData(osn, oso, oeo - oso, "");
    return fragment;
  }
  // Steps 5-10.
  const { first, last, contained } = rangeContents(osn, oso, oen, oeo);
  // Steps 11-12.
  let newNode: NodeImpl;
  let newOffset: number;
  if (isInclusiveAncestor(osn, oen)) {
    newNode = osn;
    newOffset = oso;
  } else {
    let ref = osn;
    while (ref.parent !== null && !isInclusiveAncestor(ref.parent, oen)) ref = ref.parent;
    newNode = ref.parent!;
    newOffset = indexOf(ref) + 1;
  }
  // Steps 13-14.
  if (first !== null) {
    if (isCharacterData(first)) {
      append(cloneWithData(osn, osn.data.slice(oso)), fragment);
      replaceData(osn, oso, osn.data.length - oso, "");
    } else {
      const clone = cloneNode(first, first.doc, false);
      append(clone, fragment);
      append(extract(null, osn, oso, first, nodeLength(first)), clone);
    }
  }
  // Step 15.
  for (let i = 0; i < contained.length; i++) append(contained[i], fragment);
  // Steps 16-17.
  if (last !== null) {
    if (isCharacterData(last)) {
      append(cloneWithData(oen, oen.data.slice(0, oeo)), fragment);
      replaceData(oen, 0, oeo, "");
    } else {
      const clone = cloneNode(last, last.doc, false);
      append(clone, fragment);
      append(extract(null, last, 0, oen, oeo), clone);
    }
  }
  // Step 18.
  if (range !== null) {
    range._sc = range._ec = newNode;
    range._so = range._eo = newOffset;
  }
  return fragment;
}

/** https://dom.spec.whatwg.org/#concept-range-clone */
function cloneContents(osn: NodeImpl, oso: number, oen: NodeImpl, oeo: number): NodeImpl {
  const fragment = osn.doc.createDocumentFragment()._impl;
  if (osn === oen && oso === oeo) return fragment;
  if (osn === oen && isCharacterData(osn)) {
    append(cloneWithData(osn, osn.data.slice(oso, oeo)), fragment);
    return fragment;
  }
  const { first, last, contained } = rangeContents(osn, oso, oen, oeo);
  if (first !== null) {
    if (isCharacterData(first)) {
      append(cloneWithData(osn, osn.data.slice(oso)), fragment);
    } else {
      const clone = cloneNode(first, first.doc, false);
      append(clone, fragment);
      append(cloneContents(osn, oso, first, nodeLength(first)), clone);
    }
  }
  for (let i = 0; i < contained.length; i++) append(cloneNode(contained[i], contained[i].doc, true), fragment);
  if (last !== null) {
    if (isCharacterData(last)) {
      append(cloneWithData(oen, oen.data.slice(0, oeo)), fragment);
    } else {
      const clone = cloneNode(last, last.doc, false);
      append(clone, fragment);
      append(cloneContents(last, 0, oen, oeo), clone);
    }
  }
  return fragment;
}

/** https://dom.spec.whatwg.org/#concept-range-insert */
function insertIntoRange(range: Range, node: NodeImpl): void {
  const sn = range._sc;
  const so = range._so;
  // Step 1.
  if (sn.type === PROCESSING_INSTRUCTION_NODE || sn.type === COMMENT_NODE || (isText(sn) && sn.parent === null) || sn === node) {
    throw new DOMException("The Range's start node cannot contain the inserted node.", "HierarchyRequestError");
  }
  // Steps 2-4.
  let reference: NodeImpl | null = isText(sn) ? sn : childAt(sn, so);
  // Step 5.
  const parent = reference === null ? sn : reference.parent!;
  // Step 6.
  ensurePreInsertionValidity(node, parent, reference);
  // Step 7.
  if (isText(sn)) reference = splitText(sn, so);
  // Step 8.
  if (node === reference) reference = reference.next;
  // Step 9.
  if (node.parent !== null) remove(node, false);
  // Steps 10-11.
  let newOffset = reference === null ? nodeLength(parent) : indexOf(reference);
  newOffset += node.type === DOCUMENT_FRAGMENT_NODE ? nodeLength(node) : 1;
  // Step 12.
  preInsert(node, parent, reference);
  // Step 13.
  if (range.collapsed) {
    range._ec = parent;
    range._eo = newOffset;
  }
}
