// The cascade and computed values.
// https://drafts.csswg.org/css-cascade-5/#cascading
// https://drafts.csswg.org/css-cascade-5/#inheriting
// https://drafts.csswg.org/css-cascade-5/#defaulting-keywords
// https://drafts.csswg.org/css-variables-2/#substitute-a-var
// https://drafts.csswg.org/cssom/#resolved-values
//
// Per tree root, author rules are indexed by the subject compound's id / class / tag (the
// selectors engine's `keyKind`/`key`), so an element only tests rules that can match it.
// Per element, a StyleRecord (cascaded declarations + memoized computed values) is cached in
// NodeCache and stamped with `Document._version` / `Document._styleVersion`.
//
// With no author sheets, the hot visibility questions (display:none, visibility, pointer-events)
// reduce to inline-style and UA-default checks without any rule matching.

import type { Document } from "../nodes/Document.ts";
import type { Element } from "../nodes/Element.ts";
import type { NodeImpl } from "../nodes/NodeImpl.ts";
import { nodeCache, type NodeCache } from "../nodes/cache.ts";
import { DOCUMENT_NODE, ELEMENT_NODE, F_HAS_STYLE_ATTR, F_SHADOW_ROOT, HTML_NS } from "../nodes/constants.ts";
import { T } from "../nodes/tags.ts";
import { attr, classTokens, asciiLowercase } from "../nodes/attributes.ts";
import { nextElementInTree } from "../nodes/traverse.ts";
import { KEY_CLASS, KEY_ID, KEY_TAG, matchesSelector, type CompiledSelector } from "../selectors/internal.ts";
import { predicates } from "../selectors/state.ts";
import {
  CSSGroupingRule,
  CSSLayerBlockRule,
  CSSLayerStatementRule,
  CSSMediaRule,
  CSSNestedDeclarations,
  CSSStyleRule,
  CSSStyleSheet,
  CSSSupportsRule,
  type CSSRule,
} from "./cssom.ts";
import { DeclBlock, parseDeclBlock } from "./declarations.ts";
import { evaluateMediaQueryList, type MediaEnvironment, DEFAULT_MEDIA_ENV } from "./media.ts";
import { mediaEnvironment } from "../window/media.ts";
import { isCustomPropertyName, propertyInfo } from "./properties.ts";
import { expandShorthand, isExpandedShorthand, longhandsOf, serializeShorthand, MULTI_LAYER } from "./shorthands.ts";
import { computeColor } from "./colors.ts";
import { containsVar, formatNumber, grammarFor, G_COLOR, isCSSWideKeyword, splitComponents, TK_DIMENSION, TK_IDENT, TK_PERCENTAGE, TK_STRING, TK_FUNCTION, TK_DELIM, COMP_SPACE } from "./values.ts";
import { CSSTokenizer, TK_EOF, TK_FUNCTION as TOK_FUNCTION, TK_LPAREN, TK_RPAREN, TK_COMMA, TK_LBRACKET, TK_RBRACKET } from "./tokenizer.ts";
import { inlineStyleCount } from "./inline-count.ts";
import { DocCSS, docCSS, existingDocCSS, type RootStyles, rootStylesFor, validateAdopted } from "./stylesheets.ts";

// --- rule index --------------------------------------------------------------------------------

export class IndexedRule {
  sel: CompiledSelector;
  specificity: number;
  /** Position in cascade order (tree order of rules across sheets). */
  order: number;
  /** Layer rank: higher wins for normal declarations; unlayered rules have the highest rank. */
  layer: number;
  block: DeclBlock;
  layerNode: LayerNode;

  constructor(sel: CompiledSelector, order: number, block: DeclBlock, layerNode: LayerNode) {
    this.sel = sel;
    this.specificity = sel.specificity;
    this.order = order;
    this.layer = 0;
    this.block = block;
    this.layerNode = layerNode;
  }
}

/** Rules bucketed by subject key. */
export class RuleBuckets {
  ids: Map<string, IndexedRule[]>;
  classes: Map<string, IndexedRule[]>;
  tags: Map<string, IndexedRule[]>;
  universal: IndexedRule[];
  size: number;

  constructor() {
    this.ids = new Map();
    this.classes = new Map();
    this.tags = new Map();
    this.universal = [];
    this.size = 0;
  }

  add(r: IndexedRule): void {
    this.size++;
    const kind = r.sel.keyKind;
    const key = r.sel.key;
    let map: Map<string, IndexedRule[]> | null = null;
    if (kind === KEY_ID) map = this.ids;
    else if (kind === KEY_CLASS) map = this.classes;
    else if (kind === KEY_TAG) map = this.tags;
    if (map === null) {
      this.universal.push(r);
      return;
    }
    let list = map.get(key);
    if (list === undefined) map.set(key, (list = []));
    list.push(r);
  }
}

class LayerNode {
  name: string;
  children: Map<string, LayerNode>;
  rank: number;
  constructor(name: string) {
    this.name = name;
    this.children = new Map();
    this.rank = 0;
  }
}

export class RuleIndex {
  main: RuleBuckets;
  before: RuleBuckets;
  after: RuleBuckets;
  /** Any rule depends on state outside Document._version (:hover, :focus, :checked, ...). */
  volatile: boolean;
  styleVersion: number;
  constructor(styleVersion: number) {
    this.main = new RuleBuckets();
    this.before = new RuleBuckets();
    this.after = new RuleBuckets();
    this.volatile = false;
    this.styleVersion = styleVersion;
  }
}

class IndexBuilder {
  index: RuleIndex;
  env: MediaEnvironment;
  order: number;
  root: LayerNode;
  anon: number;
  all: IndexedRule[];

  constructor(index: RuleIndex, env: MediaEnvironment) {
    this.index = index;
    this.env = env;
    this.order = 0;
    this.root = new LayerNode("");
    this.anon = 0;
    this.all = [];
  }

  layer(parent: LayerNode, name: string): LayerNode {
    let node = parent;
    for (const part of name.split(".")) {
      let child = node.children.get(part);
      if (child === undefined) node.children.set(part, (child = new LayerNode(part)));
      node = child;
    }
    return node;
  }

