// Selector compiler + matcher over NodeImpl.
//
// https://drafts.csswg.org/selectors-4/#match-a-selector-against-an-element
// https://drafts.csswg.org/selectors-4/#specificity-rules
//
// The parser's AST is lowered in two steps:
// 1. `Test` records (one class for every kind of simple selector), grouped per compound, with
//    each complex selector's compounds stored RIGHT-TO-LEFT. These drive analysis: fast-path
//    shapes, rule-bucketing keys, :nth-* memos.
// 2. A closure tree built from them on first use (`complexFn`): one specialized closure per
//    simple selector, fused per compound, chained through combinators. Matching starts at the
//    subject (rightmost compound) and walks parents/siblings only when it matched, which
//    rejects most elements after one or two field compares.
//
// Measured against a `switch` interpreter over the same Test arrays (1000-element form, Node
// 26): closures matched 1.1-4x faster (e.g. `input` 1.8 vs 8.1 µs, `.row.r3 > input[type=text]`
// 11 vs 21 µs per 1000 elements) and compiled ~2x faster, so the interpreter (`matchTest`) is
// only kept for the rare featureless-shadow-host path.

import {
  DOCUMENT_NODE,
  ELEMENT_NODE,
  F_HTML,
  F_SHADOW_ROOT,
  TEXT_NODE,
  CDATA_SECTION_NODE,
} from "../nodes/constants.ts";
import type { NodeImpl } from "../nodes/NodeImpl.ts";
import type { Document } from "../nodes/Document.ts";
import { attr, classTokens, asciiLowercase } from "../nodes/attributes.ts";
import { tagId } from "../nodes/tags.ts";
import {
  type Complex,
  type Compound,
  type Simple,
  type SelectorList,
  S_TYPE,
  S_UNIVERSAL,
  S_ID,
  S_CLASS,
  S_ATTR,
  S_PSEUDO_CLASS,
  S_PSEUDO_ELEMENT,
  NS_UNSPECIFIED,
  NS_ANY,
  NS_NONE,
  NS_PREFIX,
  OP_EXISTS,
  OP_EQUALS,
  OP_INCLUDES,
  OP_DASH,
  OP_PREFIX,
  OP_SUFFIX,
  OP_SUBSTRING,
  CASE_INSENSITIVE,
  CASE_SENSITIVE,
  C_NONE,
  C_DESCENDANT,
  C_CHILD,
  C_NEXT_SIBLING,
  C_SUBSEQUENT_SIBLING,
  P_IS,
  P_WHERE,
  P_NOT,
  P_HAS,
  P_NTH_CHILD,
  P_NTH_LAST_CHILD,
  P_NTH_OF_TYPE,
  P_NTH_LAST_OF_TYPE,
  P_HOST_FN,
  P_HOST_CONTEXT,
  P_LANG,
  P_DIR,
  P_STATE,
  P_FIRST_CHILD,
  P_LAST_CHILD,
  P_ONLY_CHILD,
  P_FIRST_OF_TYPE,
  P_LAST_OF_TYPE,
  P_ONLY_OF_TYPE,
  P_EMPTY,
  P_ROOT,
  P_SCOPE,
  P_HOST,
  P_CURRENT,
  P_LINK,
  P_ANY_LINK,
  P_VISITED,
  P_DISABLED,
  P_ENABLED,
  P_REQUIRED,
  P_OPTIONAL,
  P_READ_ONLY,
  P_READ_WRITE,
  P_DEFAULT,
  P_OPEN,
  P_HEADING,
} from "./parser.ts";
import {
  predicates,
  type Predicate,
  matchesLang,
  directionality,
  customState,
  parentOrHost,
  shadowHost,
} from "./state.ts";
import { $impl, $mode, $shadowRoot, $version } from "../keys.ts";
import { classHash, idHash, tagHash } from "./filter.ts";

// --- test opcodes ------------------------------------------------------------------------

const O_NEVER = 0;
const O_UNIVERSAL_NS = 1;
const O_TYPE = 2;
const O_ID = 3;
const O_CLASS = 4;
const O_ATTR = 5;
const O_PREDICATE = 6;
const O_IS = 7;
const O_NOT = 8;
const O_HAS = 9;
const O_NTH_CHILD = 10;
const O_NTH_LAST_CHILD = 11;
const O_NTH_OF_TYPE = 12;
const O_NTH_LAST_OF_TYPE = 13;
const O_EMPTY = 14;
const O_ROOT = 15;
const O_SCOPE = 16;
const O_LANG = 17;
const O_DIR = 18;
const O_STATE = 19;
const O_HOST = 20;
const O_HOST_FN = 21;
const O_HOST_CONTEXT = 22;
const O_HEADING = 23;

/** Attribute value case handling. */
const VC_SENSITIVE = 0;
const VC_INSENSITIVE = 1;
/** Insensitive iff the element is an HTML element in an HTML document. */
const VC_HTML = 2;

/**
 * Attributes whose values match ASCII case-insensitively on HTML elements in HTML documents.
 * https://html.spec.whatwg.org/#case-sensitivity-of-selectors
 */
// oxfmt-ignore
const HTML_CASE_INSENSITIVE_ATTRS = new Set([
  "accept", "accept-charset", "align", "alink", "axis", "bgcolor", "charset", "checked", "clear",
  "codetype", "color", "compact", "declare", "defer", "dir", "direction", "disabled", "enctype",
  "face", "frame", "hreflang", "http-equiv", "lang", "language", "link", "media", "method",
  "multiple", "nohref", "noresize", "noshade", "nowrap", "readonly", "rel", "rev", "rules",
  "scope", "scrolling", "selected", "shape", "target", "text", "type", "valign", "valuetype",
  "vlink",
]);

/** Predicate-based pseudo-classes whose result depends only on attributes/tree (Document._version). */
const STABLE_PREDICATES = new Set([
  P_LINK,
  P_ANY_LINK,
  P_VISITED,
  P_DISABLED,
  P_ENABLED,
  P_REQUIRED,
  P_OPTIONAL,
  P_READ_ONLY,
  P_READ_WRITE,
  P_DEFAULT,
  P_OPEN,
]);

/** One compiled simple selector. Every field is initialized so all tests share one shape. */
export class Test {
  op: number;
  /** Exact name (type/attribute local name, id, class). */
  name: string;
  /** ASCII-lowercased name. */
  lower: string;
  /** For type tests: true when the namespace must equal `ns`. For attribute tests: true when any namespace is allowed. */
  nsCheck: boolean;
  ns: string | null;
  /** Attribute matcher (OP_*). */
  attrOp: number;
  value: string;
  valueLower: string;
  valueCase: number;
  a: number;
  b: number;
  list: CList | null;
  fn: Predicate | null;
  args: string[];
  // Single-slot index memo for :nth-* (valid within one top-level query; see resetMemos).
  memoEl: NodeImpl | null;
  memoIdx: number;
  memoVersion: number;
  memoParent: NodeImpl | null;
  memoCount: number;
  memoCountVersion: number;
  /** Depends on state outside Document._version (a non-STABLE predicate, :dir(), :state()): evaluations are logged (StateDeps). */
  volatileTest: boolean;

