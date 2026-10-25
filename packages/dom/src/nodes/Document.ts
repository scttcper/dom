// https://dom.spec.whatwg.org/#interface-document
// https://html.spec.whatwg.org/#the-document-object

import { argumentsRequired, hideInternals } from "../webidl-runtime.ts";
import { installEventHandlers } from "../events/handlers.ts";
import { DOCUMENT_NODE, ELEMENT_NODE, HTML_NS, SVG_NS, DOCUMENT_TYPE_NODE, F_CONNECTED } from "./constants.ts";
import { Node } from "./Node.ts";
import type { NodeImpl } from "./NodeImpl.ts";
import type { Element } from "./Element.ts";
import { Text, Comment, CDATASection, ProcessingInstruction } from "./CharacterData.ts";
import { DocumentFragment } from "./DocumentFragment.ts";
import { DocumentType } from "./DocumentType.ts";
import { Attr } from "./Attr.ts";
import { ceReactionsPending, createElementImplSync, flushCEReactions } from "./create.ts";
import { asciiLowercase, attr, isValidAttributeLocalName } from "./attributes.ts";
import { firstElementChild, nextElementInTree } from "./traverse.ts";
import { cloneNode } from "./clone.ts";
import { adopt } from "./tree.ts";
import {
  installNonElementParentNode,
  installParentNode,
  type NonElementParentNode,
  type ParentNode,
} from "./mixins.ts";
import { cachedCollection, getElementsByClassName, getElementsByTagName, getElementsByTagNameNS } from "./Element.ts";
import { isValidDoctypeName, isValidElementLocalName, isXMLName, validateAndExtract } from "./names.ts";
import { Range } from "../traversal/Range.ts";
import { TreeWalker, NodeIterator, type NodeFilterArg } from "../traversal/TreeWalker.ts";
import { Selection } from "../traversal/Selection.ts";
import { withNamedProperties, type HTMLCollection } from "../collections/HTMLCollection.ts";
import type { Window } from "../window/Window.ts";
import { T } from "./tags.ts";
import type { NodeList } from "../collections/NodeList.ts";
import { NameNodeList } from "../html/forms/collections.ts";
import type { ElementCreationOptions } from "../webidl.ts";
import type { Event } from "../events/Event.ts";
import { createEvent } from "../events/createEvent.ts";
import { parseDocument } from "../parser/index.ts";
import {
  $aboutBase,
  $baseFor,
  $baseOverride,
  $baseURL,
  $baseVersion,
  $contentType,
  $css,
  $derived,
  $doc,
  $focused,
  $forms,
  $ids,
  $impl,
  $implementation,
  $isHTML,
  $mode,
  $ranges,
  $selection,
  $styleVersion,
  $url,
  $version,
  $window,
  $writeBuffer,
} from "../keys.ts";

export class Document extends Node {
  /** Browsing context's window, or null for documents created via DOMImplementation / new Document(). */
  [$window]: Window | null;
  /** Bumped on every tree, attribute and character-data mutation of nodes owned by this document. */
  [$version]: number;
  /** Bumped when author style sheets change (src/css). */
  [$styleVersion]: number;
  /** Connected elements by id. A value is an array only when several connected elements share an id. */
  [$ids]: Map<string, NodeImpl | NodeImpl[]>;
  /** Focused element (https://html.spec.whatwg.org/#focused-area-of-the-document), null = viewport/body. */
  [$focused]: NodeImpl | null;
  [$isHTML]: boolean;
  [$contentType]: string;
  [$url]: string;
  [$mode]: "no-quirks" | "quirks" | "limited-quirks";
  [$implementation]: DOMImplementation | null;
  /** Opaque per-document state owned by src/css (style sheet list, rule index). */
  [$css]: object | null;
  /** Markup written since document.open() (null when no open() is in effect). */
  [$writeBuffer]: string | null;
  /** https://w3c.github.io/selection-api/#dfn-selection — created on first getSelection(). */
  [$selection]: Selection | null;
  /** Live ranges whose boundary points are in this document (traversal/live.ts); null when none. */
  [$ranges]: WeakRef<object>[] | null;
  /**
   * Derived per-document caches (selector results, label index, ...) keyed by owner token; see
   * nodes/derived.ts. Dropped whenever a node is removed from a tree of this document, so caches
   * never keep removed subtrees alive.
   */
  [$derived]: Map<object, unknown> | null;
  /** document.forms (named-properties proxy), created on first read. */
  [$forms]: HTMLCollection | null;
  /** https://html.spec.whatwg.org/#concept-document-about-base-url (about:blank / about:srcdoc documents of nested browsing contexts). */
  [$aboutBase]: string | null;
  /** https://dom.spec.whatwg.org/#document-base-url-override (set when cloning a document). */
  [$baseOverride]: string | null;
  /** Cached document base URL, valid while `[$baseVersion] === [$version]` and `[$baseFor] === [$url]`. */
  [$baseURL]: string;
  [$baseVersion]: number;
  [$baseFor]: string;

