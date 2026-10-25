import type { NodeImpl } from "./NodeImpl.ts";

/**
 * Lazily created per-node cache hung on `NodeImpl.cache`. One class with every field
 * declared up front keeps the slot monomorphic. Subsystems add their fields HERE (in the
 * constructor, with a comment naming the owner) instead of attaching ad-hoc properties.
 *
 * Validity: each subsystem stamps its entries with the document version it computed them
 * at (`Document._version`, bumped by every tree/attribute/character-data mutation) and/or
 * the style version (`Document._styleVersion`, bumped by stylesheet changes), and treats a
 * mismatched stamp as a miss. Never hold strong references to other nodes' wrappers here
 * beyond what the DOM tree already holds.
 */
export class NodeCache {
  // --- @ctrl/dom/aria ---
  /** `Document._version` at which `role` was computed. */
  roleVersion: number;
  /** Computed (explicit-or-implicit) role, "" for none. */
  role: string;
  /** `Document._version` at which `name` was computed. */
  nameVersion: number;
  /** Accessible name. */
  name: string;

  // --- css (computed style) ---
  /** `Document._version` at which `style` was computed. */
  styleVersion: number;
  /** `Document._styleVersion` at which `style` was computed. */
  styleSheetVersion: number;
  /** Opaque computed-style record owned by src/css. */
  style: object | null;

  // --- @ctrl/dom/aria (appended by the aria agent) ---
  /** `Document._styleVersion` at which `name` was computed (paired with `nameVersion`). */
  ariaNameStyleVersion: number;
  /** `Document._version` at which `ariaHiddenBits` was computed. */
  ariaHiddenVersion: number;
  /** `Document._styleVersion` at which `ariaHiddenBits` was computed. */
  ariaHiddenStyleVersion: number;
  /** Accessibility-tree exclusion bits owned by packages/aria/src/hidden.ts. */
  ariaHiddenBits: number;

  constructor() {
    this.roleVersion = -1;
    this.role = "";
    this.nameVersion = -1;
    this.name = "";
    this.styleVersion = -1;
    this.styleSheetVersion = -1;
    this.style = null;
    this.ariaNameStyleVersion = -1;
    this.ariaHiddenVersion = -1;
    this.ariaHiddenStyleVersion = -1;
    this.ariaHiddenBits = 0;
  }
}

export function nodeCache(impl: NodeImpl): NodeCache {
  let c = impl.cache as NodeCache | null;
  if (c === null) impl.cache = c = new NodeCache();
  return c;
}
