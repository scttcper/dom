// Live range and NodeIterator bookkeeping called from the mutation algorithms.
// https://dom.spec.whatwg.org/#concept-live-range
// https://dom.spec.whatwg.org/#nodeiterator-pre-removing-steps
//
// OWNER: dom-core. Zero cost when unused: the mutation algorithms test `liveRangeCount` /
// `nodeIteratorCount` (one integer compare) before calling in here.
//
// Ranges and iterators are held through WeakRefs so that `document.createRange()` in a loop
// (user-event, polyfills) does not leak or slow down every later mutation: dead entries are
// dropped the next time a mutation walks the list.

import type { NodeImpl } from "../nodes/NodeImpl.ts";
import { nextSkippingChildren, isInclusiveAncestor, indexOf } from "../nodes/traverse.ts";

/** Boundary points of a live range, as NodeImpls. Implemented by `AbstractRange`. */
export interface LiveBoundaries {
  _sc: NodeImpl;
  _so: number;
  _ec: NodeImpl;
  _eo: number;
  /** Document whose `_ranges` list holds this range. */
  _home: object | null;
}

/** State of a NodeIterator relevant to the pre-removing steps. */
export interface IteratorState {
  _root: NodeImpl;
  _reference: NodeImpl;
  _pointerBeforeReference: boolean;
  /** Candidate position of an in-flight traversal while the filter runs (kept up to date too). */
  _inflight: IteratorState | null;
}

/** Number of registered (possibly already collected) live ranges. */
export let liveRangeCount = 0;
/** Number of registered (possibly already collected) NodeIterators. */
export let nodeIteratorCount = 0;

// Live ranges are filed per node document (Document._ranges) so a mutation only looks at the
// ranges of its own document: test runs create many documents, and ranges of finished tests
// stay registered until GC clears their WeakRefs.
let iterators: WeakRef<IteratorState>[] = [];

interface RangeHome {
  _ranges: WeakRef<LiveBoundaries>[] | null;
}

function homeOf(n: NodeImpl): RangeHome {
  return n.doc as unknown as RangeHome;
}

export function registerLiveRange(r: LiveBoundaries): void {
  const home = homeOf(r._sc);
  r._home = home;
  (home._ranges ??= []).push(new WeakRef(r));
  liveRangeCount++;
}

/** Re-file `r` after its boundary points moved to another document. */
export function refileRange(r: LiveBoundaries): void {
  const home = homeOf(r._sc);
  if (r._home === home || r._home === null) return;
  r._home = home;
  (home._ranges ??= []).push(new WeakRef(r));
  liveRangeCount++;
}

export function registerNodeIterator(it: IteratorState): void {
  iterators.push(new WeakRef(it));
  nodeIteratorCount = iterators.length;
}

/** Live ranges of `n`'s node document that are still alive; compacts that document's list. */
function liveRanges(n: NodeImpl): LiveBoundaries[] {
  const home = homeOf(n);
  const list = home._ranges;
  const out: LiveBoundaries[] = [];
  if (list === null) return out;
  let w = 0;
  for (let i = 0; i < list.length; i++) {
    const r = list[i].deref();
    // Entries left behind by refileRange/rangesAdopt (the range now lives elsewhere) are dropped.
    if (r !== undefined && r._home === home) {
      out.push(r);
      list[w++] = list[i];
    }
  }
  liveRangeCount -= list.length - w;
  list.length = w;
  if (w === 0) home._ranges = null;
  return out;
}

/**
 * Adopting `node` from `oldDoc`: ranges filed under the old document whose boundary points are
 * inside the adopted subtree move to the new document's list.
 */
export function rangesAdopt(node: NodeImpl, oldDoc: object): void {
  const oldHome = oldDoc as RangeHome;
  const newHome = homeOf(node);
  const list = oldHome._ranges;
  if (list === null || oldHome === newHome) return;
  let w = 0;
  for (let i = 0; i < list.length; i++) {
    const r = list[i].deref();
    if (r === undefined) {
      liveRangeCount--;
      continue;
    }
    if (r._home !== oldHome) {
      liveRangeCount--;
      continue;
    }
    if (isInclusiveAncestor(node, r._sc) || isInclusiveAncestor(node, r._ec)) {
      r._home = newHome;
      (newHome._ranges ??= []).push(list[i]);
    } else {
      list[w++] = list[i];
    }
  }
  list.length = w;
  if (w === 0) oldHome._ranges = null;
}