  constructor() {
    super(DOCUMENT_NODE, null);
    // A document is the root of its own tree, so it is always connected.
    this[$impl].flags |= F_CONNECTED;
    this[$window] = null;
    this[$version] = 0;
    this[$styleVersion] = 0;
    this[$ids] = new Map();
    this[$focused] = null;
    this[$isHTML] = false;
    this[$contentType] = "application/xml";
    this[$url] = "about:blank";
    this[$mode] = "no-quirks";
    this[$implementation] = null;
    this[$css] = null;
    this[$writeBuffer] = null;
    this[$selection] = null;
    this[$forms] = null;
    this[$ranges] = null;
    this[$derived] = null;
    this[$aboutBase] = null;
    this[$baseOverride] = null;
    this[$baseURL] = "";
    this[$baseVersion] = -1;
    this[$baseFor] = "";
    // Documents are few: hide their internals so object walks (Jest's diff printer) stop here
    // instead of following [$window] into the host global (see Window's constructor).
    hideInternals(this);
  }

  /** @internal Create an HTML document (what a Window and DOMImplementation.createHTMLDocument use). */
  static _createHTML(window: Window | null, url = "about:blank"): Document {
    const doc = new Document();
    doc[$window] = window;
    doc[$isHTML] = true;
    doc[$contentType] = "text/html";
    doc[$url] = url;
    return doc;
  }

  // --- id index ---------------------------------------------------------------------------

  /** @internal */
  _idAdd(el: NodeImpl): void {
    const id = el.id;
    const existing = this[$ids].get(id);
    if (existing === undefined) this[$ids].set(id, el);
    else if (Array.isArray(existing)) existing.push(el);
    else this[$ids].set(id, [existing, el]);
  }

  /** @internal */
  _idRemove(el: NodeImpl): void {
    const id = el.id;
    const existing = this[$ids].get(id);
    if (existing === undefined) return;
    if (existing === el) {
      this[$ids].delete(id);
    } else if (Array.isArray(existing)) {
      const i = existing.indexOf(el);
      if (i !== -1) existing.splice(i, 1);
      if (existing.length === 1) this[$ids].set(id, existing[0]);
    }
  }

  /** @internal First connected element in tree order with this id. */
  _idLookup(id: string): NodeImpl | null {
    const found = this[$ids].get(id);
    if (found === undefined) return null;
    if (!Array.isArray(found)) return found;
    // Duplicate ids: resolve tree order by walking (rare).
    const root = this[$impl];
    for (let n = nextElementInTree(root, root); n !== null; n = nextElementInTree(n, root)) {
      if (n.id === id) return n;
    }
    return null;
  }

  // --- properties -------------------------------------------------------------------------

  get URL(): string {
    return this[$url];
  }

  get documentURI(): string {
    return this[$url];
  }

  /**
   * https://html.spec.whatwg.org/#document-base-url — version-stamped, so repeated reads (every
   * `a.href`) cost one compare between mutations.
   */
  override get baseURI(): string {
    if (this[$baseVersion] === this[$version] && this[$baseFor] === this[$url]) return this[$baseURL];
    const url = documentBaseURL(this);
    this[$baseURL] = url;
    this[$baseVersion] = this[$version];
    this[$baseFor] = this[$url];
    return url;
  }

