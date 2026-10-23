// https://w3c.github.io/selection-api/#selection-interface
//
// OWNER: dom-core. One Selection per document (document.getSelection(); the window agent's
// window.getSelection() returns the active document's). The selection holds at most one live
// Range plus a direction. No layout: `modify()` is a no-op. selectionchange events are not
// fired (deviation).

import { DOCUMENT_TYPE_NODE, F_SHADOW_ROOT } from "../nodes/constants.ts";
import type { Document } from "../nodes/Document.ts";
import type { Node } from "../nodes/Node.ts";
import type { NodeImpl } from "../nodes/NodeImpl.ts";
import { treeRoot } from "../nodes/traverse.ts";
import { Range, StaticRange, compareBoundaryPoints, nodeLength } from "./Range.ts";

const DIR_NONE = 0;
const DIR_FORWARDS = 1;
const DIR_BACKWARDS = 2;

function toImpl(node: unknown, method: string): NodeImpl {
  if (node === null || typeof node !== "object" || !("_impl" in node)) {
    throw new TypeError(`Failed to execute '${method}' on 'Selection': parameter 1 is not of type 'Node'.`);
  }
  return (node as Node)._impl;
}

function checkBoundary(n: NodeImpl, offset: number): void {
  if (n.type === DOCUMENT_TYPE_NODE) throw new DOMException("DocumentType Node can't be used as boundary point.", "InvalidNodeTypeError");
  if (offset > nodeLength(n)) throw new DOMException(`There is no child at offset ${offset}.`, "IndexSizeError");
}

export class Selection {
  #doc: Document;
  #range: Range | null;
  #direction: number;

  /** @internal Use document.getSelection(). */
  constructor(doc: Document) {
    this.#doc = doc;
    this.#range = null;
    this.#direction = DIR_NONE;
  }

