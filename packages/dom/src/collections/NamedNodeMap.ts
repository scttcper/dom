// https://dom.spec.whatwg.org/#interface-namednodemap (element.attributes)
//
// OWNER: dom-core. A view over the element's AttrRecord list; Attr nodes are materialized on
// demand (nodes/attr-nodes.ts). Indexed access is Proxy-free (prototype getters, see
// collections/indexed.ts).
//
// Named properties (`attributes.value`, `'value' in attributes`) are WebIDL
// [LegacyUnenumerableNamedProperties] (https://dom.spec.whatwg.org/#interface-namednodemap):
// react-hook-form reads a checkbox's value only when `'value' in option.attributes`, so without
// them a checked `<input type=checkbox value=x>` submits `true` instead of "x". Unlike the other
// collections, NamedNodeMap is off every hot path (React and our upper layers read attributes
// through getAttribute / AttrRecords), so each instance is a Proxy (one per element whose
// `attributes` is read; Element caches it). The element lives under a symbol, not a #private
// field, because methods are called with the Proxy as `this`.

import { F_HTML } from "../nodes/constants.ts";
import type { NodeImpl } from "../nodes/NodeImpl.ts";
import type { Attr } from "../nodes/Attr.ts";
import { asciiLowercase, findAttributeByName, findAttributeByNamespace, removeAttributeRecord } from "../nodes/attributes.ts";
import { attrNode, setAttributeNode } from "../nodes/attr-nodes.ts";
import { ensureIndexGetters, indexGetterTable, type IndexGetterTable } from "./indexed.ts";

let table: IndexGetterTable | null = null;
const $el = Symbol("NamedNodeMap.element");

/** https://webidl.spec.whatwg.org/#dfn-array-index-property-name: indexed, never named. */
const isArrayIndex = (key: string): boolean => /^(?:0|[1-9]\d*)$/.test(key) && Number(key) < 4294967295;

/**
 * The attribute a supported property name names, or null.
 * https://dom.spec.whatwg.org/#ref-for-dfn-supported-property-names: the attributes' qualified
 * names, minus names with ASCII upper alpha on HTML elements in HTML documents; the named getter is
 * getNamedItem(), so a supported name matches exactly.
 */
function namedAttribute(map: NamedNodeMap, key: string) {
  const el = map[$el];
  if ((el.flags & F_HTML) !== 0 && /[A-Z]/.test(key)) return null;
  return findAttributeByName(el, key);
}

/**
 * https://webidl.spec.whatwg.org/#legacy-platform-object-getownproperty with the named property
 * visibility algorithm (no [LegacyOverrideBuiltIns]: own and prototype properties win). No named
 * setter, so writes are ordinary (an expando then shadows the name, as an own property would).
 */
function named(target: NamedNodeMap, key: string | symbol) {
  return typeof key === "string" && !(key in target) && !isArrayIndex(key) ? namedAttribute(target, key) : null;
}
const handler: ProxyHandler<NamedNodeMap> = {
  get(target, key) {
    // Members and index getters run with the target as `this` (not the Proxy), so `attributes[i]`
    // costs one trap instead of a trap per inner `this.item` / `this[$el]` read.
    if (typeof key === "symbol" || key in target) return (target as any)[key];
    const a = isArrayIndex(key) ? null : namedAttribute(target, key);
    return a === null ? undefined : attrNode(target[$el], a);
  },
  has(target, key) {
    return key in target || named(target, key) !== null;
  },
  getOwnPropertyDescriptor(target, key) {
    const a = named(target, key);
    if (a === null) return key === $el ? undefined : Reflect.getOwnPropertyDescriptor(target, key);
    return { value: attrNode(target[$el], a), writable: false, enumerable: false, configurable: true };
  },
  ownKeys(target) {
    const keys = Reflect.ownKeys(target).filter((k) => k !== $el);
    const attrs = target[$el].attrs;
    if (attrs !== null) {
      for (let i = 0; i < attrs.length; i++) {
        const name = attrs[i].name;
        if (!keys.includes(name) && named(target, name) !== null) keys.push(name);
      }
    }
    return keys;
  },
};

/** https://dom.spec.whatwg.org/#concept-element-attributes-get-by-name */
function byName(el: NodeImpl, qualifiedName: string) {
  const q = String(qualifiedName);
  return findAttributeByName(el, (el.flags & F_HTML) !== 0 ? asciiLowercase(q) : q);
}

export class NamedNodeMap {
  declare [$el]: NodeImpl;

  /** @internal */
  constructor(el: NodeImpl) {
    // Configurable (Proxy invariants let ownKeys hide it), non-enumerable.
    Object.defineProperty(this, $el, { value: el, configurable: true });
    if (table === null) table = indexGetterTable(NamedNodeMap.prototype, (self, i) => (self as NamedNodeMap).item(i) ?? undefined, 16);
    // A constructor may return an object: the Proxy is the instance (and what Element caches).
    return new Proxy(this, handler);
  }

  get length(): number {
    const attrs = this[$el].attrs;
    const n = attrs === null ? 0 : attrs.length;
    if (n > table!.count) ensureIndexGetters(table!, n);
    return n;
  }

  /** https://dom.spec.whatwg.org/#dom-namednodemap-item */
  item(index: number): Attr | null {
    const el = this[$el];
    const attrs = el.attrs;
    const i = Number(index) >>> 0;
    return attrs === null || i >= attrs.length ? null : attrNode(el, attrs[i]);
  }

  /** https://dom.spec.whatwg.org/#dom-namednodemap-getnameditem */
  getNamedItem(qualifiedName: string): Attr | null {
    const a = byName(this[$el], qualifiedName);
    return a === null ? null : attrNode(this[$el], a);
  }

  getNamedItemNS(namespace: string | null, localName: string): Attr | null {
    const el = this[$el];
    const a = findAttributeByNamespace(el, namespace === "" || namespace === undefined ? null : namespace, String(localName));
    return a === null ? null : attrNode(el, a);
  }

  setNamedItem(attr: Attr): Attr | null {
    return setAttributeNode(this[$el], attr);
  }

  setNamedItemNS(attr: Attr): Attr | null {
    return setAttributeNode(this[$el], attr);
  }

  /** https://dom.spec.whatwg.org/#dom-namednodemap-removenameditem */
  removeNamedItem(qualifiedName: string): Attr {
    const el = this[$el];
    const a = byName(this[$el], qualifiedName);
    if (a === null) throw new DOMException(`No item with name '${qualifiedName}' was found.`, "NotFoundError");
    const node = attrNode(el, a);
    removeAttributeRecord(el, a);
    return node;
  }

  removeNamedItemNS(namespace: string | null, localName: string): Attr {
    const el = this[$el];
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
