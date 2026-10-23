// https://dom.spec.whatwg.org/#interface-htmlcollection
//
// OWNER: dom-core.
//
// Live collection over a root and a filter. The matching elements are computed lazily into a
// snapshot array stamped with the root's node document and `Document._version` (bumped by every
// mutation), so repeated reads between mutations are O(1) and mutations themselves pay nothing.
//
// Indexed access (`coll[0]`) is Proxy-free: accessor properties on HTMLCollection.prototype
// (collections/indexed.ts). Named access (`coll.foo`) needs a Proxy, which costs every property
// read, so the base class does NOT install one; `namedItem()` always works, and subclasses
// that need `coll.name` access (HTMLFormControlsCollection: `form.elements.username`) wrap
// instances with `withNamedProperties()`.
//
// State is kept in ONE non-enumerable own symbol-keyed property (`[$coll]`, keys.ts) so that
// (a) `Object.keys(coll)` / `Object.getOwnPropertyNames(coll)` stay clean for jest/pretty-format
// and WebIDL (https://webidl.spec.whatwg.org/#legacy-platform-object-property-enumeration) and
// (b) a named-properties Proxy can forward to it. `_s` is a prototype alias for subclasses.
//
// Subclasses (html agent: HTMLFormControlsCollection, HTMLOptionsCollection, document.forms,
// table.rows, ...) either override `_collect(out)` (keeping the base class's version-stamped
// caching) or override `_snapshot()` entirely (managing `_items` / `_version` themselves).
// Everything else (length, item, namedItem, indexed access, iteration) goes through
// `_snapshot()`.

import { holdSnapshot } from "../nodes/derived.ts";
import { ELEMENT_NODE, HTML_NS } from "../nodes/constants.ts";
import type { Document } from "../nodes/Document.ts";
import type { Element } from "../nodes/Element.ts";
import type { NodeImpl } from "../nodes/NodeImpl.ts";
import { attr } from "../nodes/attributes.ts";
import { nextElementInTree } from "../nodes/traverse.ts";
import { ensureIndexGetters, indexGetterTable, type IndexGetterTable } from "./indexed.ts";
import { $coll, $impl, $items, $version } from "../keys.ts";

export type ElementFilter = (el: NodeImpl) => boolean;

/** @internal Monomorphic state record of an HTMLCollection. */
export class CollectionState {
  root: NodeImpl;
  /** true: only element children of root; false: descendants matching `filter`. */
  childrenOnly: boolean;
  filter: ElementFilter | null;
  items: Element[];
  doc: Document | null;
  version: number;

  constructor(root: NodeImpl, childrenOnly: boolean, filter: ElementFilter | null) {
    this.root = root;
    this.childrenOnly = childrenOnly;
    this.filter = filter;
    this.items = [];
    this.doc = null;
    this.version = -1;
  }

  /** nodes/derived.ts: release the (stale) members once a node was removed from the document. */
  _dropSnapshot(): void {
    this.items = [];
    this.doc = null;
    this.version = -1;
  }
}

export class HTMLCollection {
  declare [$coll]: CollectionState;
  /** Free for subclasses that override `_snapshot()` (not used by the base class). */
  declare [$items]: Element[] | null;
  declare [$version]: number;

  /** @internal Use the static factories or a subclass. */
  constructor(root: NodeImpl, childrenOnly = false, filter: ElementFilter | null = null) {
    Object.defineProperty(this, $coll, { value: new CollectionState(root, childrenOnly, filter) });
    if (table === null) table = indexGetterTable(HTMLCollection.prototype, tableItem, 256);
  }

  /**
   * @internal Collection state (prototype accessor, so it is not an own property name).
   * TODO(html): html/collection.ts and html/forms/collections.ts could read `this[$coll]`.
   */
  get _s(): CollectionState {
    return this[$coll];
  }

  /** @internal The collection root. */
  get _rootImpl(): NodeImpl {
    return this[$coll].root;
  }

  /** @internal Element children of `root` (ParentNode.children). */
  static _childrenOf(root: NodeImpl): HTMLCollection {
    return new HTMLCollection(root, true, null);
  }

  /** @internal Descendant elements of `root` matching `filter`, in tree order. */
  static _descendants(root: NodeImpl, filter: ElementFilter | null): HTMLCollection {
    return new HTMLCollection(root, false, filter);
  }

  /**
   * @internal Fill `out` with the members in tree order. Subclasses override this for custom
   * membership; it runs only when the document changed since the last snapshot.
   */
  _collect(out: Element[]): void {
    const s = this[$coll];
    const root = s.root;
    if (s.childrenOnly) {
      for (let c = root.first; c !== null; c = c.next) if (c.type === ELEMENT_NODE) out.push(c.node as Element);
      return;
    }
    const filter = s.filter;
    if (filter === null) {
      for (let n = nextElementInTree(root, root); n !== null; n = nextElementInTree(n, root)) out.push(n.node as Element);
    } else {
      for (let n = nextElementInTree(root, root); n !== null; n = nextElementInTree(n, root)) {
        if (filter(n)) out.push(n.node as Element);
      }
    }
  }

