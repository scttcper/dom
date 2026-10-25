// Attr node algorithms: lazily materialized Attr wrappers over AttrRecords.
// https://dom.spec.whatwg.org/#concept-element-attributes-set
// https://dom.spec.whatwg.org/#concept-element-attributes-replace
//
// OWNER: dom-core. The element's AttrRecord list stays the source of truth; an Attr wrapper is
// created on first request (`attributes`, `getAttributeNode`) and cached on `AttrRecord.attr`.

import { Attr } from "./Attr.ts";
import type { Element } from "./Element.ts";
import { AttrRecord, type NodeImpl } from "./NodeImpl.ts";
import {
  appendAttribute,
  findAttributeByNamespace,
  handleAttributeChanges,
  removeAttributeRecord,
} from "./attributes.ts";
import { $impl, $owner, $record } from "../keys.ts";

/** The Attr wrapper for `record` on element `el`, created on first use. */
export function attrNode(el: NodeImpl, record: AttrRecord): Attr {
  let a = record.attr;
  if (a === null) {
    a = new Attr(el.doc, record.localName, record.value, record.ns, record.prefix, el.node as Element, record);
    record.attr = a;
  }
  return a;
}

/** https://dom.spec.whatwg.org/#concept-element-attributes-set — returns the replaced Attr or null. */
export function setAttributeNode(el: NodeImpl, attr: Attr): Attr | null {
  const owner = attr[$owner];
  // Step 2.
  if (owner !== null && owner[$impl] !== el) {
    throw new DOMException("The attribute is in use by another element.", "InUseAttributeError");
  }
  const impl = attr[$impl];
  // Step 3.
  const old = findAttributeByNamespace(el, impl.ns, impl.name);
  // Step 4.
  if (old !== null && old.attr === attr) return attr;
  const record = new AttrRecord(impl.name, attr.value, impl.ns, impl.prefix);
  record.attr = attr;
  if (old !== null) {
    // Step 5: replace.
    const oldAttr = attrNode(el, old);
    const attrs = el.attrs!;
    attrs[attrs.indexOf(old)] = record;
    attr._attach(el.node as Element, record);
    oldAttr._detach();
    handleAttributeChanges(el, record, old.value, record.value);
    return oldAttr;
  }
  // Step 6: append.
  attr._attach(el.node as Element, record);
  appendAttribute(el, record);
  return null;
}

/** https://dom.spec.whatwg.org/#dom-element-removeattributenode */
export function removeAttributeNode(el: NodeImpl, attr: Attr): Attr {
  const record = attr[$record];
  const attrs = el.attrs;
  if (record === null || attrs === null || !attrs.includes(record)) {
    throw new DOMException("The attribute is not an attribute of this element.", "NotFoundError");
  }
  removeAttributeRecord(el, record);
  return attr;
}
