// Per-document style sheet bookkeeping: which sheets apply to the document and to each shadow
// root (owner sheets from <style>/<link> in tree order, then adopted sheets), the live
// `document.styleSheets` list, `adoptedStyleSheets`, and the hooks src/html calls when
// <style>/<link> elements change.
// https://drafts.csswg.org/cssom/#css-style-sheet-collections
// https://drafts.csswg.org/cssom/#dom-documentorshadowroot-adoptedstylesheets
// https://html.spec.whatwg.org/#update-a-style-block

import type { Document } from "../nodes/Document.ts";
import type { Element } from "../nodes/Element.ts";
import type { NodeImpl } from "../nodes/NodeImpl.ts";
import { DOCUMENT_NODE, F_SHADOW_ROOT } from "../nodes/constants.ts";
import { compareTreeOrder } from "../nodes/traverse.ts";
import { CSSStyleSheet, StyleSheetList } from "./cssom.ts";
import { ShadowAttributeNames, type ShadowAttributeUses } from "./style-deps.ts";
import type { RuleIndex } from "./cascade.ts";
import { $constructed, $css, $doc, $impl, $ownerNode, $styleVersion, $templateContentsOwner } from "../keys.ts";

/** Style sheets of one tree (a document or a shadow root). */
export class RootStyles {
  root: NodeImpl;
  /** Owner sheets (<style>, <link>) in tree order. */
  owners: CSSStyleSheet[];
  ownerNodes: NodeImpl[];
  /** Adopted sheets in cascade order. The public array view observes writes to this array. */
  adopted: CSSStyleSheet[];
  /** The array view returned to script, allocated on the first read. */
  adoptedView: CSSStyleSheet[] | null;
  list: StyleSheetList | null;
  /** Listed in its document's DocCSS.shadows index. */
  indexed: boolean;
  /** The weak reference the document's RootRefs hold (created on first use). */
  ref: WeakRef<RootStyles> | null;
  /** Rule index cache (built by cascade.ts). */
  index: RuleIndex | null;

  constructor(root: NodeImpl) {
    this.root = root;
    this.owners = [];
    this.ownerNodes = [];
    this.adopted = [];
    this.adoptedView = null;
    this.list = null;
    this.indexed = false;
    this.ref = null;
    this.index = null;
  }

  discardIndex(): void {
    const names = this.index?.attributeNames;
    if (names instanceof ShadowAttributeNames) names.release();
    this.index = null;
  }

  hasSheets(): boolean {
    return this.owners.length !== 0 || this.adopted.length !== 0;
  }
}

/** Document-wide CSS state, hung on `Document._css`. */
/**
 * Weak references to shadow roots' RootStyles. Collected entries are pruned whenever the set
 * doubles since the last prune (amortized O(1) per add), so a document that sees thousands of
 * short-lived shadow roots keeps a small index. Walkers deref each entry and delete the collected.
 */
export class RootRefs {
  readonly refs: Set<WeakRef<RootStyles>>;
  pruneAt: number;

  constructor() {
    this.refs = new Set();
    this.pruneAt = 64;
  }

  add(rs: RootStyles): void {
    const refs = this.refs;
    refs.add((rs.ref ??= new WeakRef(rs)));
    if (refs.size < this.pruneAt) return;
    for (const ref of refs) if (ref.deref() === undefined) refs.delete(ref);
    this.pruneAt = Math.max(64, refs.size * 2);
  }

  delete(rs: RootStyles): void {
    if (rs.ref !== null) this.refs.delete(rs.ref);
  }
}

export class DocCSS {
  doc: Document;
  main: RootStyles;
  /**
   * Shadow roots with active sheets. Each root owns its RootStyles and can be collected
   * with its host. Empty roots leave this index when their last sheet is removed.
   */
  shadows: RootRefs | null;
  shadowAttributeUses: ShadowAttributeUses | null = null;
  /** Viewport the rule index was last validated against. */
  envWidth: number;
  envHeight: number;
  envDpr: number;
  /** Cache for hasAuthorStyles(): (version, styleVersion) → result. */
  authorVersion: number;
  authorStyleVersion: number;
  authorResult: boolean;

  constructor(doc: Document) {
    this.doc = doc;
    this.main = new RootStyles(doc[$impl]);
    this.shadows = null;
    this.envWidth = -1;
    this.envHeight = -1;
    this.envDpr = -1;
    this.authorVersion = -1;
    this.authorStyleVersion = -1;
    this.authorResult = false;
  }

  /** A shadow tree moved to a different node document. Its constructor-bound sheets stay behind. */
  adoptShadowRoot(root: NodeImpl): void {
    const rs = shadowStyles.get(root);
    if (rs === undefined || !rs.hasSheets()) return;
    rs.discardIndex();
    this.shadows?.delete(rs);
    rs.indexed = false;
    const doc = root.doc;
    // A template's inert contents and their host document share the adopted sheets on transfer.
    if (this.doc[$templateContentsOwner] !== doc && doc[$templateContentsOwner] !== this.doc) {
      if (!Reflect.set(rs.adopted, "length", 0)) {
        rs.adopted = [];
        rs.adoptedView = null;
      }
    }
    for (const sheet of rs.owners) sheet[$doc] = doc;
    syncShadowRegistration(rs);
    this.doc[$styleVersion]++;
    doc[$styleVersion]++;
  }
}

