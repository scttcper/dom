// https://dom.spec.whatwg.org/#concept-node-clone
// https://dom.spec.whatwg.org/#concept-node-equals

import {
  CDATA_SECTION_NODE,
  COMMENT_NODE,
  DOCUMENT_FRAGMENT_NODE,
  DOCUMENT_NODE,
  DOCUMENT_TYPE_NODE,
  ELEMENT_NODE,
  PROCESSING_INSTRUCTION_NODE,
  TEXT_NODE,
  ATTRIBUTE_NODE,
  F_HAS_SHADOW,
} from "./constants.ts";
import { AttrRecord, type NodeImpl } from "./NodeImpl.ts";
import type { Document } from "./Document.ts";
import type { Element } from "./Element.ts";
import { appendDetached } from "./tree.ts";
import { createElementImpl } from "./create.ts";
import { $clonable, $declarative, $delegatesFocus, $impl, $mode, $serializable, $shadowRoot, $slotAssignment } from "../keys.ts";

/** Clone `node` into `doc`. Deep clones build the copy detached and never fire hooks. */
export function cloneNode(node: NodeImpl, doc: Document, deep: boolean): NodeImpl {
  const copy = cloneOne(node, doc, deep);
  if (deep) {
    for (let c = node.first; c !== null; c = c.next) appendDetached(cloneNode(c, copy.type === DOCUMENT_NODE ? (copy.node as Document) : doc, true), copy);
  }
  // Clonable shadow roots are cloned with their host, regardless of `deep`
  // (https://dom.spec.whatwg.org/#concept-node-clone step for shadow hosts).
  if ((node.flags & F_HAS_SHADOW) !== 0) {
    const shadow = (node.node as Element)[$shadowRoot]!;
    if (shadow[$clonable]) {
      const copyShadow = (copy.node as Element).attachShadow({
        mode: shadow[$mode],
        clonable: true,
        serializable: shadow[$serializable],
        delegatesFocus: shadow[$delegatesFocus],
        slotAssignment: shadow[$slotAssignment],
      });
      copyShadow[$declarative] = shadow[$declarative];
      for (let c = shadow[$impl].first; c !== null; c = c.next) appendDetached(cloneNode(c, doc, true), copyShadow[$impl]);
    }
  }
  return copy;
}

function cloneOne(node: NodeImpl, doc: Document, deep: boolean): NodeImpl {
  switch (node.type) {
    case ELEMENT_NODE: {
      const el = createElementImpl(doc, node.name, node.ns, node.prefix);
      const attrs = node.attrs;
      if (attrs !== null) {
        const copied: AttrRecord[] = new Array(attrs.length);
        for (let i = 0; i < attrs.length; i++) {
          const a = attrs[i];
          copied[i] = new AttrRecord(a.localName, a.value, a.ns, a.prefix);
        }
        el.attrs = copied;
        el.id = node.id;
        el.flags |= node.flags & 0x40; // F_HAS_STYLE_ATTR
      }
      // Element-specific cloning steps (input value/checkedness, template contents, ...).
      (node.node as Element)._cloningSteps(el.node as Element, deep); // `deep` = the spec's subtree flag (template contents)
      return el;
    }
    case TEXT_NODE:
      return doc.createTextNode(node.data)[$impl];
    case CDATA_SECTION_NODE:
      // Not via createCDATASection: cloning into an HTML document must not throw.
      return new (node.node.constructor as new (data: string, doc: Document) => { [$impl]: NodeImpl })(node.data, doc)[$impl];
    case COMMENT_NODE:
      return doc.createComment(node.data)[$impl];
    case PROCESSING_INSTRUCTION_NODE:
      return doc.createProcessingInstruction(node.name, node.data)[$impl];
    case DOCUMENT_FRAGMENT_NODE:
      return doc.createDocumentFragment()[$impl];
    case DOCUMENT_TYPE_NODE: {
      const dt = node.node as unknown as { name: string; publicId: string; systemId: string };
      return doc.implementation.createDocumentType(dt.name, dt.publicId, dt.systemId)[$impl];
    }
    case DOCUMENT_NODE:
      return (node.node as Document)._cloneDocument()[$impl];
    case ATTRIBUTE_NODE: {
      const a = doc.createAttributeNS(node.ns, node.prefix === null ? node.name : node.prefix + ":" + node.name);
      a.value = node.data;
      return a[$impl];
    }
  }
  throw new DOMException("Cannot clone this node.", "NotSupportedError");
}

export function isEqualNode(a: NodeImpl, b: NodeImpl): boolean {
  if (a === b) return true;
  if (a.type !== b.type) return false;
  switch (a.type) {
    case DOCUMENT_TYPE_NODE: {
      const x = a.node as unknown as { name: string; publicId: string; systemId: string };
      const y = b.node as unknown as { name: string; publicId: string; systemId: string };
      if (x.name !== y.name || x.publicId !== y.publicId || x.systemId !== y.systemId) return false;
      break;
    }
    case ELEMENT_NODE: {
      if (a.ns !== b.ns || a.prefix !== b.prefix || a.name !== b.name) return false;
      const aa = a.attrs ?? [];
      const ba = b.attrs ?? [];
      if (aa.length !== ba.length) return false;
      outer: for (let i = 0; i < aa.length; i++) {
        const x = aa[i];
        for (let j = 0; j < ba.length; j++) {
          const y = ba[j];
          if (x.ns === y.ns && x.localName === y.localName) {
            if (x.value !== y.value) return false;
            continue outer;
          }
        }
        return false;
      }
      break;
    }
    case ATTRIBUTE_NODE:
      if (a.ns !== b.ns || a.name !== b.name || a.data !== b.data) return false;
      break;
    case PROCESSING_INSTRUCTION_NODE:
      if (a.name !== b.name || a.data !== b.data) return false;
      break;
    case TEXT_NODE:
    case CDATA_SECTION_NODE:
    case COMMENT_NODE:
      if (a.data !== b.data) return false;
      break;
  }
  if (a.childCount !== b.childCount) return false;
  for (let x = a.first, y = b.first; x !== null && y !== null; x = x.next, y = y.next) {
    if (!isEqualNode(x, y)) return false;
  }
  return true;
}
