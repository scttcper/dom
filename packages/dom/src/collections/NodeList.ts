// https://dom.spec.whatwg.org/#interface-nodelist
//
// OWNER: dom-core.
//
// Proxy-free. Two storage modes:
//
// 1. Plain `NodeList` instances store their items as OWN indexed data properties (elements
//    backing store, ~1-9 ns per `list[i]`, vs ~100 ns through a Proxy):
//    - static lists (querySelectorAll, MutationRecord.addedNodes, ...) are filled once by
//      `NodeList._static(items)`;
//    These own index properties are writable, so `list[0] = x` replaces the entry instead of
//    being ignored (WebIDL: no indexed setter); a deliberate deviation (docs/deviations.md), since
//    read-only properties would cost a defineProperty per eager update.
//    - live `childNodes` lists are kept up to date EAGERLY by the mutation algorithms: a
//      parent whose `childNodes` was materialized carries F_CHILD_LIST, and tree.ts calls
//      `_appended` / `_popped` / `_rebuild` from link/unlink. Appending is O(1); other changes
//      rebuild the list (O(children)); batch operations rebuild once. Parents without a
//      materialized list pay one flag test per mutation.
//
// 2. SUBCLASSES (html agent: `labels`, RadioNodeList) are lazy: they override `_snapshot()`
//    (returning the current members, typically version-stamped with `Document._version`) and
//    get accessor properties `0..n` on their own prototype (collections/indexed.ts), so they
//    never mix with own index properties.
//
// Iteration: `forEach`, `entries` and `keys` are the Array.prototype functions, as WebIDL specifies
// for indexed iterable interfaces (https://webidl.spec.whatwg.org/#es-iterable); `values` and
// `@@iterator` are collections/iterator.ts, the same semantics (iterating a live list sees
// mutations) without V8's generic per-element lookups.
//
// Internal state lives in private fields so `Object.keys(list)` is just the indices (jest's
// `equals` and pretty-format enumerate own keys).

import { F_CHILD_LIST } from "../nodes/constants.ts";
import type { Node } from "../nodes/Node.ts";
import type { NodeImpl } from "../nodes/NodeImpl.ts";
import { ensureIndexGetters, indexGetterTable, type IndexGetterTable } from "./indexed.ts";
import { CollectionIterator, iterableTarget } from "./iterator.ts";
import { $items, $version } from "../keys.ts";

/** Index getter tables of lazy NodeList subclasses, by prototype. */
const lazyTables = new Map<object, IndexGetterTable>();

function lazyItem(self: object, i: number): unknown {
  const items = (self as NodeList)._snapshot();
  return i < items.length ? items[i] : undefined;
}

export class NodeList {
  /** Parent whose children this live list reflects, or null for a static / lazy list. */
  #parent: NodeImpl | null;
  #length: number;
  /** true for subclass instances (lazy `_snapshot()` mode). */
  #lazy: boolean;

  /** For lazy subclasses: their cached snapshot (subclasses manage these). */
  declare [$items]: Node[] | null;
  declare [$version]: number;

  /**
   * @internal Use `NodeList._static` / `NodeList._live`. Subclasses call `super(null)` and
   * override `_snapshot()`.
   */
  constructor(parent: NodeImpl | null, _items?: Node[] | null) {
    this.#parent = parent;
    this.#length = 0;
    const lazy = new.target !== NodeList;
    this.#lazy = lazy;
    if (lazy && !lazyTables.has(new.target.prototype)) {
      lazyTables.set(new.target.prototype, indexGetterTable(new.target.prototype, lazyItem, 64));
    }
  }

  /** @internal A static NodeList over `items` (the array is not retained). */
  static _static(items: readonly Node[]): NodeList {
    const list = new NodeList(null);
    const n = items.length;
    for (let i = 0; i < n; i++) (list as unknown as Node[])[i] = items[i];
    list.#length = n;
    return list;
  }

  /** @internal A static NodeList over NodeImpls (avoids an intermediate wrapper array). */
  static _staticFromImpls(items: readonly NodeImpl[]): NodeList {
    const list = new NodeList(null);
    const n = items.length;
    for (let i = 0; i < n; i++) (list as unknown as Node[])[i] = items[i].node;
    list.#length = n;
    return list;
  }

  /** @internal The live `childNodes` list of `parent`. */
  static _live(parent: NodeImpl): NodeList {
    const list = new NodeList(parent);
    parent.flags |= F_CHILD_LIST;
    list.#rebuild();
    return list;
  }

  #rebuild(): void {
    const self = this as unknown as Node[];
    const parent = this.#parent!;
    let i = 0;
    for (let c = parent.first; c !== null; c = c.next) self[i++] = c.node;
    const old = this.#length;
    for (let j = i; j < old; j++) delete self[j];
    this.#length = i;
  }

  /** @internal Called by tree.ts after `node` was linked as the LAST child of a flagged parent. */
  static _appended(list: NodeList, node: Node): void {
    (list as unknown as Node[])[list.#length++] = node;
  }

  /** @internal Called by tree.ts after the LAST child of a flagged parent was unlinked. */
  static _popped(list: NodeList): void {
    delete (list as unknown as Node[])[--list.#length];
  }

  /** @internal Called by tree.ts after any other change to a flagged parent's children. */
  static _rebuild(list: NodeList): void {
    if (list.#parent !== null) list.#rebuild();
  }

  /**
   * @internal Current members. Lazy subclasses override this; for plain lists it copies the
   * own index properties.
   */
  _snapshot(): Node[] {
    const n = this.#length;
    const out: Node[] = new Array(n);
    for (let i = 0; i < n; i++) out[i] = (this as unknown as Node[])[i];
    return out;
  }

  get length(): number {
    if (this.#lazy) {
      const n = this._snapshot().length;
      const table = lazyTables.get(Object.getPrototypeOf(this))!;
      if (n > table.count) ensureIndexGetters(table, n);
      return n;
    }
    return this.#length;
  }

  /** https://dom.spec.whatwg.org/#dom-nodelist-item */
  item(index: number): Node | null {
    const i = Number(index) >>> 0;
    if (this.#lazy) return this._snapshot()[i] ?? null;
    return i < this.#length ? (this as unknown as Node[])[i] : null;
  }

  /** @internal values() / @@iterator: lazy lists are read through their snapshot. */
  static _values(self: unknown): CollectionIterator {
    const list = iterableTarget(self);
    return new CollectionIterator(list, #lazy in list && (list as NodeList).#lazy);
  }

  [index: number]: Node;
  declare forEach: (callback: (value: Node, key: number, parent: NodeList) => void, thisArg?: unknown) => void;
  declare entries: () => ArrayIterator<[number, Node]>;
  declare keys: () => ArrayIterator<number>;
  declare values: () => ArrayIterator<Node>;
  declare [Symbol.iterator]: () => ArrayIterator<Node>;
}

/** One function for both, as WebIDL has it (a method: named "values", not a constructor). */
const values = {
  values(this: unknown) {
    return NodeList._values(this);
  },
}.values;

Object.defineProperties(NodeList.prototype, {
  forEach: { value: Array.prototype.forEach, writable: true, enumerable: true, configurable: true },
  entries: { value: Array.prototype.entries, writable: true, enumerable: true, configurable: true },
  keys: { value: Array.prototype.keys, writable: true, enumerable: true, configurable: true },
  values: { value: values, writable: true, enumerable: true, configurable: true },
  [Symbol.iterator]: { value: values, writable: true, configurable: true },
  [Symbol.toStringTag]: { value: "NodeList", configurable: true },
});