export function docCSS(doc: Document): DocCSS {
  let c = doc[$css] as DocCSS | null;
  if (c === null) doc[$css] = c = new DocCSS(doc);
  return c;
}

export function existingDocCSS(doc: Document): DocCSS | null {
  return doc[$css] as DocCSS | null;
}

/** Each shadow root's RootStyles, owned by the shadow root (collected with it). */
const shadowStyles = new WeakMap<NodeImpl, RootStyles>();

/** RootStyles for a tree root (document or shadow root impl), created on demand. */
export function rootStylesFor(root: NodeImpl, create: boolean): RootStyles | null {
  const doc = root.doc;
  const css = create ? docCSS(doc) : existingDocCSS(doc);
  if (css === null) return null;
  if (root.type === DOCUMENT_NODE) return css.main;
  let s = shadowStyles.get(root) ?? null;
  if (create && s === null) shadowStyles.set(root, (s = new RootStyles(root)));
  return s;
}

/** Only trees with sheets need to be visited for document-wide style checks. */
function syncShadowRegistration(rs: RootStyles): void {
  if (rs.root.type === DOCUMENT_NODE) return;
  const hasSheets = rs.hasSheets();
  if (rs.indexed === hasSheets) return;
  const css = docCSS(rs.root.doc);
  if (hasSheets) (css.shadows ??= new RootRefs()).add(rs);
  else css.shadows?.delete(rs);
  rs.indexed = hasSheets;
}

/** The tree each registered owner sheet belongs to (its owner may have moved since). */
const sheetRoots = new WeakMap<CSSStyleSheet, RootStyles>();

/** A rule index holds the CSS rules it matched. Release deleted rules before another style read. */
export function discardSheetRuleIndexes(sheet: CSSStyleSheet): void {
  if (!sheet[$constructed]) {
    const rs = sheetRoots.get(sheet);
    if (rs !== undefined) rs.discardIndex();
    return;
  }
  const doc = sheet[$doc];
  const css = doc === null ? null : existingDocCSS(doc);
  if (css === null) return;
  if (css.main.index !== null && css.main.adopted.includes(sheet)) css.main.discardIndex();
  if (css.shadows === null) return;
  for (const ref of css.shadows.refs) {
    const rs = ref.deref();
    if (rs === undefined) css.shadows.refs.delete(ref);
    else if (rs.index !== null && rs.adopted.includes(sheet)) rs.discardIndex();
  }
}

/** Top of the (shadow-scoped) tree containing `n`. */
export function treeTop(n: NodeImpl): NodeImpl {
  let p = n;
  while (p.parent !== null) p = p.parent;
  return p;
}

/** Is `top` a tree root whose sheets apply (a document, or a shadow root)? */
export function isStyleRoot(top: NodeImpl): boolean {
  return top.type === DOCUMENT_NODE || (top.flags & F_SHADOW_ROOT) !== 0;
}

function syncList(rs: RootStyles): void {
  rs.list?._set(rs.owners.slice());
}

// --- hooks for src/html ------------------------------------------------------------------------

/** Registers a new owner sheet (from a connected <style>/<link>) with its tree. */
export function registerOwnerSheet(owner: NodeImpl, sheet: CSSStyleSheet): void {
  const top = treeTop(owner);
  if (!isStyleRoot(top)) return;
  const rs = rootStylesFor(top, true)!;
  // Find the insertion point; appends at the end are the common case (emotion, styled-components).
  let i = rs.ownerNodes.length;
  while (i > 0 && compareTreeOrder(rs.ownerNodes[i - 1], owner) > 0) i--;
  rs.ownerNodes.splice(i, 0, owner);
  rs.owners.splice(i, 0, sheet);
  sheetRoots.set(sheet, rs);
  syncShadowRegistration(rs);
  syncList(rs);
  owner.doc[$styleVersion]++;
}

/** Removes an owner sheet (element disconnected, emptied or retyped). */
export function unregisterOwnerSheet(owner: NodeImpl, sheet: CSSStyleSheet): void {
  const css = existingDocCSS(owner.doc);
  const rs = sheetRoots.get(sheet);
  if (css !== null && rs !== undefined) {
    const i = rs.owners.indexOf(sheet);
    if (i !== -1) {
      rs.discardIndex();
      rs.owners.splice(i, 1);
      rs.ownerNodes.splice(i, 1);
      syncList(rs);
    }
    sheetRoots.delete(sheet);
    syncShadowRegistration(rs);
  }
  sheet[$ownerNode] = null;
  owner.doc[$styleVersion]++;
}

