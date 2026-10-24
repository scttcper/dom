// Named character reference lookup for the tokenizer.
// https://html.spec.whatwg.org/#named-character-reference-state
//
// The table (entities-data.ts) is a pair of packed strings. On first use it is turned into a
// first-child/next-sibling trie over typed arrays (~2231 names, built in well under a
// millisecond), so documents without named references never pay for it.

import { ENTITY_COUNT, ENTITY_NAMES, ENTITY_VALUES } from "./entities-data.ts";

let built = false;
/** Per trie node: first child node index (-1 = none). */
let firstChild = new Int32Array(0);
/** Per trie node: next sibling node index (-1 = none). */
let nextSibling = new Int32Array(0);
/** Per trie node: the character on the edge into this node. */
let edgeChar = new Uint8Array(0);
/** Per trie node: index into `values` if a name ends here, else -1. */
let nodeValue = new Int32Array(0);
/** Root level: node index for each ASCII first character (-1 = none). */
const rootIndex = new Int32Array(128);
/** Second level: (first char index) * 128 + second char → node index (-1 = none). */
let secondLevel = new Int32Array(0);
const values: string[] = [];
let nodeCount = 0;
let lastLength = 0;

function newNode(c: number): number {
  const n = nodeCount++;
  firstChild[n] = -1;
  nextSibling[n] = -1;
  edgeChar[n] = c;
  nodeValue[n] = -1;
  return n;
}

function build(): void {
  built = true;
  const cap = ENTITY_NAMES.length + 1;
  firstChild = new Int32Array(cap);
  nextSibling = new Int32Array(cap);
  edgeChar = new Uint8Array(cap);
  nodeValue = new Int32Array(cap);
  rootIndex.fill(-1);
  let v = 0;
  for (let e = 0; e < ENTITY_COUNT; e++) {
    const len = ENTITY_VALUES.charCodeAt(v) - 48;
    values.push(ENTITY_VALUES.slice(v + 1, v + 1 + len));
    v += 1 + len;
  }
  let p = 0;
  let index = 0;
  const total = ENTITY_NAMES.length;
  while (p < total) {
    // One name: ENTITY_NAMES[p .. comma).
    const c0 = ENTITY_NAMES.charCodeAt(p);
    let node = rootIndex[c0];
    if (node < 0) {
      node = newNode(c0);
      rootIndex[c0] = node;
    }
    p++;
    while (p < total) {
      const c = ENTITY_NAMES.charCodeAt(p);
      if (c === 44) break;
      let child = firstChild[node];
      let found = -1;
      let last = -1;
      while (child >= 0) {
        if (edgeChar[child] === c) {
          found = child;
          break;
        }
        last = child;
        child = nextSibling[child];
      }
      if (found < 0) {
        found = newNode(c);
        if (last < 0) firstChild[node] = found;
        else nextSibling[last] = found;
      }
      node = found;
      p++;
    }
    nodeValue[node] = index++;
    p++; // skip comma
  }
  // Dense table for the second character: root sibling chains are the longest.
  secondLevel = new Int32Array(128 * 128).fill(-1);
  for (let c0 = 0; c0 < 128; c0++) {
    const root = rootIndex[c0];
    if (root < 0) continue;
    for (let child = firstChild[root]; child >= 0; child = nextSibling[child]) secondLevel[c0 * 128 + edgeChar[child]] = child;
  }
}

/**
 * Longest named character reference that is a prefix of `src` starting at `start` (the
 * character after "&"). Returns an index for `entityValue`, or -1; the number of characters
 * matched is available from `matchedLength()`.
 */
export function matchNamedReference(src: string, start: number): number {
  if (!built) build();
  lastLength = 0;
  const len = src.length;
  if (start >= len) return -1;
  const c0 = src.charCodeAt(start);
  if (c0 >= 128) return -1;
  let node = rootIndex[c0];
  if (node < 0) return -1;
  let best = -1;
  let bestLen = 0;
  let i = start + 1;
  if (nodeValue[node] >= 0) {
    best = nodeValue[node];
    bestLen = 1;
  }
  if (i < len) {
    const c1 = src.charCodeAt(i);
    const second = c1 < 128 ? secondLevel[c0 * 128 + c1] : -1;
    if (second < 0) {
      lastLength = bestLen;
      return best;
    }
    node = second;
    i++;
    if (nodeValue[node] >= 0) {
      best = nodeValue[node];
      bestLen = 2;
    }
  }
  while (i < len) {
    const c = src.charCodeAt(i);
    let child = firstChild[node];
    while (child >= 0 && edgeChar[child] !== c) child = nextSibling[child];
    if (child < 0) break;
    node = child;
    i++;
    if (nodeValue[node] >= 0) {
      best = nodeValue[node];
      bestLen = i - start;
    }
  }
  lastLength = bestLen;
  return best;
}

/** Characters consumed by the last successful `matchNamedReference` call. */
export function matchedLength(): number {
  return lastLength;
}

export function entityValue(index: number): string {
  return values[index];
}

/**
 * Replacement table for numeric references in the C1 range.
 * https://html.spec.whatwg.org/#numeric-character-reference-end-state
 */
const C1_REPLACEMENTS = new Int32Array([
  0x20ac, 0x81, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x8d, 0x017d, 0x8f,
  0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x9d, 0x017e, 0x0178,
]);

/** https://html.spec.whatwg.org/#numeric-character-reference-end-state (steps after parsing). */
export function numericReferenceValue(code: number): string {
  if (code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return "�";
  if (code >= 0x80 && code <= 0x9f) return String.fromCharCode(C1_REPLACEMENTS[code - 0x80]);
  return String.fromCodePoint(code);
}
