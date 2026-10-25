// HTML parsing entry points used by the DOM.
// https://html.spec.whatwg.org/#parsing
// https://html.spec.whatwg.org/#html-fragment-parsing-algorithm
//
// The tokenizer (tokenizer.ts) and tree builder (treebuilder.ts) are pure (no DOM access);
// this file is the DOM side: `DomSink` turns tree-builder operations on integer
// handles into NodeImpl operations. Trees are always built DETACHED (into a DocumentFragment)
// with the fast `appendDetached` / `appendAttributeDetached` paths — no mutation records,
// hooks or version bumps — and then inserted with the normal DOM algorithms by the caller
// (innerHTML & co.) or by `parseDocument` itself, which is where connectedness, the id index
// and connected hooks are handled.

import {
  ELEMENT_NODE,
  F_CHILDREN_HOOK,
  HTML_NS,
  MATHML_NS,
  SVG_NS,
  TEXT_NODE,
  XLINK_NS,
  XML_NS,
  XMLNS_NS,
} from "../nodes/constants.ts";
import type { Document } from "../nodes/Document.ts";
import type { Element } from "../nodes/Element.ts";
import type { NodeImpl } from "../nodes/NodeImpl.ts";
import { ceActive, ceParserCreated, createElementImpl } from "../nodes/create.ts";
import { append, appendDetached, insertDetached, remove, adopt } from "../nodes/tree.ts";
import { appendAttributeDetached, findAttributeByName, attr } from "../nodes/attributes.ts";
import { Comment, ProcessingInstruction, Text } from "../nodes/CharacterData.ts";
import { DocumentFragment } from "../nodes/DocumentFragment.ts";
import { DocumentType } from "../nodes/DocumentType.ts";
import { T } from "../nodes/tags.ts";
import {
  ANS_XLINK,
  ANS_XML,
  ANS_XMLNS,
  MODE_LIMITED_QUIRKS,
  MODE_QUIRKS,
  NS_HTML,
  NS_MATHML,
  NS_OTHER,
  NS_SVG,
  ParseOptions,
  TreeBuilder,
  TreeSink,
} from "./treebuilder.ts";
import { attachShadowRoot } from "../nodes/Element.ts";

import { parseXMLFragment } from "./xml.ts";
import { $availableToElementInternals, $declarative, $host, $impl, $isHTML, $mode, $shadowRoot } from "../keys.ts";

export { parseXML, parseXMLFragment, PARSERERROR_NS } from "./xml.ts";

/** Options for the HTML parser entry points. */
export interface HTMLParseOptions {
  /** Scripting flag (affects <noscript>). Default false: like jsdom, scripts never run here. */
  scripting?: boolean;
  /** Declarative shadow roots (`<template shadowrootmode>`): setHTMLUnsafe / parseHTMLUnsafe. */
  allowDeclarativeShadowRoots?: boolean;
  /** Parse `<?target data?>` as processing instructions (2026 HTML change; default off). */
  processingInstructions?: boolean;
}

/** The DOM side of the tree builder. Handles index `nodes`. */
class DomSink extends TreeSink {
  nodes: NodeImpl[];
  /** Elements whose wrappers want `_childrenChangedSteps()` once their children are complete. */
  hooked: NodeImpl[];
  /** Document whose mode the parser sets (document parsing only). */
  modeTarget: Document | null;
  /** Namespace URI for NS_OTHER (fragment context in a non-HTML/SVG/MathML namespace). */
  otherNs: string | null;

  constructor() {
    super();
    this.nodes = [];
    this.hooked = [];
    this.modeTarget = null;
    this.otherNs = null;
  }

  begin(modeTarget: Document | null): void {
    this.nodes.length = 0;
    this.hooked.length = 0;
    this.modeTarget = modeTarget;
    this.otherNs = null;
  }

  /** Run children-changed hooks and drop references. */
  finish(): void {
    const hooked = this.hooked;
    for (let i = 0; i < hooked.length; i++) (hooked[i].node as Element)._childrenChangedSteps();
    hooked.length = 0;
    this.nodes.length = 0;
    this.modeTarget = null;
  }

  register(impl: NodeImpl): number {
    const nodes = this.nodes;
    nodes.push(impl);
    return nodes.length - 1;
  }

  private parentOf(parent: number, ref: number): NodeImpl {
    return parent >= 0 ? this.nodes[parent] : this.nodes[ref].parent!;
  }

