// https://dom.spec.whatwg.org/#interface-node
//
// Public wrapper. All state lives in `_impl` (see NodeImpl.ts for why). Methods here are
// thin: validate/convert arguments, call the NodeImpl algorithms in tree.ts, wrap results.

import {
  ATTRIBUTE_NODE,
  CDATA_SECTION_NODE,
  COMMENT_NODE,
  DOCUMENT_FRAGMENT_NODE,
  DOCUMENT_NODE,
  DOCUMENT_POSITION_CONTAINED_BY,
  DOCUMENT_POSITION_CONTAINS,
  DOCUMENT_POSITION_DISCONNECTED,
  DOCUMENT_POSITION_FOLLOWING,
  DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC,
  DOCUMENT_POSITION_PRECEDING,
  DOCUMENT_TYPE_NODE,
  ELEMENT_NODE,
  ENTITY_NODE,
  ENTITY_REFERENCE_NODE,
  F_CONNECTED,
  F_HTML,
  F_SHADOW_ROOT,
  NOTATION_NODE,
  PROCESSING_INSTRUCTION_NODE,
  TEXT_NODE,
} from "./constants.ts";
import { EventTarget } from "../events/EventTarget.ts";
import type { Document } from "./Document.ts";
import type { Element } from "./Element.ts";
import { NodeImpl } from "./NodeImpl.ts";
import { nextInTree, treeRoot } from "./traverse.ts";
import { preInsert, preRemove, replace, replaceAll } from "./tree.ts";
import { cloneNode, isEqualNode } from "./clone.ts";
import { NodeList } from "../collections/NodeList.ts";
import type { GetRootNodeOptions } from "../webidl.ts";
import type { Event } from "../events/Event.ts";
import { remove } from "./tree.ts";
import { replaceData } from "./character-data.ts";
import { liveRangeCount, rangesNormalizeMerge } from "../traversal/live.ts";
import { nodeGetTheParent } from "../events/dispatch.ts";
import { inspectNode } from "./inspect.ts";
import { XML_NS, XMLNS_NS } from "./constants.ts";
import { $childNodes, $host, $impl, $owner, $record } from "../keys.ts";
import { changeAttribute } from "./attributes.ts";
import type { AttrRecord } from "./NodeImpl.ts";

export abstract class Node extends EventTarget {
  static readonly ELEMENT_NODE = ELEMENT_NODE;
  static readonly ATTRIBUTE_NODE = ATTRIBUTE_NODE;
  static readonly TEXT_NODE = TEXT_NODE;
  static readonly CDATA_SECTION_NODE = CDATA_SECTION_NODE;
  static readonly ENTITY_REFERENCE_NODE = ENTITY_REFERENCE_NODE;
  static readonly ENTITY_NODE = ENTITY_NODE;
  static readonly PROCESSING_INSTRUCTION_NODE = PROCESSING_INSTRUCTION_NODE;
  static readonly COMMENT_NODE = COMMENT_NODE;
  static readonly DOCUMENT_NODE = DOCUMENT_NODE;
  static readonly DOCUMENT_TYPE_NODE = DOCUMENT_TYPE_NODE;
  static readonly DOCUMENT_FRAGMENT_NODE = DOCUMENT_FRAGMENT_NODE;
  static readonly NOTATION_NODE = NOTATION_NODE;
  static readonly DOCUMENT_POSITION_DISCONNECTED = DOCUMENT_POSITION_DISCONNECTED;
  static readonly DOCUMENT_POSITION_PRECEDING = DOCUMENT_POSITION_PRECEDING;
  static readonly DOCUMENT_POSITION_FOLLOWING = DOCUMENT_POSITION_FOLLOWING;
  static readonly DOCUMENT_POSITION_CONTAINS = DOCUMENT_POSITION_CONTAINS;
  static readonly DOCUMENT_POSITION_CONTAINED_BY = DOCUMENT_POSITION_CONTAINED_BY;
  static readonly DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC = DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC;

