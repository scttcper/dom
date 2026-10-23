// Interface mixins shared by several node classes.
// https://dom.spec.whatwg.org/#interface-parentnode
// https://dom.spec.whatwg.org/#interface-childnode
// https://dom.spec.whatwg.org/#interface-nondocumenttypechildnode
// https://dom.spec.whatwg.org/#interface-nonelementparentnode
//
// Implemented once here and copied onto each including prototype with `install*`.
// TypeScript sees them through interface merging (`export interface Element extends ParentNode {}`).

import { DOCUMENT_FRAGMENT_NODE, ELEMENT_NODE } from "./constants.ts";
import type { Document } from "./Document.ts";
import type { Element } from "./Element.ts";
import type { Node } from "./Node.ts";
import type { NodeImpl } from "./NodeImpl.ts";
import {
  firstElementChild,
  lastElementChild,
  nextElementInTree,
  nextElementSibling,
  previousElementSibling,
} from "./traverse.ts";
import { move, preInsert, remove, replace, replaceAll, ensureReplaceAllValidity } from "./tree.ts";
import { querySelector, querySelectorAll } from "../selectors/index.ts";
import { HTMLCollection } from "../collections/HTMLCollection.ts";
import type { NodeList } from "../collections/NodeList.ts";
import { $children, $impl } from "../keys.ts";
import { argumentsRequired } from "../webidl-runtime.ts";

export interface ParentNode {
  readonly children: HTMLCollection;
  readonly firstElementChild: Element | null;
  readonly lastElementChild: Element | null;
  readonly childElementCount: number;
  prepend(...nodes: (Node | string)[]): void;
  append(...nodes: (Node | string)[]): void;
  replaceChildren(...nodes: (Node | string)[]): void;
  moveBefore(node: Node, child: Node | null): void;
  querySelector<E extends Element = Element>(selectors: string): E | null;
  querySelectorAll<E extends Element = Element>(selectors: string): NodeList & Iterable<E>;
}

export interface ChildNode {
  before(...nodes: (Node | string)[]): void;
  after(...nodes: (Node | string)[]): void;
  replaceWith(...nodes: (Node | string)[]): void;
  remove(): void;
}

export interface NonDocumentTypeChildNode {
  readonly previousElementSibling: Element | null;
  readonly nextElementSibling: Element | null;
}

export interface NonElementParentNode {
  getElementById(elementId: string): Element | null;
}

type Ctor = { prototype: object };

function define(target: Ctor, source: object): void {
  for (const key of Reflect.ownKeys(source)) {
    Object.defineProperty(target.prototype, key, Object.getOwnPropertyDescriptor(source, key)!);
  }
}

/** https://dom.spec.whatwg.org/#converting-nodes-into-a-node */
export function convertNodesIntoNode(nodes: (Node | string)[], doc: Document): NodeImpl {
  if (nodes.length === 1) return toNode(nodes[0], doc)[$impl];
  const fragment = doc.createDocumentFragment();
  for (const n of nodes) fragment.appendChild(toNode(n, doc));
  return fragment[$impl];
}

/** WebIDL `(Node or DOMString)`: anything that is not a Node is stringified. */
function toNode(n: unknown, doc: Document): Node {
  if (typeof n === "object" && n !== null && $impl in n) return n as Node;
  return doc.createTextNode(String(n));
}

/** WebIDL `Node` argument conversion. */
function nodeArg(value: unknown, method: string, position: number, self: NodeImpl): NodeImpl {
  if (typeof value === "object" && value !== null && $impl in value) return (value as Node)[$impl];
  throw new TypeError(`Failed to execute '${method}' on '${parentNodeInterface(self)}': parameter ${position} is not of type 'Node'.`);
}

/** The interface name used in ParentNode error messages. */
function parentNodeInterface(impl: NodeImpl): string {
  return impl.type === ELEMENT_NODE ? "Element" : impl.type === DOCUMENT_FRAGMENT_NODE ? "DocumentFragment" : "Document";
}

function wrap(n: NodeImpl | null): Element | null {
  return n === null ? null : (n.node as Element);
}