  constructor(op: number) {
    this.op = op;
    this.name = "";
    this.lower = "";
    this.nsCheck = false;
    this.ns = null;
    this.attrOp = OP_EXISTS;
    this.value = "";
    this.valueLower = "";
    this.valueCase = VC_SENSITIVE;
    this.a = 0;
    this.b = 0;
    this.list = null;
    this.fn = null;
    this.args = EMPTY_ARGS;
    this.memoEl = null;
    this.memoIdx = 0;
    this.memoVersion = -1;
    this.memoParent = null;
    this.memoCount = 0;
    this.memoCountVersion = -1;
    this.volatileTest = false;
  }
}

const EMPTY_ARGS: string[] = [];

/** A compiled complex (or relative) selector. Compounds are stored right-to-left. */
export class CComplex {
  /** comps[0] is the subject (rightmost) compound. */
  comps: Test[][];
  /** combs[k] joins comps[k] (right) and comps[k + 1] (left). */
  combs: number[];
  last: number;
  /** For relative selectors (:has): the relation of the leftmost compound to the anchor. */
  leading: number;
  /** Search domain for :has candidates (H_*). */
  hasDomain: number;
  /** Pseudo-element name of the subject ("" for none), e.g. "before". */
  pseudoElement: string;
  /** Packed specificity (see packSpecificity). */
  specificity: number;
  /** Source text. */
  text: string;
  /** Matcher closure (built on first call). */
  fn: Matcher;

  constructor() {
    this.comps = [];
    this.combs = [];
    this.last = 0;
    this.leading = C_NONE;
    this.hasDomain = 0;
    this.pseudoElement = "";
    this.specificity = 0;
    this.text = "";
    this.fn = (el) => {
      const fn = complexFn(this, 0);
      this.fn = fn;
      return fn(el);
    };
  }
}

export class CList {
  items: CComplex[];
  /** Matches if any item matches (built on first call). */
  fn: Matcher;
  constructor() {
    this.items = [];
    this.fn = (el) => {
      const fn = listFn(this);
      this.fn = fn;
      return fn(el);
    };
  }
}

export type Matcher = (el: NodeImpl) => boolean;

/** Results of a compilation besides the program itself. */
export class CompileInfo {
  /** Contains state pseudo-classes whose value is not covered by Document._version. */
  volatile: boolean;
  /** Contains :scope. */
  usesScope: boolean;
  /** :nth-* tests whose memos must be reset after each top-level query. */
  nthTests: Test[];
  /** Namespace resolution: prefix → URI (undefined = undeclared). */
  resolve: ((prefix: string) => string | null | undefined) | null;
  /** Default namespace (undefined = none declared: type selectors match any namespace). */
  defaultNs: string | null | undefined;
  /** First compile error ("" when none). */
  error: string;
  /**
   * A forgiving list (:is/:where) dropped an item: the selector only parses because of
   * forgiving parsing, so `@supports selector()` reports it unsupported
   * (https://drafts.csswg.org/css-conditional-4/#support-definition-ext).
   */
  forgivingDropped: boolean;

  constructor() {
    this.volatile = false;
    this.usesScope = false;
    this.nthTests = [];
    this.resolve = null;
    this.defaultNs = undefined;
    this.error = "";
    this.forgivingDropped = false;
  }
}

// --- :has() search domains ---------------------------------------------------------------
const H_DESCENDANTS = 1;
const H_CHILDREN = 2;
const H_NEXT_SIBLING = 3;
const H_SIBLINGS = 4;
const H_SIBLINGS_AND_DESCENDANTS = 5;

// --- specificity -------------------------------------------------------------------------

/** Pack (a, b, c) into one comparable number (each component saturates at 1023). */
export function packSpecificity(a: number, b: number, c: number): number {
  return Math.min(a, 1023) * 1048576 + Math.min(b, 1023) * 1024 + Math.min(c, 1023);
}

export function unpackSpecificity(s: number): [number, number, number] {
  return [Math.floor(s / 1048576), Math.floor(s / 1024) % 1024, s % 1024];
}

function listSpecificity(list: SelectorList | null): number {
  if (list === null) return 0;
  let max = 0;
  for (let i = 0; i < list.items.length; i++) {
    if (list.items[i].invalid) continue;
    const s = complexSpecificity(list.items[i]);
    if (s > max) max = s;
  }
  return max;
}

/** https://drafts.csswg.org/selectors-4/#specificity-rules */
export function complexSpecificity(cx: Complex): number {
  let total = 0;
  for (let i = 0; i < cx.compounds.length; i++) total += compoundSpecificity(cx.compounds[i]);
  return total;
}

const A1 = 1048576;
const B1 = 1024;

function compoundSpecificity(c: Compound): number {
  let s = 0;
  for (let i = 0; i < c.simples.length; i++) {
    const simple = c.simples[i];
    switch (simple.kind) {
      case S_ID:
        s += A1;
        break;
      case S_CLASS:
      case S_ATTR:
        s += B1;
        break;
      case S_TYPE:
        s += 1;
        break;
      case S_UNIVERSAL:
        break;
      case S_PSEUDO_ELEMENT:
        s += 1 + listSpecificity(simple.list);
        break;
      case S_PSEUDO_CLASS:
        switch (simple.pseudo) {
          case P_WHERE:
            break;
          case P_IS:
          case P_NOT:
          case P_HAS:
          case P_CURRENT:
            s += listSpecificity(simple.list);
            break;
          case P_NTH_CHILD:
          case P_NTH_LAST_CHILD:
          case P_HOST_FN:
          case P_HOST_CONTEXT:
            s += B1 + listSpecificity(simple.list);
            break;
          default:
            s += B1;
        }
        break;
    }
  }
  return s;
}

// --- compilation -------------------------------------------------------------------------

function fail(info: CompileInfo, msg: string): void {
  if (info.error === "") info.error = msg;
}

function resolvePrefix(info: CompileInfo, prefix: string): string | null | undefined {
  return info.resolve === null ? undefined : info.resolve(prefix);
}

export function compileList(list: SelectorList, info: CompileInfo): CList {
  const out = new CList();
  for (let i = 0; i < list.items.length; i++) {
    const cx = list.items[i];
    if (!cx.invalid) out.items.push(compileComplex(cx, info));
  }
  return out;
}

/** Forgiving lists also drop items that fail to compile (e.g. an undeclared namespace prefix). */
function compileForgivingList(list: SelectorList, info: CompileInfo): CList {
  const out = new CList();
  for (let i = 0; i < list.items.length; i++) {
    const cx = list.items[i];
    if (cx.invalid) {
      info.forgivingDropped = true;
      continue;
    }
    const saved = info.error;
    const compiled = compileComplex(cx, info);
    if (info.error !== saved) {
      info.error = saved;
      info.forgivingDropped = true;
    } else out.items.push(compiled);
  }
  return out;
}

export function compileComplex(cx: Complex, info: CompileInfo): CComplex {
  const out = new CComplex();
  const n = cx.compounds.length;
  for (let i = n - 1; i >= 0; i--) {
    const compound = cx.compounds[i];
    out.comps.push(compileCompound(compound, info, out, i === n - 1));
    if (i > 0) out.combs.push(cx.combinators[i - 1]);
  }
  out.last = n - 1;
  out.leading = cx.leading;
  out.specificity = complexSpecificity(cx);
  out.text = cx.text;
  if (cx.leading !== C_NONE) out.hasDomain = hasDomain(cx);
  return out;
}