  /** Whether the selection's document is a shadow-including inclusive ancestor of `n`. */
  #inDocument(n: NodeImpl): boolean {
    let root = treeRoot(n);
    while ((root.flags & F_SHADOW_ROOT) !== 0) {
      const host = (root.node as unknown as { _host: { _impl: NodeImpl } | null })._host;
      if (host === null) return false;
      root = treeRoot(host._impl);
    }
    return root === this.#doc._impl;
  }

  #set(range: Range | null, direction: number): void {
    this.#range = range;
    this.#direction = direction;
  }

  get anchorNode(): Node | null {
    const r = this.#range;
    if (r === null) return null;
    return (this.#direction === DIR_BACKWARDS ? r._ec : r._sc).node;
  }

  get anchorOffset(): number {
    const r = this.#range;
    if (r === null) return 0;
    return this.#direction === DIR_BACKWARDS ? r._eo : r._so;
  }

  get focusNode(): Node | null {
    const r = this.#range;
    if (r === null) return null;
    return (this.#direction === DIR_BACKWARDS ? r._sc : r._ec).node;
  }

  get focusOffset(): number {
    const r = this.#range;
    if (r === null) return 0;
    return this.#direction === DIR_BACKWARDS ? r._so : r._eo;
  }

  get isCollapsed(): boolean {
    const r = this.#range;
    return r === null || r.collapsed;
  }

  get rangeCount(): number {
    return this.#range === null ? 0 : 1;
  }

  get type(): string {
    const r = this.#range;
    return r === null ? "None" : r.collapsed ? "Caret" : "Range";
  }

  /** https://w3c.github.io/selection-api/#dom-selection-direction */
  get direction(): string {
    const r = this.#range;
    if (r === null || r.collapsed || this.#direction === DIR_NONE) return "none";
    return this.#direction === DIR_BACKWARDS ? "backward" : "forward";
  }

  /** https://w3c.github.io/selection-api/#dom-selection-getrangeat */
  getRangeAt(index: number): Range {
    const r = this.#range;
    if (Number(index) !== 0 || r === null) throw new DOMException(`The index provided (${index}) is greater than or equal to the maximum bound (${this.rangeCount}).`, "IndexSizeError");
    return r;
  }

  /** https://w3c.github.io/selection-api/#dom-selection-addrange */
  addRange(range: Range): void {
    if (!(range instanceof Range)) throw new TypeError("Failed to execute 'addRange' on 'Selection': parameter 1 is not of type 'Range'.");
    if (range._root() !== this.#doc._impl) return;
    if (this.#range !== null) return;
    this.#set(range, DIR_FORWARDS);
  }

  /** https://w3c.github.io/selection-api/#dom-selection-removerange */
  removeRange(range: Range): void {
    if (range !== this.#range) throw new DOMException("The given range isn't in document.", "NotFoundError");
    this.#set(null, DIR_NONE);
  }

  removeAllRanges(): void {
    this.#set(null, DIR_NONE);
  }

  empty(): void {
    this.removeAllRanges();
  }

  /** https://w3c.github.io/selection-api/#dom-selection-collapse */
  collapse(node: Node | null, offset = 0): void {
    if (node === null) {
      this.removeAllRanges();
      return;
    }
    const n = toImpl(node, "collapse");
    const o = Number(offset) >>> 0;
    checkBoundary(n, o);
    if (!this.#inDocument(n)) return;
    const r = new Range(this.#doc);
    r._setStart(n, o);
    r._setEnd(n, o);
    this.#set(r, DIR_FORWARDS);
  }

  setPosition(node: Node | null, offset = 0): void {
    this.collapse(node, offset);
  }

  collapseToStart(): void {
    const r = this.#range;
    if (r === null) throw new DOMException("There is no selection to collapse.", "InvalidStateError");
    const n = new Range(this.#doc);
    n._setStart(r._sc, r._so);
    n._setEnd(r._sc, r._so);
    this.#set(n, DIR_FORWARDS);
  }

  collapseToEnd(): void {
    const r = this.#range;
    if (r === null) throw new DOMException("There is no selection to collapse.", "InvalidStateError");
    const n = new Range(this.#doc);
    n._setStart(r._ec, r._eo);
    n._setEnd(r._ec, r._eo);
    this.#set(n, DIR_FORWARDS);
  }

  /** https://w3c.github.io/selection-api/#dom-selection-extend */
  extend(node: Node, offset = 0): void {
    const n = toImpl(node, "extend");
    const o = Number(offset) >>> 0;
    if (!this.#inDocument(n)) return;
    const r = this.#range;
    if (r === null) throw new DOMException("This Selection object doesn't have any Ranges.", "InvalidStateError");
    checkBoundary(n, o);
    const anchorNode = this.#direction === DIR_BACKWARDS ? r._ec : r._sc;
    const anchorOffset = this.#direction === DIR_BACKWARDS ? r._eo : r._so;
    const nr = new Range(this.#doc);
    if (treeRoot(n) !== r._root()) {
      nr._setStart(n, o);
      nr._setEnd(n, o);
    } else if (compareBoundaryPoints(anchorNode, anchorOffset, n, o) <= 0) {
      nr._setStart(anchorNode, anchorOffset);
      nr._setEnd(n, o);
    } else {
      nr._setStart(n, o);
      nr._setEnd(anchorNode, anchorOffset);
    }
    const backwards = treeRoot(n) === treeRoot(anchorNode) && compareBoundaryPoints(n, o, anchorNode, anchorOffset) < 0;
    this.#set(nr, backwards ? DIR_BACKWARDS : DIR_FORWARDS);
  }

  /** https://w3c.github.io/selection-api/#dom-selection-setbaseandextent */
  setBaseAndExtent(anchorNode: Node, anchorOffset: number, focusNode: Node, focusOffset: number): void {
    const a = toImpl(anchorNode, "setBaseAndExtent");
    const f = toImpl(focusNode, "setBaseAndExtent");
    const ao = Number(anchorOffset) >>> 0;
    const fo = Number(focusOffset) >>> 0;
    checkBoundary(a, ao);
    checkBoundary(f, fo);
    if (!this.#inDocument(a) || !this.#inDocument(f)) return;
    const r = new Range(this.#doc);
    const backwards = compareBoundaryPoints(f, fo, a, ao) < 0;
    if (backwards) {
      r._setStart(f, fo);
      r._setEnd(a, ao);
    } else {
      r._setStart(a, ao);
      r._setEnd(f, fo);
    }
    this.#set(r, backwards ? DIR_BACKWARDS : DIR_FORWARDS);
  }

  /** https://w3c.github.io/selection-api/#dom-selection-selectallchildren */
  selectAllChildren(node: Node): void {
    const n = toImpl(node, "selectAllChildren");
    if (n.type === DOCUMENT_TYPE_NODE) throw new DOMException("DocumentType Node can't be used as boundary point.", "InvalidNodeTypeError");
    if (!this.#inDocument(n)) return;
    const r = new Range(this.#doc);
    r._selectContents(n);
    this.#set(r, DIR_FORWARDS);
  }

  /** https://w3c.github.io/selection-api/#dom-selection-deletefromdocument */
  deleteFromDocument(): void {
    this.#range?.deleteContents();
  }

  /** https://w3c.github.io/selection-api/#dom-selection-containsnode */
  containsNode(node: Node, allowPartialContainment = false): boolean {
    const n = toImpl(node, "containsNode");
    const r = this.#range;
    if (r === null || !this.#inDocument(n) || treeRoot(n) !== r._root()) return false;
    const len = nodeLength(n);
    if (allowPartialContainment) {
      return compareBoundaryPoints(r._sc, r._so, n, len) <= 0 && compareBoundaryPoints(r._ec, r._eo, n, 0) >= 0;
    }
    return compareBoundaryPoints(r._sc, r._so, n, 0) <= 0 && compareBoundaryPoints(r._ec, r._eo, n, len) >= 0;
  }

  /** https://w3c.github.io/selection-api/#dom-selection-getcomposedranges (no shadow root reparenting) */
  getComposedRanges(..._args: unknown[]): StaticRange[] {
    const r = this.#range;
    if (r === null) return [];
    return [new StaticRange({ startContainer: r._sc.node, startOffset: r._so, endContainer: r._ec.node, endOffset: r._eo })];
  }

  /** No layout: https://w3c.github.io/selection-api/#dom-selection-modify is a no-op. */
  modify(_alter?: string, _direction?: string, _granularity?: string): void {}

  toString(): string {
    const r = this.#range;
    return r === null ? "" : r.toString();
  }
}

Object.defineProperty(Selection.prototype, Symbol.toStringTag, { value: "Selection", configurable: true });