  sheet(sheet: CSSStyleSheet): void {
    if (sheet._disabled) return;
    if (sheet._media._queries.length !== 0 && !evaluateMediaQueryList(sheet._media._queries, this.env)) return;
    this.rules(sheet._rules, this.root, null);
  }

  rules(rules: CSSRule[], layer: LayerNode, parentStyle: CSSStyleRule | null): void {
    for (let i = 0; i < rules.length; i++) {
      const r = rules[i];
      if (r instanceof CSSStyleRule) {
        this.style(r, r._block, layer);
        if (r._rules.length !== 0) this.rules(r._rules, layer, r);
      } else if (r instanceof CSSNestedDeclarations) {
        if (parentStyle !== null) this.style(parentStyle, r._block, layer);
      } else if (r instanceof CSSMediaRule) {
        if (evaluateMediaQueryList(r._media._queries, this.env)) this.rules(r._rules, layer, parentStyle);
      } else if (r instanceof CSSSupportsRule) {
        if (r._matches) this.rules(r._rules, layer, parentStyle);
      } else if (r instanceof CSSLayerBlockRule) {
        const name = r._name === "" ? "\0anon" + this.anon++ : r._name;
        this.rules(r._rules, this.layer(layer, name), parentStyle);
      } else if (r instanceof CSSLayerStatementRule) {
        for (const n of r._names) this.layer(layer, n);
      } else if (r instanceof CSSGroupingRule) {
        // @container, @scope, @starting-style: not applied (no layout / scoping proximity).
      }
    }
  }

  style(rule: CSSStyleRule, block: DeclBlock, layer: LayerNode): void {
    if (block.names.length === 0) return;
    const compiled = rule._compile();
    if (compiled === null) return;
    const order = this.order++;
    for (const sel of compiled.selectors) {
      const ir = new IndexedRule(sel, order, block, layer);
      if (sel.volatile) this.index.volatile = true;
      const pe = sel.pseudoElement;
      if (pe === "") this.index.main.add(ir);
      else if (pe === "before") this.index.before.add(ir);
      else if (pe === "after") this.index.after.add(ir);
      else continue;
      this.all.push(ir);
    }
  }

  /** Post-order ranks: sub-layers before their parent's own rules; unlayered (root) last. */
  finish(): void {
    let next = 0;
    const visit = (n: LayerNode): void => {
      for (const c of n.children.values()) visit(c);
      n.rank = next++;
    };
    visit(this.root);
    for (const r of this.all) r.layer = r.layerNode.rank;
  }
}

function windowEnv(doc: Document): MediaEnvironment {
  // Viewport + per-window feature overrides (createWindow({ mediaFeatures })), shared with matchMedia.
  const w = doc._window;
  return w === null ? DEFAULT_MEDIA_ENV : mediaEnvironment(w);
}

/**
 * Validates the document's style state (adopted-sheet mutations, viewport changes for media
 * rules) and returns the current `_styleVersion`.
 */
export function currentStyleVersion(doc: Document): number {
  const css = doc._css as DocCSS | null;
  if (css === null) return doc._styleVersion;
  validateAdopted(css);
  const w = doc._window as unknown as { innerWidth?: number; innerHeight?: number; devicePixelRatio?: number } | null;
  if (w !== null) {
    const width = w.innerWidth ?? 1024;
    const height = w.innerHeight ?? 768;
    const dpr = w.devicePixelRatio ?? 1;
    if (width !== css.envWidth || height !== css.envHeight || dpr !== css.envDpr) {
      if (css.envWidth !== -1) doc._styleVersion++;
      css.envWidth = width;
      css.envHeight = height;
      css.envDpr = dpr;
    }
  }
  return doc._styleVersion;
}

function sheetsHaveRules(rs: RootStyles): boolean {
  for (const s of rs.owners) if (s._rules.length !== 0) return true;
  for (const s of rs.adopted) if (s instanceof CSSStyleSheet && s._rules.length !== 0) return true;
  return false;
}

/** Rule index for a tree (null if it has no applicable sheets). */
export function ruleIndexFor(rs: RootStyles, doc: Document, styleVersion: number): RuleIndex | null {
  if (!rs.hasSheets()) return null;
  let idx = rs.index;
  if (idx !== null && idx.styleVersion === styleVersion) return idx.main.size + idx.before.size + idx.after.size === 0 ? null : idx;
  idx = new RuleIndex(styleVersion);
  const b = new IndexBuilder(idx, windowEnv(doc));
  for (const s of rs.owners) b.sheet(s);
  for (const s of rs.adopted) if (s instanceof CSSStyleSheet) b.sheet(s);
  b.finish();
  rs.index = idx;
  return idx.main.size + idx.before.size + idx.after.size === 0 ? null : idx;
}

// --- UA defaults -------------------------------------------------------------------------------

/**
 * UA `display` (https://html.spec.whatwg.org/#rendering), including the hidden-elements rules
 * (https://html.spec.whatwg.org/#hidden-elements). `[hidden]` and `dialog:not([open])` are
 * normal-importance UA rules (author styles override them); `input[type=hidden]` is
 * `!important` (see uaDisplayImportant).
 */