function hasDomain(cx: Complex): number {
  let deep = false; // any child/descendant combinator after the leading one
  for (let i = 0; i < cx.combinators.length; i++) {
    const c = cx.combinators[i];
    if (c === C_CHILD || c === C_DESCENDANT) deep = true;
  }
  switch (cx.leading) {
    case C_CHILD:
      return deep ? H_DESCENDANTS : H_CHILDREN;
    case C_DESCENDANT:
      return H_DESCENDANTS;
    case C_NEXT_SIBLING:
      if (deep) return H_SIBLINGS_AND_DESCENDANTS;
      return cx.combinators.length === 0 ? H_NEXT_SIBLING : H_SIBLINGS;
    default:
      return deep ? H_SIBLINGS_AND_DESCENDANTS : H_SIBLINGS;
  }
}

function compileCompound(c: Compound, info: CompileInfo, owner: CComplex, isSubject: boolean): Test[] {
  const tests: Test[] = [];
  const end = c.pseudoElementIndex === -1 ? c.simples.length : c.pseudoElementIndex;
  for (let i = 0; i < c.simples.length; i++) {
    const s = c.simples[i];
    if (i >= end) {
      if (s.kind === S_PSEUDO_ELEMENT) {
        if (isSubject) owner.pseudoElement = owner.pseudoElement === "" ? s.name : owner.pseudoElement + "::" + s.name;
        continue;
      }
      // User-action pseudo-classes after a pseudo-element apply to the originating element here.
    }
    const t = compileSimple(s, info);
    if (t !== null) tests.push(t);
  }
  // https://drafts.csswg.org/css-namespaces-3/#css-qnames: with a default namespace, a compound
  // without a type selector has an implied `*` in that namespace — except a compound of only
  // :host-family pseudo-classes, which targets the featureless host
  // (https://drafts.csswg.org/selectors-4/#featureless).
  if (info.defaultNs !== undefined && needsImpliedNamespace(c, end)) {
    const t = new Test(O_UNIVERSAL_NS);
    t.nsCheck = true;
    t.ns = info.defaultNs;
    tests.push(t);
  }
  return tests;
}

function needsImpliedNamespace(c: Compound, end: number): boolean {
  let onlyHost = end > 0;
  for (let i = 0; i < end; i++) {
    const s = c.simples[i];
    if (s.kind === S_TYPE || s.kind === S_UNIVERSAL) return false;
    if (!(s.kind === S_PSEUDO_CLASS && (s.pseudo === P_HOST || s.pseudo === P_HOST_FN || s.pseudo === P_HOST_CONTEXT)))
      onlyHost = false;
  }
  return !onlyHost;
}

function compileSimple(s: Simple, info: CompileInfo): Test | null {
  switch (s.kind) {
    case S_UNIVERSAL:
    case S_TYPE: {
      let nsCheck = false;
      let ns: string | null = null;
      switch (s.nsKind) {
        case NS_UNSPECIFIED:
          if (info.defaultNs !== undefined) {
            nsCheck = true;
            ns = info.defaultNs;
          }
          break;
        case NS_ANY:
          break;
        case NS_NONE:
          nsCheck = true;
          ns = null;
          break;
        case NS_PREFIX: {
          const uri = resolvePrefix(info, s.nsPrefix);
          if (uri === undefined) {
            fail(info, "undeclared namespace prefix " + s.nsPrefix);
            return new Test(O_NEVER);
          }
          nsCheck = true;
          ns = uri;
          break;
        }
      }
      if (s.kind === S_UNIVERSAL) {
        if (!nsCheck) return null; // `*` alone matches every element
        const t = new Test(O_UNIVERSAL_NS);
        t.nsCheck = true;
        t.ns = ns;
        return t;
      }
      const t = new Test(O_TYPE);
      t.name = s.name;
      t.lower = asciiLowercase(s.name);
      t.a = tagId(t.lower);
      t.nsCheck = nsCheck;
      t.ns = ns;
      return t;
    }
    case S_ID: {
      const t = new Test(O_ID);
      t.name = s.name;
      t.lower = asciiLowercase(s.name);
      return t;
    }
    case S_CLASS: {
      const t = new Test(O_CLASS);
      t.name = s.name;
      t.lower = asciiLowercase(s.name);
      return t;
    }
    case S_ATTR:
      return compileAttribute(s, info);
    case S_PSEUDO_CLASS:
      return compilePseudoClass(s, info);
    case S_PSEUDO_ELEMENT:
      return null;
  }
  return null;
}

function compileAttribute(s: Simple, info: CompileInfo): Test {
  const t = new Test(O_ATTR);
  t.name = s.name;
  t.lower = asciiLowercase(s.name);
  // nsCheck=false: no-namespace attributes only; nsCheck=true with ns: that namespace; any: ns="*".
  switch (s.nsKind) {
    case NS_UNSPECIFIED:
    case NS_NONE:
      t.nsCheck = false;
      break;
    case NS_ANY:
      t.nsCheck = true;
      t.ns = "*";
      break;
    case NS_PREFIX: {
      const uri = resolvePrefix(info, s.nsPrefix);
      if (uri === undefined) {
        fail(info, "undeclared namespace prefix " + s.nsPrefix);
        return new Test(O_NEVER);
      }
      if (uri === null) t.nsCheck = false;
      else {
        t.nsCheck = true;
        t.ns = uri;
      }
      break;
    }
  }
  t.attrOp = s.op;
  t.value = s.value;
  t.valueLower = asciiLowercase(s.value);
  if (s.caseFlag === CASE_INSENSITIVE) t.valueCase = VC_INSENSITIVE;
  else if (s.caseFlag === CASE_SENSITIVE) t.valueCase = VC_SENSITIVE;
  else t.valueCase = HTML_CASE_INSENSITIVE_ATTRS.has(t.lower) ? VC_HTML : VC_SENSITIVE;
  // Matchers that can never match (https://drafts.csswg.org/selectors-4/#attribute-substrings).
  if ((s.op === OP_PREFIX || s.op === OP_SUFFIX || s.op === OP_SUBSTRING) && s.value === "") return new Test(O_NEVER);
  if (s.op === OP_INCLUDES && (s.value === "" || hasWhitespace(s.value))) return new Test(O_NEVER);
  return t;
}

function hasWhitespace(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0c || c === 0x0d) return true;
  }
  return false;
}

