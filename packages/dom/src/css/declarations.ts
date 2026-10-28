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
  shorthandFamily,
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
  /**
   * How many leading names are unchanged since the CSSStyleDeclaration last synced its indexed
   * properties (it sets this after syncing): appends keep the prefix, so only new indices are
   * written, and most style writes update a value in place and sync nothing.
   */
  namesSynced: number;
  /**
   * The last serialization and how many leading declarations it covers, or -1 once a declaration
   * was changed in place, moved or removed since. Declarations appended after it are serialized
   * onto its end (see serialize()), and a value changed in place is spliced into it (put()).
   */
  serialized: string;
  serializedCount: number;
  /**
   * Shorthand families (shorthandFamily bits) of the declarations `serialized` covers, or -1 when
   * not computed yet (only an append with shorthand longhands needs them).
   */
  serializedFamilies: number;
  /** Whether `serialized` has every declaration on its own, in order (no shorthand grouped). */
  serializedPlain: boolean;

  constructor() {
    this.names = [];
    this.values = [];
    this.important = [];
    this.dirty = false;
    this.namesSynced = 0;
    this.serialized = "";
    this.serializedCount = 0;
    this.serializedFamilies = 0;
    this.serializedPlain = true;
  }

  get length(): number {
    return this.names.length;
  }

  indexOf(name: string, from = 0): number {
    const names = this.names;
    for (let i = from; i < names.length; i++) if (names[i] === name) return i;
    return -1;
  }

  clear(): void {
    this.names.length = 0;
    this.values.length = 0;
    this.important.length = 0;
    this.namesSynced = 0;
    this.serialized = "";
    this.serializedCount = 0;
    this.serializedFamilies = 0;
    this.serializedPlain = true;
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
      // A declaration outside every shorthand family is serialized on its own whatever its value,
      // so in a plain serialization only its own text changes (floating-ui moving a popup).
      if (
        this.serializedCount === this.names.length &&
        this.serializedPlain &&
        shorthandsContaining(name) === undefined
      )
        this.spliceSerialized(i, value, important);
      else this.serializedCount = -1;
      this.values[i] = value;
      this.important[i] = important;
      this.dirty = true;
    }
  }

  /**
   * Replaces declaration `i`'s text in a plain `serialized` (declarations joined by one space,
   * each `name: value;` or `name: value !important;`), before its value is overwritten.
   */
  spliceSerialized(i: number, value: string, important: boolean): void {
    const names = this.names;
    const values = this.values;
    const imp = this.important;
    let start = 0;
    for (let j = 0; j < i; j++) start += names[j].length + values[j].length + (imp[j] ? 15 : 4);
    const end = start + names[i].length + values[i].length + (imp[i] ? 14 : 3);
    const text = this.serialized;
    this.serialized = text.slice(0, start) + serializeDeclaration(names[i], value, important) + text.slice(end);
  }

  /** Low-level set used while parsing a block: a later declaration moves to the end, but never overrides an important one with a normal one. */
  putParsed(name: string, value: string, important: boolean): void {
    const i = this.indexOf(name);
    if (i !== -1) {
      if (this.important[i] && !important) return;
      this.names.splice(i, 1);
      this.values.splice(i, 1);
      this.important.splice(i, 1);
      if (i < this.namesSynced) this.namesSynced = i;
      this.serializedCount = -1;
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
    if (i < this.namesSynced) this.namesSynced = i;
    this.serializedCount = -1;
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
      const vals = longhandValues(property, value);
      if (vals === null) return false;
      const longhands = longhandsOf(property)!;
      if (vals === KEEP_SHORTHAND) {
        // Pending-substitution (var()) or unexpandable value: store the shorthand itself.
        for (const l of longhands) this.removeOne(l);
        this.putOrParsed(property, value.trim(), important, parsing);
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

  /**
   * https://drafts.csswg.org/cssom/#serialize-a-css-declaration-block, incrementally.
   *
   * React writes inline styles one property at a time on mount, and every write serializes the
   * block into the style attribute (CSSStyleDeclaration._changed), so an element with N inline
   * properties serialized N(N+1)/2 declarations. When the only changes since the last call are
   * appended declarations, the result is the previous text followed by the appended declarations
   * serialized on their own. The shorthand loop can only group declarations of one shorthand
   * family, so that holds unless an appended longhand shares a family with an earlier
   * declaration; then the whole block is serialized again.
   * bench dom/inline-style-mount (8 properties on 500 elements): 1.18 → 0.80 ms, allocation
   * 3.8 → 2.0 MB per iteration; dom/inline-style-shorthand-mount (Base UI's visually hidden
   * input, with border/padding/margin): 3.0 → 1.5 ms, 7.2 → 2.9 MB (Node 26.12, 11 paired
   * samples each).
   */
  serialize(): string {
    const n = this.names.length;
    const from = this.serializedCount;
    if (from === n) return this.serialized;
    if (from < 0 || !this.serializeAppended(from)) {
      this.serialized = this.serializeAll(0);
      this.serializedCount = n;
      this.serializedFamilies = -1;
      this.serializedPlain = !lastSerializationGrouped;
    }
    return this.serialized;
  }

  /**
   * serialize() after appends only: extends `serialized` with the declarations from `from` on,
   * unless one of them shares a shorthand family with an earlier declaration (returns false).
   */
  serializeAppended(from: number): boolean {
    const names = this.names;
    const n = names.length;
    let families = 0;
    for (let i = from; i < n; i++) families |= shorthandFamily(names[i]);
    let before = this.serializedFamilies;
    if (families !== 0 && before === -1) {
      before = 0;
      for (let i = 0; i < from; i++) before |= shorthandFamily(names[i]);
    }
    if ((families & before) !== 0) return false;
    const appended = this.serializeAll(from);
    if (lastSerializationGrouped) this.serializedPlain = false;
    this.serialized = this.serialized === "" ? appended : this.serialized + " " + appended;
    this.serializedCount = n;
    this.serializedFamilies = before === -1 ? -1 : before | families;
    return true;
  }

  /**
   * https://drafts.csswg.org/cssom/#serialize-a-css-declaration-block over the declarations from
   * `from` on, as if they were the whole block (no cache). serialize() passes a `from` past 0 only
   * when no shorthand family has declarations on both sides of it.
   */
  serializeAll(from = 0): string {
    const names = this.names;
    const n = names.length;
    lastSerializationGrouped = false;
    if (n === from) return "";
    let out = "";
    let done: Set<string> | null = null;
    for (let i = from; i < n; i++) {
      const name = names[i];
      if (done !== null && done.has(name)) continue;
      const shorthands = shorthandsContaining(name);
      let emitted = false;
      if (shorthands !== undefined) {
        for (let s = 0; s < shorthands.length && !emitted; s++) {
          const sh = shorthands[s];
          const longhands = longhandsOf(sh)!;
          // Usually some longhand is missing: check before collecting values (fewer declarations
          // than longhands rules it out without a lookup).
          let ok = longhands.length <= n - from;
          for (let k = 0; k < longhands.length && ok; k++) {
            const j = this.indexOf(longhands[k], from);
            ok = j !== -1 && this.important[j] === this.important[i] && (done === null || !done.has(longhands[k]));
          }
          if (!ok) continue;
          const vals: string[] = new Array(longhands.length);
          for (let k = 0; k < longhands.length; k++) vals[k] = this.values[this.indexOf(longhands[k], from)];
          const v = serializeShorthand(sh, vals, false);
          if (v === "") continue;
          if (done === null) done = new Set();
          for (const l of longhands) done.add(l);
          out += (out === "" ? "" : " ") + serializeDeclaration(sh, v, this.important[i]);
          emitted = true;
        }
      }
      if (emitted) continue;
      out += (out === "" ? "" : " ") + serializeDeclaration(name, this.values[i], this.important[i]);
    }
    lastSerializationGrouped = done !== null;
    return out;
  }
}

/** Whether the last serializeAll() grouped declarations into a shorthand (read right after it). */
let lastSerializationGrouped = false;

/** https://drafts.csswg.org/cssom/#serialize-a-css-declaration */
function serializeDeclaration(property: string, value: string, important: boolean): string {
  return property + ": " + value + (important ? " !important;" : ";");
}

/** longhandValues' answer for var() and multi-layer values: keep the shorthand as one declaration. */
const KEEP_SHORTHAND = MULTI_LAYER;

const shorthandValues = new Map<string, Map<string, string[] | null>>();

/**
 * The longhand values (longhandsOf order) an expanded shorthand declaration sets, KEEP_SHORTHAND,
 * or null if the value is invalid. The result is shared: callers must not modify it. Memoized
 * per property and value like normalizeLonghand: React writes the same few values on every mount
 * (Base UI's visually hidden inputs set `border: 0`, `padding: 0` and `margin: -1px`), and each
 * used to be tokenized twice.
 */
function longhandValues(property: string, value: string): string[] | null {
  let byValue = shorthandValues.get(property);
  if (byValue === undefined) shorthandValues.set(property, (byValue = new Map()));
  else {
    const hit = byValue.get(value);
    if (hit !== undefined) return hit;
  }
  let result: string[] | null = null;
  const trimmed = value.trim();
  const comps = trimmed === "" ? null : splitComponents(trimmed);
  if (comps === null) result = null;
  else if (comps.length === 1 && comps[0].type === TK_IDENT && isCSSWideKeyword(comps[0].lower))
    result = new Array(longhandsOf(property)!.length).fill(comps[0].lower);
  else if (containsVar(trimmed)) result = KEEP_SHORTHAND;
  else result = expandShorthand(property, trimmed);
  if (byValue.size === 256) byValue.clear();
  byValue.set(value, result);
  return result;
}

/** Parses a style attribute / declaration list into a fresh block. */
export function parseDeclBlock(text: string): DeclBlock {
  const b = new DeclBlock();
  b.parse(text);
  return b;
}