  get compatMode(): string {
    return this[$mode] === "quirks" ? "BackCompat" : "CSS1Compat";
  }

  get characterSet(): string {
    return "UTF-8";
  }

  get charset(): string {
    return "UTF-8";
  }

  get inputEncoding(): string {
    return "UTF-8";
  }

  get contentType(): string {
    return this[$contentType];
  }

  get defaultView(): Window | null {
    return this[$window];
  }

  get implementation(): DOMImplementation {
    return (this[$implementation] ??= new DOMImplementation(this));
  }

  get doctype(): DocumentType | null {
    for (let c = this[$impl].first; c !== null; c = c.next)
      if (c.type === DOCUMENT_TYPE_NODE) return c.node as DocumentType;
    return null;
  }

  get documentElement(): Element | null {
    const el = firstElementChild(this[$impl]);
    return el === null ? null : (el.node as Element);
  }

  /** https://html.spec.whatwg.org/#dom-document-head */
  get head(): Element | null {
    const html = firstElementChild(this[$impl]);
    if (html === null || html.tag !== T.html) return null;
    for (let c = html.first; c !== null; c = c.next)
      if (c.type === ELEMENT_NODE && c.tag === T.head) return c.node as Element;
    return null;
  }

  /** https://html.spec.whatwg.org/#dom-document-body */
  get body(): Element | null {
    const html = firstElementChild(this[$impl]);
    if (html === null || html.tag !== T.html) return null;
    for (let c = html.first; c !== null; c = c.next) {
      if (c.type === ELEMENT_NODE && (c.tag === T.body || c.tag === T.frameset)) return c.node as Element;
    }
    return null;
  }

  /** https://html.spec.whatwg.org/#dom-document-body (setter) */
  set body(value: Element | null) {
    const impl = value === null || value === undefined ? null : value[$impl];
    // Step 1.
    if (impl === null || impl.ns !== HTML_NS || (impl.tag !== T.body && impl.tag !== T.frameset)) {
      throw new DOMException("The new body element must be a 'body' or 'frameset' element.", "HierarchyRequestError");
    }
    // Step 2.
    const current = this.body;
    if (value === current) return;
    // Step 3.
    if (current !== null) {
      current.parentNode!.replaceChild(value!, current);
      return;
    }
    // Steps 4-5.
    const root = this.documentElement;
    if (root === null) throw new DOMException("The document has no document element.", "HierarchyRequestError");
    root.appendChild(value!);
  }

  // --- factories --------------------------------------------------------------------------

  /** https://dom.spec.whatwg.org/#dom-document-createelement */
  createElement(localName: string, _options?: string | ElementCreationOptions): Element {
    let name = String(localName);
    if (!isValidElementLocalName(name)) {
      throw new DOMException(`"${name}" is not a valid element name.`, "InvalidCharacterError");
    }
    if (this[$isHTML]) name = asciiLowercase(name);
    const ns = this[$isHTML] || this[$contentType] === "application/xhtml+xml" ? HTML_NS : null;
    // Synchronous custom element construction + customized built-ins (`is`): html/custom-elements.ts.
    const is =
      typeof _options === "object" && _options !== null && _options.is !== undefined ? String(_options.is) : null;
    return createElementImplSync(this, name, ns, null, is).node as Element;
  }

  /** https://dom.spec.whatwg.org/#dom-document-createelementns */
  createElementNS(
    namespace: string | null,
    qualifiedName: string,
    _options?: string | ElementCreationOptions,
  ): Element {
    const {
      namespace: ns,
      prefix,
      localName,
    } = validateAndExtract(namespace === undefined ? null : namespace, String(qualifiedName), "element");
    const is =
      typeof _options === "object" && _options !== null && _options.is !== undefined ? String(_options.is) : null;
    return createElementImplSync(this, localName, ns, prefix, is).node as Element;
  }

  createDocumentFragment(): DocumentFragment {
    return new DocumentFragment(this);
  }

  createTextNode(data: string): Text {
    return new Text(String(data), this);
  }

  createCDATASection(data: string): CDATASection {
    if (this[$isHTML])
      throw new DOMException("CDATA sections are not supported in HTML documents.", "NotSupportedError");
    if (String(data).includes("]]>")) throw new DOMException('Data contains "]]>".', "InvalidCharacterError");
    return new CDATASection(String(data), this);
  }

