// Selector engine entry points used by the DOM (querySelector(All), matches, closest).
//
// https://dom.spec.whatwg.org/#scope-match-a-selectors-string
// https://dom.spec.whatwg.org/#dom-parentnode-queryselectorall
// https://dom.spec.whatwg.org/#dom-element-matches
// https://dom.spec.whatwg.org/#dom-element-closest
// https://drafts.csswg.org/selectors-4/
//
// Pipeline: selector string → parser.ts (CSS Syntax 3 tokens + Selectors 4 grammar, pure and
// scriptc-compatible) → compile.ts (right-to-left program over NodeImpl) → cached by string in a
// bounded map. querySelector(All) take allocation-free tree walks with specialized loops for the
// shapes Testing Library and React apps hammer (`*`, `#id`, `.class`, `tag`, `[attr]`,
// `[attr="v"]`); everything else runs the generic matcher per element.

import { DOCUMENT_NODE, ELEMENT_NODE, F_CONNECTED, F_HTML } from "../nodes/constants.ts";
import type { NodeImpl } from "../nodes/NodeImpl.ts";
import { classTokens } from "../nodes/attributes.ts";
import { NodeList } from "../collections/NodeList.ts";
import { SelectorParser } from "./parser.ts";
import {
  type CList,
  type Test,
  CompileInfo,
  compileList,
  CList as CListClass,
  matchList,
  setScope,
  resetMemos,
  fastShape,
  fastTest,
  FAST_NONE,
  FAST_ALL,
  FAST_ID,
  FAST_CLASS,
  FAST_TAG,
  FAST_ATTR,
} from "./compile.ts";

/** A compiled selector string, cached by text. */
class Query {
  /** Complex selectors without pseudo-elements (pseudo-elements never match DOM queries). */
  list: CList;
  info: CompileInfo;
  fast: number;
  fastT: Test | null;
  /** Nonzero when the selector has :nth-* memos to reset after each top-level call. */
  hasMemos: boolean;

  constructor(list: CList, info: CompileInfo) {
    const domList = new CListClass();
    for (let i = 0; i < list.items.length; i++) {
      const cx = list.items[i];
      if (cx.pseudoElement === "") domList.items.push(cx);
    }
    this.list = domList;
    this.info = info;
    this.fast = info.usesScope ? FAST_NONE : fastShape(domList);
    this.fastT = this.fast === FAST_NONE || this.fast === FAST_ALL ? null : fastTest(domList);
    this.hasMemos = info.nthTests.length !== 0;
  }
}

const MAX_CACHE = 2048;
/** Compiled selectors by text; null marks an invalid selector. */
const cache = new Map<string, Query | null>();

/** Drop every compiled selector (e.g. after replacing a pseudo-class predicate). */
export function clearSelectorCaches(): void {
  cache.clear();
}


function compileQuery(selectors: string): Query | null {
  const parser = new SelectorParser(selectors);
  const ast = parser.parseSelectorList();
  if (ast === null) return null;
  const info = new CompileInfo();
  const list = compileList(ast, info);
  if (info.error !== "") return null;
  return new Query(list, info);
}

function interfaceName(root: NodeImpl): string {
  if (root.type === DOCUMENT_NODE) return "Document";
  if (root.type === ELEMENT_NODE) return "Element";
  return "DocumentFragment";
}

/** SyntaxError with the browser's message shape. https://dom.spec.whatwg.org/#scope-match-a-selectors-string step 2 */
function syntaxError(selectors: string, method: string, root: NodeImpl): DOMException {
  return new DOMException(`Failed to execute '${method}' on '${interfaceName(root)}': '${selectors}' is not a valid selector.`, "SyntaxError");
}

function getQuery(selectors: string, method: string, root: NodeImpl): Query {
  let q = cache.get(selectors);
  if (q === undefined) {
    q = compileQuery(selectors);
    if (cache.size >= MAX_CACHE) cache.clear();
    cache.set(selectors, q);
  }
  if (q === null) throw syntaxError(selectors, method, root);
  return q;
}

/** https://drafts.csswg.org/selectors-4/#scoping-root — the root element, or the document element for a Document. */
function scopeFor(root: NodeImpl): NodeImpl | null {
  if (root.type === ELEMENT_NODE) return root;
  if (root.type === DOCUMENT_NODE) {
    for (let c = root.first; c !== null; c = c.next) if (c.type === ELEMENT_NODE) return c;
  }
  return null;
}

// --- tree walks ----------------------------------------------------------------------------

