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
import { F_RANGE, F_RANGE_BELOW } from "../nodes/constants.ts";
import { $ec, $eo, $home, $inflight, $pointerBeforeReference, $ranges, $reference, $root, $sc, $so } from "../keys.ts";

/** Boundary points of a live range, as NodeImpls. Implemented by `AbstractRange`. */
export interface LiveBoundaries {
  [$sc]: NodeImpl;
  [$so]: number;
  [$ec]: NodeImpl;
  [$eo]: number;
  /** Document whose `_ranges` list holds this range. */
  [$home]: object | null;
}

/** State of a NodeIterator relevant to the pre-removing steps. */
export interface IteratorState {
  [$root]: NodeImpl;
  [$reference]: NodeImpl;
  [$pointerBeforeReference]: boolean;
  /** Candidate position of an in-flight traversal while the filter runs (kept up to date too). */
  [$inflight]: IteratorState | null;
}

/** Number of registered (possibly already collected) live ranges. */
export let liveRangeCount = 0;
/** Number of registered (possibly already collected) NodeIterators. */
export let nodeIteratorCount = 0;

// Live ranges are filed per node document (Document._ranges) so a mutation only looks at the
// ranges of its own document: test runs create many documents, and ranges of finished tests
// stay registered until GC clears their WeakRefs.
let iterators: WeakRef<IteratorState>[] = [];

/**
 * A document's live ranges. Dead WeakRefs are dropped when a mutation walks the list, and on
 * registration once the list has doubled since the last sweep: a WeakRef's target stays alive
 * until the current job ends, so `createRange()` in a synchronous loop finds nothing to drop
 * and sweeping on a fixed stride would be quadratic.
 */
interface RangeList {
  refs: WeakRef<LiveBoundaries>[];
  sweepAt: number;
}

interface RangeHome {
  [$ranges]: RangeList | null;
}

const SWEEP_MIN = 64;

function homeOf(n: NodeImpl): RangeHome {
  return n.doc as unknown as RangeHome;
}

function file(home: RangeHome, ref: WeakRef<LiveBoundaries>): void {
  let list = home[$ranges];
  if (list === null) list = home[$ranges] = { refs: [], sweepAt: SWEEP_MIN };
  else if (list.refs.length >= list.sweepAt) {
    compact(home, list);
    list.sweepAt = Math.max(SWEEP_MIN, list.refs.length * 2);
  }
  list.refs.push(ref);
  liveRangeCount++;
}

/**
 * Marks `n` as a live range's boundary node and its ancestors as having one below
 * (nodes/constants.ts F_RANGE). Called whenever a live range takes a new start or end node.
 */
export function markBoundary(n: NodeImpl): void {
  if ((n.flags & F_RANGE) !== 0) return;
  n.flags |= F_RANGE;
  if (n.parent !== null) markRangeAncestors(n.parent);
}

/** Sets F_RANGE_BELOW on `n` and its ancestors (stops at the first one that has it). */
export function markRangeAncestors(n: NodeImpl): void {
  for (let p: NodeImpl | null = n; p !== null && (p.flags & F_RANGE_BELOW) === 0; p = p.parent)
    p.flags |= F_RANGE_BELOW;
}

export function registerLiveRange(r: LiveBoundaries): void {
  markBoundary(r[$sc]);
  markBoundary(r[$ec]);
  const home = homeOf(r[$sc]);
  r[$home] = home;
  file(home, new WeakRef(r));
}

/**
 * `r` is unreachable: its only holder (a Selection that made it and never handed it out) has
 * replaced it. The next walk of its document's list drops the entry instead of waiting for a
 * major GC to clear the WeakRef, so selections moved in a loop do not lengthen every mutation.
 */
export function retireLiveRange(r: LiveBoundaries): void {
  r[$home] = null;
}

/** Re-file `r` after its boundary points moved to another document. */
export function refileRange(r: LiveBoundaries): void {
  markBoundary(r[$sc]);
  markBoundary(r[$ec]);
  const home = homeOf(r[$sc]);
  if (r[$home] === home || r[$home] === null) return;
  r[$home] = home;
  file(home, new WeakRef(r));
}

/** Registry length at which registerNodeIterator drops collected entries (amortized O(1)). */
let iteratorSweepAt = 64;