export function uaDisplay(el: NodeImpl): string {
  if (el.ns !== HTML_NS) return el.parent !== null && el.parent.type === DOCUMENT_NODE ? "block" : "inline";
  if (el.attrs !== null) {
    if (el.tag !== T.embed) {
      const hidden = attr(el, "hidden");
      if (hidden !== null && asciiLowercase(hidden) !== "until-found") return "none";
    }
    // [popover]:not(:popover-open):not(dialog[open]) { display: none } — https://html.spec.whatwg.org/#flow-content-3
    if (attr(el, "popover") !== null && !predicates["popover-open"](el) && !(el.tag === T.dialog && attr(el, "open") !== null)) return "none";
  }
  switch (el.tag) {
    case T.area: case T.base: case T.basefont: case T.datalist: case T.head: case T.link: case T.meta:
    case T.noembed: case T.noframes: case T.param: case T.rp: case T.script: case T.style: case T.template: case T.title:
      return "none";
    case T.dialog:
      return attr(el, "open") === null ? "none" : "block";
    case T.html: case T.body: case T.address: case T.blockquote: case T.center: case T.div: case T.figure:
    case T.figcaption: case T.footer: case T.form: case T.header: case T.hr: case T.legend: case T.listing:
    case T.main: case T.p: case T.plaintext: case T.pre: case T.search: case T.xmp: case T.details: case T.summary:
    case T.dir: case T.dd: case T.dl: case T.dt: case T.menu: case T.ol: case T.ul: case T.article: case T.aside:
    case T.h1: case T.h2: case T.h3: case T.h4: case T.h5: case T.h6: case T.hgroup: case T.nav: case T.section:
    case T.fieldset: case T.optgroup: case T.option: case T.frameset: case T.frame:
      return "block";
    case T.li:
      return "list-item";
    case T.table:
      return "table";
    case T.caption:
      return "table-caption";
    case T.colgroup:
      return "table-column-group";
    case T.col:
      return "table-column";
    case T.thead:
      return "table-header-group";
    case T.tbody:
      return "table-row-group";
    case T.tfoot:
      return "table-footer-group";
    case T.tr:
      return "table-row";
    case T.td: case T.th:
      return "table-cell";
    case T.input:
      return attr(el, "type") !== null && asciiLowercase(attr(el, "type")!) === "hidden" ? "none" : "inline-block";
    case T.button: case T.select: case T.textarea: case T.meter: case T.progress: case T.marquee:
      return "inline-block";
    case T.ruby:
      return "ruby";
    case T.rt:
      return "ruby-text";
    case T.slot:
      return "contents";
  }
  return "inline";
}

/** `input[type=hidden i] { display: none !important }` */
function uaDisplayImportant(el: NodeImpl): boolean {
  if (el.tag !== T.input || el.ns !== HTML_NS) return false;
  const t = attr(el, "type");
  return t !== null && asciiLowercase(t) === "hidden";
}

/**
 * UA style sheet subset for properties other than display
 * (https://html.spec.whatwg.org/#rendering — phrasing content, links, headings, tables).
 */
const UA_CSS = `
a[href], area[href] { color: rgb(0, 0, 238); text-decoration: underline; cursor: pointer; }
b, strong, th, h1, h2, h3, h4, h5, h6, optgroup { font-weight: bold; }
i, em, cite, var, dfn, address { font-style: italic; }
h1 { font-size: 2em; } h2 { font-size: 1.5em; } h3 { font-size: 1.17em; } h5 { font-size: 0.83em; } h6 { font-size: 0.67em; }
small { font-size: smaller; } big { font-size: larger; }
sub { vertical-align: sub; font-size: smaller; } sup { vertical-align: super; font-size: smaller; }
code, kbd, samp, tt, pre, listing, xmp, plaintext { font-family: monospace; }
pre, listing, xmp, plaintext { white-space: pre; }
textarea { white-space: pre-wrap; }
u, ins { text-decoration: underline; }
s, strike, del { text-decoration: line-through; }
mark { background-color: yellow; color: black; }
center, th, caption { text-align: center; }
table { box-sizing: border-box; border-spacing: 2px; border-collapse: separate; }
button, select, meter, progress { box-sizing: border-box; }
ol { list-style-type: decimal; } ul, menu, dir { list-style-type: disc; }
nobr { white-space: nowrap; }
colgroup[hidden], col[hidden], thead[hidden], tbody[hidden], tfoot[hidden], tr[hidden] { visibility: collapse; }
`;

let uaIndex: RuleIndex | null = null;

function uaRuleIndex(): RuleIndex {
  if (uaIndex !== null) return uaIndex;
  const sheet = new CSSStyleSheet();
  sheet._doc = null;
  sheet._setText(UA_CSS);
  sheet._doc = null;
  uaIndex = new RuleIndex(0);
  const b = new IndexBuilder(uaIndex, DEFAULT_MEDIA_ENV);
  b.sheet(sheet);
  b.finish();
  return uaIndex;
}

// --- style records -----------------------------------------------------------------------------

export const PSEUDO_NONE = 0;
export const PSEUDO_BEFORE = 1;
export const PSEUDO_AFTER = 2;

const PENDING = "\0";

/** Cascade result + memoized computed values for one element (or pseudo-element). */
export class StyleRecord {
  el: NodeImpl;
  pseudo: number;
  /** Winning cascaded value per property (author + inline + UA), null if none. */
  decls: Map<string, string> | null;
  /** UA cascaded values (for `revert`). */
  ua: Map<string, string> | null;
  /** Whether a UA !important display:none applies. */
  displayLocked: boolean;
  /** Memoized computed values. */
  computed: Map<string, string> | null;
  /** Computed custom properties (inherited), resolved lazily. */
  custom: Map<string, string> | null;
  customDone: boolean;
  /** Computed display/visibility/pointer-events (hot for aria), "" = not computed yet. */
  display: string;
  visibility: string;
  pointerEvents: string;
  /** Depends on volatile selector state: never reuse from cache. */
  volatile: boolean;
  before: StyleRecord | null;
  after: StyleRecord | null;
  /** Tree root styles this element belongs to (null when disconnected). */
  root: RootStyles | null;

  constructor(el: NodeImpl, pseudo: number) {
    this.el = el;
    this.pseudo = pseudo;
    this.decls = null;
    this.ua = null;
    this.displayLocked = false;
    this.computed = null;
    this.custom = null;
    this.customDone = false;
    this.display = "";
    this.visibility = "";
    this.pointerEvents = "";
    this.volatile = false;
    this.before = null;
    this.after = null;
    this.root = null;
  }
}

const inlineCache = new Map<string, DeclBlock>();

