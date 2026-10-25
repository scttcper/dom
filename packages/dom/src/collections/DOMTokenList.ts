// https://dom.spec.whatwg.org/#interface-domtokenlist
//
// OWNER: dom-core. Used for `classList`, `part`, and by the html agent for `relList`,
// `sandbox`, `htmlFor` (<output>), etc. (pass `supportedTokens` for interfaces whose spec
// defines them, e.g. relList).
//
// The token set is parsed lazily from the attribute value and cached until the value changes
// (string identity/equality check, no version stamps needed). For `class` the cache reuses the
// element's `NodeImpl.classes` split when it has no duplicates.

import type { NodeImpl } from "../nodes/NodeImpl.ts";
import {
  attr,
  classTokens,
  isAsciiWhitespace,
  removeAttribute,
  setAttribute,
  splitOnAsciiWhitespace,
} from "../nodes/attributes.ts";
import { ensureIndexGetters, indexGetterTable, type IndexGetterTable } from "./indexed.ts";

const EMPTY: string[] = [];

/** https://infra.spec.whatwg.org/#ordered-set (dedupe, keeping first occurrences). */
function orderedSet(tokens: string[]): string[] {
  const n = tokens.length;
  if (n < 2) return tokens;
  for (let i = 1; i < n; i++) {
    const t = tokens[i];
    for (let j = 0; j < i; j++) {
      if (tokens[j] === t) {
        const out: string[] = [];
        for (const tok of tokens) if (!out.includes(tok)) out.push(tok);
        return out;
      }
    }
  }
  return tokens;
}

function validateToken(token: string): void {
  if (token === "") throw new DOMException("The token provided must not be empty.", "SyntaxError");
  for (let i = 0; i < token.length; i++) {
    if (isAsciiWhitespace(token.charCodeAt(i))) {
      throw new DOMException(
        `The token provided ('${token}') contains HTML space characters, which are not valid in tokens.`,
        "InvalidCharacterError",
      );
    }
  }
}

let table: IndexGetterTable | null = null;

export class DOMTokenList {
  #el: NodeImpl;
  #attr: string;
  #supported: readonly string[] | null;
  /** Attribute value (or classes array for `class`) the cached set was parsed from. */
  #source: string | string[] | null;
  #tokens: string[];

  /** @internal */
  constructor(el: NodeImpl, attributeName: string, supportedTokens: readonly string[] | null = null) {
    this.#el = el;
    this.#attr = attributeName;
    this.#supported = supportedTokens;
    this.#source = null;
    this.#tokens = EMPTY;
    if (table === null) {
      table = indexGetterTable(DOMTokenList.prototype, (self, i) => (self as DOMTokenList).item(i) ?? undefined, 16);
    }
  }

  /** https://dom.spec.whatwg.org/#concept-dtl-tokens */
  #set(): string[] {
    const el = this.#el;
    if (this.#attr === "class") {
      const classes = classTokens(el);
      if (classes !== this.#source) {
        this.#source = classes;
        this.#tokens = orderedSet(classes);
      }
      return this.#tokens;
    }
    const value = attr(el, this.#attr);
    if (value !== this.#source) {
      this.#source = value;
      this.#tokens = value === null || value === "" ? EMPTY : orderedSet(splitOnAsciiWhitespace(value));
    }
    return this.#tokens;
  }

  /** https://dom.spec.whatwg.org/#concept-dtl-update */
  #update(tokens: string[]): void {
    const el = this.#el;
    if (tokens.length === 0 && attr(el, this.#attr) === null) return;
    setAttribute(el, this.#attr, tokens.join(" "));
  }

  get length(): number {
    const n = this.#set().length;
    if (n > table!.count) ensureIndexGetters(table!, n);
    return n;
  }

  /** https://dom.spec.whatwg.org/#dom-domtokenlist-item */
  item(index: number): string | null {
    const tokens = this.#set();
    const i = Number(index) >>> 0;
    return i < tokens.length ? tokens[i] : null;
  }

  /** https://dom.spec.whatwg.org/#dom-domtokenlist-contains */
  contains(token: string): boolean {
    return this.#set().includes(String(token));
  }

  /** https://dom.spec.whatwg.org/#dom-domtokenlist-add */
  add(...tokens: string[]): void {
    const strs = tokens.map(String);
    for (const t of strs) validateToken(t);
    const set = this.#set().slice();
    for (const t of strs) if (!set.includes(t)) set.push(t);
    this.#update(set);
  }

  /** https://dom.spec.whatwg.org/#dom-domtokenlist-remove */
  remove(...tokens: string[]): void {
    const strs = tokens.map(String);
    for (const t of strs) validateToken(t);
    const set = this.#set().filter((t) => !strs.includes(t));
    this.#update(set);
  }

  /** https://dom.spec.whatwg.org/#dom-domtokenlist-toggle */
  toggle(token: string, force?: boolean): boolean {
    const t = String(token);
    validateToken(t);
    const set = this.#set();
    if (set.includes(t)) {
      if (force === undefined || !force) {
        this.#update(set.filter((x) => x !== t));
        return false;
      }
      return true;
    }
    if (force === undefined || force) {
      this.#update([...set, t]);
      return true;
    }
    return false;
  }

  /** https://dom.spec.whatwg.org/#dom-domtokenlist-replace */
  replace(token: string, newToken: string): boolean {
    const t = String(token);
    const n = String(newToken);
    if (t === "" || n === "") throw new DOMException("The token provided must not be empty.", "SyntaxError");
    validateToken(t);
    validateToken(n);
    const set = this.#set();
    if (!set.includes(t)) return false;
    // https://infra.spec.whatwg.org/#set-replace
    const out: string[] = [];
    let placed = false;
    for (const x of set) {
      if (x === t || x === n) {
        if (!placed) {
          out.push(n);
          placed = true;
        }
      } else {
        out.push(x);
      }
    }
    this.#update(out);
    return true;
  }

  /** https://dom.spec.whatwg.org/#dom-domtokenlist-supports */
  supports(token: string): boolean {
    const supported = this.#supported;
    if (supported === null) {
      throw new TypeError(`'${this.#attr}' attribute has no supported tokens`);
    }
    return supported.includes(String(token).toLowerCase());
  }

  /** https://dom.spec.whatwg.org/#dom-domtokenlist-value */
  get value(): string {
    return attr(this.#el, this.#attr) ?? "";
  }

  set value(value: string) {
    setAttribute(this.#el, this.#attr, String(value));
  }

  toString(): string {
    return this.value;
  }

  /** @internal Remove the associated attribute entirely (used by some reflecting setters). */
  _clear(): void {
    removeAttribute(this.#el, this.#attr);
  }

  [index: number]: string;
  declare forEach: (callback: (value: string, key: number, parent: DOMTokenList) => void, thisArg?: unknown) => void;
  declare entries: () => ArrayIterator<[number, string]>;
  declare keys: () => ArrayIterator<number>;
  declare values: () => ArrayIterator<string>;
  declare [Symbol.iterator]: () => ArrayIterator<string>;
}

Object.defineProperties(DOMTokenList.prototype, {
  forEach: { value: Array.prototype.forEach, writable: true, enumerable: true, configurable: true },
  entries: { value: Array.prototype.entries, writable: true, enumerable: true, configurable: true },
  keys: { value: Array.prototype.keys, writable: true, enumerable: true, configurable: true },
  values: { value: Array.prototype.values, writable: true, enumerable: true, configurable: true },
  [Symbol.iterator]: { value: Array.prototype.values, writable: true, configurable: true },
  [Symbol.toStringTag]: { value: "DOMTokenList", configurable: true },
});