export function registerNodeIterator(it: IteratorState): void {
  if (iterators.length >= iteratorSweepAt) {
    // Without removals (which compact the list) iterators created in a loop would leave one
    // dead WeakRef each behind for the life of the process.
    let w = 0;
    for (let i = 0; i < iterators.length; i++) if (iterators[i].deref() !== undefined) iterators[w++] = iterators[i];
    iterators.length = w;
    iteratorSweepAt = Math.max(64, w * 2);
  }
  iterators.push(new WeakRef(it));
  nodeIteratorCount = iterators.length;
}

/** Drops collected entries and entries for ranges now filed elsewhere; keeps `list` attached. */
function compact(home: RangeHome, list: RangeList, update?: (range: LiveBoundaries) => void): void {
  const refs = list.refs;
  let w = 0;
  for (let i = 0; i < refs.length; i++) {
    const r = refs[i].deref();
    // Entries left behind by refileRange/rangesAdopt (the range now lives elsewhere) are dropped.
    if (r !== undefined && r[$home] === home) {
      refs[w++] = refs[i];
      update?.(r);
    }
  }
  liveRangeCount -= refs.length - w;
  refs.length = w;
}

/** Update ranges as their weak references are compacted, so a mutation never retains its ranges afterward. */
function updateLiveRanges(n: NodeImpl, update: (range: LiveBoundaries) => void): void {
  const home = homeOf(n);
  const list = home[$ranges];
  if (list === null) return;
  compact(home, list, update);
  const remaining = list.refs.length;
  if (remaining === 0) home[$ranges] = null;
  else if (list.sweepAt > SWEEP_MIN && remaining * 4 < list.sweepAt) list.sweepAt = Math.max(SWEEP_MIN, remaining * 2);
}

/**
 * Adopting `node` from `oldDoc`: ranges filed under the old document whose boundary points are
 * inside the adopted subtree move to the new document's list.
 */
export function rangesAdopt(node: NodeImpl, oldDoc: object): void {
  const oldHome = oldDoc as RangeHome;
  const newHome = homeOf(node);
  const list = oldHome[$ranges];
  if (list === null || oldHome === newHome) return;
  const refs = list.refs;
  let w = 0;
  for (let i = 0; i < refs.length; i++) {
    const r = refs[i].deref();
    if (r === undefined || r[$home] !== oldHome) {
      liveRangeCount--;
      continue;
    }
    if (isInclusiveAncestor(node, r[$sc]) || isInclusiveAncestor(node, r[$ec])) {
      r[$home] = newHome;
      liveRangeCount--;
      file(newHome, refs[i]);
    } else {
      refs[w++] = refs[i];
    }
  }
  refs.length = w;
  if (w === 0) oldHome[$ranges] = null;
}

/** The two ends of a parent need no sibling walk; interior offsets share one lookup per mutation. */
function offsetAfterChild(offset: number, parent: NodeImpl, getIndex: () => number): boolean {
  return offset > 0 && (offset === parent.childCount || offset > getIndex());
}

/** https://dom.spec.whatwg.org/#concept-node-insert step 2 */
export function rangesAfterInsert(parent: NodeImpl, child: NodeImpl, count: number): void {
  let index: number | undefined;
  const getIndex = () => (index ??= indexOf(child));
  updateLiveRanges(parent, (r) => {
    if (r[$sc] === parent && offsetAfterChild(r[$so], parent, getIndex)) r[$so] += count;
    if (r[$ec] === parent && offsetAfterChild(r[$eo], parent, getIndex)) r[$eo] += count;
  });
}

/** https://dom.spec.whatwg.org/#concept-node-remove steps 4-7 */
export function rangesBeforeRemove(node: NodeImpl, parent: NodeImpl): void {
  let index: number | undefined;
  const getIndex = () => (index ??= indexOf(node));
  const hasBoundaryBelow = (node.flags & F_RANGE_BELOW) !== 0;
  updateLiveRanges(parent, (r) => {
    const start = r[$sc];
    const end = r[$ec];
    const moveStart = start === node || (hasBoundaryBelow && isInclusiveAncestor(node, start));
    const moveEnd = start === end ? moveStart : end === node || (hasBoundaryBelow && isInclusiveAncestor(node, end));
    if (moveStart || moveEnd) markBoundary(parent);
    if (moveStart) {
      r[$sc] = parent;
      r[$so] = getIndex();
    } else if (start === parent && offsetAfterChild(r[$so], parent, getIndex)) r[$so]--;
    if (moveEnd) {
      r[$ec] = parent;
      r[$eo] = getIndex();
    } else if (end === parent && offsetAfterChild(r[$eo], parent, getIndex)) r[$eo]--;
  });
}