/** Declarations of an element's style attribute (live CSSStyleDeclaration when one exists). */
function inlineBlock(el: NodeImpl): DeclBlock | null {
  if ((el.flags & F_HAS_STYLE_ATTR) === 0) return null;
  const style = (el.node as Element)._style;
  if (style !== null && style !== undefined) return style._block;
  const text = attr(el, "style");
  if (text === null || text === "") return null;
  let b = inlineCache.get(text);
  if (b === undefined) {
    b = parseDeclBlock(text);
    if (inlineCache.size > 2000) inlineCache.clear();
    inlineCache.set(text, b);
  }
  return b;
}

/** Parent element for inheritance: the parent element, or the host for shadow-root children. */
export function inheritanceParent(el: NodeImpl): NodeImpl | null {
  const p = el.parent;
  if (p === null) return null;
  if (p.type === ELEMENT_NODE) return p;
  if ((p.flags & F_SHADOW_ROOT) !== 0) {
    const host = (p.node as unknown as { _host?: Element | null })._host;
    return host ? host._impl : null;
  }
  return null;
}

/** Tree root styles of an element, and whether that tree is connected to a document. */
function rootOf(el: NodeImpl): RootStyles | null {
  let top = el;
  while (top.parent !== null) top = top.parent;
  if (top.type === DOCUMENT_NODE) return rootStylesFor(top, false);
  if ((top.flags & F_SHADOW_ROOT) !== 0) return rootStylesFor(top, false);
  return null;
}

/** Shadow root of a host element when that shadow tree has style sheets. */
function shadowStylesOf(el: NodeImpl): RootStyles | null {
  const sr = (el.node as unknown as { _shadowRoot?: { _impl: NodeImpl } | null })._shadowRoot;
  if (sr === null || sr === undefined) return null;
  return rootStylesFor(sr._impl, false);
}

function hostOf(rs: RootStyles): NodeImpl | null {
  if (rs.root.type === DOCUMENT_NODE) return null;
  const host = (rs.root.node as unknown as { _host?: Element | null })._host;
  return host ? host._impl : null;
}

class Matched {
  rule: IndexedRule;
  /** Context rank: shadow-host (:host) rules lose to outer-tree rules for normal declarations. */
  context: number;
  constructor(rule: IndexedRule, context: number) {
    this.rule = rule;
    this.context = context;
  }
}

function collect(buckets: RuleBuckets, el: NodeImpl, pseudo: string, host: NodeImpl | null, context: number, out: Matched[], rec: StyleRecord): void {
  if (buckets.size === 0) return;
  const opts = host === null ? undefined : { shadowHost: host };
  const test = (list: IndexedRule[] | undefined): void => {
    if (list === undefined) return;
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (r.sel.volatile) rec.volatile = true;
      if (matchesSelector(r.sel, el, pseudo, opts)) out.push(new Matched(r, context));
    }
  };
  if (el.id !== "" && buckets.ids.size !== 0) test(buckets.ids.get(el.id));
  if (buckets.classes.size !== 0 && el.attrs !== null) {
    const cls = classTokens(el);
    for (let i = 0; i < cls.length; i++) test(buckets.classes.get(cls[i]));
  }
  if (buckets.tags.size !== 0) test(buckets.tags.get(asciiLowercase(el.name)));
  test(buckets.universal);
}

function bucketsFor(idx: RuleIndex, pseudo: number): RuleBuckets {
  return pseudo === PSEUDO_NONE ? idx.main : pseudo === PSEUDO_BEFORE ? idx.before : idx.after;
}

function applyBlock(map: Map<string, string>, block: DeclBlock, important: boolean): void {
  const names = block.names;
  const values = block.values;
  const imp = block.important;
  for (let i = 0; i < names.length; i++) {
    if (imp[i] !== important) continue;
    const name = names[i];
    if (isExpandedShorthand(name)) {
      // Unexpanded shorthand (var() or multi-layer): record it under each longhand.
      const pending = PENDING + name + PENDING + values[i];
      for (const l of longhandsOf(name)!) map.set(l, pending);
      map.set(name, values[i]);
      continue;
    }
    map.set(name, values[i]);
  }
}

/** https://drafts.csswg.org/css-cascade-5/#cascade-sort over matched rules + inline style. */
function cascade(rec: StyleRecord, matched: Matched[], inline: DeclBlock | null, uaMatched: Matched[]): void {
  let map: Map<string, string> | null = null;
  if (uaMatched.length !== 0) {
    map = new Map();
    uaMatched.sort(normalOrder);
    for (const m of uaMatched) applyBlock(map, m.rule.block, false);
    rec.ua = new Map(map);
  }
  if (matched.length !== 0) {
    map ??= new Map();
    matched.sort(normalOrder);
    for (const m of matched) applyBlock(map, m.rule.block, false);
  }
  if (inline !== null && inline.names.length !== 0) {
    map ??= new Map();
    applyBlock(map, inline, false);
  }
  if (matched.length !== 0) {
    let anyImportant = false;
    for (const m of matched) if (m.rule.block.important.indexOf(true) !== -1) anyImportant = true;
    if (anyImportant) {
      const imp = matched.slice().sort(importantOrder);
      for (const m of imp) applyBlock(map!, m.rule.block, true);
    }
  }
  if (inline !== null && inline.important.indexOf(true) !== -1) applyBlock(map!, inline, true);
  rec.decls = map;
}

function normalOrder(a: Matched, b: Matched): number {
  return a.context - b.context || a.rule.layer - b.rule.layer || a.rule.specificity - b.rule.specificity || a.rule.order - b.rule.order;
}

/** Important declarations: inner context and earlier layers win (reversed). */
function importantOrder(a: Matched, b: Matched): number {
  return b.context - a.context || b.rule.layer - a.rule.layer || a.rule.specificity - b.rule.specificity || a.rule.order - b.rule.order;
}