/** Next node in tree order within `root`'s subtree (inlined copy of traverse.nextInTree). */
function next(n: NodeImpl, root: NodeImpl): NodeImpl | null {
  const f = n.first;
  if (f !== null) return f;
  let cur: NodeImpl | null = n;
  while (cur !== root) {
    const nx: NodeImpl | null = cur!.next;
    if (nx !== null) return nx;
    cur = cur!.parent;
  }
  return null;
}

function hasClass(el: NodeImpl, name: string): boolean {
  const tokens = classTokens(el);
  for (let i = 0; i < tokens.length; i++) if (tokens[i] === name) return true;
  return false;
}

function attrMatch(el: NodeImpl, t: Test, exists: boolean): boolean {
  const attrs = el.attrs;
  if (attrs === null) return false;
  const name = (el.flags & F_HTML) !== 0 ? t.lower : t.name;
  for (let i = 0; i < attrs.length; i++) {
    const a = attrs[i];
    if (a.localName === name && a.ns === null) return exists || a.value === t.value;
  }
  return false;
}

function isQuirks(root: NodeImpl): boolean {
  return root.doc._mode === "quirks";
}

/** Collect (or find the first of, when `first`) the matching descendants of `root` in tree order. */
function run(root: NodeImpl, q: Query, first: boolean, out: NodeImpl[]): NodeImpl | null {
  switch (q.fast) {
    case FAST_ALL:
      for (let n = root.first; n !== null; n = next(n, root)) {
        if (n.type === ELEMENT_NODE) {
          if (first) return n;
          out.push(n);
        }
      }
      return null;
    case FAST_ID: {
      const t = q.fastT!;
      if ((root.flags & F_CONNECTED) !== 0 && !isQuirks(root)) {
        const found = root.doc._ids.get(t.name);
        if (found === undefined) {
          if (root.type === DOCUMENT_NODE) return null;
        } else if (!Array.isArray(found)) {
          // Single element with this id in the document: answer from the index if it is under root.
          for (let p = found.parent; p !== null; p = p.parent) {
            if (p === root) {
              if (first) return found;
              out.push(found);
              return null;
            }
          }
          if (root.type === DOCUMENT_NODE) return null;
        }
      }
      const id = t.name;
      if (!isQuirks(root)) {
        for (let n = root.first; n !== null; n = next(n, root)) {
          if (n.type === ELEMENT_NODE && n.id === id) {
            if (first) return n;
            out.push(n);
          }
        }
        return null;
      }
      break;
    }
    case FAST_CLASS: {
      if (isQuirks(root)) break;
      const name = q.fastT!.name;
      for (let n = root.first; n !== null; n = next(n, root)) {
        if (n.type === ELEMENT_NODE && n.attrs !== null && hasClass(n, name)) {
          if (first) return n;
          out.push(n);
        }
      }
      return null;
    }
    case FAST_TAG: {
      const t = q.fastT!;
      const lower = t.lower;
      const name = t.name;
      for (let n = root.first; n !== null; n = next(n, root)) {
        if (n.type === ELEMENT_NODE && ((n.flags & F_HTML) !== 0 ? n.name === lower : n.name === name)) {
          if (first) return n;
          out.push(n);
        }
      }
      return null;
    }
    case FAST_ATTR: {
      const t = q.fastT!;
      const exists = t.attrOp === 0;
      for (let n = root.first; n !== null; n = next(n, root)) {
        if (n.type === ELEMENT_NODE && attrMatch(n, t, exists)) {
          if (first) return n;
          out.push(n);
        }
      }
      return null;
    }
  }
  const list = q.list;
  if (list.items.length === 0) return null;
  const prevScope = setScope(q.info.usesScope ? scopeFor(root) : null);
  try {
    for (let n = root.first; n !== null; n = next(n, root)) {
      if (n.type === ELEMENT_NODE && matchList(list, n)) {
        if (first) return n;
        out.push(n);
      }
    }
    return null;
  } finally {
    setScope(prevScope);
    if (q.hasMemos) resetMemos(q.info);
  }
}

const NO_OUT: NodeImpl[] = [];

// --- version-stamped result cache ------------------------------------------------------------
//
// Repeated identical queries with no DOM mutation in between are common in tests (waitFor
// polling, repeated getBy* calls). Results of selectors whose outcome depends only on the tree
// and attributes (CompileInfo.volatile === false) are reused while Document._version is unchanged
// (https://dom.spec.whatwg.org's mutation algorithms bump it in nodes/tree.ts, attributes.ts,
// CharacterData.ts). Keyed weakly by the root so cached results never keep a document alive.

