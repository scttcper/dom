// Document metadata elements with document-level effects: <title> (and document.title),
// <style>, <link>, <script>.
// https://html.spec.whatwg.org/#the-title-element
// https://html.spec.whatwg.org/#the-style-element
// https://html.spec.whatwg.org/#the-link-element
// https://html.spec.whatwg.org/#the-script-element
//
// Style sheets: this module decides WHEN a <style>/<link> element's sheet must be (re)created
// ("update a style block", https://html.spec.whatwg.org/#update-a-style-block) and delegates
// the sheet itself to the css area through `styleSheetHooks`, which src/css installs:
//
//   import { styleSheetHooks } from "../html/resources.ts";
//   styleSheetHooks.createSheet = (ownerImpl, text, media) => new CSSStyleSheet(...);
//   styleSheetHooks.removeSheet = (ownerImpl, sheet) => { ...; doc._styleVersion++ };
//
// <link rel=stylesheet> never fetches (no network); its sheet stays null unless the css area
// provides `createLinkSheet` (e.g. for data: URLs). <script> never executes.

import { HTMLElement } from "./HTMLElement.ts";
import {
  bool,
  contentAttr,
  CROSS_ORIGIN,
  enumerated,
  FETCH_PRIORITY,
  REFERRER_POLICY,
  str,
  tokenList,
  url,
} from "./reflect.ts";
import { Document } from "../nodes/Document.ts";
import type { NodeImpl } from "../nodes/NodeImpl.ts";
import type { Element } from "../nodes/Element.ts";
import {
  CDATA_SECTION_NODE,
  ELEMENT_NODE,
  F_ATTR_HOOK,
  F_CHILDREN_HOOK,
  F_CONNECT_HOOK,
  F_CONNECTED,
  HTML_NS,
  SVG_NS,
  TEXT_NODE,
} from "../nodes/constants.ts";
import { T } from "../nodes/tags.ts";
import { firstElementChild, nextElementInTree } from "../nodes/traverse.ts";
import { $impl, $styleVersion } from "../keys.ts";

export interface StyleSheetHooks {
  /** Create the CSS style sheet for a <style> element (or SVG <style>) from its child text. */
  createSheet: ((owner: NodeImpl, text: string, media: string) => object) | null;
  /** The element's sheet is going away (disconnected, emptied, type changed). */
  removeSheet: ((owner: NodeImpl, sheet: object) => void) | null;
  /** Optional: a sheet for <link rel=stylesheet> (no fetching happens here). */
  createLinkSheet: ((owner: NodeImpl, href: string, media: string) => object | null) | null;
}

export const styleSheetHooks: StyleSheetHooks = { createSheet: null, removeSheet: null, createLinkSheet: null };

const SHEET = Symbol("sheet");

function getSheet(el: Element): object | null {
  return (el as unknown as Record<symbol, object | null | undefined>)[SHEET] ?? null;
}

function setSheet(el: Element, sheet: object | null): void {
  Object.defineProperty(el, SHEET, { value: sheet, writable: true, configurable: true });
}

/** The CSS style sheet associated with a <style>/<link> element (for document.styleSheets). */
export function associatedSheet(impl: NodeImpl): object | null {
  return getSheet(impl.node as Element);
}

/** https://html.spec.whatwg.org/#child-text-content */
export function childTextContent(impl: NodeImpl): string {
  let s = "";
  for (let c = impl.first; c !== null; c = c.next)
    if (c.type === TEXT_NODE || c.type === CDATA_SECTION_NODE) s += c.data;
  return s;
}

function removeAssociatedSheet(el: Element): void {
  const sheet = getSheet(el);
  if (sheet === null) return;
  setSheet(el, null);
  styleSheetHooks.removeSheet?.(el[$impl], sheet);
}

