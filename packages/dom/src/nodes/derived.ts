// Per-document derived caches.
//
// Caches computed from a document's trees (selector results per root, aria's label index, ...)
// are version-stamped (Document[$version]) and so stay correct without invalidation walks. But a
// stale entry for a long-lived root (the document, body) would otherwise keep a removed subtree
// alive until that root is queried again — after Testing Library's cleanup() that is the whole
// previous test's tree. Such caches live in Document[$derived] instead, which nodes/tree.ts
// remove() drops (one null check + store per removal).
import type { Document } from "./Document.ts";
import type { NodeImpl } from "./NodeImpl.ts";
import { F_CONNECTED } from "./constants.ts";
import { $derived } from "../keys.ts";

/** The `key`-owned cache of `doc`, created with `create()` when absent (or dropped since). */
export function derivedCache<T>(doc: Document, key: object, create: () => T): T {
  let map = doc[$derived];
  if (map === null) doc[$derived] = map = new Map();
  let cache = map.get(key) as T | undefined;
  if (cache === undefined) map.set(key, (cache = create()));
  return cache;
}

/** The `key`-owned cache of `doc`, or undefined when absent. */
export function peekDerivedCache<T>(doc: Document, key: object): T | undefined {
  const map = doc[$derived];
  return map === null ? undefined : (map.get(key) as T | undefined);
}

/**
 * A version-stamped node snapshot owned by a long-lived object (a live collection's members, a
 * form's listed controls). Registered with `holdSnapshot` when filled; nodes/tree.ts remove()
 * calls `_dropSnapshot()` on every holder registered since the previous removal.
 *
 * Only snapshots rooted in a connected node are registered. A detached root's snapshot can only
 * hold nodes of its own tree and lives exactly as long as its owner; registering it would let the
 * document keep the whole detached tree alive until its next removal (a removed React container
 * whose `children` were read, every clone a test inspects).
 */
export interface SnapshotHolder {
  _dropSnapshot(): void;
}

const HOLDERS = {};
const newHolders = (): Set<SnapshotHolder> => new Set();

/**
 * Register `holder`, whose snapshot was computed from the tree of `root`, to have its snapshot
 * dropped at the next removal from a tree of `doc`; a no-op when `root` is not connected.
 */
export function holdSnapshot(doc: Document, holder: SnapshotHolder, root: NodeImpl): void {
  if ((root.flags & F_CONNECTED) === 0) return;
  derivedCache(doc, HOLDERS, newHolders).add(holder);
}

/** nodes/tree.ts: a node was removed from a tree of `doc` (doc[$derived] is non-null). */
export function dropDerivedCaches(doc: Document): void {
  const map = doc[$derived]!;
  doc[$derived] = null;
  const holders = map.get(HOLDERS) as Set<SnapshotHolder> | undefined;
  if (holders !== undefined) for (const h of holders) h._dropSnapshot();
}