function compilePseudoClass(s: Simple, info: CompileInfo): Test | null {
  switch (s.pseudo) {
    case P_IS:
    case P_WHERE:
    case P_CURRENT: {
      const t = new Test(O_IS);
      t.list = compileForgivingList(s.list!, info);
      return t;
    }
    case P_NOT: {
      const t = new Test(O_NOT);
      t.list = compileList(s.list!, info);
      return t;
    }
    case P_HAS: {
      const t = new Test(O_HAS);
      t.list = compileList(s.list!, info);
      return t;
    }
    case P_NTH_CHILD:
    case P_NTH_LAST_CHILD:
    case P_NTH_OF_TYPE:
    case P_NTH_LAST_OF_TYPE:
      return nthTest(s.pseudo, s.a, s.b, s.list, info);
    case P_FIRST_CHILD:
      return nthTest(P_NTH_CHILD, 0, 1, null, info);
    case P_LAST_CHILD:
      return nthTest(P_NTH_LAST_CHILD, 0, 1, null, info);
    case P_FIRST_OF_TYPE:
      return nthTest(P_NTH_OF_TYPE, 0, 1, null, info);
    case P_LAST_OF_TYPE:
      return nthTest(P_NTH_LAST_OF_TYPE, 0, 1, null, info);
    case P_ONLY_CHILD: {
      // :first-child:last-child
      const t = new Test(O_IS);
      const cl = new CList();
      const cx = new CComplex();
      cx.comps.push([nthTest(P_NTH_CHILD, 0, 1, null, info), nthTest(P_NTH_LAST_CHILD, 0, 1, null, info)]);
      cl.items.push(cx);
      t.list = cl;
      return t;
    }
    case P_ONLY_OF_TYPE: {
      const t = new Test(O_IS);
      const cl = new CList();
      const cx = new CComplex();
      cx.comps.push([nthTest(P_NTH_OF_TYPE, 0, 1, null, info), nthTest(P_NTH_LAST_OF_TYPE, 0, 1, null, info)]);
      cl.items.push(cx);
      t.list = cl;
      return t;
    }
    case P_EMPTY:
      return new Test(O_EMPTY);
    case P_ROOT:
      return new Test(O_ROOT);
    case P_SCOPE:
      info.usesScope = true;
      return new Test(O_SCOPE);
    case P_HOST:
      return new Test(O_HOST);
    case P_HOST_FN:
    case P_HOST_CONTEXT: {
      const t = new Test(s.pseudo === P_HOST_FN ? O_HOST_FN : O_HOST_CONTEXT);
      t.list = compileList(s.list!, info);
      return t;
    }
    case P_LANG: {
      const t = new Test(O_LANG);
      t.args = s.args;
      return t;
    }
    case P_DIR: {
      info.volatile = true;
      const dir = s.args[0];
      if (dir !== "ltr" && dir !== "rtl") return new Test(O_NEVER);
      const t = new Test(O_DIR);
      t.volatileTest = true;
      t.a = dir === "rtl" ? 2 : 1;
      return t;
    }
    case P_HEADING: {
      // https://drafts.csswg.org/selectors-5/#headings — h1..h6 (heading level = digit).
      const t = new Test(O_HEADING);
      t.args = s.args;
      return t;
    }
    case P_STATE: {
      info.volatile = true;
      const t = new Test(O_STATE);
      t.volatileTest = true;
      t.name = s.args[0];
      return t;
    }
  }
  const fn = predicates[s.name];
  if (fn === undefined) {
    fail(info, "unsupported pseudo-class :" + s.name);
    return new Test(O_NEVER);
  }
  const t = new Test(O_PREDICATE);
  if (!STABLE_PREDICATES.has(s.pseudo)) {
    info.volatile = true;
    t.volatileTest = true;
  }
  t.fn = fn;
  t.name = s.name;
  return t;
}

function nthTest(p: number, a: number, b: number, list: SelectorList | null, info: CompileInfo): Test {
  const op =
    p === P_NTH_CHILD
      ? O_NTH_CHILD
      : p === P_NTH_LAST_CHILD
        ? O_NTH_LAST_CHILD
        : p === P_NTH_OF_TYPE
          ? O_NTH_OF_TYPE
          : O_NTH_LAST_OF_TYPE;
  const t = new Test(op);
  t.a = a;
  t.b = b;
  if (list !== null) t.list = compileList(list, info);
  info.nthTests.push(t);
  return t;
}

/** Drop per-query memos (they hold node references). */
export function resetMemos(info: CompileInfo): void {
  const tests = info.nthTests;
  for (let i = 0; i < tests.length; i++) {
    const t = tests[i];
    t.memoEl = null;
    t.memoParent = null;
    t.memoVersion = -1;
    t.memoCountVersion = -1;
  }
}

// --- volatile-state dependencies -------------------------------------------------------------
//
// A style rule with :hover, :focus, :checked, ... depends on state that Document._version does not
// cover. WebKit marks elements "affected by" such pseudo-classes during matching and invalidates
// them when that state changes (Style::Resolver / the childrenAffectedBy* flags,
// https://github.com/WebKit/WebKit/blob/main/Source/WebCore/style/StyleRelations.h). Without
// invalidation hooks into every piece of state, this records instead EVERY volatile test the
// matcher evaluated while matching one element's rules, with its element and result. Matching is
// deterministic given the DOM (stamped by Document._version) and those results, so while the
// version is unchanged and every logged test still returns the same result, the matched rules are
// the same: the cascade may reuse them (`stateDepsHold`).

/** Volatile tests evaluated while recording, with their elements and results. */
export class StateDeps {
  tests: Test[];
  els: NodeImpl[];
  results: boolean[];
  constructor() {
    this.tests = [];
    this.els = [];
    this.results = [];
  }
}

let depOn = false;
let depCur: StateDeps | null = null;

function logDep(t: Test, el: NodeImpl, r: boolean): void {
  const d = (depCur ??= new StateDeps());
  d.tests.push(t);
  d.els.push(el);
  d.results.push(r);
}

/** Start recording volatile tests; returns the enclosing recording to pass to `endStateDeps`. */
export function beginStateDeps(): StateDeps | boolean | null {
  const prev = depOn ? depCur : false;
  depOn = true;
  depCur = null;
  return prev;
}

/** Stop recording: the tests logged since `beginStateDeps` (null if none). Nested recordings also log into the enclosing one. */
export function endStateDeps(prev: StateDeps | boolean | null): StateDeps | null {
  const d = depCur;
  if (prev === false) {
    depOn = false;
    depCur = null;
  } else {
    depCur = prev as StateDeps | null;
    if (d !== null) for (let i = 0; i < d.tests.length; i++) logDep(d.tests[i], d.els[i], d.results[i]);
  }
  return d;
}

/** Whether every logged test still evaluates to its logged result. */
export function stateDepsHold(d: StateDeps): boolean {
  const savedOn = depOn;
  depOn = false;
  let ok = true;
  const tests = d.tests;
  for (let i = 0; i < tests.length; i++) {
    if (matchTest(tests[i], d.els[i]) !== d.results[i]) {
      ok = false;
      break;
    }
  }
  depOn = savedOn;
  return ok;
}

// --- matching context ----------------------------------------------------------------------

/** :scope element for the current top-level match (https://drafts.csswg.org/selectors-4/#scope-element). */
export let scopeEl: NodeImpl | null = null;
/** Anchor element of the :has() argument being evaluated. */
let hasAnchor: NodeImpl | null = null;
/** Shadow host matched as a featureless element (https://drafts.csswg.org/css-scoping-1/#featureless). */
let hostEl: NodeImpl | null = null;

export function setScope(el: NodeImpl | null): NodeImpl | null {
  const prev = scopeEl;
  scopeEl = el;
  return prev;
}

export function setHostContext(el: NodeImpl | null): NodeImpl | null {
  const prev = hostEl;
  hostEl = el;
  return prev;
}

// --- matching ------------------------------------------------------------------------------

export function matchList(list: CList, el: NodeImpl): boolean {
  return list.fn(el);
}

export function matchComplex(cx: CComplex, el: NodeImpl): boolean {
  return cx.fn(el);
}

// --- closure building ------------------------------------------------------------------------

const NEVER: Matcher = () => false;
const ALWAYS: Matcher = () => true;

function listFn(list: CList): Matcher {
  const items = list.items;
  if (items.length === 0) return NEVER;
  if (items.length === 1) {
    const cx = items[0];
    return (el) => cx.fn(el);
  }
  const byTag = tagDispatch(items);
  if (byTag !== null) return byTag;
  return (el) => {
    for (let i = 0; i < items.length; i++) if (items[i].fn(el)) return true;
    return false;
  };
}

