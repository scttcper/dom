// https://dom.spec.whatwg.org/#interface-namednodemap (element.attributes)
//
// OWNER: dom-core. A view over the element's AttrRecord list; Attr nodes are materialized on
// demand (nodes/attr-nodes.ts). Indexed access is Proxy-free (prototype getters, see
// collections/indexed.ts). Deviation: named properties (`attributes.id`) are not exposed;
// use getNamedItem().

import { F_HTML } from "../nodes/constants.ts";
import type { NodeImpl } from "../nodes/NodeImpl.ts";
import type { Attr } from "../nodes/Attr.ts";
import { asciiLowercase, findAttributeByName, findAttributeByNamespace, removeAttributeRecord } from "../nodes/attributes.ts";
import { attrNode, setAttributeNode } from "../nodes/attr-nodes.ts";
import { ensureIndexGetters, indexGetterTable, type IndexGetterTable } from "./indexed.ts";

let table: IndexGetterTable | null = null;

export class NamedNodeMap {
  #el: NodeImpl;

  /** @internal */
  constructor(el: NodeImpl) {
    this.#el = el;
    if (table === null) table = indexGetterTable(NamedNodeMap.prototype, (self, i) => (self as NamedNodeMap).item(i) ?? undefined, 16);
  }

  get length(): number {
    const attrs = this.#el.attrs;
    const n = attrs === null ? 0 : attrs.length;
    if (n > table!.count) ensureIndexGetters(table!, n);
    return n;
  }

  /** https://dom.spec.whatwg.org/#dom-namednodemap-item */
  item(index: number): Attr | null {
    const el = this.#el;
    const attrs = el.attrs;
    const i = Number(index) >>> 0;
    return attrs === null || i >= attrs.length ? null : attrNode(el, attrs[i]);
  }

  #byName(qualifiedName: string) {
    const el = this.#el;
    const q = String(qualifiedName);
    return findAttributeByName(el, (el.flags & F_HTML) !== 0 ? asciiLowercase(q) : q);
  }

  /** https://dom.spec.whatwg.org/#dom-namednodemap-getnameditem */
  getNamedItem(qualifiedName: string): Attr | null {
    const a = this.#byName(qualifiedName);
    return a === null ? null : attrNode(this.#el, a);
  }

  getNamedItemNS(namespace: string | null, localName: string): Attr | null {
    const el = this.#el;
    const a = findAttributeByNamespace(el, namespace === "" || namespace === undefined ? null : namespace, String(localName));
    return a === null ? null : attrNode(el, a);
  }

  setNamedItem(attr: Attr): Attr | null {
    return setAttributeNode(this.#el, attr);
  }

  setNamedItemNS(attr: Attr): Attr | null {
    return setAttributeNode(this.#el, attr);
  }

  /** https://dom.spec.whatwg.org/#dom-namednodemap-removenameditem */
  removeNamedItem(qualifiedName: string): Attr {
    const el = this.#el;
    const a = this.#byName(qualifiedName);
    if (a === null) throw new DOMException(`No item with name '${qualifiedName}' was found.`, "NotFoundError");
    const node = attrNode(el, a);
    removeAttributeRecord(el, a);
    return node;
  }

  removeNamedItemNS(namespace: string | null, localName: string): Attr {
    const el = this.#el;
    const a = findAttributeByNamespace(el, namespace === "" || namespace === undefined ? null : namespace, String(localName));
    if (a === null) throw new DOMException(`No item with name '${namespace}::${localName}' was found.`, "NotFoundError");
    const node = attrNode(el, a);
    removeAttributeRecord(el, a);
    return node;
  }

  [index: number]: Attr;
  declare [Symbol.iterator]: () => ArrayIterator<Attr>;
}

Object.defineProperties(NamedNodeMap.prototype, {
  [Symbol.iterator]: { value: Array.prototype.values, writable: true, configurable: true },
  [Symbol.toStringTag]: { value: "NamedNodeMap", configurable: true },
});
