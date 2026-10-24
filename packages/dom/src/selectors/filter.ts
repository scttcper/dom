// Ancestor filter: fast rejection of descendant / child combinator selectors.
//
// Port of WebKit's SelectorFilter
// (https://github.com/WebKit/WebKit/blob/main/Source/WebCore/css/SelectorFilter.h,
// SelectorFilter.cpp; Blink has the same idea in core/css/selector_filter.h): every complex
// selector carries up to four hashes of the type / id / class names that some ANCESTOR of the
// subject must have (taken from the compounds joined to the subject by descendant or child
// combinators). Before matching a rule against an element, the hashes are looked up in a set
// built from the element's ancestors; if one is missing, the rule cannot match and the
// right-to-left ancestor walk (https://drafts.csswg.org/selectors-4/#match-a-selector-against-an-element)
// is skipped. Hash collisions only let a rule through to the real matcher: never a wrong answer.
//
// Differences from WebKit: WebKit keeps a counting Bloom filter that its style-resolution tree
// walk pushes/pops parents on. getComputedStyle here is random access per element, so the set is
// rebuilt per element from its ancestor chain (O(depth) hashes instead of O(depth x rules)
// ancestor steps), and it is a generation-stamped table (slot === generation) so rebuilding
// never clears memory.

import type { NodeImpl } from "../nodes/NodeImpl.ts";
import { ELEMENT_NODE, F_HTML } from "../nodes/constants.ts";
import { classTokens, asciiLowercase } from "../nodes/attributes.ts";

const BITS = 12;
const SIZE = 1 << BITS;
const MASK = SIZE - 1;

/** Seeds keep `div` the tag, `#div` and `.div` apart. */
const SEED_TAG = 0x2545f491;
const SEED_ID = 0x6c8e9cf5;
const SEED_CLASS = 0x1b873593;

/** FNV-1a over UTF-16 code units, folded to the table size. */
function hash(s: string, seed: number): number {
  let h = 0x811c9dc5 ^ seed;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h ^ (h >>> 16)) & MASK;
}

/** Hash of a type selector / element local name (ASCII-lowercased). */
export function tagHash(lower: string): number {
  return hash(lower, SEED_TAG);
}

export function idHash(id: string): number {
  return hash(id, SEED_ID);
}

export function classHash(name: string): number {
  return hash(name, SEED_CLASS);
}

/** Tag hashes of known HTML tags, by `NodeImpl.tag` (filled on first use). */
const TAG_HASHES: number[] = [];

function elementTagHash(el: NodeImpl): number {
  if (el.tag !== 0 && (el.flags & F_HTML) !== 0) {
    // HTML elements' local names are lowercase already.
    const h = TAG_HASHES[el.tag];
    if (h !== undefined) return h;
    return (TAG_HASHES[el.tag] = tagHash(el.name));
  }
  return tagHash(asciiLowercase(el.name));
}

/** The set of ancestor hashes for one element (allocated on first use: no cost without style sheets). */
let slots = new Int32Array(0);
let generation = 0;

/**
 * Fill the set with the tag, id and classes of every element ancestor of `el` (the parent chain
 * up to the first non-element: a descendant / child combinator never crosses further, except
 * into a featureless shadow host, whose compound carries no hashes).
 * Not for quirks-mode documents (their ids and classes match case-insensitively).
 */
export function buildAncestorFilter(el: NodeImpl): void {
  if (++generation === 0x7fffffff || slots.length === 0) {
    if (slots.length === 0) slots = new Int32Array(SIZE);
    else slots.fill(0);
    generation = 1;
  }
  const g = generation;
  for (let p = el.parent; p !== null && p.type === ELEMENT_NODE; p = p.parent) {
    slots[elementTagHash(p)] = g;
    if (p.id !== "") slots[idHash(p.id)] = g;
    if (p.attrs !== null) {
      const cls = classTokens(p);
      for (let i = 0; i < cls.length; i++) slots[classHash(cls[i])] = g;
    }
  }
}

/**
 * Whether a selector with ancestor hashes h0..h3 (-1 = none) may match the element the filter
 * was last built for. Inline-friendly: four slot reads at most.
 */
export function mayMatchAncestors(h0: number, h1: number, h2: number, h3: number): boolean {
  const g = generation;
  if (h0 < 0) return true;
  if (slots[h0] !== g) return false;
  if (h1 < 0) return true;
  if (slots[h1] !== g) return false;
  if (h2 < 0) return true;
  if (slots[h2] !== g) return false;
  return h3 < 0 || slots[h3] === g;
}