  declare readonly ELEMENT_NODE: number;
  declare readonly ATTRIBUTE_NODE: number;
  declare readonly TEXT_NODE: number;
  declare readonly CDATA_SECTION_NODE: number;
  declare readonly ENTITY_REFERENCE_NODE: number;
  declare readonly ENTITY_NODE: number;
  declare readonly PROCESSING_INSTRUCTION_NODE: number;
  declare readonly COMMENT_NODE: number;
  declare readonly DOCUMENT_NODE: number;
  declare readonly DOCUMENT_TYPE_NODE: number;
  declare readonly DOCUMENT_FRAGMENT_NODE: number;
  declare readonly NOTATION_NODE: number;
  declare readonly DOCUMENT_POSITION_DISCONNECTED: number;
  declare readonly DOCUMENT_POSITION_PRECEDING: number;
  declare readonly DOCUMENT_POSITION_FOLLOWING: number;
  declare readonly DOCUMENT_POSITION_CONTAINS: number;
  declare readonly DOCUMENT_POSITION_CONTAINED_BY: number;
  declare readonly DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC: number;

  [$impl]: NodeImpl;
  /** The live childNodes list, added on first access (see Element's lazily added fields). */
  declare [$childNodes]?: NodeList | null;

  /** @internal Wrappers are created by the document/parser, never directly by users. */
  constructor(type: number, doc: Document | null) {
    // Node, CharacterData, Element, Attr and DocumentType have no constructor in their IDL, so
    // `new Element()` & co. throw (https://webidl.spec.whatwg.org/#es-interface-call step 1;
    // https://dom.spec.whatwg.org/#interface-node). Internal callers always pass a document
    // (null for a Document, which is its own node document).
    if (doc === undefined) throw new TypeError("Illegal constructor");
    super();
    // A Document passes null and becomes its own node document.
    this[$impl] = new NodeImpl(this, type, doc ?? (this as unknown as Document));
  }

  get nodeType(): number {
    return this[$impl].type;
  }

  /**
   * https://dom.spec.whatwg.org/#dom-node-nodename
   *
   * One accessor on Node.prototype for every node type, as WebIDL puts it
   * (https://webidl.spec.whatwg.org/#es-attributes): libraries such as DOMPurify capture
   * `Object.getOwnPropertyDescriptor(Node.prototype, "nodeName").get` and call it on any node.
   */
  get nodeName(): string {
    const impl = this[$impl];
    switch (impl.type) {
      case ELEMENT_NODE:
        return htmlUppercasedQualifiedName(impl);
      case TEXT_NODE:
        return "#text";
      case COMMENT_NODE:
        return "#comment";
      case ATTRIBUTE_NODE:
        return impl.prefix === null ? impl.name : impl.prefix + ":" + impl.name;
      case CDATA_SECTION_NODE:
        return "#cdata-section";
      case DOCUMENT_NODE:
        return "#document";
      case DOCUMENT_FRAGMENT_NODE:
        return "#document-fragment";
      default:
        // ProcessingInstruction: its target; DocumentType: its name.
        return impl.name;
    }
  }

  get baseURI(): string {
    return this[$impl].doc.baseURI;
  }

  get isConnected(): boolean {
    return (this[$impl].flags & F_CONNECTED) !== 0;
  }

  get ownerDocument(): Document | null {
    const impl = this[$impl];
    return impl.type === DOCUMENT_NODE ? null : impl.doc;
  }

  /** https://dom.spec.whatwg.org/#dom-node-getrootnode */
  getRootNode(options?: GetRootNodeOptions): Node {
    let root = treeRoot(this[$impl]);
    if (options?.composed) {
      // Shadow-including root: https://dom.spec.whatwg.org/#concept-shadow-including-root
      while ((root.flags & F_SHADOW_ROOT) !== 0) {
        const host = (root.node as unknown as { [$host]: Element })[$host];
        root = treeRoot(host[$impl]);
      }
    }
    return root.node;
  }

  get parentNode(): Node | null {
    const p = this[$impl].parent;
    return p === null ? null : p.node;
  }

  get parentElement(): Element | null {
    const p = this[$impl].parent;
    return p !== null && p.type === ELEMENT_NODE ? (p.node as Element) : null;
  }

  hasChildNodes(): boolean {
    return this[$impl].first !== null;
  }