/** https://html.spec.whatwg.org/#update-a-style-block */
export function updateStyleBlock(el: Element): void {
  const impl = el[$impl];
  removeAssociatedSheet(el);
  if ((impl.flags & F_CONNECTED) === 0) return;
  // Shadow trees count (connected flag covers shadow-including roots).
  const type = contentAttr(impl, "type");
  if (type !== null && type !== "" && type.toLowerCase() !== "text/css") return;
  const create = styleSheetHooks.createSheet;
  if (create === null) {
    impl.doc[$styleVersion]++;
    return;
  }
  setSheet(el, create(impl, childTextContent(impl), contentAttr(impl, "media") ?? ""));
}

// --- <style> ----------------------------------------------------------------------------------

export class HTMLStyleElement extends HTMLElement {
  constructor(doc?: Document, localName?: string, ns?: string | null, prefix?: string | null) {
    super(doc, localName, ns, prefix);
    this[$impl].flags |= F_CONNECT_HOOK | F_CHILDREN_HOOK | F_ATTR_HOOK;
  }

  override _connectedSteps(): void {
    super._connectedSteps();
    updateStyleBlock(this);
  }

  override _disconnectedSteps(): void {
    super._disconnectedSteps();
    updateStyleBlock(this);
  }

  override _childrenChangedSteps(): void {
    updateStyleBlock(this);
  }

  override _attributeChangedSteps(
    localName: string,
    oldValue: string | null,
    value: string | null,
    namespace: string | null,
  ): void {
    super._attributeChangedSteps(localName, oldValue, value, namespace);
    if (namespace === null && (localName === "type" || localName === "media")) updateStyleBlock(this);
  }

  get sheet(): object | null {
    return getSheet(this);
  }

  /** https://html.spec.whatwg.org/#dom-style-disabled */
  get disabled(): boolean {
    const sheet = getSheet(this) as { disabled?: boolean } | null;
    return sheet !== null && sheet.disabled === true;
  }

  set disabled(v: boolean) {
    const sheet = getSheet(this) as { disabled?: boolean } | null;
    if (sheet !== null) sheet.disabled = !!v;
  }
}
str(HTMLStyleElement, "media type");
tokenList(HTMLStyleElement, "blocking", "blocking", ["render"]);

// --- <link> -----------------------------------------------------------------------------------

function isStylesheetLink(impl: NodeImpl): boolean {
  const rel = contentAttr(impl, "rel");
  if (rel === null) return false;
  return (
    /(?:^|[\t\n\f\r ])stylesheet(?:$|[\t\n\f\r ])/i.test(rel) &&
    !/(?:^|[\t\n\f\r ])alternate(?:$|[\t\n\f\r ])/i.test(rel)
  );
}

function updateLinkSheet(el: HTMLLinkElement): void {
  const impl = el[$impl];
  removeAssociatedSheet(el);
  if ((impl.flags & F_CONNECTED) === 0 || !isStylesheetLink(impl) || contentAttr(impl, "disabled") !== null) return;
  const create = styleSheetHooks.createLinkSheet;
  if (create === null) return;
  const href = contentAttr(impl, "href");
  if (href === null || href === "") return;
  const sheet = create(impl, (el as unknown as { href: string }).href, contentAttr(impl, "media") ?? "");
  if (sheet !== null) setSheet(el, sheet);
}

export class HTMLLinkElement extends HTMLElement {
  constructor(doc?: Document, localName?: string, ns?: string | null, prefix?: string | null) {
    super(doc, localName, ns, prefix);
    this[$impl].flags |= F_CONNECT_HOOK | F_ATTR_HOOK;
  }

  override _connectedSteps(): void {
    super._connectedSteps();
    updateLinkSheet(this);
  }

  override _disconnectedSteps(): void {
    super._disconnectedSteps();
    removeAssociatedSheet(this);
  }

  override _attributeChangedSteps(
    localName: string,
    oldValue: string | null,
    value: string | null,
    namespace: string | null,
  ): void {
    super._attributeChangedSteps(localName, oldValue, value, namespace);
    if (
      namespace === null &&
      (localName === "rel" ||
        localName === "href" ||
        localName === "media" ||
        localName === "disabled" ||
        localName === "type")
    )
      updateLinkSheet(this);
  }

