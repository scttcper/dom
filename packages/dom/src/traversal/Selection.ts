// https://w3c.github.io/selection-api/#selection-interface
//
// OWNER: dom-core. One Selection per document (document.getSelection(); the window agent's
// window.getSelection() returns the active document's). The selection holds at most one live
// Range plus a direction. No layout: `modify()` is a no-op. A selectionchange event is
// scheduled on the document whenever the selection is associated with a different range
// (https://w3c.github.io/selection-api/#selectionchange-event), like jsdom; mutations of the
// associated range itself do not schedule one.

import { DOCUMENT_TYPE_NODE, F_SHADOW_ROOT } from "../nodes/constants.ts";
import type { Document } from "../nodes/Document.ts";
import type { Node } from "../nodes/Node.ts";
import type { NodeImpl } from "../nodes/NodeImpl.ts";
import { treeRoot } from "../nodes/traverse.ts";
import { fireAnEvent } from "../events/fire.ts";
// Node's own timer, not the (possibly faked or spied-on) global one: like jsdom's internal task
// queue, user-agent selectionchange tasks are invisible to fake timers and setTimeout spies
// (user-event's "do not call setTimeout with delay `null`" relies on that).
import { setTimeout as hostSetTimeout } from "node:timers";
import type { EventTarget } from "../events/EventTarget.ts";
import { Range, StaticRange, compareBoundaryPoints, nodeLength } from "./Range.ts";
import { $ec, $eo, $host, $impl, $sc, $so } from "../keys.ts";

const DIR_NONE = 0;
const DIR_FORWARDS = 1;
const DIR_BACKWARDS = 2;

function toImpl(node: unknown, method: string): NodeImpl {
  if (node === null || typeof node !== "object" || !($impl in node)) {
    throw new TypeError(`Failed to execute '${method}' on 'Selection': parameter 1 is not of type 'Node'.`);
  }
  return (node as Node)[$impl];
}

/** WebIDL: too few arguments for a non-optional parameter. */
function arity(given: number, required: number, method: string): void {
  if (given < required) {
    throw new TypeError(
      `Failed to execute '${method}' on 'Selection': ${required} argument${required === 1 ? "" : "s"} required, but only ${given} present.`,
    );
  }
}

function checkBoundary(n: NodeImpl, offset: number): void {
  if (n.type === DOCUMENT_TYPE_NODE)
    throw new DOMException("DocumentType Node can't be used as boundary point.", "InvalidNodeTypeError");
  if (offset > nodeLength(n)) throw new DOMException(`There is no child at offset ${offset}.`, "IndexSizeError");
}

export class Selection {
  #doc: Document;
  #range: Range | null;
  #direction: number;
  /** https://w3c.github.io/selection-api/#dfn-has-scheduled-selectionchange-event */
  #scheduled: boolean;

  /** @internal Use document.getSelection(). */
  constructor(doc: Document) {
    this.#doc = doc;
    this.#range = null;
    this.#direction = DIR_NONE;
    this.#scheduled = false;
  }