function computeRecord(el: NodeImpl, pseudo: number, styleVersion: number): StyleRecord {
  const rec = new StyleRecord(el, pseudo);
  const doc = el.doc;
  const rs = rootOf(el);
  rec.root = rs;
  const matched: Matched[] = [];
  const pseudoName = pseudo === PSEUDO_NONE ? "" : pseudo === PSEUDO_BEFORE ? "before" : "after";
  if (rs !== null) {
    const idx = ruleIndexFor(rs, doc, styleVersion);
    if (idx !== null) collect(bucketsFor(idx, pseudo), el, pseudoName, hostOf(rs), 1, matched, rec);
  }
  if (pseudo === PSEUDO_NONE) {
    const srs = shadowStylesOf(el);
    if (srs !== null) {
      const idx = ruleIndexFor(srs, doc, styleVersion);
      if (idx !== null) collect(idx.main, el, "", el, 0, matched, rec);
    }
  }
  const uaMatched: Matched[] = [];
  if (pseudo === PSEUDO_NONE && el.ns === HTML_NS) collect(uaRuleIndex().main, el, "", null, 0, uaMatched, rec);
  cascade(rec, matched, pseudo === PSEUDO_NONE ? inlineBlock(el) : null, uaMatched);
  if (pseudo === PSEUDO_NONE) {
    rec.displayLocked = uaDisplayImportant(el);
    // Popover showing state changes without a DOM mutation: never reuse the cached display.
    if (el.attrs !== null && attr(el, "popover") !== null) rec.volatile = true;
  }
  return rec;
}

/** The (cached) style record of an element. */
export function styleRecord(el: NodeImpl): StyleRecord {
  const doc = el.doc;
  const sv = currentStyleVersion(doc);
  const c: NodeCache = nodeCache(el);
  const cached = c.style as StyleRecord | null;
  if (cached !== null && c.styleVersion === doc._version && c.styleSheetVersion === sv && !cached.volatile) return cached;
  const rec = computeRecord(el, PSEUDO_NONE, sv);
  c.style = rec;
  c.styleVersion = doc._version;
  c.styleSheetVersion = sv;
  return rec;
}

function pseudoRecord(el: NodeImpl, pseudo: number): StyleRecord {
  const owner = styleRecord(el);
  const existing = pseudo === PSEUDO_BEFORE ? owner.before : owner.after;
  if (existing !== null && !existing.volatile) return existing;
  const rec = computeRecord(el, pseudo, el.doc._styleVersion);
  if (pseudo === PSEUDO_BEFORE) owner.before = rec;
  else owner.after = rec;
  return rec;
}

export function recordFor(el: NodeImpl, pseudo: number): StyleRecord {
  return pseudo === PSEUDO_NONE ? styleRecord(el) : pseudoRecord(el, pseudo);
}

// --- computed values -----------------------------------------------------------------------------

function parentRecord(rec: StyleRecord): StyleRecord | null {
  if (rec.pseudo !== PSEUDO_NONE) return styleRecord(rec.el);
  const p = inheritanceParent(rec.el);
  return p === null ? null : styleRecord(p);
}

/** Computed custom properties: parent's, overlaid with own declarations (var() substituted). */
function customProps(rec: StyleRecord): Map<string, string> | null {
  if (rec.customDone) return rec.custom;
  rec.customDone = true;
  const parent = parentRecord(rec);
  const inherited = parent === null ? null : customProps(parent);
  const decls = rec.decls;
  let own: string[] | null = null;
  if (decls !== null) for (const k of decls.keys()) if (isCustomPropertyName(k)) (own ??= []).push(k);
  if (own === null) {
    rec.custom = inherited;
    return inherited;
  }
  const map = inherited === null ? new Map<string, string>() : new Map(inherited);
  rec.custom = map;
  // Resolve with cycle detection: https://drafts.csswg.org/css-variables-2/#cycles
  const state = new Map<string, number>(); // 1 = resolving, 2 = done
  const resolve = (name: string): string | null => {
    const s = state.get(name);
    if (s === 2) return map.get(name) ?? null;
    if (s === 1) return null;
    const raw = decls!.get(name);
    if (raw === undefined) return map.get(name) ?? null;
    state.set(name, 1);
    let value: string | null = raw;
    const lower = raw.toLowerCase();
    if (lower === "initial") value = null;
    else if (lower === "inherit" || lower === "unset" || lower === "revert" || lower === "revert-layer") value = inherited?.get(name) ?? null;
    else if (containsVar(raw)) value = substitute(raw, (n) => (decls!.has(n) ? resolve(n) : (map.get(n) ?? null)));
    state.set(name, 2);
    if (value === null) map.delete(name);
    else map.set(name, value);
    return value;
  };
  for (const k of own) resolve(k);
  return map;
}

/**
 * https://drafts.csswg.org/css-variables-2/#substitute-a-var — replaces var()/env() references.
 * Returns null when a reference is invalid (value becomes invalid at computed-value time).
 */
export function substitute(value: string, lookup: (name: string) => string | null): string | null {
  const t = new CSSTokenizer(value);
  let out = "";
  let last = 0;
  while (true) {
    const type = t.next();
    if (type === TK_EOF) break;
    if (type !== TOK_FUNCTION) continue;
    const fname = t.value.toLowerCase();
    if (fname !== "var" && fname !== "env") continue;
    const fnStart = t.start;
    const argStart = t.end;
    let depth = 1;
    let comma = -1;
    let argEnd = value.length;
    let end = value.length;
    while (depth > 0) {
      const inner = t.next();
      if (inner === TK_EOF) break;
      if (inner === TOK_FUNCTION || inner === TK_LPAREN || inner === TK_LBRACKET) depth++;
      else if (inner === TK_RPAREN || inner === TK_RBRACKET) {
        depth--;
        if (depth === 0) {
          argEnd = t.start;
          end = t.end;
        }
      } else if (inner === TK_COMMA && depth === 1 && comma === -1) comma = t.start;
    }
    const name = value.slice(argStart, comma === -1 ? argEnd : comma).trim();
    const fallback = comma === -1 ? null : value.slice(comma + 1, argEnd).trim();
    let rep: string | null = fname === "var" ? lookup(name) : envValue(name);
    if (rep === null && fallback !== null) rep = containsVar(fallback) ? substitute(fallback, lookup) : fallback;
    if (rep === null) return null;
    out += value.slice(last, fnStart) + rep;
    last = end;
  }
  return out + value.slice(last);
}

