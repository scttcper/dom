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
import { CSSStyleSheet, StyleSheetList } from "./cssom.ts";
import type { RuleIndex } from "./cascade.ts";
import { $constructed, $css, $doc, $impl, $ownerNode, $styleVersion } from "../keys.ts";

/** Style sheets of one tree (a document or a shadow root). */
export class RootStyles {
  root: NodeImpl;
  /** Owner sheets (<style>, <link>) in tree order. */
  owners: CSSStyleSheet[];
  ownerNodes: NodeImpl[];
  /** The adoptedStyleSheets array handed out to script (may be mutated in place). */
  adopted: CSSStyleSheet[];
  /** Copy of `adopted` at the last validation (detects push/splice). */
  adoptedSnapshot: CSSStyleSheet[];
  list: StyleSheetList | null;
  /** Rule index cache (built by cascade.ts). */
  index: RuleIndex | null;

  constructor(root: NodeImpl) {
    this.root = root;
    this.owners = [];
    this.ownerNodes = [];
    this.adopted = [];
    this.adoptedSnapshot = [];
    this.list = null;
    this.index = null;
  }

  hasSheets(): boolean {
    return this.owners.length !== 0 || this.adopted.length !== 0;
  }
}

/** Document-wide CSS state, hung on `Document._css`. */
export class DocCSS {
  doc: Document;
  main: RootStyles;
  /** Shadow roots that have (or had) sheets. */
  shadows: Map<NodeImpl, RootStyles> | null;
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
}

export function docCSS(doc: Document): DocCSS {
  let c = doc[$css] as DocCSS | null;
  if (c === null) doc[$css] = c = new DocCSS(doc);
  return c;
}

export function existingDocCSS(doc: Document): DocCSS | null {
  return doc[$css] as DocCSS | null;
}

/** RootStyles for a tree root (document or shadow root impl), created on demand. */
export function rootStylesFor(root: NodeImpl, create: boolean): RootStyles | null {
  const doc = root.doc;
  const css = create ? docCSS(doc) : existingDocCSS(doc);
  if (css === null) return null;
  if (root.type === DOCUMENT_NODE) return css.main;
  let s = css.shadows?.get(root) ?? null;
  if (s === null && create) {
    s = new RootStyles(root);
    (css.shadows ??= new Map()).set(root, s);
  }
  return s;
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

// --- tree order ------------------------------------------------------------------------------

function ancestors(n: NodeImpl): NodeImpl[] {
  const out: NodeImpl[] = [];
  for (let p: NodeImpl | null = n; p !== null; p = p.parent) out.push(p);
  return out;
}

/** Negative if a precedes b in tree order. */
export function compareTreeOrder(a: NodeImpl, b: NodeImpl): number {
  if (a === b) return 0;
  const pa = ancestors(a);
  const pb = ancestors(b);
  let i = pa.length - 1;
  let j = pb.length - 1;
  while (i >= 0 && j >= 0 && pa[i] === pb[j]) {
    i--;
    j--;
  }
  if (i < 0) return -1; // a is an ancestor of b
  if (j < 0) return 1;
  const ca = pa[i];
  const cb = pb[j];
  for (let s = ca.next; s !== null; s = s.next) if (s === cb) return -1;
  return 1;
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
  syncList(rs);
  owner.doc[$styleVersion]++;
}

/** Removes an owner sheet (element disconnected, emptied or retyped). */
export function unregisterOwnerSheet(owner: NodeImpl, sheet: CSSStyleSheet): void {
  const css = existingDocCSS(owner.doc);
  if (css !== null) {
    const roots: RootStyles[] = [css.main];
    if (css.shadows !== null) for (const r of css.shadows.values()) roots.push(r);
    for (const rs of roots) {
      const i = rs.owners.indexOf(sheet);
      if (i !== -1) {
        rs.owners.splice(i, 1);
        rs.ownerNodes.splice(i, 1);
        syncList(rs);
        break;
      }
    }
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

/** https://drafts.csswg.org/cssom/#dom-documentorshadowroot-adoptedstylesheets (getter) */
export function adoptedStyleSheetsOf(root: NodeImpl): CSSStyleSheet[] {
  return rootStylesFor(root, true)!.adopted;
}

/** Setter: every entry must be a constructed sheet of the same document. */
export function setAdoptedStyleSheets(root: NodeImpl, value: unknown): void {
  if (value === null || typeof value !== "object" || typeof (value as { length?: unknown }).length !== "number") {
    throw new TypeError("Failed to set the 'adoptedStyleSheets' property: The provided value cannot be converted to a sequence.");
  }
  const list = Array.from(value as ArrayLike<unknown>);
  for (const s of list) {
    if (!(s instanceof CSSStyleSheet)) {
      throw new TypeError("Failed to set the 'adoptedStyleSheets' property: Failed to convert value to 'CSSStyleSheet'.");
    }
    if (!s[$constructed]) {
      throw new DOMException("Failed to set the 'adoptedStyleSheets' property: Can't adopt non-constructed stylesheets.", "NotAllowedError");
    }
    if (s[$doc] !== null && s[$doc] !== root.doc) {
      throw new DOMException("Failed to set the 'adoptedStyleSheets' property: Sharing constructed stylesheets in multiple documents is not allowed", "NotAllowedError");
    }
  }
  const rs = rootStylesFor(root, true)!;
  rs.adopted = list as CSSStyleSheet[];
  for (const s of rs.adopted) if (s[$doc] === null) s[$doc] = root.doc;
  root.doc[$styleVersion]++;
}

/**
 * Detects in-place mutation of adoptedStyleSheets arrays (push/splice) since the last check
 * and bumps the style version if so. Cheap: compares a few references.
 */
export function validateAdopted(css: DocCSS): void {
  if (checkAdopted(css.main)) css.doc[$styleVersion]++;
  if (css.shadows !== null) for (const rs of css.shadows.values()) if (checkAdopted(rs)) css.doc[$styleVersion]++;
}

function checkAdopted(rs: RootStyles): boolean {
  const a = rs.adopted;
  const snap = rs.adoptedSnapshot;
  let changed = a.length !== snap.length;
  if (!changed) for (let i = 0; i < a.length; i++) if (a[i] !== snap[i]) changed = true;
  if (changed) {
    rs.adoptedSnapshot = a.slice();
    for (const s of a) if (s instanceof CSSStyleSheet && s[$doc] === null) s[$doc] = rs.root.doc;
  }
  return changed;
}
