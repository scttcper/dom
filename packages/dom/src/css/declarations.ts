// CSS declaration blocks — the storage behind CSSStyleDeclaration, CSSStyleRule.style and
// inline styles, read directly by the cascade (no CSSStyleDeclaration allocation needed).
// https://drafts.csswg.org/cssom/#css-declaration-blocks

import { parseDeclarationList, type RawDecl } from "./parser.ts";
import { isCustomPropertyName, isSupportedProperty } from "./properties.ts";
import {
  containsVar,
  isCSSWideKeyword,
  normalizeCustom,
  normalizeLonghand,
  splitComponents,
  TK_IDENT,
} from "./values.ts";
import {
  expandShorthand,
  isExpandedShorthand,
  longhandsOf,
  MULTI_LAYER,
  serializeShorthand,
  shorthandsContaining,
} from "./shorthands.ts";

export class DeclBlock {
  /** Property names (lowercase, or custom property names as written). */
  names: string[];
  /** Specified values, already normalized. */
  values: string[];
  important: boolean[];
  /** Set by put()/removeOne() when they change the block (setProperty's "updated" flag). */
  dirty: boolean;

  constructor() {
    this.names = [];
    this.values = [];
    this.important = [];
    this.dirty = false;
  }

  get length(): number {
    return this.names.length;
  }

  indexOf(name: string): number {
    const names = this.names;
    for (let i = 0; i < names.length; i++) if (names[i] === name) return i;
    return -1;
  }

  clear(): void {
    this.names.length = 0;
    this.values.length = 0;
    this.important.length = 0;
  }

  /** Low-level set: update in place, or append. */
  put(name: string, value: string, important: boolean): void {
    const i = this.indexOf(name);
    if (i === -1) {
      this.names.push(name);
      this.values.push(value);
      this.important.push(important);
      this.dirty = true;
    } else if (this.values[i] !== value || this.important[i] !== important) {
      this.values[i] = value;
      this.important[i] = important;
      this.dirty = true;
    }
  }

  /** Low-level set used while parsing a block: a later declaration moves to the end, but never overrides an important one with a normal one. */
  putParsed(name: string, value: string, important: boolean): void {
    const i = this.indexOf(name);
    if (i !== -1) {
      if (this.important[i] && !important) return;
      this.names.splice(i, 1);
      this.values.splice(i, 1);
      this.important.splice(i, 1);
    }
    this.names.push(name);
    this.values.push(value);
    this.important.push(important);
  }

  /** Removes `name`; returns true if it was present. */
  removeOne(name: string): boolean {
    const i = this.indexOf(name);
    if (i === -1) return false;
    this.names.splice(i, 1);
    this.values.splice(i, 1);
    this.important.splice(i, 1);
    this.dirty = true;
    return true;
  }

  /**
   * https://drafts.csswg.org/cssom/#set-a-css-declaration with value parsing/expansion.
   * `property` must already be normalized (lowercase unless custom). Returns false if the
   * value was invalid (nothing changed).
   */
  setValue(property: string, value: string, important: boolean, parsing: boolean): boolean {
    if (isCustomPropertyName(property)) {
      const v = normalizeCustom(value);
      if (v === null) return false;
      if (parsing) this.putParsed(property, v, important);
      else this.put(property, v, important);
      return true;
    }
    if (isExpandedShorthand(property)) {
      const longhands = longhandsOf(property)!;
      const trimmed = value.trim();
      const comps = splitComponents(trimmed);
      if (comps === null || trimmed === "") return false;
      if (comps.length === 1 && comps[0].type === TK_IDENT && isCSSWideKeyword(comps[0].lower)) {
        for (const l of longhands) this.putOrParsed(l, comps[0].lower, important, parsing);
        this.removeOne(property);
        return true;
      }
      let vals: string[] | null = null;
      if (!containsVar(trimmed)) {
        vals = expandShorthand(property, trimmed);
        if (vals === null) return false;
      }
      if (vals === null || vals === MULTI_LAYER) {
        // Pending-substitution (var()) or unexpandable value: store the shorthand itself.
        for (const l of longhands) this.removeOne(l);
        this.putOrParsed(property, trimmed, important, parsing);
        return true;
      }
      this.removeOne(property);
      for (let i = 0; i < longhands.length; i++) this.putOrParsed(longhands[i], vals[i], important, parsing);
      return true;
    }
    if (!isSupportedProperty(property)) return false;
    const v = normalizeLonghand(property, value);
    if (v === null) return false;
    this.putOrParsed(property, v, important, parsing);
    // A longhand set after a stored (unexpanded) shorthand overrides part of it; keep both like jsdom.
    return true;
  }