  createComment(data: string): Comment {
    return new Comment(String(data), this);
  }

  /** https://dom.spec.whatwg.org/#dom-document-createprocessinginstruction */
  createProcessingInstruction(target: string, data: string): ProcessingInstruction {
    if (!isXMLName(String(target)))
      throw new DOMException(`"${target}" is not a valid processing instruction target.`, "InvalidCharacterError");
    if (String(data).includes("?>")) throw new DOMException('Data contains "?>".', "InvalidCharacterError");
    return new ProcessingInstruction(String(target), String(data), this);
  }

  createAttribute(localName: string): Attr {
    let name = String(localName);
    if (!isValidAttributeLocalName(name))
      throw new DOMException(`"${name}" is not a valid attribute name.`, "InvalidCharacterError");
    if (this[$isHTML]) name = asciiLowercase(name);
    return new Attr(this, name, "", null, null, null);
  }

  createAttributeNS(namespace: string | null, qualifiedName: string): Attr {
    const {
      namespace: ns,
      prefix,
      localName,
    } = validateAndExtract(namespace === undefined ? null : namespace, String(qualifiedName), "attribute");
    return new Attr(this, localName, "", ns, prefix, null);
  }

  /** https://dom.spec.whatwg.org/#dom-document-importnode */
  importNode<T extends Node>(node: T, deep = false): T {
    if (node[$impl].type === DOCUMENT_NODE || (node[$impl].flags & 0x20) !== 0) {
      throw new DOMException("Documents and shadow roots cannot be imported.", "NotSupportedError");
    }
    return cloneNode(node[$impl], this, deep).node as T;
  }

  /** https://dom.spec.whatwg.org/#dom-document-adoptnode */
  adoptNode<T extends Node>(node: T): T {
    if (node[$impl].type === DOCUMENT_NODE) throw new DOMException("Documents cannot be adopted.", "NotSupportedError");
    if ((node[$impl].flags & 0x20) !== 0)
      throw new DOMException("Shadow roots cannot be adopted.", "HierarchyRequestError");
    adopt(node[$impl], this);
    // [CEReactions]: adoptedCallback reactions (html/custom-elements.ts).
    if (ceReactionsPending) flushCEReactions();
    return node;
  }

  getElementsByTagName(qualifiedName: string): HTMLCollection {
    return getElementsByTagName(this[$impl], String(qualifiedName));
  }

  getElementsByTagNameNS(namespace: string | null, localName: string): HTMLCollection {
    return getElementsByTagNameNS(this[$impl], namespace, String(localName));
  }

  getElementsByClassName(classNames: string): HTMLCollection {
    return getElementsByClassName(this[$impl], String(classNames));
  }

  /** https://html.spec.whatwg.org/#dom-document-getelementsbyname */
  getElementsByName(elementName: string): NodeList {
    return new NameNodeList(this[$impl], String(elementName));
  }

  // --- HTML document collections (https://html.spec.whatwg.org/#dom-document-forms and following) ---

  /** document.forms supports named access (`document.forms.login`), so it is the Proxy-wrapped variant. */
  get forms(): HTMLCollection {
    return (this[$forms] ??= withNamedProperties(
      cachedCollection(this[$impl], "\u0001forms", (el) => el.tag === T.form && el.ns === HTML_NS),
    ));
  }

  get images(): HTMLCollection {
    return cachedCollection(this[$impl], "\u0001images", (el) => el.tag === T.img && el.ns === HTML_NS);
  }

  get embeds(): HTMLCollection {
    return cachedCollection(this[$impl], "\u0001embeds", (el) => el.tag === T.embed && el.ns === HTML_NS);
  }

  get plugins(): HTMLCollection {
    return this.embeds;
  }

  get scripts(): HTMLCollection {
    return cachedCollection(this[$impl], "\u0001scripts", (el) => el.tag === T.script && el.ns === HTML_NS);
  }