function envValue(name: string): string | null {
  if (name.startsWith("safe-area-inset-") || name.startsWith("keyboard-inset-")) return "0px";
  return null;
}

/** Font sizes for absolute keywords (https://drafts.csswg.org/css-fonts-4/#absolute-size-mapping). */
const FONT_KEYWORDS: Record<string, number> = {
  "xx-small": 9, "x-small": 10, small: 13, medium: 16, large: 18, "x-large": 24, "xx-large": 32, "xxx-large": 48,
};

function px(n: number): string {
  return formatNumber(Math.round(n * 10000) / 10000) + "px";
}

function parentPx(rec: StyleRecord, prop: string, fallback: number): number {
  const p = parentRecord(rec);
  if (p === null) return fallback;
  const v = computedValueOf(p, prop);
  const n = parseFloat(v);
  return Number.isNaN(n) ? fallback : n;
}

function rootFontSize(rec: StyleRecord): number {
  const doc = rec.el.doc;
  let root: NodeImpl | null = null;
  for (let c = doc._impl.first; c !== null; c = c.next) if (c.type === ELEMENT_NODE) root = c;
  if (root === null || root === rec.el) return 16;
  return parseFloat(computedValueOf(styleRecord(root), "font-size")) || 16;
}

/** Absolute length in px for a single dimension token, given font metrics (null if not absolute). */
function absLength(num: number, unit: string, em: number, rem: number): number | null {
  switch (unit) {
    case "px": return num;
    case "em": return num * em;
    case "rem": return num * rem;
    case "ex": return num * em * 0.5;
    case "ch": return num * em * 0.5;
    case "in": return num * 96;
    case "cm": return (num * 96) / 2.54;
    case "mm": return (num * 96) / 25.4;
    case "q": return (num * 96) / 101.6;
    case "pt": return (num * 96) / 72;
    case "pc": return num * 16;
  }
  return null;
}

function computeFontSize(rec: StyleRecord, v: string): string {
  const comps = splitComponents(v);
  if (comps === null || comps.length !== 1) return v;
  const c = comps[0];
  if (c.type === TK_IDENT) {
    const k = FONT_KEYWORDS[c.lower];
    if (k !== undefined) return px(k);
    if (c.lower === "smaller") return px(parentPx(rec, "font-size", 16) / 1.2);
    if (c.lower === "larger") return px(parentPx(rec, "font-size", 16) * 1.2);
    return v;
  }
  if (c.type === TK_PERCENTAGE) return px((parentPx(rec, "font-size", 16) * c.num) / 100);
  if (c.type === TK_DIMENSION) {
    const n = absLength(c.num, c.lower, parentPx(rec, "font-size", 16), c.lower === "rem" ? rootFontSize(rec) : 16);
    return n === null ? v : px(n);
  }
  return v;
}

function computeFontWeight(rec: StyleRecord, v: string): string {
  switch (v) {
    case "normal": return "400";
    case "bold": return "700";
    case "bolder": {
      const p = parentPx(rec, "font-weight", 400);
      return p < 350 ? "400" : p < 550 ? "700" : p < 900 ? "900" : formatNumber(p);
    }
    case "lighter": {
      const p = parentPx(rec, "font-weight", 400);
      return p < 100 ? formatNumber(p) : p < 550 ? "100" : p < 750 ? "400" : "700";
    }
  }
  return v;
}

let computedColorMode: "specified" | "rgb" = "specified";

/**
 * "specified" (default): computed colors keep the author's specified serialization.
 * "rgb": spec behavior, colors resolve to rgb()/rgba(). Bumps nothing: call before reading styles.
 */
export function setComputedColorMode(mode: "specified" | "rgb"): void {
  computedColorMode = mode;
}

const LINE_WIDTH: Record<string, string> = { thin: "1px", medium: "3px", thick: "5px" };

function borderStyleFor(prop: string): string | null {
  const m = /^(border-(?:top|right|bottom|left)|outline|column-rule)-width$/.exec(prop);
  return m === null ? null : m[1] + "-style";
}

/** Computed value from a specified value (https://drafts.csswg.org/css-cascade-5/#computed). */
function computeSpecified(rec: StyleRecord, prop: string, v: string): string {
  if (prop === "font-size") return computeFontSize(rec, v);
  if (prop === "font-weight") return computeFontWeight(rec, v);
  const styleProp = borderStyleFor(prop);
  if (styleProp !== null) {
    const style = computedValueOf(rec, styleProp);
    if (style === "none" || style === "hidden") return "0px";
    return LINE_WIDTH[v] ?? v;
  }
  if ((grammarFor(prop).types & G_COLOR) !== 0) {
    if (computedColorMode === "specified") {
      // Compat (docs/deviations.md): author colors keep their specified serialization like
      // jsdom <= 26 / happy-dom, so `toHaveStyle({ color: "red" })` keeps working. Only
      // `currentcolor` is resolved.
      if (v.toLowerCase() !== "currentcolor") return v;
      if (prop !== "color") return computedValueOf(rec, "color");
      const p = parentRecord(rec);
      return p === null ? "rgb(0, 0, 0)" : computedValueOf(p, "color");
    }
    if (prop === "color") {
      const lower = v.toLowerCase();
      if (lower === "currentcolor") {
        const p = parentRecord(rec);
        return p === null ? "rgb(0, 0, 0)" : computedValueOf(p, "color");
      }
      return computeColor(v, "rgb(0, 0, 0)");
    }
    return computeColor(v, v.toLowerCase().indexOf("currentcolor") !== -1 ? computedValueOf(rec, "color") : "");
  }
  return v;
}

function initialValue(rec: StyleRecord, prop: string): string {
  if (prop === "display") return "inline";
  if (prop === "content" && rec.pseudo !== PSEUDO_NONE) return "none";
  const info = propertyInfo(prop);
  if (info === undefined || info.initial === "") return "";
  return computeSpecified(rec, prop, info.initial);
}

