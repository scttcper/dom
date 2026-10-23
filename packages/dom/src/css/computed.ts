// Read-only, live computed style declarations.
// https://drafts.csswg.org/cssom/#dom-window-getcomputedstyle
// https://drafts.csswg.org/cssom/#resolved-values

import type { Element } from "../nodes/Element.ts";
import type { NodeImpl } from "../nodes/NodeImpl.ts";
import { CSSStyleDeclaration } from "./CSSStyleDeclaration.ts";
import { computedValue, customPropertyNames } from "./cascade.ts";
import { computedPropertyNames, isCustomPropertyName } from "./properties.ts";
import { indexGetterTable, ensureIndexGetters, type IndexGetterTable } from "../collections/indexed.ts";

/**
 * Computed declarations enumerate every longhand (sorted, like browsers) and resolve values
 * lazily through the cascade's per-element cache, so reads stay live across mutations.
 */
export class CSSComputedStyleDeclaration extends CSSStyleDeclaration {
  _el: NodeImpl;
  _pseudo: string | null;

  constructor(el: NodeImpl, pseudo: string | null) {
    super(null, null, null);
    this._el = el;
    this._pseudo = pseudo;
    this._readonly = true;
    if (table === null) table = indexGetterTable(CSSComputedStyleDeclaration.prototype, (self, i) => (self as CSSComputedStyleDeclaration).item(i), 0);
    ensureIndexGetters(table, computedPropertyNames().length);
  }

  override get length(): number {
    if (this._pseudo === INVALID) return 0;
    const n = computedPropertyNames().length + customNames(this._el, this._pseudo).length;
    if (table !== null && n > table.count) ensureIndexGetters(table, n);
    return n;
  }

  override item(index: number): string {
    if (this._pseudo === INVALID) return "";
    const names = computedPropertyNames();
    const i = index >>> 0;
    if (i < names.length) return names[i];
    return customNames(this._el, this._pseudo)[i - names.length] ?? "";
  }

  override getPropertyValue(property: string): string {
    if (this._pseudo === INVALID) return "";
    const p = String(property);
    return computedValue(this._el, isCustomPropertyName(p) ? p : p.toLowerCase(), this._pseudo);
  }

  override getPropertyPriority(_property: string): string {
    return "";
  }

  override get cssText(): string {
    return "";
  }

  override set cssText(_text: string) {
    this._checkWritable();
  }

  override _syncIndices(): void {}
}

let table: IndexGetterTable | null = null;

/** Marker for unsupported pseudo-elements: an empty declaration (https://drafts.csswg.org/cssom/#dom-window-getcomputedstyle step 4). */
const INVALID = "\0invalid";

function customNames(el: NodeImpl, pseudo: string | null): string[] {
  return customPropertyNames(el, pseudo);
}

const cache = new WeakMap<NodeImpl, CSSComputedStyleDeclaration>();

/** https://drafts.csswg.org/cssom/#dom-window-getcomputedstyle — the declaration object is reused per element (it is live). */
export function getComputedStyle(element: Element, pseudoElement?: string | null): CSSStyleDeclaration {
  const impl = element._impl;
  let pseudo = pseudoElement === undefined || pseudoElement === null || pseudoElement === "" ? null : String(pseudoElement);
  if (pseudo !== null) {
    const lower = pseudo.toLowerCase();
    if (lower.charCodeAt(0) !== 0x3a) pseudo = null;
    else if (lower !== "::before" && lower !== "::after" && lower !== ":before" && lower !== ":after") pseudo = INVALID;
  }
  if (pseudo === null) {
    let d = cache.get(impl);
    if (d === undefined) cache.set(impl, (d = new CSSComputedStyleDeclaration(impl, null)));
    return d;
  }
  return new CSSComputedStyleDeclaration(impl, pseudo);
}