/** https://dom.spec.whatwg.org/#concept-node-insert step 2 */
export function rangesAfterInsert(parent: NodeImpl, index: number, count: number): void {
  const list = liveRanges(parent);
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    if (r._sc === parent && r._so > index) r._so += count;
    if (r._ec === parent && r._eo > index) r._eo += count;
  }
}

/** https://dom.spec.whatwg.org/#concept-node-remove steps 4-7 */
export function rangesBeforeRemove(node: NodeImpl, parent: NodeImpl, index: number): void {
  const list = liveRanges(parent);
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    if (isInclusiveAncestor(node, r._sc)) {
      r._sc = parent;
      r._so = index;
    }
    if (isInclusiveAncestor(node, r._ec)) {
      r._ec = parent;
      r._eo = index;
    }
    if (r._sc === parent && r._so > index) r._so--;
    if (r._ec === parent && r._eo > index) r._eo--;
  }
}

/** https://dom.spec.whatwg.org/#concept-cd-replace steps 8-11 */
export function rangesReplaceData(node: NodeImpl, offset: number, count: number, dataLength: number): void {
  const list = liveRanges(node);
  const end = offset + count;
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    if (r._sc === node && r._so > offset && r._so <= end) r._so = offset;
    if (r._ec === node && r._eo > offset && r._eo <= end) r._eo = offset;
    if (r._sc === node && r._so > end) r._so += dataLength - count;
    if (r._ec === node && r._eo > end) r._eo += dataLength - count;
  }
}

/** https://dom.spec.whatwg.org/#concept-text-split steps 7.2-7.5 */
export function rangesSplitText(node: NodeImpl, newNode: NodeImpl, offset: number, parent: NodeImpl): void {
  const list = liveRanges(node);
  const index = indexOf(node);
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    if (r._sc === node && r._so > offset) {
      r._sc = newNode;
      r._so -= offset;
    }
    if (r._ec === node && r._eo > offset) {
      r._ec = newNode;
      r._eo -= offset;
    }
    if (r._sc === parent && r._so === index + 1) r._so++;
    if (r._ec === parent && r._eo === index + 1) r._eo++;
  }
}

/** https://dom.spec.whatwg.org/#dom-node-normalize steps 6.4.1-6.4.4 for one merged sibling. */
export function rangesNormalizeMerge(node: NodeImpl, current: NodeImpl, length: number): void {
  const list = liveRanges(node);
  const parent = current.parent;
  const index = indexOf(current);
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    if (r._sc === current) {
      r._so += length;
      r._sc = node;
    }
    if (r._ec === current) {
      r._eo += length;
      r._ec = node;
    }
    if (r._sc === parent && r._so === index) {
      r._sc = node;
      r._so = length;
    }
    if (r._ec === parent && r._eo === index) {
      r._ec = node;
      r._eo = length;
    }
  }
}

/** https://dom.spec.whatwg.org/#nodeiterator-pre-removing-steps (for every iterator in node's document). */
export function iteratorsBeforeRemove(toBeRemoved: NodeImpl): void {
  let w = 0;
  const doc = toBeRemoved.doc;
  for (let i = 0; i < iterators.length; i++) {
    const it = iterators[i].deref();
    if (it === undefined) continue;
    iterators[w++] = iterators[i];
    if (it._root.doc !== doc) continue;
    preRemovingSteps(it, it, toBeRemoved);
    if (it._inflight !== null) preRemovingSteps(it, it._inflight, toBeRemoved);
  }
  iterators.length = w;
  nodeIteratorCount = w;
}

function preRemovingSteps(it: IteratorState, pos: IteratorState, toBeRemoved: NodeImpl): void {
  // Step 1.
  if (!isInclusiveAncestor(toBeRemoved, pos._reference) || isInclusiveAncestor(toBeRemoved, it._root)) return;
  // Step 2.
  if (pos._pointerBeforeReference) {
    // First following node that is an inclusive descendant of root and not an inclusive
    // descendant of toBeRemoved.
    const next = nextSkippingChildren(toBeRemoved, it._root);
    if (next !== null) {
      pos._reference = next;
      return;
    }
    pos._pointerBeforeReference = false;
  }
  // Step 3.
  const prev = toBeRemoved.prev;
  if (prev === null) {
    pos._reference = toBeRemoved.parent!;
  } else {
    let last = prev;
    while (last.last !== null) last = last.last;
    pos._reference = last;
  }
}

/** @internal For tests: drop every registration. */
export function _resetLiveRegistries(): void {
  iterators = [];
  liveRangeCount = 0;
  nodeIteratorCount = 0;
}