/** Type test of a subject compound usable for tag dispatch: no namespace constraint, a known HTML tag. */
function subjectTagTest(cx: CComplex): Test | null {
  if (cx.leading !== C_NONE) return null;
  const tests = cx.comps[0];
  for (let i = 0; i < tests.length; i++) {
    const t = tests[i];
    if (t.op === O_TYPE) return !t.nsCheck && t.a !== 0 ? t : null;
  }
  return null;
}

/**
 * Selector lists dispatched on the element's tag id, after Blink's RuleSet buckets
 * (https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/core/css/rule_set.h,
 * "TagRules") and WebKit's SelectorQuery per-selector shortcuts
 * (https://github.com/WebKit/WebKit/blob/main/Source/WebCore/dom/SelectorQuery.cpp). Testing
 * Library's role queries are lists like `*[role~="heading"],h1,h2,h3,h4,h5,h6`: bare tag items
 * become one table lookup, and items whose subject has a type selector are only tried on
 * elements of that tag. For an HTML element in an HTML document (F_HTML), a type selector with a
 * known tag matches exactly when `el.tag` is that tag's id (Element.ts sets `tag = tagId(localName)`
 * for HTML-namespace elements); every other element falls back to trying each item.
 * https://drafts.csswg.org/selectors-4/#match-a-selector-against-an-element (a list matches if any item does).
 */
function tagDispatch(items: CComplex[]): Matcher | null {
  let maxTag = 0;
  let keyed = 0;
  for (let i = 0; i < items.length; i++) {
    const t = subjectTagTest(items[i]);
    if (t !== null) {
      keyed++;
      if (t.a > maxTag) maxTag = t.a;
    }
  }
  if (keyed === 0) return null;
  /** 1 = an item that is just this tag (`h1`): the element matches. */
  const bare = new Uint8Array(maxTag + 1);
  const buckets: (CComplex[] | undefined)[] = new Array(maxTag + 1).fill(undefined);
  const rest: CComplex[] = [];
  for (let i = 0; i < items.length; i++) {
    const cx = items[i];
    const t = subjectTagTest(cx);
    if (t === null) rest.push(cx);
    else if (cx.last === 0 && cx.comps[0].length === 1) bare[t.a] = 1;
    else (buckets[t.a] ??= []).push(cx);
  }
  return (el) => {
    if ((el.flags & F_HTML) === 0) {
      for (let i = 0; i < items.length; i++) if (items[i].fn(el)) return true;
      return false;
    }
    const tag = el.tag;
    if (tag !== 0 && tag <= maxTag) {
      if (bare[tag] === 1) return true;
      const b = buckets[tag];
      if (b !== undefined) for (let i = 0; i < b.length; i++) if (b[i].fn(el)) return true;
    }
    for (let i = 0; i < rest.length; i++) if (rest[i].fn(el)) return true;
    return false;
  };
}

function testFn(t: Test): Matcher {
  switch (t.op) {
    case O_TYPE: {
      const lower = t.lower;
      const name = t.name;
      if (!t.nsCheck) return (el) => ((el.flags & F_HTML) !== 0 ? el.name === lower : el.name === name);
      const ns = t.ns;
      return (el) => ((el.flags & F_HTML) !== 0 ? el.name === lower : el.name === name) && el.ns === ns;
    }
    case O_CLASS: {
      const name = t.name;
      return (el) => {
        const tokens = classTokens(el);
        for (let i = 0; i < tokens.length; i++) if (tokens[i] === name) return true;
        // Quirks-mode fallback without matchTest's second scan of the tokens.
        return tokens.length !== 0 && isQuirks(el.doc) && quirksClassMatch(tokens, t.lower);
      };
    }
    case O_ID: {
      const name = t.name;
      const lower = t.lower;
      return (el) => el.id === name || (el.id !== "" && isQuirks(el.doc) && asciiLowercase(el.id) === lower);
    }
    case O_ATTR: {
      if (t.nsCheck || t.valueCase !== VC_SENSITIVE || (t.attrOp !== OP_EXISTS && t.attrOp !== OP_EQUALS))
        return (el) => matchAttribute(t, el);
      const lower = t.lower;
      const name = t.name;
      if (t.attrOp === OP_EXISTS) {
        return (el) => {
          const attrs = el.attrs;
          if (attrs === null) return false;
          const n = (el.flags & F_HTML) !== 0 ? lower : name;
          for (let i = 0; i < attrs.length; i++) if (attrs[i].localName === n && attrs[i].ns === null) return true;
          return false;
        };
      }
      const value = t.value;
      return (el) => {
        const attrs = el.attrs;
        if (attrs === null) return false;
        const n = (el.flags & F_HTML) !== 0 ? lower : name;
        for (let i = 0; i < attrs.length; i++) {
          const a = attrs[i];
          if (a.localName === n && a.ns === null) return a.value === value;
        }
        return false;
      };
    }
    case O_UNIVERSAL_NS: {
      const ns = t.ns;
      return (el) => el.ns === ns;
    }
    case O_PREDICATE:
      // Volatile predicates go through matchTest, which logs them for StateDeps.
      return t.volatileTest ? (el) => matchTest(t, el) : t.fn!;
    case O_IS: {
      const list = t.list!;
      return (el) => list.fn(el);
    }
    case O_NOT: {
      const list = t.list!;
      return (el) => !list.fn(el);
    }
    case O_HAS: {
      const list = t.list!;
      return (el) => matchHas(list, el);
    }
    case O_NTH_CHILD:
    case O_NTH_LAST_CHILD:
    case O_NTH_OF_TYPE:
    case O_NTH_LAST_OF_TYPE:
      return (el) => matchNth(t, el);
    case O_SCOPE:
      return (el) => el === scopeEl;
    case O_NEVER:
      return NEVER;
  }
  return (el) => matchTest(t, el);
}

function compoundFn(tests: Test[]): Matcher {
  switch (tests.length) {
    case 0:
      return ALWAYS;
    case 1:
      return testFn(tests[0]);
    case 2: {
      const a = testFn(tests[0]);
      const b = testFn(tests[1]);
      return (el) => a(el) && b(el);
    }
    case 3: {
      const a = testFn(tests[0]);
      const b = testFn(tests[1]);
      const c = testFn(tests[2]);
      return (el) => a(el) && b(el) && c(el);
    }
  }
  const fns = tests.map(testFn);
  return (el) => {
    for (let i = 0; i < fns.length; i++) if (!fns[i](el)) return false;
    return true;
  };
}

/** Closure for compounds k..last of `cx` (right-to-left), matched at `el` = the element for compound k. */
function complexFn(cx: CComplex, k: number): Matcher {
  const comp = compoundFn(cx.comps[k]);
  if (k === cx.last) {
    if (cx.leading === C_NONE) return comp;
    const rel = cx.leading;
    return (el) => comp(el) && relatesToAnchor(rel, el);
  }
  const leftIdx = k + 1;
  const left = complexFn(cx, leftIdx);
  switch (cx.combs[k]) {
    case C_DESCENDANT:
      return (el) => {
        if (!comp(el)) return false;
        for (let p = el.parent; p !== null; p = p.parent) {
          if (p.type !== ELEMENT_NODE) return hostStep(cx, leftIdx, p);
          if (left(p)) return true;
        }
        return false;
      };
    case C_CHILD:
      return (el) => {
        if (!comp(el)) return false;
        const p = el.parent;
        if (p === null) return false;
        if (p.type !== ELEMENT_NODE) return hostStep(cx, leftIdx, p);
        return left(p);
      };
    case C_NEXT_SIBLING:
      return (el) => {
        if (!comp(el)) return false;
        let p = el.prev;
        while (p !== null && p.type !== ELEMENT_NODE) p = p.prev;
        return p !== null && left(p);
      };
    case C_SUBSEQUENT_SIBLING:
      return (el) => {
        if (!comp(el)) return false;
        for (let p = el.prev; p !== null; p = p.prev) if (p.type === ELEMENT_NODE && left(p)) return true;
        return false;
      };
  }
  return NEVER;
}