  get childNodes(): NodeList {
    return (this[$childNodes] ??= NodeList._live(this[$impl]));
  }

  get firstChild(): Node | null {
    const c = this[$impl].first;
    return c === null ? null : c.node;
  }

  get lastChild(): Node | null {
    const c = this[$impl].last;
    return c === null ? null : c.node;
  }

  get previousSibling(): Node | null {
    const c = this[$impl].prev;
    return c === null ? null : c.node;
  }

  get nextSibling(): Node | null {
    const c = this[$impl].next;
    return c === null ? null : c.node;
  }

  /** https://dom.spec.whatwg.org/#dom-node-nodevalue */
  get nodeValue(): string | null {
    const impl = this[$impl];
    switch (impl.type) {
      case ATTRIBUTE_NODE:
        return attrValue(this);
      case TEXT_NODE:
      case CDATA_SECTION_NODE:
      case PROCESSING_INSTRUCTION_NODE:
      case COMMENT_NODE:
        return impl.data;
      default:
        return null;
    }
  }

  /** https://dom.spec.whatwg.org/#dom-node-nodevalue (setter: null is treated as "") */
  set nodeValue(value: string | null) {
    const impl = this[$impl];
    switch (impl.type) {
      case ATTRIBUTE_NODE:
        setAttrValue(this, value === null || value === undefined ? "" : String(value));
        return;
      case TEXT_NODE:
      case CDATA_SECTION_NODE:
      case PROCESSING_INSTRUCTION_NODE:
      case COMMENT_NODE:
        replaceData(impl, 0, impl.data.length, value === null || value === undefined ? "" : String(value));
        return;
    }
  }

  /** https://dom.spec.whatwg.org/#dom-node-textcontent (get text content) */
  get textContent(): string | null {
    const impl = this[$impl];
    switch (impl.type) {
      case ELEMENT_NODE:
      case DOCUMENT_FRAGMENT_NODE:
        return descendantTextContent(impl);
      case TEXT_NODE:
      case CDATA_SECTION_NODE:
      case PROCESSING_INSTRUCTION_NODE:
      case COMMENT_NODE:
        return impl.data;
      case ATTRIBUTE_NODE:
        return attrValue(this);
      default:
        return null;
    }
  }

  /** https://dom.spec.whatwg.org/#dom-node-textcontent (set text content; null is treated as "") */
  set textContent(value: string | null) {
    const impl = this[$impl];
    const v = value === null || value === undefined ? "" : String(value);
    switch (impl.type) {
      case ELEMENT_NODE:
      case DOCUMENT_FRAGMENT_NODE:
        // https://dom.spec.whatwg.org/#string-replace-all
        replaceAll(v === "" ? null : impl.doc.createTextNode(v)[$impl], impl);
        return;
      case TEXT_NODE:
      case CDATA_SECTION_NODE:
      case PROCESSING_INSTRUCTION_NODE:
      case COMMENT_NODE:
        replaceData(impl, 0, impl.data.length, v);
        return;
      case ATTRIBUTE_NODE:
        setAttrValue(this, v);
        return;
    }
  }

  /** https://dom.spec.whatwg.org/#dom-node-normalize */
  normalize(): void {
    const root = this[$impl];
    let n = root.first;
    while (n !== null) {
      if (n.type !== TEXT_NODE) {
        n = nextInTree(n, root);
        continue;
      }
      // Step 1-2: drop empty exclusive Text nodes.
      let length = n.data.length;
      if (length === 0) {
        const after = nextSkippingSelf(n, root);
        remove(n, false);
        n = after;
        continue;
      }
      // Step 3: data of the contiguous exclusive Text nodes following n.
      let next = n.next;
      if (next === null || next.type !== TEXT_NODE) {
        n = nextInTree(n, root);
        continue;
      }
      let data = "";
      for (let c: NodeImpl | null = next; c !== null && c.type === TEXT_NODE; c = c.next) data += c.data;
      // Step 4: replace data with node n, offset length, count 0, and data.
      replaceData(n, length, 0, data);
      // Steps 5-6: move live range boundary points, then remove the merged siblings.
      let current: NodeImpl | null = next;
      while (current !== null && current.type === TEXT_NODE) {
        if (liveRangeCount !== 0) rangesNormalizeMerge(n, current, length);
        length += current.data.length;
        current = current.next;
      }
      while (next !== null && next.type === TEXT_NODE) {
        const following: NodeImpl | null = next.next;
        remove(next, false);
        next = following;
      }
      n = nextInTree(n, root);
    }
  }

