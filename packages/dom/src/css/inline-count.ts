// Per-document count of elements carrying a non-empty `style` attribute (F_HAS_STYLE_ATTR
// transitions, reported by nodes/attributes.ts). Lets hasAuthorStyles() answer "no inline
// styles anywhere" in O(1). Elements are not uncounted when they are removed from the tree, so
// a non-zero count is conservative (callers then confirm with a cached walk).
//
// Deliberately import-free: nodes/attributes.ts loads before everything else.

const counts = new WeakMap<object, number>();

export function noteInlineStyle(doc: object, delta: number): void {
  counts.set(doc, (counts.get(doc) ?? 0) + delta);
}

export function inlineStyleCount(doc: object): number {
  return counts.get(doc) ?? 0;
}