class ResultEntry {
  version: number;
  doc: object;
  /** All matches (querySelectorAll), or null if only `first` is known. */
  all: NodeImpl[] | null;
  /** First match (querySelector); undefined = unknown. */
  first: NodeImpl | null | undefined;

  constructor(version: number, doc: object) {
    this.version = version;
    this.doc = doc;
    this.all = null;
    this.first = undefined;
  }
}

const MAX_ENTRIES_PER_ROOT = 64;
const results = new WeakMap<NodeImpl, Map<Query, ResultEntry>>();

function cacheable(q: Query): boolean {
  return !q.info.volatile && q.fast !== FAST_ID;
}

function cachedEntry(root: NodeImpl, q: Query, create: boolean): ResultEntry | null {
  let m = results.get(root);
  if (m === undefined) {
    if (!create) return null;
    m = new Map();
    results.set(root, m);
  }
  const doc = root.doc;
  const version = doc._version;
  let e = m.get(q);
  if (e !== undefined && e.version === version && e.doc === doc) return e;
  if (!create) return null;
  if (e === undefined) {
    if (m.size >= MAX_ENTRIES_PER_ROOT) m.clear();
    e = new ResultEntry(version, doc);
    m.set(q, e);
  } else {
    e.version = version;
    e.doc = doc;
    e.all = null;
    e.first = undefined;
  }
  return e;
}

// --- DOM entry points ------------------------------------------------------------------------

/** https://dom.spec.whatwg.org/#dom-parentnode-queryselector */
export function querySelector(root: NodeImpl, selectors: string): NodeImpl | null {
  const q = getQuery(selectors, "querySelector", root);
  if (!cacheable(q)) return run(root, q, true, NO_OUT);
  const hit = cachedEntry(root, q, false);
  if (hit !== null) {
    if (hit.first !== undefined) return hit.first;
    if (hit.all !== null) return (hit.first = hit.all.length === 0 ? null : hit.all[0]);
  }
  const first = run(root, q, true, NO_OUT);
  cachedEntry(root, q, true)!.first = first;
  return first;
}

/** https://dom.spec.whatwg.org/#dom-parentnode-queryselectorall (static NodeList) */
export function querySelectorAll(root: NodeImpl, selectors: string): NodeList {
  return NodeList._staticFromImpls(allImpls(root, getQuery(selectors, "querySelectorAll", root)));
}

/** The matches as a (possibly shared, read-only) impl array. */
function allImpls(root: NodeImpl, q: Query): NodeImpl[] {
  if (!cacheable(q)) {
    const out: NodeImpl[] = [];
    run(root, q, false, out);
    return out;
  }
  const hit = cachedEntry(root, q, false);
  if (hit !== null && hit.all !== null) return hit.all;
  const out: NodeImpl[] = [];
  run(root, q, false, out);
  const e = cachedEntry(root, q, true)!;
  e.all = out;
  e.first = out.length === 0 ? null : out[0];
  return out;
}

/** Internal variant of querySelectorAll returning impls (no NodeList allocation). The array is fresh and owned by the caller. */
export function querySelectorAllImpls(root: NodeImpl, selectors: string, out: NodeImpl[] = []): NodeImpl[] {
  const all = allImpls(root, getQuery(selectors, "querySelectorAll", root));
  for (let i = 0; i < all.length; i++) out.push(all[i]);
  return out;
}

/** https://dom.spec.whatwg.org/#dom-element-matches */
export function matches(el: NodeImpl, selectors: string): boolean {
  const q = getQuery(selectors, "matches", el);
  const list = q.list;
  if (list.items.length === 0) return false;
  const prevScope = setScope(el);
  try {
    return matchList(list, el);
  } finally {
    setScope(prevScope);
    if (q.hasMemos) resetMemos(q.info);
  }
}

/** https://dom.spec.whatwg.org/#dom-element-closest */
export function closest(el: NodeImpl, selectors: string): NodeImpl | null {
  const q = getQuery(selectors, "closest", el);
  const list = q.list;
  if (list.items.length === 0) return null;
  const prevScope = setScope(el);
  try {
    for (let n: NodeImpl | null = el; n !== null && n.type === ELEMENT_NODE; n = n.parent) {
      if (matchList(list, n)) return n;
    }
    return null;
  } finally {
    setScope(prevScope);
    if (q.hasMemos) resetMemos(q.info);
  }
}

/** Whether `selectors` parses as a valid selector list (no exception). */
export function isValidSelector(selectors: string): boolean {
  let q = cache.get(selectors);
  if (q === undefined) {
    q = compileQuery(selectors);
    if (cache.size >= MAX_CACHE) cache.clear();
    cache.set(selectors, q);
  }
  return q !== null;
}