  override createElement(
    name: string,
    ns: number,
    parent: number,
    ref: number,
    names: string[],
    values: string[],
    attrNs: number[],
    count: number,
    hasNs: boolean,
  ): number {
    const doc = this.parentOf(parent, ref).doc;
    const nsUri = ns === NS_HTML ? HTML_NS : ns === NS_SVG ? SVG_NS : ns === NS_MATHML ? MATHML_NS : this.otherNs;
    const el = createElementImpl(doc, name, nsUri, null);
    if (hasNs) {
      for (let i = 0; i < count; i++) {
        const a = attrNs[i];
        if (a === 0) appendAttributeDetached(el, names[i], values[i], null, null);
        else if (a === ANS_XLINK) appendAttributeDetached(el, names[i], values[i], XLINK_NS, "xlink");
        else if (a === ANS_XML) appendAttributeDetached(el, names[i], values[i], XML_NS, "xml");
        else if (a === ANS_XMLNS)
          appendAttributeDetached(el, names[i], values[i], XMLNS_NS, names[i] === "xmlns" ? null : "xmlns");
      }
    } else {
      for (let i = 0; i < count; i++) appendAttributeDetached(el, names[i], values[i], null, null);
    }
    // Custom elements: "is" value and upgrade reaction (html/custom-elements.ts).
    if (ceActive && ns === NS_HTML) ceParserCreated(el);
    if ((el.flags & F_CHILDREN_HOOK) !== 0) this.hooked.push(el);
    return this.register(el);
  }

  override insert(parent: number, ref: number, child: number): void {
    const c = this.nodes[child];
    const p = this.parentOf(parent, ref);
    if (c.parent !== null) remove(c, true);
    if (c.doc !== p.doc) adopt(c, p.doc);
    if (ref < 0) appendDetached(c, p);
    else insertDetached(c, p, this.nodes[ref]);
  }

  override insertText(parent: number, ref: number, text: string): void {
    const p = this.parentOf(parent, ref);
    const r = ref >= 0 ? this.nodes[ref] : null;
    const prev = r !== null ? r.prev : p.last;
    if (prev !== null && prev.type === TEXT_NODE) {
      prev.data += text;
      return;
    }
    const t = new Text(text, p.doc)[$impl];
    if (r === null) appendDetached(t, p);
    else insertDetached(t, p, r);
  }

  override insertComment(parent: number, ref: number, data: string): void {
    const p = this.parentOf(parent, ref);
    const c = new Comment(data, p.doc)[$impl];
    if (ref < 0) appendDetached(c, p);
    else insertDetached(c, p, this.nodes[ref]);
  }

  override insertProcessingInstruction(parent: number, ref: number, target: string, data: string): void {
    const p = this.parentOf(parent, ref);
    const c = new ProcessingInstruction(target, data, p.doc)[$impl];
    if (ref < 0) appendDetached(c, p);
    else insertDetached(c, p, this.nodes[ref]);
  }

  override insertDoctype(doc: number, name: string, publicId: string, systemId: string): void {
    const p = this.nodes[doc];
    // https://html.spec.whatwg.org/#the-initial-insertion-mode: only if no doctype/element child yet.
    for (let c = p.first; c !== null; c = c.next) if (c.type === ELEMENT_NODE || c.type === 10) return;
    appendDetached(new DocumentType(p.doc, name, publicId, systemId)[$impl], p);
  }

  override remove(child: number): void {
    const c = this.nodes[child];
    if (c.parent !== null) remove(c, true);
  }

  override hasParent(node: number): boolean {
    return this.nodes[node].parent !== null;
  }

  override reparentChildren(from: number, to: number): void {
    const f = this.nodes[from];
    const t = this.nodes[to];
    for (let c = f.first; c !== null; c = f.first) {
      remove(c, true);
      appendDetached(c, t);
    }
  }

  override addMissingAttributes(node: number, names: string[], values: string[], count: number): void {
    const el = this.nodes[node];
    if (el.type !== ELEMENT_NODE) return;
    for (let i = 0; i < count; i++) {
      if (findAttributeByName(el, names[i]) === null) appendAttributeDetached(el, names[i], values[i], null, null);
    }
  }

  override templateContents(template: number): number {
    const el = this.nodes[template];
    const content = (el.node as unknown as { content?: DocumentFragment }).content;
    if (content === undefined || content === null) return template;
    return this.register(content[$impl]);
  }

  override attachDeclarativeShadowRoot(
    host: number,
    mode: string,
    delegatesFocus: boolean,
    serializable: boolean,
    slotAssignment: string,
    clonable: boolean,
  ): number {
    const el = this.nodes[host].node as Element;
    if (el[$shadowRoot] != null) return -1;
    try {
      const shadow = attachShadowRoot(
        el,
        mode === "closed" ? "closed" : "open",
        clonable,
        serializable,
        delegatesFocus,
        slotAssignment === "manual" ? "manual" : "named",
      );
      shadow[$declarative] = true;
      shadow[$availableToElementInternals] = true;
      return this.register(shadow[$impl]);
    } catch {
      return -1;
    }
  }

  override associateForm(element: number, form: number): void {
    // TODO(html-forms): implement `_parserAssociateForm(form)` on form-associated elements
    // (https://html.spec.whatwg.org/#create-an-element-for-the-token, the "parser inserted" form owner).
    const el = this.nodes[element].node as unknown as { _parserAssociateForm?: (form: unknown) => void };
    if (typeof el._parserAssociateForm === "function") el._parserAssociateForm(this.nodes[form].node);
  }

  override setDocumentMode(mode: number): void {
    const doc = this.modeTarget;
    if (doc !== null)
      doc[$mode] = mode === MODE_QUIRKS ? "quirks" : mode === MODE_LIMITED_QUIRKS ? "limited-quirks" : "no-quirks";
  }
}