function inheritedValue(rec: StyleRecord, prop: string): string {
  const p = parentRecord(rec);
  return p === null ? initialValue(rec, prop) : computedValueOf(p, prop);
}

/** Resolves a pending (unexpanded) shorthand value to one longhand's specified value. */
function resolvePending(rec: StyleRecord, prop: string, pending: string): string | null {
  const sep = pending.indexOf(PENDING, 1);
  const shorthand = pending.slice(1, sep);
  let raw: string | null = pending.slice(sep + 1);
  if (containsVar(raw)) raw = substitute(raw, (n) => customProps(rec)?.get(n) ?? null);
  if (raw === null) return null;
  const lower = raw.trim().toLowerCase();
  if (isCSSWideKeyword(lower)) return lower;
  const vals = expandShorthand(shorthand, raw);
  if (vals === null || vals === MULTI_LAYER) return null;
  const i = longhandsOf(shorthand)!.indexOf(prop);
  return i === -1 ? null : vals[i];
}

/** The computed value of `prop` for a record (memoized). */
export function computedValueOf(rec: StyleRecord, prop: string): string {
  if (isCustomPropertyName(prop)) return customProps(rec)?.get(prop) ?? "";
  let memo = rec.computed;
  if (memo !== null) {
    const m = memo.get(prop);
    if (m !== undefined) return m;
  }
  let result: string;
  if (isExpandedShorthand(prop)) {
    const longhands = longhandsOf(prop)!;
    const vals: string[] = [];
    for (const l of longhands) vals.push(computedValueOf(rec, l));
    result = vals.indexOf("") !== -1 ? "" : serializeShorthand(prop, vals, true);
  } else if (prop === "display") {
    result = computeDisplay(rec);
  } else {
    result = cascadedToComputed(rec, prop, rec.decls?.get(prop));
  }
  if (memo === null) rec.computed = memo = new Map();
  memo.set(prop, result);
  return result;
}

function cascadedToComputed(rec: StyleRecord, prop: string, v: string | undefined): string {
  const info = propertyInfo(prop);
  const inherited = info !== undefined && info.inherited;
  if (v !== undefined && v.charCodeAt(0) === 0) {
    const r = resolvePending(rec, prop, v);
    v = r === null ? "unset" : r;
  } else if (v !== undefined && containsVar(v)) {
    const r = substitute(v, (n) => customProps(rec)?.get(n) ?? null);
    v = r === null ? "unset" : r.trim();
  }
  if (v === undefined) return inherited ? inheritedValue(rec, prop) : initialValue(rec, prop);
  switch (v) {
    case "inherit":
      return inheritedValue(rec, prop);
    case "initial":
      return initialValue(rec, prop);
    case "unset":
      return inherited ? inheritedValue(rec, prop) : initialValue(rec, prop);
    case "revert":
    case "revert-layer": {
      const ua = rec.ua?.get(prop);
      if (ua !== undefined && ua !== "revert" && ua !== "revert-layer") return cascadedToComputed(rec, prop, ua);
      return inherited ? inheritedValue(rec, prop) : initialValue(rec, prop);
    }
  }
  return computeSpecified(rec, prop, v);
}

function computeDisplay(rec: StyleRecord): string {
  if (rec.display !== "") return rec.display;
  let d: string;
  if (rec.displayLocked) d = "none";
  else {
    let v = rec.decls?.get("display");
    if (v !== undefined && containsVar(v)) v = substitute(v, (n) => customProps(rec)?.get(n) ?? null) ?? "unset";
    const ua = rec.pseudo === PSEUDO_NONE ? uaDisplay(rec.el) : "inline";
    if (v === undefined || v === "revert" || v === "revert-layer") d = ua;
    else if (v === "inherit") d = inheritedValue(rec, "display");
    else if (v === "initial" || v === "unset") d = "inline";
    else d = v;
  }
  // Pseudo-elements of flex/grid containers are flex/grid items: blockify
  // (https://drafts.csswg.org/css-display-3/#blockify).
  if (rec.pseudo !== PSEUDO_NONE && d !== "none" && d !== "contents") {
    const owner = computeDisplay(styleRecord(rec.el));
    if (owner === "flex" || owner === "inline-flex" || owner === "grid" || owner === "inline-grid") d = blockify(d);
  }
  rec.display = d;
  return d;
}

function blockify(d: string): string {
  switch (d) {
    case "inline": case "inline-block": case "run-in": return "block";
    case "inline-flex": return "flex";
    case "inline-grid": return "grid";
    case "inline-table": return "table";
    case "inline-list-item": return "list-item";
  }
  return d.startsWith("inline ") ? d.slice(7) : d;
}

// --- fast API ------------------------------------------------------------------------------------

/**
 * True when any style sheet with rules applies anywhere in the document, or any element has an
 * inline style. O(1) for documents without inline styles (per-document counter maintained by
 * nodes/attributes.ts); otherwise answered by a walk cached per (`_version`, `_styleVersion`).
 * Not exact after adoptNode() of styled elements into another document (counted in the old one).
 */
export function hasAuthorStyles(doc: Document): boolean {
  const css = existingDocCSS(doc);
  if (css !== null) {
    const sv = currentStyleVersion(doc);
    if (css.authorVersion === doc._version && css.authorStyleVersion === sv) return css.authorResult;
    let result = sheetsHaveRules(css.main);
    if (!result && css.shadows !== null) for (const rs of css.shadows.values()) if (sheetsHaveRules(rs)) result = true;
    if (!result && inlineStyleCount(doc) > 0) result = hasConnectedInlineStyle(doc);
    css.authorVersion = doc._version;
    css.authorStyleVersion = sv;
    css.authorResult = result;
    return result;
  }
  if (inlineStyleCount(doc) === 0) return false;
  // Inline styles but no sheet state yet: create it so the answer is cached.
  return hasAuthorStyles(docCSSFor(doc));
}

function docCSSFor(doc: Document): Document {
  docCSS(doc);
  return doc;
}

