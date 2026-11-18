// Per-document derived caches.
//
// Caches computed from a document's trees (selector results per root, ...)
// are version-stamped (Document[$version]) and so stay correct without invalidation walks. But a
// stale entry for a long-lived root (the document, body) would otherwise keep a removed subtree
// alive until that root is queried again — after Testing Library's cleanup() that is the whole
// previous test's tree. Such caches live in Document[$derived] instead, which nodes/tree.ts
// remove() drops with a single store.
import type { Document } from "./Document.ts";
import { $derived } from "../keys.ts";

/** The `key`-owned cache of `doc`, created with `create()` when absent (or dropped since). */
export function derivedCache<T>(doc: Document, key: object, create: () => T): T {
  let map = doc[$derived];
  if (map === null) doc[$derived] = map = new WeakMap();
  let cache = map.get(key) as T | undefined;
  if (cache === undefined) map.set(key, (cache = create()));
  return cache;
}

/** The `key`-owned cache of `doc`, or undefined when absent. */
export function peekDerivedCache<T>(doc: Document, key: object): T | undefined {
  const map = doc[$derived];
  return map === null ? undefined : (map.get(key) as T | undefined);
}

/** A version-stamped snapshot under its collection or form's weak key. */
export function cachedSnapshot<T>(doc: Document, owner: object, version: number): T[] | undefined {
  const entry = doc[$derived]?.get(owner) as { version: number; items: T[] } | undefined;
  return entry?.version === version ? entry.items : undefined;
}

export function storeSnapshot<T>(doc: Document, owner: object, version: number, items: T[]): void {
  (doc[$derived] ??= new WeakMap()).set(owner, { version, items });
}