const parentNode = {
  get children(): HTMLCollection {
    const self = this as unknown as Node & { [$children]: HTMLCollection | null };
    return (self[$children] ??= HTMLCollection._childrenOf(self[$impl]));
  },
  get firstElementChild(): Element | null {
    return wrap(firstElementChild((this as unknown as Node)[$impl]));
  },
  get lastElementChild(): Element | null {
    return wrap(lastElementChild((this as unknown as Node)[$impl]));
  },
  get childElementCount(): number {
    let count = 0;
    for (let c = (this as unknown as Node)[$impl].first; c !== null; c = c.next) if (c.type === ELEMENT_NODE) count++;
    return count;
  },
  prepend(this: Node, ...nodes: (Node | string)[]): void {
    const impl = this[$impl];
    preInsert(convertNodesIntoNode(nodes, impl.doc), impl, impl.first);
  },
  append(this: Node, ...nodes: (Node | string)[]): void {
    const impl = this[$impl];
    preInsert(convertNodesIntoNode(nodes, impl.doc), impl, null);
  },
  replaceChildren(this: Node, ...nodes: (Node | string)[]): void {
    const impl = this[$impl];
    const node = convertNodesIntoNode(nodes, impl.doc);
    ensureReplaceAllValidity(node, impl);
    replaceAll(node, impl);
  },
  // https://dom.spec.whatwg.org/#dom-parentnode-movebefore
  moveBefore(this: Node, node: Node, child: Node | null): void {
    if (arguments.length < 2) argumentsRequired("moveBefore", parentNodeInterface(this[$impl]), 2, arguments.length);
    const n = nodeArg(node, "moveBefore", 1, this[$impl]);
    // Steps 1-2: referenceChild.
    let reference = child === null ? null : nodeArg(child, "moveBefore", 2, this[$impl]);
    if (reference === n) reference = n.next;
    // Step 3.
    move(n, this[$impl], reference);
  },
  // https://dom.spec.whatwg.org/#dom-parentnode-queryselector
  querySelector(this: Node, selectors: string): Element | null {
    if (arguments.length === 0) argumentsRequired("querySelector", parentNodeInterface(this[$impl]), 1, 0);
    return wrap(querySelector(this[$impl], String(selectors)));
  },
  // https://dom.spec.whatwg.org/#dom-parentnode-queryselectorall
  querySelectorAll(this: Node, selectors: string): NodeList {
    if (arguments.length === 0) argumentsRequired("querySelectorAll", parentNodeInterface(this[$impl]), 1, 0);
    return querySelectorAll(this[$impl], String(selectors));
  },
};

/** https://dom.spec.whatwg.org/#dom-childnode-before (and after/replaceWith/remove) */
const childNode = {
  before(this: Node, ...nodes: (Node | string)[]): void {
    const impl = this[$impl];
    const parent = impl.parent;
    if (parent === null) return;
    let viablePrevious = impl.prev;
    while (viablePrevious !== null && nodes.includes(viablePrevious.node)) viablePrevious = viablePrevious.prev;
    const node = convertNodesIntoNode(nodes, impl.doc);
    preInsert(node, parent, viablePrevious === null ? parent.first : viablePrevious.next);
  },
  after(this: Node, ...nodes: (Node | string)[]): void {
    const impl = this[$impl];
    const parent = impl.parent;
    if (parent === null) return;
    let viableNext = impl.next;
    while (viableNext !== null && nodes.includes(viableNext.node)) viableNext = viableNext.next;
    preInsert(convertNodesIntoNode(nodes, impl.doc), parent, viableNext);
  },
  replaceWith(this: Node, ...nodes: (Node | string)[]): void {
    const impl = this[$impl];
    const parent = impl.parent;
    if (parent === null) return;
    let viableNext = impl.next;
    while (viableNext !== null && nodes.includes(viableNext.node)) viableNext = viableNext.next;
    const node = convertNodesIntoNode(nodes, impl.doc);
    if (impl.parent === parent) replace(impl, node, parent);
    else preInsert(node, parent, viableNext);
  },
  remove(this: Node): void {
    const impl = this[$impl];
    if (impl.parent !== null) remove(impl, false);
  },
};

const nonDocumentTypeChildNode = {
  get previousElementSibling(): Element | null {
    return wrap(previousElementSibling((this as unknown as Node)[$impl]));
  },
  get nextElementSibling(): Element | null {
    return wrap(nextElementSibling((this as unknown as Node)[$impl]));
  },
};

const nonElementParentNode = {
  getElementById(this: Node, elementId: string): Element | null {
    const impl = this[$impl];
    const id = String(elementId);
    if (id === "") return null;
    if (impl.type !== DOCUMENT_FRAGMENT_NODE) return wrap((this as unknown as Document)._idLookup(id));
    for (let n = nextElementInTree(impl, impl); n !== null; n = nextElementInTree(n, impl)) {
      if (n.id === id) return n.node as Element;
    }
    return null;
  },
};

export function installParentNode(target: Ctor): void {
  define(target, parentNode);
  addUnscopables(target, ["prepend", "append", "replaceChildren"]);
}
export function installChildNode(target: Ctor): void {
  define(target, childNode);
  addUnscopables(target, ["before", "after", "replaceWith", "remove"]);
}

/** https://dom.spec.whatwg.org/#interface-childnode ([Unscopable] members). */
function addUnscopables(target: Ctor, names: string[]): void {
  const proto = target.prototype as Record<symbol, unknown>;
  let u = Object.getOwnPropertyDescriptor(proto, Symbol.unscopables)?.value as Record<string, boolean> | undefined;
  if (u === undefined) {
    u = Object.create(null) as Record<string, boolean>;
    Object.defineProperty(proto, Symbol.unscopables, { value: u, configurable: true });
  }
  for (const n of names) u[n] = true;
}
export function installNonDocumentTypeChildNode(target: Ctor): void {
  define(target, nonDocumentTypeChildNode);
}
export function installNonElementParentNode(target: Ctor): void {
  define(target, nonElementParentNode);
}