  cloneNode(deep = false): Node {
    if ((this[$impl].flags & F_SHADOW_ROOT) !== 0) {
      throw new DOMException("Shadow roots cannot be cloned.", "NotSupportedError");
    }
    return cloneNode(this[$impl], this[$impl].doc, deep).node;
  }

  isEqualNode(other: Node | null): boolean {
    return other !== null && isEqualNode(this[$impl], other[$impl]);
  }

  isSameNode(other: Node | null): boolean {
    return this === other;
  }

  /** https://dom.spec.whatwg.org/#dom-node-comparedocumentposition */
  compareDocumentPosition(other: Node): number {
    if (this === other) return 0;
    let node1: NodeImpl | null = other[$impl];
    let node2: NodeImpl | null = this[$impl];
    let attr1: NodeImpl | null = null;
    let attr2: NodeImpl | null = null;
    if (node1.type === ATTRIBUTE_NODE) {
      attr1 = node1;
      node1 = ownerElementImpl(node1);
    }
    if (node2.type === ATTRIBUTE_NODE) {
      attr2 = node2;
      node2 = ownerElementImpl(node2);
      if (attr1 !== null && node1 !== null && node2 === node1) {
        for (const a of node2.attrs ?? []) {
          if (a.attr?.[$impl] === attr1) return DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC | DOCUMENT_POSITION_PRECEDING;
          if (a.attr?.[$impl] === attr2) return DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC | DOCUMENT_POSITION_FOLLOWING;
        }
      }
    }
    if (node1 === null || node2 === null || treeRoot(node1) !== treeRoot(node2)) {
      return (
        DOCUMENT_POSITION_DISCONNECTED |
        DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC |
        (stableOrder(node1 ?? attr1!, node2 ?? attr2!) ? DOCUMENT_POSITION_PRECEDING : DOCUMENT_POSITION_FOLLOWING)
      );
    }
    if ((attr1 === null && isAncestor(node1, node2)) || (attr2 !== null && node1 === node2)) {
      return DOCUMENT_POSITION_CONTAINS | DOCUMENT_POSITION_PRECEDING;
    }
    if ((attr2 === null && isAncestor(node2, node1)) || (attr1 !== null && node1 === node2)) {
      return DOCUMENT_POSITION_CONTAINED_BY | DOCUMENT_POSITION_FOLLOWING;
    }
    return precedes(node1, node2) ? DOCUMENT_POSITION_PRECEDING : DOCUMENT_POSITION_FOLLOWING;
  }

  /** https://dom.spec.whatwg.org/#dom-node-contains */
  contains(other: Node | null): boolean {
    if (other === null) return false;
    const self = this[$impl];
    for (let n: NodeImpl | null = other[$impl]; n !== null; n = n.parent) if (n === self) return true;
    return false;
  }

  /** https://dom.spec.whatwg.org/#dom-node-lookupprefix */
  lookupPrefix(namespace: string | null): string | null {
    if (namespace === null || namespace === undefined || namespace === "") return null;
    const el = namespaceContextElement(this[$impl]);
    return el === null ? null : locatePrefix(el, String(namespace));
  }

  /** https://dom.spec.whatwg.org/#dom-node-lookupnamespaceuri */
  lookupNamespaceURI(prefix: string | null): string | null {
    const p = prefix === undefined || prefix === null || prefix === "" ? null : String(prefix);
    return locateNamespace(this[$impl], p);
  }

  /** https://dom.spec.whatwg.org/#dom-node-isdefaultnamespace */
  isDefaultNamespace(namespace: string | null): boolean {
    const ns = namespace === undefined || namespace === null || namespace === "" ? null : String(namespace);
    return locateNamespace(this[$impl], null) === ns;
  }

  insertBefore<T extends Node>(node: T, child: Node | null): T {
    preInsert(node[$impl], this[$impl], child === null ? null : child[$impl]);
    return node;
  }