  get sheet(): object | null {
    return getSheet(this);
  }
}
url(HTMLLinkElement, "href");
enumerated(HTMLLinkElement, "crossOrigin=crossorigin", CROSS_ORIGIN);
str(
  HTMLLinkElement,
  "rel media integrity hreflang type imageSrcset=imagesrcset imageSizes=imagesizes charset rev target",
);
// oxfmt-ignore
enumerated(HTMLLinkElement, "as", {
  keywords: ["fetch", "audio", "audioworklet", "document", "embed", "font", "frame", "iframe", "image", "json", "manifest", "object", "paintworklet", "report", "script", "serviceworker", "sharedworker", "style", "track", "video", "webidentity", "worker", "xslt"],
});
tokenList(HTMLLinkElement, "relList", "rel", [
  "alternate",
  "dns-prefetch",
  "expect",
  "icon",
  "manifest",
  "modulepreload",
  "next",
  "pingback",
  "preconnect",
  "prefetch",
  "preload",
  "search",
  "stylesheet",
]);
tokenList(HTMLLinkElement, "sizes", "sizes");
tokenList(HTMLLinkElement, "blocking", "blocking", ["render"]);
enumerated(HTMLLinkElement, "referrerPolicy=referrerpolicy", REFERRER_POLICY);
enumerated(HTMLLinkElement, "fetchPriority=fetchpriority", FETCH_PRIORITY);
bool(HTMLLinkElement, "disabled");

// --- <script> ---------------------------------------------------------------------------------

const NON_BLOCKING = Symbol("nonBlocking");

/** https://html.spec.whatwg.org/#htmlscriptelement — inert: never fetched or executed. */
export class HTMLScriptElement extends HTMLElement {
  static supports(type: string): boolean {
    const t = String(type);
    return t === "classic" || t === "module" || t === "importmap" || t === "speculationrules";
  }

  /** https://html.spec.whatwg.org/#dom-script-text */
  get text(): string {
    return childTextContent(this[$impl]);
  }

  set text(value: string) {
    this.textContent = String(value);
  }

  /** https://html.spec.whatwg.org/#dom-script-async */
  get async(): boolean {
    // "force async" starts true for script-created elements (parser-inserted ones cannot be
    // told apart here, see docs/deviations.md).
    const forceAsync = (this as unknown as Record<symbol, boolean | undefined>)[NON_BLOCKING] ?? true;
    return forceAsync || contentAttr(this[$impl], "async") !== null;
  }

  set async(v: boolean) {
    Object.defineProperty(this, NON_BLOCKING, { value: false, writable: true, configurable: true });
    if (v) this.setAttribute("async", "");
    else this.removeAttribute("async");
  }
}
url(HTMLScriptElement, "src");
str(HTMLScriptElement, "type charset event htmlFor=for integrity");
bool(HTMLScriptElement, "noModule=nomodule defer");
enumerated(HTMLScriptElement, "crossOrigin=crossorigin", CROSS_ORIGIN);
enumerated(HTMLScriptElement, "referrerPolicy=referrerpolicy", REFERRER_POLICY);
enumerated(HTMLScriptElement, "fetchPriority=fetchpriority", FETCH_PRIORITY);
tokenList(HTMLScriptElement, "blocking", "blocking", ["render"]);

// --- <title> and document.title -----------------------------------------------------------------

export class HTMLTitleElement extends HTMLElement {
  /** https://html.spec.whatwg.org/#dom-title-text */
  get text(): string {
    return childTextContent(this[$impl]);
  }

  set text(value: string) {
    this.textContent = String(value);
  }
}

/** https://infra.spec.whatwg.org/#strip-and-collapse-ascii-whitespace */
function stripAndCollapse(s: string): string {
  return s.replace(/[\t\n\f\r ]+/g, " ").replace(/^ | $/g, "");
}