  /** Whether the selection's document is a shadow-including inclusive ancestor of `n`. */
  #inDocument(n: NodeImpl): boolean {
    let root = treeRoot(n);
    while ((root.flags & F_SHADOW_ROOT) !== 0) {
      const host = (root.node as unknown as { [$host]: { [$impl]: NodeImpl } | null })[$host];
      if (host === null) return false;
      root = treeRoot(host[$impl]);
    }
    return root === this.#doc[$impl];
  }

  #set(range: Range | null, direction: number): void {
    const old = this.#range;
    this.#range = range;
    this.#direction = direction;
    // https://w3c.github.io/selection-api/#selectionchange-event: dissociated from its range or
    // associated with a new one (a new range with the same boundary points is not a change).
    if (old === range) return;
    if (
      old === null ||
      range === null ||
      old[$sc] !== range[$sc] ||
      old[$so] !== range[$so] ||
      old[$ec] !== range[$ec] ||
      old[$eo] !== range[$eo]
    ) {
      this.#schedule();
    }
  }

  /** https://w3c.github.io/selection-api/#scheduling-selectionhange-event */
  #schedule(): void {
    // 1. If target's has scheduled selectionchange event is true, abort these steps.
    if (this.#scheduled) return;
    // 2. Set target's has scheduled selectionchange event to true.
    this.#scheduled = true;
    // 3. Queue a task on the user interaction task source to fire a selectionchange event.
    hostSetTimeout(() => {
      // https://w3c.github.io/selection-api/#firing-selectionhange-event
      // 1. Set target's has scheduled selectionchange event to false.
      this.#scheduled = false;
      // A closed window's document gets no more tasks.
      const win = this.#doc.defaultView as unknown as { closed?: boolean } | null;
      if (win === null || win.closed === true) return;
      // 2. Fire an event named selectionchange at target (document: does not bubble, like jsdom).
      fireAnEvent("selectionchange", this.#doc as unknown as EventTarget);
    }, 0);
  }

  get anchorNode(): Node | null {
    const r = this.#range;
    if (r === null) return null;
    return (this.#direction === DIR_BACKWARDS ? r[$ec] : r[$sc]).node;
  }

  get anchorOffset(): number {
    const r = this.#range;
    if (r === null) return 0;
    return this.#direction === DIR_BACKWARDS ? r[$eo] : r[$so];
  }

  get focusNode(): Node | null {
    const r = this.#range;
    if (r === null) return null;
    return (this.#direction === DIR_BACKWARDS ? r[$sc] : r[$ec]).node;
  }

  get focusOffset(): number {
    const r = this.#range;
    if (r === null) return 0;
    return this.#direction === DIR_BACKWARDS ? r[$so] : r[$eo];
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
    if (Number(index) !== 0 || r === null)
      throw new DOMException(
        `The index provided (${index}) is greater than or equal to the maximum bound (${this.rangeCount}).`,
        "IndexSizeError",
      );
    return r;
  }

  /** https://w3c.github.io/selection-api/#dom-selection-addrange */
  addRange(range: Range): void {
    arity(arguments.length, 1, "addRange");
    if (!(range instanceof Range))
      throw new TypeError("Failed to execute 'addRange' on 'Selection': parameter 1 is not of type 'Range'.");
    if (range._treeRoot() !== this.#doc[$impl]) return;
    if (this.#range !== null) return;
    this.#set(range, DIR_FORWARDS);
  }

  /** https://w3c.github.io/selection-api/#dom-selection-removerange */
  removeRange(range: Range): void {
    arity(arguments.length, 1, "removeRange");
    if (!(range instanceof Range))
      throw new TypeError("Failed to execute 'removeRange' on 'Selection': parameter 1 is not of type 'Range'.");
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
    arity(arguments.length, 1, "collapse");
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
    arity(arguments.length, 1, "setPosition");
    this.collapse(node, offset);
  }

  collapseToStart(): void {
    const r = this.#range;
    if (r === null) throw new DOMException("There is no selection to collapse.", "InvalidStateError");
    const n = new Range(this.#doc);
    n._setStart(r[$sc], r[$so]);
    n._setEnd(r[$sc], r[$so]);
    this.#set(n, DIR_FORWARDS);
  }

  collapseToEnd(): void {
    const r = this.#range;
    if (r === null) throw new DOMException("There is no selection to collapse.", "InvalidStateError");
    const n = new Range(this.#doc);
    n._setStart(r[$ec], r[$eo]);
    n._setEnd(r[$ec], r[$eo]);
    this.#set(n, DIR_FORWARDS);
  }

  /** https://w3c.github.io/selection-api/#dom-selection-extend */
  extend(node: Node, offset = 0): void {
    arity(arguments.length, 1, "extend");
    const n = toImpl(node, "extend");
    const o = Number(offset) >>> 0;
    if (!this.#inDocument(n)) return;
    const r = this.#range;
    if (r === null) throw new DOMException("This Selection object doesn't have any Ranges.", "InvalidStateError");
    checkBoundary(n, o);
    const anchorNode = this.#direction === DIR_BACKWARDS ? r[$ec] : r[$sc];
    const anchorOffset = this.#direction === DIR_BACKWARDS ? r[$eo] : r[$so];
    const nr = new Range(this.#doc);
    if (treeRoot(n) !== r._treeRoot()) {
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
    arity(arguments.length, 4, "setBaseAndExtent");
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
    // 1. If node is a DocumentType, throw an InvalidNodeTypeError.
    if (n.type === DOCUMENT_TYPE_NODE)
      throw new DOMException("DocumentType Node can't be used as boundary point.", "InvalidNodeTypeError");
    // 2. If node's root is not the document associated with this, return.
    if (!this.#inDocument(n)) return;
    // 3-5. A new range from (node, 0) to (node, node's number of children) — the child count,
    // not the node's length (a Text node gets a collapsed range at offset 0).
    const r = new Range(this.#doc);
    r._setStart(n, 0);
    r._setEnd(n, n.childCount);
    this.#set(r, DIR_FORWARDS);
  }

  /** https://w3c.github.io/selection-api/#dom-selection-deletefromdocument */
  deleteFromDocument(): void {
    this.#range?.deleteContents();
  }

  /** https://w3c.github.io/selection-api/#dom-selection-containsnode */
  containsNode(node: Node, allowPartialContainment = false): boolean {
    arity(arguments.length, 1, "containsNode");
    const n = toImpl(node, "containsNode");
    const r = this.#range;
    if (r === null || !this.#inDocument(n) || treeRoot(n) !== r._treeRoot()) return false;
    const len = nodeLength(n);
    if (allowPartialContainment) {
      return compareBoundaryPoints(r[$sc], r[$so], n, len) <= 0 && compareBoundaryPoints(r[$ec], r[$eo], n, 0) >= 0;
    }
    return compareBoundaryPoints(r[$sc], r[$so], n, 0) <= 0 && compareBoundaryPoints(r[$ec], r[$eo], n, len) >= 0;
  }

  /** https://w3c.github.io/selection-api/#dom-selection-getcomposedranges (no shadow root reparenting) */
  getComposedRanges(..._args: unknown[]): StaticRange[] {
    const r = this.#range;
    if (r === null) return [];
    return [
      new StaticRange({
        startContainer: r[$sc].node,
        startOffset: r[$so],
        endContainer: r[$ec].node,
        endOffset: r[$eo],
      }),
    ];
  }

  /** No layout: https://w3c.github.io/selection-api/#dom-selection-modify is a no-op. */
  modify(_alter?: string, _direction?: string, _granularity?: string): void {}

  toString(): string {
    const r = this.#range;
    return r === null ? "" : r.toString();
  }
}

Object.defineProperty(Selection.prototype, Symbol.toStringTag, { value: "Selection", configurable: true });