  appendChild<T extends Node>(node: T): T {
    preInsert(node[$impl], this[$impl], null);
    return node;
  }

  replaceChild<T extends Node>(node: Node, child: T): T {
    replace(child[$impl], node[$impl], this[$impl]);
    return child;
  }

  removeChild<T extends Node>(child: T): T {
    preRemove(child[$impl], this[$impl]);
    return child;
  }

  /** https://dom.spec.whatwg.org/#get-the-parent */
  override _getTheParent(event: Event): import("../events/EventTarget.ts").EventTarget | null {
    return nodeGetTheParent(this, event);
  }

  /** Node.js `util.inspect` / console.log: a short description, never the `_impl` graph. */
  [Symbol.for("nodejs.util.inspect.custom")](depth: number, options: unknown, inspect: unknown): string {
    return inspectNode(this[$impl], depth, options, inspect);
  }

  /** @internal Used by textContent/innerHTML setters. */
  _replaceAll(node: Node | null): void {
    replaceAll(node === null ? null : node[$impl], this[$impl]);
  }
}

// https://webidl.spec.whatwg.org/#es-constants — constants live on the interface object AND its prototype.
for (const key of Object.getOwnPropertyNames(Node)) {
  if (/^[A-Z_]+$/.test(key)) {
    Object.defineProperty(Node.prototype, key, {
      value: (Node as unknown as Record<string, number>)[key],
      enumerable: true,
    });
  }
}

/** Next node in tree order within root after `n` and its subtree. */
function nextSkippingSelf(n: NodeImpl, root: NodeImpl): NodeImpl | null {
  let cur: NodeImpl | null = n;
  while (cur !== null && cur !== root) {
    if (cur.next !== null) return cur.next;
    cur = cur.parent;
  }
  return null;
}

/** Element used by lookupPrefix for non-element nodes (https://dom.spec.whatwg.org/#dom-node-lookupprefix steps 2-6). */
function namespaceContextElement(n: NodeImpl): NodeImpl | null {
  switch (n.type) {
    case ELEMENT_NODE:
      return n;
    case DOCUMENT_NODE: {
      for (let c = n.first; c !== null; c = c.next) if (c.type === ELEMENT_NODE) return c;
      return null;
    }
    case DOCUMENT_TYPE_NODE:
    case DOCUMENT_FRAGMENT_NODE:
      return null;
    case ATTRIBUTE_NODE:
      return ownerElementImpl(n);
    default: {
      const p = n.parent;
      return p !== null && p.type === ELEMENT_NODE ? p : null;
    }
  }
}

/** https://dom.spec.whatwg.org/#locate-a-namespace-prefix */
function locatePrefix(el: NodeImpl, namespace: string): string | null {
  for (let e: NodeImpl | null = el; e !== null;) {
    if (e.ns === namespace && e.prefix !== null) return e.prefix;
    const attrs = e.attrs;
    if (attrs !== null) {
      for (let i = 0; i < attrs.length; i++) {
        const a = attrs[i];
        if (a.prefix === "xmlns" && a.value === namespace) return a.localName;
      }
    }
    const p: NodeImpl | null = e.parent;
    e = p !== null && p.type === ELEMENT_NODE ? p : null;
  }
  return null;
}

/** https://dom.spec.whatwg.org/#locate-a-namespace */
function locateNamespace(n: NodeImpl, prefix: string | null): string | null {
  let el = namespaceContextElement(n);
  while (el !== null) {
    if (prefix === "xml") return XML_NS;
    if (prefix === "xmlns") return XMLNS_NS;
    if (el.ns !== null && el.prefix === prefix) return el.ns;
    const attrs = el.attrs;
    if (attrs !== null) {
      for (let i = 0; i < attrs.length; i++) {
        const a = attrs[i];
        if (a.ns !== XMLNS_NS) continue;
        if (
          (a.prefix === "xmlns" && a.localName === prefix) ||
          (prefix === null && a.prefix === null && a.localName === "xmlns")
        ) {
          return a.value === "" ? null : a.value;
        }
      }
    }
    const p: NodeImpl | null = el.parent;
    el = p !== null && p.type === ELEMENT_NODE ? p : null;
  }
  return null;
}