  /** a and area elements with an href attribute. */
  get links(): HTMLCollection {
    return cachedCollection(
      this[$impl],
      "\u0001links",
      (el) => (el.tag === T.a || el.tag === T.area) && el.ns === HTML_NS && attr(el, "href") !== null,
    );
  }

  /** a elements with a name attribute. */
  get anchors(): HTMLCollection {
    return cachedCollection(
      this[$impl],
      "\u0001anchors",
      (el) => el.tag === T.a && el.ns === HTML_NS && attr(el, "name") !== null,
    );
  }

  get applets(): HTMLCollection {
    return cachedCollection(this[$impl], "\u0001applets", () => false);
  }

  // --- ranges, traversal, selection --------------------------------------------------------

  /** https://dom.spec.whatwg.org/#dom-document-createrange */
  createRange(): Range {
    return new Range(this);
  }

  /** https://dom.spec.whatwg.org/#dom-document-createtreewalker */
  createTreeWalker(root: Node, whatToShow = 0xffffffff, filter: NodeFilterArg = null): TreeWalker {
    return new TreeWalker(root, whatToShow, filter);
  }

  /** https://dom.spec.whatwg.org/#dom-document-createnodeiterator */
  createNodeIterator(root: Node, whatToShow = 0xffffffff, filter: NodeFilterArg = null): NodeIterator {
    return new NodeIterator(root, whatToShow, filter);
  }

  /** https://w3c.github.io/selection-api/#dom-document-getselection */
  getSelection(): Selection | null {
    // "the selection associated with this if this has an associated browsing context, and null otherwise"
    if (this[$window] === null) return null;
    return (this[$selection] ??= new Selection(this));
  }

  /**
   * https://html.spec.whatwg.org/#dom-document-open — simplified for tests: there is no
   * script-inserted parser, so open() empties the document and starts a write buffer that each
   * write() re-parses synchronously (content is queryable right after write(), as in browsers).
   * `open(url, name, features)` is window.open.
   */
  open(...args: unknown[]): Document | Window | null {
    if (args.length >= 3)
      return (this[$window] as unknown as { open?: (...a: unknown[]) => Window | null })?.open?.(...args) ?? null;
    if (!this[$isHTML]) throw new DOMException("Only HTML documents can be opened.", "InvalidStateError");
    this._replaceAll(null);
    this[$writeBuffer] = "";
    return this;
  }

  /** https://html.spec.whatwg.org/#dom-document-write */
  write(...text: string[]): void {
    if (!this[$isHTML]) throw new DOMException("Only HTML documents can be written to.", "InvalidStateError");
    // No open insertion point: write() implicitly runs the document open steps.
    if (this[$writeBuffer] === null) this.open();
    this[$writeBuffer] += text.map(String).join("");
    this._replaceAll(null);
    parseDocument(this[$writeBuffer]!, this);
  }

  /** https://html.spec.whatwg.org/#dom-document-writeln */
  writeln(...text: string[]): void {
    this.write(...text, "\n");
  }

  /** https://html.spec.whatwg.org/#dom-document-close */
  close(): void {
    if (!this[$isHTML]) throw new DOMException("Only HTML documents can be closed.", "InvalidStateError");
    this[$writeBuffer] = null;
  }

  /** @internal Clone steps for Document nodes (cloneNode on a document). */
  _cloneDocument(): Document {
    // https://dom.spec.whatwg.org/#concept-node-clone step 2.1: same interface (XMLDocument stays XMLDocument).
    const doc = this instanceof XMLDocument ? new XMLDocument() : new Document();
    // Step 2.1 (continued): copy's base URL override is node's base URL.
    doc[$baseOverride] = this.baseURI;
    doc[$isHTML] = this[$isHTML];
    doc[$contentType] = this[$contentType];
    doc[$url] = this[$url];
    doc[$mode] = this[$mode];
    return doc;
  }

  /** https://dom.spec.whatwg.org/#dom-document-createevent (table and algorithm in events/createEvent.ts) */
  createEvent(interfaceName: string): Event {
    if (arguments.length === 0)
      throw new TypeError("Failed to execute 'createEvent' on 'Document': 1 argument required, but only 0 present.");
    return createEvent(interfaceName);
  }