// One builder + sink, reused across parses; a nested parse (e.g. a custom element constructor
// that sets innerHTML while elements are being created) gets a fresh pair.
let shared: TreeBuilder | null = null;
let sharedBusy = false;

function acquire(): TreeBuilder {
  if (!sharedBusy) {
    sharedBusy = true;
    return (shared ??= new TreeBuilder(new DomSink()));
  }
  return new TreeBuilder(new DomSink());
}

function release(builder: TreeBuilder): void {
  if (builder === shared) sharedBusy = false;
}

const defaultOptions = new ParseOptions();
const scratchOptions = new ParseOptions();

function toOptions(options: HTMLParseOptions | undefined): ParseOptions {
  if (options === undefined) return defaultOptions;
  const o = scratchOptions;
  o.scripting = options.scripting === true;
  o.allowDeclarativeShadowRoots = options.allowDeclarativeShadowRoots === true;
  o.processingInstructions = options.processingInstructions === true;
  o.iframeSrcdoc = false;
  return o;
}

function nsCode(ns: string | null): number {
  if (ns === HTML_NS) return NS_HTML;
  if (ns === SVG_NS) return NS_SVG;
  if (ns === MATHML_NS) return NS_MATHML;
  return NS_OTHER;
}

/**
 * https://html.spec.whatwg.org/#html-fragment-parsing-algorithm
 * Parse `html` with `context` (an element) as the context element; returns a detached
 * DocumentFragment impl owned by the context's node document.
 */
export function parseFragment(html: string, context: NodeImpl, options?: HTMLParseOptions): NodeImpl {
  const doc = context.doc;
  // https://html.spec.whatwg.org/#fragment-parsing-algorithm-steps: XML documents use the XML
  // fragment parsing algorithm.
  if (!doc[$isHTML]) return parseXMLFragment(html, context);
  const fragment = new DocumentFragment(doc)[$impl];
  const builder = acquire();
  const sink = builder.sink as DomSink;
  try {
    sink.begin(null);
    const root = sink.register(fragment);
    const ctx = sink.register(context);
    const ns = nsCode(context.ns);
    if (ns === NS_OTHER) sink.otherNs = context.ns;
    let form = -1;
    for (let n: NodeImpl | null = context; n !== null; n = n.parent) {
      if (n.type === ELEMENT_NODE && n.tag === T.form && n.ns === HTML_NS) {
        form = sink.register(n);
        break;
      }
    }
    const mode = doc[$mode] === "quirks" ? MODE_QUIRKS : doc[$mode] === "limited-quirks" ? MODE_LIMITED_QUIRKS : 0;
    const encoding = ns === NS_MATHML ? (attr(context, "encoding") ?? "") : "";
    builder.parseFragment(html, root, ctx, context.name, ns, encoding, form, mode, toOptions(options));
    sink.finish();
  } finally {
    sink.nodes.length = 0;
    release(builder);
  }
  return fragment;
}

/**
 * https://html.spec.whatwg.org/#parsing — parse a whole document into `doc` (which must have
 * no children). Sets `doc._mode` (quirks detection).
 */
export function parseDocument(html: string, doc: Document, options?: HTMLParseOptions): void {
  const fragment = new DocumentFragment(doc)[$impl];
  const builder = acquire();
  const sink = builder.sink as DomSink;
  try {
    sink.begin(doc);
    doc[$mode] = "no-quirks";
    const root = sink.register(fragment);
    builder.parseDocument(html, root, toOptions(options));
    sink.finish();
  } finally {
    sink.nodes.length = 0;
    release(builder);
  }
  // Insert with the normal algorithm: connects the tree, fills the id index, runs hooks.
  append(fragment, doc[$impl]);
}

/**
 * https://html.spec.whatwg.org/#dom-element-sethtmlunsafe (and ShadowRoot.setHTMLUnsafe):
 * fragment-parse with declarative shadow roots allowed and replace all children of `target`
 * (an element — template elements receive the result in their contents — or a shadow root).
 */
export function setHTMLUnsafe(target: NodeImpl, html: string): void {
  let context = target;
  if (target.type !== ELEMENT_NODE) {
    const host = (target.node as unknown as { [$host]: Element | null })[$host];
    if (host === null) throw new TypeError("setHTMLUnsafe: no context element");
    context = host[$impl];
  }
  const fragment = parseFragment(html, context, { allowDeclarativeShadowRoots: true });
  let dest = target;
  if (target.type === ELEMENT_NODE && target.tag === T.template && target.ns === HTML_NS) {
    const content = (target.node as unknown as { content?: DocumentFragment }).content;
    if (content !== undefined) dest = content[$impl];
  }
  (dest.node as unknown as { _replaceAll(node: unknown): void })._replaceAll(fragment.node);
}

/**
 * https://html.spec.whatwg.org/#dom-parsehtmlunsafe — `doc` is a fresh HTML document (the
 * window agent creates it); declarative shadow roots are allowed.
 */
export function parseHTMLUnsafe(html: string, doc: Document): void {
  parseDocument(html, doc, { allowDeclarativeShadowRoots: true });
}