/** https://html.spec.whatwg.org/#the-title-element-2 — first <title> in the document, tree order. */
function titleElement(doc: Document): NodeImpl | null {
  const root = doc[$impl];
  for (let n = nextElementInTree(root, root); n !== null; n = nextElementInTree(n, root)) {
    if (n.tag === T.title && n.ns === HTML_NS) return n;
  }
  return null;
}

function svgTitle(docEl: NodeImpl): NodeImpl | null {
  for (let c = docEl.first; c !== null; c = c.next)
    if (c.type === ELEMENT_NODE && c.ns === SVG_NS && c.name === "title") return c;
  return null;
}

/** https://html.spec.whatwg.org/#document.title */
export function getDocumentTitle(doc: Document): string {
  const docEl = firstElementChild(doc[$impl]);
  let value: string;
  if (docEl !== null && docEl.ns === SVG_NS && docEl.name === "svg") {
    const t = svgTitle(docEl);
    value = t === null ? "" : childTextContent(t);
  } else {
    const t = titleElement(doc);
    value = t === null ? "" : childTextContent(t);
  }
  return stripAndCollapse(value);
}

export function setDocumentTitle(doc: Document, value: string): void {
  const docEl = firstElementChild(doc[$impl]);
  if (docEl === null) return;
  if (docEl.ns === SVG_NS && docEl.name === "svg") {
    let t = svgTitle(docEl);
    if (t === null) {
      t = doc.createElementNS(SVG_NS, "title")[$impl];
      docEl.node.insertBefore(t.node, docEl.first === null ? null : docEl.first.node);
    }
    t.node.textContent = value;
    return;
  }
  if (docEl.ns !== HTML_NS) return;
  let t = titleElement(doc);
  if (t === null) {
    const head = (doc as unknown as { head: Element | null }).head;
    if (head === null) return;
    t = head.appendChild(doc.createElement("title"))[$impl];
  }
  t.node.textContent = value;
}

if (!Object.hasOwn(Document.prototype, "title")) {
  Object.defineProperty(Document.prototype, "title", {
    get(this: Document) {
      return getDocumentTitle(this);
    },
    set(this: Document, v: unknown) {
      setDocumentTitle(this, String(v));
    },
    configurable: true,
    enumerable: true,
  });
}

// --- other Document members defined by the HTML Standard -----------------------------------------

/** https://html.spec.whatwg.org/#dom-document-dir — reflects the html element's `dir`. */
if (!Object.hasOwn(Document.prototype, "dir")) {
  Object.defineProperty(Document.prototype, "dir", {
    get(this: Document) {
      const html = firstElementChild(this[$impl]);
      if (html === null || html.tag !== T.html || html.ns !== HTML_NS) return "";
      const v = contentAttr(html, "dir");
      if (v === null) return "";
      const k = v.toLowerCase();
      return k === "ltr" || k === "rtl" || k === "auto" ? k : "";
    },
    set(this: Document, v: unknown) {
      const html = firstElementChild(this[$impl]);
      if (html !== null && html.tag === T.html && html.ns === HTML_NS)
        (html.node as Element).setAttribute("dir", String(v));
    },
    configurable: true,
    enumerable: true,
  });
}

// https://html.spec.whatwg.org/#dom-document-fgcolor and friends: reflect the body's attributes.
for (const [idl, content] of [
  ["fgColor", "text"],
  ["linkColor", "link"],
  ["vlinkColor", "vlink"],
  ["alinkColor", "alink"],
  ["bgColor", "bgcolor"],
] as const) {
  if (Object.hasOwn(Document.prototype, idl)) continue;
  Object.defineProperty(Document.prototype, idl, {
    get(this: Document) {
      const body = (this as unknown as { body: Element | null }).body;
      if (body === null || body[$impl].tag !== T.body) return "";
      return contentAttr(body[$impl], content) ?? "";
    },
    set(this: Document, v: unknown) {
      const body = (this as unknown as { body: Element | null }).body;
      if (body !== null && body[$impl].tag === T.body) body.setAttribute(content, v === null ? "" : String(v));
    },
    configurable: true,
    enumerable: true,
  });
}