function ownerElementImpl(attr: NodeImpl): NodeImpl | null {
  const el = (attr.node as unknown as { ownerElement: Element | null }).ownerElement;
  return el === null ? null : el[$impl];
}

function isAncestor(a: NodeImpl, b: NodeImpl): boolean {
  for (let n = b.parent; n !== null; n = n.parent) if (n === a) return true;
  return false;
}

/** Whether `a` precedes `b` in tree order (same tree, neither is an ancestor of the other). */
function precedes(a: NodeImpl, b: NodeImpl): boolean {
  // Find the children of the common ancestor on each path, then compare sibling order.
  const pathA: NodeImpl[] = [];
  for (let n: NodeImpl | null = a; n !== null; n = n.parent) pathA.push(n);
  const pathB: NodeImpl[] = [];
  for (let n: NodeImpl | null = b; n !== null; n = n.parent) pathB.push(n);
  let i = pathA.length - 1;
  let j = pathB.length - 1;
  while (i > 0 && j > 0 && pathA[i - 1] === pathB[j - 1]) {
    i--;
    j--;
  }
  const ca = pathA[i - 1];
  const cb = pathB[j - 1];
  for (let n = ca.next; n !== null; n = n.next) if (n === cb) return true;
  return false;
}

// Consistent ordering for disconnected nodes (spec: implementation-specific but consistent).
const order = new WeakMap<NodeImpl, number>();
let nextOrder = 0;
function stableOrder(a: NodeImpl, b: NodeImpl): boolean {
  let oa = order.get(a);
  if (oa === undefined) order.set(a, (oa = nextOrder++));
  let ob = order.get(b);
  if (ob === undefined) order.set(b, (ob = nextOrder++));
  return oa < ob;
}

/** Concatenation of the data of all Text descendants, in tree order (https://dom.spec.whatwg.org/#concept-descendant-text-content). */
export function descendantTextContent(root: NodeImpl): string {
  let s = "";
  for (let n = root.first; n !== null; n = nextInTree(n, root)) {
    if (n.type === TEXT_NODE || n.type === CDATA_SECTION_NODE) s += n.data;
  }
  return s;
}

type AttrWrapper = { [$record]: AttrRecord | null; [$owner]: Element | null };

/** An Attr's value: its record's value while attached, else its own (https://dom.spec.whatwg.org/#concept-attribute-value). */
export function attrValue(attr: Node): string {
  const r = (attr as unknown as AttrWrapper)[$record];
  return r === null ? attr[$impl].data : r.value;
}

/** https://dom.spec.whatwg.org/#set-an-existing-attribute-value */
export function setAttrValue(attr: Node, value: string): void {
  const r = (attr as unknown as AttrWrapper)[$record];
  const owner = (attr as unknown as AttrWrapper)[$owner];
  if (r === null || owner === null) attr[$impl].data = value;
  else changeAttribute(owner[$impl], r, value);
}

const upperNames = new Map<string, string>();

/** https://dom.spec.whatwg.org/#element-html-uppercased-qualified-name (Element.tagName / nodeName) */
export function htmlUppercasedQualifiedName(impl: NodeImpl): string {
  if (impl.prefix === null) {
    if ((impl.flags & F_HTML) === 0) return impl.name;
    let upper = upperNames.get(impl.name);
    if (upper === undefined) {
      // Bounded: generated custom element names would otherwise grow it for the whole process.
      if (upperNames.size >= 1024) upperNames.clear();
      upperNames.set(impl.name, (upper = asciiUppercase(impl.name)));
    }
    return upper;
  }
  const qualified = impl.prefix + ":" + impl.name;
  return (impl.flags & F_HTML) !== 0 ? asciiUppercase(qualified) : qualified;
}

/** https://infra.spec.whatwg.org/#ascii-uppercase */
function asciiUppercase(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0x80) {
      for (let j = 0; j < s.length; j++) {
        const d = s.charCodeAt(j);
        out += d >= 97 && d <= 122 ? String.fromCharCode(d - 32) : s[j];
      }
      return out;
    }
  }
  return s.toUpperCase();
}