  /** @internal Current members (shared array: do not mutate). */
  _snapshot(): Element[] {
    const s = this[$coll];
    const doc = s.root.doc;
    if (s.version === doc[$version] && s.doc === doc) return s.items;
    const items: Element[] = [];
    this._collect(items);
    s.items = items;
    s.doc = doc;
    s.version = doc[$version];
    if (items.length !== 0) holdSnapshot(doc, s, s.root);
    if (items.length > table!.count) ensureIndexGetters(table!, items.length);
    return items;
  }

  get length(): number {
    const n = this._snapshot().length;
    if (n > table!.count) ensureIndexGetters(table!, n);
    return n;
  }

  /** https://dom.spec.whatwg.org/#dom-htmlcollection-item */
  item(index: number): Element | null {
    const items = this._snapshot();
    const i = Number(index) >>> 0;
    return i < items.length ? items[i] : null;
  }

  /** https://dom.spec.whatwg.org/#dom-htmlcollection-nameditem-key */
  namedItem(key: string): Element | null {
    const name = String(key);
    if (name === "") return null;
    const items = this._snapshot();
    for (let i = 0; i < items.length; i++) {
      const impl = items[i][$impl];
      if (impl.id === name) return items[i];
      if (impl.ns === HTML_NS && attr(impl, "name") === name) return items[i];
    }
    return null;
  }

  /** https://dom.spec.whatwg.org/#ref-for-dfn-supported-property-names */
  _supportedPropertyNames(): string[] {
    const names: string[] = [];
    const items = this._snapshot();
    for (let i = 0; i < items.length; i++) {
      const impl = items[i][$impl];
      if (impl.id !== "" && !names.includes(impl.id)) names.push(impl.id);
      if (impl.ns === HTML_NS) {
        const n = attr(impl, "name");
        if (n !== null && n !== "" && !names.includes(n)) names.push(n);
      }
    }
    return names;
  }

  [index: number]: Element;
  declare [Symbol.iterator]: () => ArrayIterator<Element>;
}

Object.defineProperties(HTMLCollection.prototype, {
  [Symbol.iterator]: { value: Array.prototype.values, writable: true, configurable: true },
  [Symbol.toStringTag]: { value: "HTMLCollection", configurable: true },
});

/** Created on first construction so importing the module costs nothing. */
let table: IndexGetterTable | null = null;

function tableItem(self: object, i: number): unknown {
  const items = (self as HTMLCollection)._snapshot();
  return i < items.length ? items[i] : undefined;
}

/** @internal Make sure prototype index getters cover `n` items (subclasses that override both `_snapshot` and `length`). */
export function ensureCollectionIndexGetters(n: number): void {
  if (table !== null) ensureIndexGetters(table, n);
}

function isArrayIndex(key: string): boolean {
  const c = key.charCodeAt(0);
  if (c < 48 || c > 57) return false;
  const n = Number(key);
  return Number.isInteger(n) && n >= 0 && n < 4294967295 && String(n) === key;
}

/**
 * Wrap a collection in a Proxy that implements WebIDL named properties
 * (https://webidl.spec.whatwg.org/#legacy-platform-object-getownproperty) on top of
 * `namedItem` / `_supportedPropertyNames`. Use only where named access is common enough to
 * justify the per-read Proxy cost (form.elements, document.forms).
 */
export function withNamedProperties<C extends HTMLCollection>(collection: C): C {
  return new Proxy(collection, {
    get(target, key, _receiver) {
      if (typeof key === "string" && !(key in target)) return target.namedItem(key) ?? undefined;
      return Reflect.get(target, key, target);
    },
    has(target, key) {
      if (typeof key === "string" && !(key in target)) {
        return isArrayIndex(key) ? Number(key) < target.length : target.namedItem(key) !== null;
      }
      if (typeof key === "string" && isArrayIndex(key)) return Number(key) < target.length;
      return Reflect.has(target, key);
    },
    ownKeys(target) {
      const keys: (string | symbol)[] = [];
      const n = target.length;
      for (let i = 0; i < n; i++) keys.push(String(i));
      for (const name of target._supportedPropertyNames()) if (!(name in target)) keys.push(name);
      for (const k of Reflect.ownKeys(target)) keys.push(k);
      return keys;
    },
    getOwnPropertyDescriptor(target, key) {
      if (typeof key === "string") {
        if (isArrayIndex(key)) {
          const item = target.item(Number(key));
          return item === null ? undefined : { value: item, writable: false, enumerable: true, configurable: true };
        }
        if (!(key in target)) {
          const item = target.namedItem(key);
          if (item !== null) return { value: item, writable: false, enumerable: false, configurable: true };
        }
      }
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
    set(target, key, value) {
      if (typeof key === "string" && (isArrayIndex(key) || target.namedItem(key) !== null)) return false;
      return Reflect.set(target, key, value, target);
    },
    defineProperty(target, key, descriptor) {
      if (typeof key === "string" && (isArrayIndex(key) || target.namedItem(key) !== null)) return false;
      return Reflect.defineProperty(target, key, descriptor);
    },
    deleteProperty(target, key) {
      if (typeof key === "string" && isArrayIndex(key)) return Number(key) >= target.length;
      if (typeof key === "string" && !(key in target) && target.namedItem(key) !== null) return false;
      return Reflect.deleteProperty(target, key);
    },
  });
}