  putOrParsed(name: string, value: string, important: boolean, parsing: boolean): void {
    if (parsing) this.putParsed(name, value, important);
    else this.put(name, value, important);
  }

  /** https://drafts.csswg.org/cssom/#parse-a-css-declaration-block — replaces the contents. */
  parse(text: string): void {
    this.clear();
    if (text === "") return;
    this.addRaw(parseDeclarationList(text));
  }

  addRaw(decls: RawDecl[]): void {
    for (let i = 0; i < decls.length; i++) {
      const d = decls[i];
      const name = isCustomPropertyName(d.name) ? d.name : d.name.toLowerCase();
      this.setValue(name, d.value, d.important, true);
    }
  }

  /** Removes a property (expanding shorthands); returns true if anything was removed. */
  remove(property: string): boolean {
    let removed = this.removeOne(property);
    const longhands = longhandsOf(property);
    if (longhands !== undefined) for (const l of longhands) if (this.removeOne(l)) removed = true;
    return removed;
  }

  /** https://drafts.csswg.org/cssom/#dom-cssstyledeclaration-getpropertyvalue */
  getPropertyValue(property: string): string {
    const i = this.indexOf(property);
    if (i !== -1) return this.values[i];
    const longhands = longhandsOf(property);
    if (longhands === undefined) return "";
    const vals: string[] = [];
    let imp = -1;
    for (const l of longhands) {
      const j = this.indexOf(l);
      if (j === -1) return "";
      const li = this.important[j] ? 1 : 0;
      if (imp === -1) imp = li;
      else if (imp !== li) return "";
      vals.push(this.values[j]);
    }
    return serializeShorthand(property, vals, false);
  }

  /** https://drafts.csswg.org/cssom/#dom-cssstyledeclaration-getpropertypriority */
  getPropertyPriority(property: string): string {
    const i = this.indexOf(property);
    if (i !== -1) return this.important[i] ? "important" : "";
    const longhands = longhandsOf(property);
    if (longhands === undefined) return "";
    for (const l of longhands) {
      const j = this.indexOf(l);
      if (j === -1 || !this.important[j]) return "";
    }
    return "important";
  }

  /** https://drafts.csswg.org/cssom/#serialize-a-css-declaration-block */
  serialize(): string {
    const names = this.names;
    const n = names.length;
    if (n === 0) return "";
    let out = "";
    let done: Set<string> | null = null;
    for (let i = 0; i < n; i++) {
      const name = names[i];
      if (done !== null && done.has(name)) continue;
      const shorthands = shorthandsContaining(name);
      let emitted = false;
      if (shorthands !== undefined) {
        for (let s = 0; s < shorthands.length && !emitted; s++) {
          const sh = shorthands[s];
          const longhands = longhandsOf(sh)!;
          const vals: string[] = [];
          let ok = true;
          for (const l of longhands) {
            const j = this.indexOf(l);
            if (j === -1 || this.important[j] !== this.important[i] || (done !== null && done.has(l))) {
              ok = false;
              break;
            }
            vals.push(this.values[j]);
          }
          if (!ok) continue;
          const v = serializeShorthand(sh, vals, false);
          if (v === "") continue;
          if (done === null) done = new Set();
          for (const l of longhands) done.add(l);
          out += (out === "" ? "" : " ") + sh + ": " + v + (this.important[i] ? " !important;" : ";");
          emitted = true;
        }
      }
      if (emitted) continue;
      out += (out === "" ? "" : " ") + name + ": " + this.values[i] + (this.important[i] ? " !important;" : ";");
    }
    return out;
  }
}

/** Parses a style attribute / declaration list into a fresh block. */
export function parseDeclBlock(text: string): DeclBlock {
  const b = new DeclBlock();
  b.parse(text);
  return b;
}