function hasConnectedInlineStyle(doc: Document): boolean {
  const root = doc._impl;
  for (let n = nextElementInTree(root, root); n !== null; n = nextElementInTree(n, root)) {
    if ((n.flags & F_HAS_STYLE_ATTR) !== 0) return true;
  }
  return false;
}

/** Does any style sheet apply to this element's tree (or its shadow tree, for hosts)? */
function sheetsApply(el: NodeImpl): boolean {
  const css = el.doc._css as DocCSS | null;
  if (css === null) return false;
  if (css.main.hasSheets()) return true;
  return css.shadows !== null && css.shadows.size !== 0;
}

/** Fast path is valid: no sheets anywhere and no inline style on this element. */
function plain(el: NodeImpl): boolean {
  return (el.flags & F_HAS_STYLE_ATTR) === 0 && !sheetsApply(el);
}

/** Computed `display` of the element (own value, not ancestors). */
export function computedDisplay(el: NodeImpl): string {
  if (plain(el)) return uaDisplay(el);
  return computeDisplay(styleRecord(el));
}

/** https://drafts.csswg.org/css-display-3/#valdef-display-none — own computed display is none. */
export function isDisplayNone(el: NodeImpl): boolean {
  if (plain(el)) return uaDisplay(el) === "none";
  return computeDisplay(styleRecord(el)) === "none";
}

/** The element or an ancestor (flat-tree-ish: through shadow hosts) is display:none. */
export function isDisplayNoneInclusive(el: NodeImpl): boolean {
  for (let n: NodeImpl | null = el; n !== null; n = inheritanceParent(n)) if (isDisplayNone(n)) return true;
  return false;
}

function inheritedKeyword(el: NodeImpl, prop: string, field: "visibility" | "pointerEvents", fallback: string): string {
  if (plain(el)) {
    const p = inheritanceParent(el);
    return p === null ? fallback : inheritedKeyword(p, prop, field, fallback);
  }
  const rec = styleRecord(el);
  if (rec[field] !== "") return rec[field];
  const v = computedValueOf(rec, prop);
  rec[field] = v;
  return v;
}

/** Computed `visibility` (inherited): "visible" | "hidden" | "collapse". */
export function computedVisibility(el: NodeImpl): string {
  return inheritedKeyword(el, "visibility", "visibility", "visible");
}

export function isVisibilityHidden(el: NodeImpl): boolean {
  const v = computedVisibility(el);
  return v === "hidden" || v === "collapse";
}

/** Computed `pointer-events` (inherited). */
export function pointerEvents(el: NodeImpl): string {
  return inheritedKeyword(el, "pointer-events", "pointerEvents", "auto");
}

export function pointerEventsNone(el: NodeImpl): boolean {
  return pointerEvents(el) === "none";
}

function pseudoKind(pseudo: string | null | undefined): number {
  if (pseudo === undefined || pseudo === null || pseudo === "") return PSEUDO_NONE;
  const p = pseudo.toLowerCase();
  if (p === "::before" || p === ":before") return PSEUDO_BEFORE;
  if (p === "::after" || p === ":after") return PSEUDO_AFTER;
  return -1;
}

/** Computed value of `property` for an element (or its ::before/::after). "" for unknown pseudo-elements. */
export function computedValue(el: NodeImpl, property: string, pseudo?: string | null): string {
  const kind = pseudoKind(pseudo);
  if (kind === -1) return "";
  const prop = isCustomPropertyName(property) ? property : property.toLowerCase();
  if (kind === PSEUDO_NONE) {
    // Hot keywords (Testing Library's visibility checks) skip record allocation when possible.
    if (prop === "display") return computedDisplay(el);
    if (prop === "visibility") return computedVisibility(el);
    if (prop === "pointer-events") return pointerEvents(el);
  }
  return computedValueOf(recordFor(el, kind), prop);
}

/** Names of the computed custom properties of an element (for computed-style enumeration). */
export function customPropertyNames(el: NodeImpl, pseudo: string | null): string[] {
  const kind = pseudoKind(pseudo);
  if (kind === -1 || plain(el)) return EMPTY_NAMES;
  const map = customProps(recordFor(el, kind));
  return map === null ? EMPTY_NAMES : [...map.keys()].sort();
}

const EMPTY_NAMES: string[] = [];

/**
 * Text generated by `content` on ::before / ::after (strings and attr() concatenated), or ""
 * when the pseudo-element has no content. https://drafts.csswg.org/css-content-3/#content-property
 */
export function pseudoContent(el: NodeImpl, pseudo: "::before" | "::after"): string {
  const css = el.doc._css as DocCSS | null;
  if (css === null || !sheetsApply(el)) return "";
  const kind = pseudoKind(pseudo);
  if (kind <= 0) return "";
  const rs = rootOf(el);
  if (rs === null) return "";
  const idx = ruleIndexFor(rs, el.doc, currentStyleVersion(el.doc));
  if (idx === null || bucketsFor(idx, kind).size === 0) return "";
  const v = computedValueOf(recordFor(el, kind), "content");
  return contentText(el, v);
}

/** Extracts the text of a computed `content` value. */
export function contentText(el: NodeImpl, v: string): string {
  if (v === "" || v === "none" || v === "normal") return "";
  const comps = splitComponents(v);
  if (comps === null) return "";
  let out = "";
  for (const c of comps) {
    if (c.type === COMP_SPACE) continue;
    if (c.type === TK_DELIM && c.value === "/") break; // alt text follows "/"
    if (c.type === TK_STRING) out += c.value;
    else if (c.type === TK_FUNCTION && c.lower === "attr") {
      const name = c.text.slice(5, -1).trim().split(/\s|,/)[0];
      out += attr(el, name.toLowerCase()) ?? "";
    }
  }
  return out;
}

/** Number of elements with a cached style record is not tracked; exposed for tests of the fast path. */
export function _hasStyleRecord(el: NodeImpl): boolean {
  return el.cache !== null && (el.cache as NodeCache).style !== null;
}