/** Crossing from a shadow tree's top level to its featureless host (`:host > div`). */
function hostStep(cx: CComplex, left: number, p: NodeImpl): boolean {
  if ((p.flags & F_SHADOW_ROOT) === 0 || left !== cx.last) return false;
  const host = shadowHost(p);
  if (host === null) return false;
  const saved = hostEl;
  hostEl = host;
  const r = matchCompound(cx.comps[left], host) && (cx.leading === C_NONE || relatesToAnchor(cx.leading, host));
  hostEl = saved;
  return r;
}

function relatesToAnchor(rel: number, el: NodeImpl): boolean {
  const anchor = hasAnchor;
  if (anchor === null) return false;
  switch (rel) {
    case C_CHILD:
      return el.parent === anchor;
    case C_DESCENDANT:
      for (let p = el.parent; p !== null; p = p.parent) if (p === anchor) return true;
      return false;
    case C_NEXT_SIBLING: {
      let p = el.prev;
      while (p !== null && p.type !== ELEMENT_NODE) p = p.prev;
      return p === anchor;
    }
    case C_SUBSEQUENT_SIBLING:
      for (let p = el.prev; p !== null; p = p.prev) if (p === anchor) return true;
      return false;
  }
  return false;
}

function matchCompound(tests: Test[], el: NodeImpl): boolean {
  if (hostEl !== null && el === hostEl) return matchFeatureless(tests, el);
  for (let i = 0; i < tests.length; i++) if (!matchTest(tests[i], el)) return false;
  return true;
}

/** A featureless host matches only :host / :host() / :host-context() (and logical combinations of them). */
function matchFeatureless(tests: Test[], el: NodeImpl): boolean {
  return featurelessCompound(tests, el) === 1;
}

/**
 * Matches the shadow host itself against a selector from its shadow tree's style sheets
 * (https://drafts.csswg.org/selectors-4/#featureless, https://drafts.csswg.org/css-scoping-1/#host-selector):
 * only a lone compound can reach it, and only through :host / :host() / :host-context().
 */
export function matchFeaturelessHost(cx: CComplex, el: NodeImpl): boolean {
  const saved = hostEl;
  hostEl = el;
  const r = featurelessComplex(cx, el) === 1;
  hostEl = saved;
  return r;
}

const F_DISALLOWED = -1;

/** 1 = matches, 0 = does not match, F_DISALLOWED = the selector may not match a featureless element at all. */
function featurelessComplex(cx: CComplex, el: NodeImpl): number {
  if (cx.last !== 0 || cx.leading !== C_NONE) return F_DISALLOWED;
  return featurelessCompound(cx.comps[0], el);
}

/** :is()/:where() over a featureless element: disallowed items are skipped; all disallowed → disallowed. */
function featurelessList(list: CList, el: NodeImpl): number {
  let r = F_DISALLOWED;
  for (let i = 0; i < list.items.length; i++) {
    const v = featurelessComplex(list.items[i], el);
    if (v === 1) return 1;
    if (v === 0) r = 0;
  }
  return r;
}

/**
 * A compound matches a featureless element only when it is anchored by a :host-family
 * pseudo-class (directly or through a logical combination) and contains nothing else a
 * featureless element cannot match (type/class/id/attribute/structural selectors, the
 * default-namespace test); :has() may accompany the anchor. Negating a disallowed
 * argument stays disallowed (`:not(div)` does not match the host).
 */
function featurelessCompound(tests: Test[], el: NodeImpl): number {
  let anchored = false;
  let r = 1;
  for (let i = 0; i < tests.length; i++) {
    const t = tests[i];
    switch (t.op) {
      case O_HOST:
      case O_HOST_FN:
      case O_HOST_CONTEXT:
        anchored = true;
        if (r === 1 && !matchTest(t, el)) r = 0;
        break;
      case O_HAS: {
        // :host:has(...) looks into the host's shadow tree (its descendants in that context).
        const sr = (el.node as unknown as { [$shadowRoot]?: { [$impl]: NodeImpl } | null })[$shadowRoot];
        if (r === 1 && !matchHas(t.list!, sr ? sr[$impl] : el)) r = 0;
        break;
      }
      case O_IS: {
        const v = featurelessList(t.list!, el);
        if (v === F_DISALLOWED) return F_DISALLOWED;
        anchored = true;
        if (v === 0) r = 0;
        break;
      }
      case O_NOT: {
        const v = featurelessList(t.list!, el);
        if (v === F_DISALLOWED) return F_DISALLOWED;
        anchored = true;
        if (v === 1) r = 0;
        break;
      }
      default:
        return F_DISALLOWED;
    }
  }
  return anchored ? r : F_DISALLOWED;
}

function isQuirks(doc: Document): boolean {
  return doc[$mode] === "quirks";
}

/** https://html.spec.whatwg.org/#case-sensitivity-of-selectors — class names in quirks mode match ASCII case-insensitively. */
function quirksClassMatch(tokens: string[], lower: string): boolean {
  for (let i = 0; i < tokens.length; i++) if (asciiLowercase(tokens[i]) === lower) return true;
  return false;
}