/** `styleSheetHooks.createSheet` — https://html.spec.whatwg.org/#update-a-style-block step 6 */
export function createOwnerSheet(owner: NodeImpl, text: string, media: string): CSSStyleSheet {
  const sheet = CSSStyleSheet._forOwner(owner.node as Element, text, media, null);
  registerOwnerSheet(owner, sheet);
  return sheet;
}

/** `styleSheetHooks.createLinkSheet` — an empty sheet (nothing is fetched). */
export function createLinkSheet(owner: NodeImpl, href: string, media: string): CSSStyleSheet {
  const sheet = CSSStyleSheet._forOwner(owner.node as Element, "", media, href);
  registerOwnerSheet(owner, sheet);
  return sheet;
}

/** `styleSheetHooks.removeSheet` */
export function removeOwnerSheet(owner: NodeImpl, sheet: object): void {
  if (sheet instanceof CSSStyleSheet) unregisterOwnerSheet(owner, sheet);
}

// --- public collections ------------------------------------------------------------------------

/** https://drafts.csswg.org/cssom/#dom-documentorshadowroot-stylesheets */
export function styleSheetsOf(root: NodeImpl): StyleSheetList {
  const rs = rootStylesFor(root, true)!;
  if (rs.list === null) {
    rs.list = new StyleSheetList();
    syncList(rs);
  }
  return rs.list;
}

/** A held array may outlive its root. Only writes to the currently adopted array affect styles. */
class AdoptedSheetChanges extends WeakRef<RootStyles> implements ProxyHandler<CSSStyleSheet[]> {
  defineProperty(sheets: CSSStyleSheet[], key: PropertyKey, descriptor: PropertyDescriptor): boolean {
    const oldLength = sheets.length;
    const ok = Reflect.defineProperty(sheets, key, descriptor);
    if (key === "length") {
      // A failed truncation can still remove entries above a non-configurable index.
      if (sheets.length !== oldLength) this.changed(sheets, sheets.length < oldLength);
    } else if (ok && isSheetIndex(key)) {
      this.changed(sheets, Number(key) < oldLength, descriptor.value);
    }
    return ok;
  }

  deleteProperty(sheets: CSSStyleSheet[], key: PropertyKey): boolean {
    const ok = Reflect.deleteProperty(sheets, key);
    if (ok && isSheetIndex(key)) this.changed(sheets, true);
    return ok;
  }

  private changed(sheets: CSSStyleSheet[], removed: boolean, added?: unknown): void {
    const rs = this.deref();
    if (rs === undefined || rs.adopted !== sheets) return;
    if (removed) rs.discardIndex();
    if (added instanceof CSSStyleSheet && added[$doc] === null) added[$doc] = rs.root.doc;
    syncShadowRegistration(rs);
    rs.root.doc[$styleVersion]++;
  }
}

function isSheetIndex(key: PropertyKey): boolean {
  if (typeof key !== "string") return false;
  const index = Number(key) >>> 0;
  return index !== 0xffffffff && String(index) === key;
}

/** https://drafts.csswg.org/cssom/#dom-documentorshadowroot-adoptedstylesheets (getter) */
export function adoptedStyleSheetsOf(root: NodeImpl): CSSStyleSheet[] {
  const rs = rootStylesFor(root, true)!;
  return (rs.adoptedView ??= new Proxy(rs.adopted, new AdoptedSheetChanges(rs)));
}

/** Setter: every entry must be a constructed sheet of the same document. */
export function setAdoptedStyleSheets(root: NodeImpl, value: unknown): void {
  if (value === null || typeof value !== "object" || typeof (value as { length?: unknown }).length !== "number") {
    throw new TypeError(
      "Failed to set the 'adoptedStyleSheets' property: The provided value cannot be converted to a sequence.",
    );
  }
  const list = Array.from(value as ArrayLike<unknown>);
  for (const s of list) {
    if (!(s instanceof CSSStyleSheet)) {
      throw new TypeError(
        "Failed to set the 'adoptedStyleSheets' property: Failed to convert value to 'CSSStyleSheet'.",
      );
    }
    if (!s[$constructed]) {
      throw new DOMException(
        "Failed to set the 'adoptedStyleSheets' property: Can't adopt non-constructed stylesheets.",
        "NotAllowedError",
      );
    }
    if (s[$doc] !== null && s[$doc] !== root.doc) {
      throw new DOMException(
        "Failed to set the 'adoptedStyleSheets' property: Sharing constructed stylesheets in multiple documents is not allowed",
        "NotAllowedError",
      );
    }
  }
  const rs = rootStylesFor(root, true)!;
  if (rs.index !== null && rs.adopted.length !== 0) rs.discardIndex();
  rs.adopted = list as CSSStyleSheet[];
  rs.adoptedView = null;
  for (const s of rs.adopted) if (s[$doc] === null) s[$doc] = root.doc;
  root.doc[$styleVersion]++;
  syncShadowRegistration(rs);
}