/** https://dom.spec.whatwg.org/#concept-cd-replace steps 8-11 */
export function rangesReplaceData(node: NodeImpl, offset: number, count: number, dataLength: number): void {
  const end = offset + count;
  updateLiveRanges(node, (r) => {
    if (r[$sc] === node && r[$so] > offset && r[$so] <= end) r[$so] = offset;
    if (r[$ec] === node && r[$eo] > offset && r[$eo] <= end) r[$eo] = offset;
    if (r[$sc] === node && r[$so] > end) r[$so] += dataLength - count;
    if (r[$ec] === node && r[$eo] > end) r[$eo] += dataLength - count;
  });
}

/** https://dom.spec.whatwg.org/#concept-text-split steps 7.2-7.5 */
export function rangesSplitText(node: NodeImpl, newNode: NodeImpl, offset: number, parent: NodeImpl): void {
  let afterNode: number | undefined;
  updateLiveRanges(node, (r) => {
    if (r[$sc] === node && r[$so] > offset) {
      r[$sc] = newNode;
      r[$so] -= offset;
      markBoundary(newNode);
    }
    if (r[$ec] === node && r[$eo] > offset) {
      r[$ec] = newNode;
      r[$eo] -= offset;
      markBoundary(newNode);
    }
    if (r[$sc] === parent || r[$ec] === parent) {
      afterNode ??= indexOf(node) + 1;
      if (r[$sc] === parent && r[$so] === afterNode) r[$so]++;
      if (r[$ec] === parent && r[$eo] === afterNode) r[$eo]++;
    }
  });
}

/** https://dom.spec.whatwg.org/#dom-node-normalize steps 6.4.1-6.4.4 for one merged sibling. */
export function rangesNormalizeMerge(node: NodeImpl, current: NodeImpl, length: number): void {
  const parent = current.parent;
  let index: number | undefined;
  updateLiveRanges(node, (r) => {
    if (r[$sc] === parent || r[$ec] === parent) index ??= indexOf(current);
    if (r[$sc] === current) {
      r[$so] += length;
      r[$sc] = node;
    } else if (r[$sc] === parent && r[$so] === index) {
      r[$sc] = node;
      r[$so] = length;
    }
    if (r[$ec] === current) {
      r[$eo] += length;
      r[$ec] = node;
    } else if (r[$ec] === parent && r[$eo] === index) {
      r[$ec] = node;
      r[$eo] = length;
    }
    if (r[$sc] === node || r[$ec] === node) markBoundary(node);
  });
}

/** https://dom.spec.whatwg.org/#nodeiterator-pre-removing-steps (for every iterator in node's document). */
export function iteratorsBeforeRemove(toBeRemoved: NodeImpl): void {
  let w = 0;
  const doc = toBeRemoved.doc;
  for (let i = 0; i < iterators.length; i++) {
    const it = iterators[i].deref();
    if (it === undefined) continue;
    iterators[w++] = iterators[i];
    if (it[$root].doc !== doc) continue;
    preRemovingSteps(it, it, toBeRemoved);
    if (it[$inflight] !== null) preRemovingSteps(it, it[$inflight], toBeRemoved);
  }
  iterators.length = w;
  nodeIteratorCount = w;
}

function preRemovingSteps(it: IteratorState, pos: IteratorState, toBeRemoved: NodeImpl): void {
  // Step 1.
  if (!isInclusiveAncestor(toBeRemoved, pos[$reference]) || isInclusiveAncestor(toBeRemoved, it[$root])) return;
  // Step 2.
  if (pos[$pointerBeforeReference]) {
    // First following node that is an inclusive descendant of root and not an inclusive
    // descendant of toBeRemoved.
    const next = nextSkippingChildren(toBeRemoved, it[$root]);
    if (next !== null) {
      pos[$reference] = next;
      return;
    }
    pos[$pointerBeforeReference] = false;
  }
  // Step 3.
  const prev = toBeRemoved.prev;
  if (prev === null) {
    pos[$reference] = toBeRemoved.parent!;
  } else {
    let last = prev;
    while (last.last !== null) last = last.last;
    pos[$reference] = last;
  }
}

/** @internal For tests: drop every registration. */
function _resetLiveRegistries(): void {
  iterators = [];
  liveRangeCount = 0;
  nodeIteratorCount = 0;
}