function matchTest(t: Test, el: NodeImpl): boolean {
  switch (t.op) {
    case O_TYPE:
      if ((el.flags & F_HTML) !== 0 ? el.name !== t.lower : el.name !== t.name) return false;
      return !t.nsCheck || el.ns === t.ns;
    case O_CLASS: {
      const tokens = classTokens(el);
      const name = t.name;
      for (let i = 0; i < tokens.length; i++) if (tokens[i] === name) return true;
      return tokens.length !== 0 && isQuirks(el.doc) && quirksClassMatch(tokens, t.lower);
    }
    case O_ID:
      if (el.id === t.name) return true;
      return el.id !== "" && isQuirks(el.doc) && asciiLowercase(el.id) === t.lower;
    case O_ATTR:
      return matchAttribute(t, el);
    case O_UNIVERSAL_NS:
      return el.ns === t.ns;
    case O_PREDICATE: {
      const r = t.fn!(el);
      if (depOn && t.volatileTest) logDep(t, el, r);
      return r;
    }
    case O_IS:
      return matchList(t.list!, el);
    case O_NOT:
      return !matchList(t.list!, el);
    case O_HAS:
      return matchHas(t.list!, el);
    case O_NTH_CHILD:
    case O_NTH_LAST_CHILD:
    case O_NTH_OF_TYPE:
    case O_NTH_LAST_OF_TYPE:
      return matchNth(t, el);
    case O_EMPTY:
      for (let c = el.first; c !== null; c = c.next) {
        if (c.type === ELEMENT_NODE) return false;
        if ((c.type === TEXT_NODE || c.type === CDATA_SECTION_NODE) && c.data.length !== 0) return false;
      }
      return true;
    case O_ROOT: {
      const p = el.parent;
      return p !== null && p.type === DOCUMENT_NODE;
    }
    case O_SCOPE:
      return el === scopeEl;
    case O_LANG:
      return matchesLang(el, t.args);
    case O_DIR: {
      const r = directionality(el) === t.a;
      if (depOn) logDep(t, el, r);
      return r;
    }
    case O_STATE: {
      const r = customState(el, t.name);
      if (depOn) logDep(t, el, r);
      return r;
    }
    case O_HOST:
      return hostEl !== null && el === hostEl;
    case O_HOST_FN: {
      if (hostEl === null || el !== hostEl) return false;
      const saved = hostEl;
      hostEl = null;
      const r = matchList(t.list!, el);
      hostEl = saved;
      return r;
    }
    case O_HOST_CONTEXT: {
      if (hostEl === null || el !== hostEl) return false;
      const saved = hostEl;
      hostEl = null;
      let r = false;
      for (let n: NodeImpl | null = el; n !== null && !r; n = parentOrHost(n)) {
        if (n.type === ELEMENT_NODE && matchList(t.list!, n)) r = true;
      }
      hostEl = saved;
      return r;
    }
    case O_HEADING: {
      const level = headingLevel(el);
      if (level === 0) return false;
      const args = t.args;
      if (args.length === 0) return true;
      for (let i = 0; i < args.length; i++) if (Number(args[i]) === level) return true;
      return false;
    }
    case O_NEVER:
      return false;
  }
  return false;
}

/** https://html.spec.whatwg.org/#heading-levels-and-offsets — min(9, digit + heading offset). */
function headingLevel(el: NodeImpl): number {
  if (el.tag === 0 || el.name.length !== 2 || el.name.charCodeAt(0) !== 0x68) return 0;
  const d = el.name.charCodeAt(1) - 0x30;
  if (d < 1 || d > 6) return 0;
  const level = d + headingOffset(el);
  return level > 9 ? 9 : level;
}

/**
 * https://html.spec.whatwg.org/#heading-offset — sum of `headingoffset` (non-negative
 * integers) over flat-tree inclusive ancestors, stopping after one with `headingreset`.
 */
function headingOffset(el: NodeImpl): number {
  let offset = 0;
  for (let n: NodeImpl | null = el; n !== null; n = parentOrHost(n)) {
    if (n.type !== ELEMENT_NODE || n.tag === 0 || n.attrs === null) continue;
    const v = attr(n, "headingoffset");
    if (v !== null) {
      const parsed = parseNonNegativeInteger(v);
      if (parsed > 0) offset += parsed;
    }
    if (attr(n, "headingreset") !== null) break;
  }
  return offset;
}

/** https://html.spec.whatwg.org/#rules-for-parsing-non-negative-integers (-1 on error). */
function parseNonNegativeInteger(s: string): number {
  let i = 0;
  while (i < s.length && isWs(s.charCodeAt(i))) i++;
  if (i < s.length && s.charCodeAt(i) === 0x2b) i++;
  let n = -1;
  for (; i < s.length; i++) {
    const c = s.charCodeAt(i) - 0x30;
    if (c < 0 || c > 9) break;
    n = (n === -1 ? 0 : n * 10) + c;
  }
  return n;
}

function matchAttribute(t: Test, el: NodeImpl): boolean {
  const attrs = el.attrs;
  if (attrs === null) return false;
  const html = (el.flags & F_HTML) !== 0;
  const name = html ? t.lower : t.name;
  for (let i = 0; i < attrs.length; i++) {
    const a = attrs[i];
    if (a.localName !== name) continue;
    if (t.nsCheck) {
      if (t.ns !== "*" && a.ns !== t.ns) continue;
    } else if (a.ns !== null) continue;
    if (t.attrOp === OP_EXISTS) return true;
    // https://html.spec.whatwg.org/#case-sensitivity-of-selectors: the HTML list only covers
    // attributes in no namespace (`[*|lang=a]` against xml:lang stays case-sensitive).
    const ci = t.valueCase === VC_INSENSITIVE || (t.valueCase === VC_HTML && html && a.ns === null);
    if (attrValueMatches(t, ci ? asciiLowercase(a.value) : a.value, ci ? t.valueLower : t.value)) return true;
    if (!t.nsCheck) return false; // at most one no-namespace attribute with this name
  }
  return false;
}

function attrValueMatches(t: Test, v: string, want: string): boolean {
  switch (t.attrOp) {
    case OP_EQUALS:
      return v === want;
    case OP_INCLUDES: {
      // https://drafts.csswg.org/selectors-4/#attribute-representation — whitespace-separated list
      const len = v.length;
      const wl = want.length;
      let i = 0;
      while (i < len) {
        while (i < len && isWs(v.charCodeAt(i))) i++;
        const start = i;
        while (i < len && !isWs(v.charCodeAt(i))) i++;
        if (i - start === wl && v.startsWith(want, start)) return true;
      }
      return false;
    }
    case OP_DASH:
      return v === want || (v.length > want.length && v.charCodeAt(want.length) === 0x2d && v.startsWith(want));
    case OP_PREFIX:
      return v.startsWith(want);
    case OP_SUFFIX:
      return v.endsWith(want);
    case OP_SUBSTRING:
      return v.includes(want);
  }
  return false;
}

function isWs(c: number): boolean {
  return c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0c || c === 0x0d;
}

function anb(a: number, b: number, idx: number): boolean {
  if (a === 0) return idx === b;
  const d = idx - b;
  return d / a >= 0 && d % a === 0;
}

function sameType(x: NodeImpl, el: NodeImpl): boolean {
  return x.name === el.name && x.ns === el.ns;
}

/** https://drafts.csswg.org/selectors-4/#child-index */
function matchNth(t: Test, el: NodeImpl): boolean {
  const list = t.list;
  if (list !== null && !matchList(list, el)) return false;
  const version = el.doc[$version];
  const ofType = t.op === O_NTH_OF_TYPE || t.op === O_NTH_LAST_OF_TYPE;
  const fromEnd = t.op === O_NTH_LAST_CHILD || t.op === O_NTH_LAST_OF_TYPE;
  // Forward index, with a memo keyed by the previous counted sibling (consecutive siblings in
  // tree-order scans cost O(1) each instead of O(index)).
  let idx = 1;
  let p = el.prev;
  while (p !== null) {
    if (p.type === ELEMENT_NODE && (ofType ? sameType(p, el) : list === null || matchList(list, p))) break;
    p = p.prev;
  }
  if (p !== null) {
    if (p === t.memoEl && t.memoVersion === version) {
      idx = t.memoIdx + 1;
    } else {
      idx = 2;
      for (let q = p.prev; q !== null; q = q.prev) {
        if (q.type === ELEMENT_NODE && (ofType ? sameType(q, el) : list === null || matchList(list, q))) idx++;
      }
    }
  }
  t.memoEl = el;
  t.memoIdx = idx;
  t.memoVersion = version;
  if (!fromEnd) return anb(t.a, t.b, idx);
  // From the end: total count of counted siblings (memoized per parent; only valid for :nth-last-child without `of`
  // and without type, since the memo is shared across element types).
  const parent = el.parent;
  let total: number;
  if (!ofType && list === null && parent !== null && parent === t.memoParent && t.memoCountVersion === version) {
    total = t.memoCount;
  } else {
    total = idx;
    for (let q = el.next; q !== null; q = q.next) {
      if (q.type === ELEMENT_NODE && (ofType ? sameType(q, el) : list === null || matchList(list, q))) total++;
    }
    if (!ofType && list === null) {
      t.memoParent = parent;
      t.memoCount = total;
      t.memoCountVersion = version;
    }
  }
  return anb(t.a, t.b, total - idx + 1);
}