  /** https://dom.spec.whatwg.org/#get-the-parent — a document's parent is its window for non-load events. */
  override _getTheParent(event: Event): import("../events/EventTarget.ts").EventTarget | null {
    if (event.type === "load" || this[$window] === null) return null;
    return this[$window] as unknown as import("../events/EventTarget.ts").EventTarget;
  }
}

export interface Document extends ParentNode, NonElementParentNode {}
installParentNode(Document);
installNonElementParentNode(Document);
installEventHandlers(Document.prototype, "document"); // GlobalEventHandlers + onreadystatechange/onvisibilitychange

/** https://html.spec.whatwg.org/#document-base-url */
function documentBaseURL(doc: Document): string {
  // https://html.spec.whatwg.org/#fallback-base-url
  const url = doc[$url];
  const fallback =
    doc[$aboutBase] !== null && (url === "about:blank" || url === "about:srcdoc") ? doc[$aboutBase] : url;
  const root = doc[$impl];
  // Step 1: the frozen base URL of the first base element with an href attribute, in tree order.
  for (let n = nextElementInTree(root, root); n !== null; n = nextElementInTree(n, root)) {
    if (n.tag !== T.base || n.ns !== HTML_NS) continue;
    const href = attr(n, "href");
    if (href === null) continue;
    // https://html.spec.whatwg.org/#set-the-frozen-base-url steps 2-4.
    const parsed = URL.parse(href, fallback);
    if (parsed === null || parsed.protocol === "data:" || parsed.protocol === "javascript:") return fallback;
    return parsed.href;
  }
  // Step 2-3.
  return doc[$baseOverride] ?? fallback;
}

/**
 * https://dom.spec.whatwg.org/#xmldocument — what DOMImplementation.createDocument() returns
 * (https://dom.spec.whatwg.org/#dom-domimplementation-createdocument step 1). No members of its
 * own (the HTML `load()` extension is not implemented: no network).
 */
export class XMLDocument extends Document {}
Object.defineProperty(XMLDocument.prototype, Symbol.toStringTag, { value: "XMLDocument", configurable: true });

/** https://dom.spec.whatwg.org/#interface-domimplementation */
export class DOMImplementation {
  [$doc]: Document;

  /** @internal Use document.implementation. */
  constructor(doc: Document) {
    if (!(doc instanceof Document)) throw new TypeError("Illegal constructor");
    this[$doc] = doc;
  }

  /** https://dom.spec.whatwg.org/#dom-domimplementation-createdocumenttype */
  createDocumentType(qualifiedName: string, publicId: string, systemId: string): DocumentType {
    if (!isValidDoctypeName(String(qualifiedName)))
      throw new DOMException(`"${qualifiedName}" is not a valid doctype name.`, "InvalidCharacterError");
    return new DocumentType(this[$doc], String(qualifiedName), String(publicId), String(systemId));
  }

  createHTMLDocument(title?: string): Document {
    const doc = Document._createHTML(null);
    doc.appendChild(new DocumentType(doc, "html", "", ""));
    const html = doc.createElement("html");
    doc.appendChild(html);
    const head = doc.createElement("head");
    html.appendChild(head);
    if (title !== undefined) {
      const t = doc.createElement("title");
      t.appendChild(doc.createTextNode(String(title)));
      head.appendChild(t);
    }
    html.appendChild(doc.createElement("body"));
    return doc;
  }

  /** https://dom.spec.whatwg.org/#dom-domimplementation-createdocument */
  createDocument(
    namespace: string | null,
    qualifiedName: string | null,
    doctype: DocumentType | null = null,
  ): XMLDocument {
    if (arguments.length < 2) argumentsRequired("createDocument", "DOMImplementation", 2, arguments.length);
    // Step 1: a new XMLDocument.
    const doc = new XMLDocument();
    if (namespace === HTML_NS) doc[$contentType] = "application/xhtml+xml";
    else if (namespace === SVG_NS) doc[$contentType] = "image/svg+xml";
    if (doctype !== null) doc.appendChild(doctype);
    if (qualifiedName !== null && qualifiedName !== "") doc.appendChild(doc.createElementNS(namespace, qualifiedName));
    return doc;
  }

  hasFeature(): boolean {
    return true;
  }
}
