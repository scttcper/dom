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

interface RangeHome {
  [$ranges]: WeakRef<LiveBoundaries>[] | null;
}

function homeOf(n: NodeImpl): RangeHome {
  return n.doc as unknown as RangeHome;
}

export function registerLiveRange(r: LiveBoundaries): void {
  const home = homeOf(r[$sc]);
  r[$home] = home;
  const list = (home[$ranges] ??= []);
  // Lists are compacted on mutation (liveRanges); `createRange()` in a loop without mutations
  // would otherwise keep one dead WeakRef per range. Sweep every 256 registrations.
  if (list.length !== 0 && (list.length & 255) === 0) liveRanges(r[$sc]);
  (home[$ranges] ??= []).push(new WeakRef(r));
  liveRangeCount++;
}

/** Re-file `r` after its boundary points moved to another document. */
export function refileRange(r: LiveBoundaries): void {
  const home = homeOf(r[$sc]);
  if (r[$home] === home || r[$home] === null) return;
  r[$home] = home;
  (home[$ranges] ??= []).push(new WeakRef(r));
  liveRangeCount++;
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

/** Live ranges of `n`'s node document that are still alive; compacts that document's list. */
function liveRanges(n: NodeImpl): LiveBoundaries[] {
  const home = homeOf(n);
  const list = home[$ranges];
  const out: LiveBoundaries[] = [];
  if (list === null) return out;
  let w = 0;
  for (let i = 0; i < list.length; i++) {
    const r = list[i].deref();
    // Entries left behind by refileRange/rangesAdopt (the range now lives elsewhere) are dropped.
    if (r !== undefined && r[$home] === home) {
      out.push(r);
      list[w++] = list[i];
    }
  }
  liveRangeCount -= list.length - w;
  list.length = w;
  if (w === 0) home[$ranges] = null;
  return out;
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
  let w = 0;
  for (let i = 0; i < list.length; i++) {
    const r = list[i].deref();
    if (r === undefined) {
      liveRangeCount--;
      continue;
    }
    if (r[$home] !== oldHome) {
      liveRangeCount--;
      continue;
    }
    if (isInclusiveAncestor(node, r[$sc]) || isInclusiveAncestor(node, r[$ec])) {
      r[$home] = newHome;
      (newHome[$ranges] ??= []).push(list[i]);
    } else {
      list[w++] = list[i];
    }
  }
  list.length = w;
  if (w === 0) oldHome[$ranges] = null;
}

/** https://dom.spec.whatwg.org/#concept-node-insert step 2 */
export function rangesAfterInsert(parent: NodeImpl, index: number, count: number): void {
  const list = liveRanges(parent);
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    if (r[$sc] === parent && r[$so] > index) r[$so] += count;
    if (r[$ec] === parent && r[$eo] > index) r[$eo] += count;
  }
}

/** https://dom.spec.whatwg.org/#concept-node-remove steps 4-7 */
export function rangesBeforeRemove(node: NodeImpl, parent: NodeImpl, index: number): void {
  const list = liveRanges(parent);
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    if (isInclusiveAncestor(node, r[$sc])) {
      r[$sc] = parent;
      r[$so] = index;
    }
    if (isInclusiveAncestor(node, r[$ec])) {
      r[$ec] = parent;
      r[$eo] = index;
    }
    if (r[$sc] === parent && r[$so] > index) r[$so]--;
    if (r[$ec] === parent && r[$eo] > index) r[$eo]--;
  }
}

/** https://dom.spec.whatwg.org/#concept-cd-replace steps 8-11 */
export function rangesReplaceData(node: NodeImpl, offset: number, count: number, dataLength: number): void {
  const list = liveRanges(node);
  const end = offset + count;
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    if (r[$sc] === node && r[$so] > offset && r[$so] <= end) r[$so] = offset;
    if (r[$ec] === node && r[$eo] > offset && r[$eo] <= end) r[$eo] = offset;
    if (r[$sc] === node && r[$so] > end) r[$so] += dataLength - count;
    if (r[$ec] === node && r[$eo] > end) r[$eo] += dataLength - count;
  }
}

/** https://dom.spec.whatwg.org/#concept-text-split steps 7.2-7.5 */
export function rangesSplitText(node: NodeImpl, newNode: NodeImpl, offset: number, parent: NodeImpl): void {
  const list = liveRanges(node);
  const index = indexOf(node);
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    if (r[$sc] === node && r[$so] > offset) {
      r[$sc] = newNode;
      r[$so] -= offset;
    }
    if (r[$ec] === node && r[$eo] > offset) {
      r[$ec] = newNode;
      r[$eo] -= offset;
    }
    if (r[$sc] === parent && r[$so] === index + 1) r[$so]++;
    if (r[$ec] === parent && r[$eo] === index + 1) r[$eo]++;
  }
}

/** https://dom.spec.whatwg.org/#dom-node-normalize steps 6.4.1-6.4.4 for one merged sibling. */
export function rangesNormalizeMerge(node: NodeImpl, current: NodeImpl, length: number): void {
  const list = liveRanges(node);
  const parent = current.parent;
  const index = indexOf(current);
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    if (r[$sc] === current) {
      r[$so] += length;
      r[$sc] = node;
    }
    if (r[$ec] === current) {
      r[$eo] += length;
      r[$ec] = node;
    }
    if (r[$sc] === parent && r[$so] === index) {
      r[$sc] = node;
      r[$so] = length;
    }
    if (r[$ec] === parent && r[$eo] === index) {
      r[$ec] = node;
      r[$eo] = length;
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
export function _resetLiveRegistries(): void {
  iterators = [];
  liveRangeCount = 0;
  nodeIteratorCount = 0;
}