/** https://drafts.csswg.org/selectors-4/#relational */
function matchHas(list: CList, anchor: NodeImpl): boolean {
  const saved = hasAnchor;
  hasAnchor = anchor;
  let r = false;
  const items = list.items;
  for (let i = 0; i < items.length && !r; i++) {
    const cx = items[i];
    switch (cx.hasDomain) {
      case H_CHILDREN:
        for (let c = anchor.first; c !== null; c = c.next) {
          if (c.type === ELEMENT_NODE && cx.fn(c)) {
            r = true;
            break;
          }
        }
        break;
      case H_DESCENDANTS:
        for (let c = anchor.first; c !== null;) {
          if (c.type === ELEMENT_NODE && cx.fn(c)) {
            r = true;
            break;
          }
          c = nextIn(c, anchor);
        }
        break;
      case H_NEXT_SIBLING: {
        let c = anchor.next;
        while (c !== null && c.type !== ELEMENT_NODE) c = c.next;
        r = c !== null && cx.fn(c);
        break;
      }
      case H_SIBLINGS:
        for (let c = anchor.next; c !== null; c = c.next) {
          if (c.type === ELEMENT_NODE && cx.fn(c)) {
            r = true;
            break;
          }
        }
        break;
      case H_SIBLINGS_AND_DESCENDANTS:
        for (let s = anchor.next; s !== null && !r; s = s.next) {
          if (s.type !== ELEMENT_NODE) continue;
          if (cx.fn(s)) {
            r = true;
            break;
          }
          for (let c = s.first; c !== null;) {
            if (c.type === ELEMENT_NODE && cx.fn(c)) {
              r = true;
              break;
            }
            c = nextIn(c, s);
          }
        }
        break;
    }
  }
  hasAnchor = saved;
  return r;
}

function nextIn(n: NodeImpl, root: NodeImpl): NodeImpl | null {
  const f = n.first;
  if (f !== null) return f;
  let cur: NodeImpl | null = n;
  while (cur !== null && cur !== root) {
    const nx: NodeImpl | null = cur.next;
    if (nx !== null) return nx;
    cur = cur.parent;
  }
  return null;
}

// --- analysis for fast paths and rule bucketing ------------------------------------------

/** Rightmost-compound key kinds for rule bucketing / candidate collection. */
export const KEY_NONE = 0;
export const KEY_ID = 1;
export const KEY_CLASS = 2;
export const KEY_TAG = 3;

/** The best bucketing key of the subject compound: id, then class, then tag (lowercased). */
export function subjectKey(cx: CComplex): { kind: number; value: string } {
  const tests = cx.comps[0];
  let cls = "";
  let tag = "";
  for (let i = 0; i < tests.length; i++) {
    const t = tests[i];
    if (t.op === O_ID) return { kind: KEY_ID, value: t.name };
    if (t.op === O_CLASS && cls === "") cls = t.name;
    else if (t.op === O_TYPE && tag === "") tag = t.lower;
  }
  if (cls !== "") return { kind: KEY_CLASS, value: cls };
  if (tag !== "") return { kind: KEY_TAG, value: tag };
  return { kind: KEY_NONE, value: "" };
}

/**
 * Ancestor hashes for the ancestor filter (filter.ts), as WebKit's
 * SelectorFilter::collectSelectorHashes
 * (https://github.com/WebKit/WebKit/blob/main/Source/WebCore/css/SelectorFilter.cpp): the ids,
 * classes and type names of compounds joined by a descendant or child combinator. Such a compound
 * always matches an element ancestor of the subject (the ancestor of the subject, of an ancestor,
 * or of a sibling of either), so the subject's ancestors must carry every one of these names.
 * Ids and classes come first (most selective); at most four, as in WebKit.
 */
export function ancestorHashes(cx: CComplex): number[] {
  const out: number[] = [];
  if (cx.leading !== C_NONE) return out;
  for (let pass = 0; pass < 3 && out.length < 4; pass++) {
    for (let k = 1; k <= cx.last && out.length < 4; k++) {
      const comb = cx.combs[k - 1];
      if (comb !== C_DESCENDANT && comb !== C_CHILD) continue;
      const tests = cx.comps[k];
      for (let i = 0; i < tests.length && out.length < 4; i++) {
        const t = tests[i];
        let h = -1;
        if (pass === 0 && t.op === O_ID) h = idHash(t.name);
        else if (pass === 1 && t.op === O_CLASS) h = classHash(t.name);
        else if (pass === 2 && t.op === O_TYPE) h = tagHash(t.lower);
        if (h !== -1 && out.indexOf(h) === -1) out.push(h);
      }
    }
  }
  return out;
}

/**
 * WebKit SelectorQuery's id-rooted traversal
 * (https://github.com/WebKit/WebKit/blob/main/Source/WebCore/dom/SelectorQuery.cpp,
 * "selectorForIdLookup" / filterRootById): for a single complex selector, the id of a compound
 * joined to the subject only by descendant / child combinators (`#app li`, `#form > div input`).
 * Every match is then a descendant of the element with that id. "" when there is none.
 */
export function idRootOf(list: CList): string {
  if (list.items.length !== 1) return "";
  const cx = list.items[0];
  if (cx.leading !== C_NONE) return "";
  for (let k = 1; k <= cx.last; k++) {
    const comb = cx.combs[k - 1];
    if (comb !== C_DESCENDANT && comb !== C_CHILD) return "";
    const tests = cx.comps[k];
    for (let i = 0; i < tests.length; i++) if (tests[i].op === O_ID) return tests[i].name;
  }
  return "";
}

/** Fast-path shapes for querySelector(All): a single complex with one compound of one test. */
export const FAST_NONE = 0;
export const FAST_ALL = 1; // `*`
export const FAST_ID = 2;
export const FAST_CLASS = 3;
export const FAST_TAG = 4;
export const FAST_ATTR = 5; // [a] / [a=v] with no namespace, case-sensitive value

export function fastShape(list: CList): number {
  if (list.items.length !== 1) return FAST_NONE;
  const cx = list.items[0];
  if (cx.last !== 0) return FAST_NONE;
  const tests = cx.comps[0];
  if (tests.length === 0) return FAST_ALL;
  if (tests.length !== 1) return FAST_NONE;
  const t = tests[0];
  switch (t.op) {
    case O_ID:
      return FAST_ID;
    case O_CLASS:
      return FAST_CLASS;
    case O_TYPE:
      return t.nsCheck ? FAST_NONE : FAST_TAG;
    case O_ATTR:
      if (t.nsCheck) return FAST_NONE;
      if (t.attrOp === OP_EXISTS || (t.attrOp === OP_EQUALS && t.valueCase === VC_SENSITIVE)) return FAST_ATTR;
      return FAST_NONE;
  }
  return FAST_NONE;
}

export function fastTest(list: CList): Test {
  return list.items[0].comps[0][0];
}
