// https://dom.spec.whatwg.org/#concept-create-element (minus custom element reactions, which
// the html agent layers on through the registry).
//
// The element-class lookup is late-bound: html/registry.ts installs it when evaluated. A
// static import here would create the cycle Node → clone → create → registry → Element → Node,
// and `class Element extends Node` would then run before Node is initialized. Keep base
// modules (Node, NodeImpl, tree, traverse, attributes) free of value imports of subclasses.

import type { Document } from "./Document.ts";
import type { Element } from "./Element.ts";
import type { NodeImpl } from "./NodeImpl.ts";
import { $impl } from "../keys.ts";

export type ElementConstructor = new (
  doc: Document,
  localName: string,
  ns: string | null,
  prefix: string | null,
) => Element;

let lookup: ((localName: string, ns: string | null) => ElementConstructor) | null = null;

export function setElementClassLookup(fn: (localName: string, ns: string | null) => ElementConstructor): void {
  lookup = fn;
}

/** Create an element wrapper of the right interface for (namespace, localName) and return its impl. */
export function createElementImpl(
  doc: Document,
  localName: string,
  ns: string | null,
  prefix: string | null,
): NodeImpl {
  const Ctor = lookup!(localName, ns);
  return new Ctor(doc, localName, ns, prefix)[$impl];
}

// --- custom elements (installed by html/custom-elements.ts) --------------------------------
// https://html.spec.whatwg.org/#custom-element-reactions
//
// Custom element reactions are queued by element hooks (connected/disconnected/attribute
// changed) and must run once the DOM operation that queued them has finished, never in the
// middle of a subtree walk. tree.ts (`insert`, `remove`) and attributes.ts
// (`handleAttributeChanges`) end with `if (ceReactionsPending) flushCEReactions();` — a single
// live-binding read when no custom elements are in use.

/** True while custom element reactions are queued. Written only via `setCEReactionsPending`. */
export let ceReactionsPending = false;
let ceFlush: (() => void) | null = null;

export function setCEReactionsPending(pending: boolean): void {
  ceReactionsPending = pending;
}

export function setCEReactionsFlush(fn: () => void): void {
  ceFlush = fn;
}

export function flushCEReactions(): void {
  if (ceFlush !== null) ceFlush();
}

type SyncCreate = (
  doc: Document,
  localName: string,
  ns: string | null,
  prefix: string | null,
  is: string | null,
) => NodeImpl | null;
let syncCreate: SyncCreate | null = null;

export function setCustomElementCreate(fn: SyncCreate): void {
  syncCreate = fn;
}

/**
 * https://dom.spec.whatwg.org/#concept-create-element with the synchronous custom elements
 * flag set (createElement / createElementNS): a defined custom element is constructed now.
 */
export function createElementImplSync(
  doc: Document,
  localName: string,
  ns: string | null,
  prefix: string | null,
  is: string | null,
): NodeImpl {
  if (syncCreate !== null) {
    const el = syncCreate(doc, localName, ns, prefix, is);
    if (el !== null) return el;
  }
  return createElementImpl(doc, localName, ns, prefix);
}

/**
 * True once custom elements are in use in this process (a definition exists, or an element got
 * an "is" value). Cloning and the HTML parser check it before calling the hooks below, so they
 * cost one live-binding read when custom elements are unused.
 */
export let ceActive = false;

export function setCEActive(): void {
  ceActive = true;
}

type CloneCreate = (doc: Document, source: NodeImpl) => NodeImpl;
type ParserCreated = (impl: NodeImpl) => void;
let cloneCreate: CloneCreate | null = null;
let parserCreated: ParserCreated | null = null;

export function setCustomElementCloneHooks(clone: CloneCreate, parser: ParserCreated): void {
  cloneCreate = clone;
  parserCreated = parser;
}

/**
 * https://dom.spec.whatwg.org/#concept-node-clone step 2.1: create an element with the source's
 * "is" value and the synchronous custom elements flag unset (a defined custom element gets an
 * upgrade reaction). Only call when `ceActive`.
 */
export function createCloneElementImpl(doc: Document, source: NodeImpl): NodeImpl {
  return cloneCreate!(doc, source);
}

/**
 * https://html.spec.whatwg.org/#create-an-element-for-the-token for an HTML element the parser
 * created (attributes already appended): the "is" value and upgrade reaction. Only call when
 * `ceActive`.
 */
export function ceParserCreated(impl: NodeImpl): void {
  parserCreated!(impl);
}
