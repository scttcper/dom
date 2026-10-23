// HTML element interfaces without significant behavior: document metadata, sections,
// grouping content, text-level semantics, edits, embedded content, tables, legacy elements.
// https://html.spec.whatwg.org/#semantics
//
// Each class is declared empty and gets its IDL attributes from the reflection helpers
// (reflect.ts). Elements with behavior live in their own modules (anchor.ts, media.ts,
// interactive.ts, template.ts, slot.ts, resources.ts, table.ts).

import { installEventHandlers } from "../events/handlers.ts";
import { HTMLElement } from "./HTMLElement.ts";
import { bool, clampedUlong, CROSS_ORIGIN, enumerated, strNullEmpty, FETCH_PRIORITY, LOADING, long, REFERRER_POLICY, str, tokenList, ulong, url, contentAttr } from "./reflect.ts";
import type { Element } from "../nodes/Element.ts";
import type { NodeImpl } from "../nodes/NodeImpl.ts";
import { ELEMENT_NODE, F_CONNECT_HOOK, HTML_NS } from "../nodes/constants.ts";
import type { Document } from "../nodes/Document.ts";
import type { Window } from "../window/Window.ts";
import { frameConnected, frameContentWindow, frameDisconnected } from "../window/browsing-context.ts";
import { T } from "../nodes/tags.ts";
import { nextElementInTree } from "../nodes/traverse.ts";
import { setAttribute } from "../nodes/attributes.ts";
import { fnCollection } from "./collection.ts";
import { installConstraintValidation, V_CUSTOM_ERROR, type ConstraintValidation, type ValidityState } from "./forms/validation.ts";
import { formOwner } from "./forms/form-associated.ts";
import { currentDocument } from "../window/current.ts";
import type { HTMLCollection } from "../collections/HTMLCollection.ts";
import { $customValidity, $impl, $options, $validity } from "../keys.ts";

/** Lazily created, per-element [SameObject] value stored under a non-enumerable symbol. */
export function sameObject<V>(el: object, key: symbol, create: () => V): V {
  const rec = el as Record<symbol, V>;
  let v = rec[key];
  if (v === undefined) {
    v = create();
    Object.defineProperty(el, key, { value: v });
  }
  return v;
}

// --- document metadata ----------------------------------------------------------------------

export class HTMLHtmlElement extends HTMLElement {}
str(HTMLHtmlElement, "version");

export class HTMLHeadElement extends HTMLElement {}

export class HTMLBaseElement extends HTMLElement {
  /** https://html.spec.whatwg.org/#dom-base-href — resolved against the document's fallback base URL. */
  get href(): string {
    const impl = this[$impl];
    const v = contentAttr(impl, "href") ?? "";
    const parsed = URL.parse(v, impl.doc.URL);
    return parsed === null ? v : parsed.href;
  }
  set href(v: string) {
    setAttribute(this[$impl], "href", String(v));
  }
}
str(HTMLBaseElement, "target");

export class HTMLMetaElement extends HTMLElement {}
str(HTMLMetaElement, "name httpEquiv=http-equiv content media scheme");

// --- sections & grouping ----------------------------------------------------------------------

export class HTMLBodyElement extends HTMLElement {}
installEventHandlers(HTMLBodyElement.prototype, "body"); // WindowEventHandlers forwarded to the Window
strNullEmpty(HTMLBodyElement, "text link vLink=vlink aLink=alink bgColor=bgcolor");
str(HTMLBodyElement, "background");

export class HTMLHeadingElement extends HTMLElement {}
str(HTMLHeadingElement, "align");

export class HTMLParagraphElement extends HTMLElement {}
str(HTMLParagraphElement, "align");

export class HTMLHRElement extends HTMLElement {}
str(HTMLHRElement, "align color size width");
bool(HTMLHRElement, "noShade=noshade");

export class HTMLPreElement extends HTMLElement {}
long(HTMLPreElement, "width");

export class HTMLQuoteElement extends HTMLElement {}
url(HTMLQuoteElement, "cite");

export class HTMLOListElement extends HTMLElement {}
bool(HTMLOListElement, "reversed compact");
long(HTMLOListElement, "start", 1);
str(HTMLOListElement, "type");

export class HTMLUListElement extends HTMLElement {}
bool(HTMLUListElement, "compact");
str(HTMLUListElement, "type");

export class HTMLMenuElement extends HTMLElement {}
bool(HTMLMenuElement, "compact");

export class HTMLLIElement extends HTMLElement {}
long(HTMLLIElement, "value");
str(HTMLLIElement, "type");

export class HTMLDListElement extends HTMLElement {}
bool(HTMLDListElement, "compact");

export class HTMLDivElement extends HTMLElement {}
str(HTMLDivElement, "align");

// --- text-level semantics -------------------------------------------------------------------

export class HTMLDataElement extends HTMLElement {}
str(HTMLDataElement, "value");

export class HTMLTimeElement extends HTMLElement {}
str(HTMLTimeElement, "dateTime=datetime");

export class HTMLSpanElement extends HTMLElement {}

export class HTMLBRElement extends HTMLElement {}
str(HTMLBRElement, "clear");

export class HTMLModElement extends HTMLElement {}
url(HTMLModElement, "cite");
str(HTMLModElement, "dateTime=datetime");

// --- embedded content -------------------------------------------------------------------------

export class HTMLPictureElement extends HTMLElement {}

export class HTMLSourceElement extends HTMLElement {}
url(HTMLSourceElement, "src");
str(HTMLSourceElement, "type srcset sizes media");
ulong(HTMLSourceElement, "width height");

/**
 * https://html.spec.whatwg.org/#htmlimageelement — nothing is fetched, so an image with a source
 * stays "pending" forever: `complete` is false, natural dimensions are 0, no load/error events
 * fire (as jsdom without resource loading). `decode()` resolves.
 */
export class HTMLImageElement extends HTMLElement {
  /**
   * https://html.spec.whatwg.org/#dom-img-complete — true only when there is no source
   * (no srcset and an empty/absent src); a request that never progresses is neither
   * completely available nor broken.
   */
  get complete(): boolean {
    const impl = this[$impl];
    if (contentAttr(impl, "srcset") !== null) return false;
    const src = contentAttr(impl, "src");
    return src === null || src === "";
  }
  get naturalWidth(): number {
    return 0;
  }
  get naturalHeight(): number {
    return 0;
  }
  get currentSrc(): string {
    return (this as unknown as { src: string }).src;
  }
  get x(): number {
    return 0;
  }
  get y(): number {
    return 0;
  }
  /** https://html.spec.whatwg.org/#dom-img-width — rendered width unavailable: the attribute, or the natural width (0). */
  get width(): number {
    return dimension(this[$impl], "width");
  }
  set width(v: number) {
    setAttribute(this[$impl], "width", String(clampUlong(v)));
  }
  get height(): number {
    return dimension(this[$impl], "height");
  }
  set height(v: number) {
    setAttribute(this[$impl], "height", String(clampUlong(v)));
  }
  decode(): Promise<void> {
    return Promise.resolve();
  }
}
str(HTMLImageElement, "alt srcset sizes useMap=usemap name align");
strNullEmpty(HTMLImageElement, "border");
url(HTMLImageElement, "src longDesc=longdesc lowsrc");
enumerated(HTMLImageElement, "crossOrigin=crossorigin", CROSS_ORIGIN);
bool(HTMLImageElement, "isMap=ismap");
ulong(HTMLImageElement, "hspace vspace");
enumerated(HTMLImageElement, "referrerPolicy=referrerpolicy", REFERRER_POLICY);
enumerated(HTMLImageElement, "decoding", { keywords: ["sync", "async", "auto"], missing: "auto", invalid: "auto" });
enumerated(HTMLImageElement, "loading", LOADING);
enumerated(HTMLImageElement, "fetchPriority=fetchpriority", FETCH_PRIORITY);

/** `unsigned long` setter conversion for reflected dimensions (values above 2^31-1 become 0). */
function clampUlong(v: unknown): number {
  const n = Number(v) >>> 0;
  return n > 2147483647 ? 0 : n;
}

function dimension(impl: NodeImpl, name: string): number {
  const v = contentAttr(impl, name);
  if (v === null) return 0;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * https://html.spec.whatwg.org/#dom-image — `new Image(width?, height?)` creates an <img> in the
 * current window's document.
 */
export const Image = function Image(this: unknown, width?: number, height?: number): HTMLImageElement {
  if (new.target === undefined) throw new TypeError("Failed to construct 'Image': Please use the 'new' operator.");
  const el = currentDocument().createElementNS(HTML_NS, "img") as HTMLImageElement;
  if (width !== undefined) setAttribute(el[$impl], "width", String(Number(width) >>> 0));
  if (height !== undefined) setAttribute(el[$impl], "height", String(Number(height) >>> 0));
  return el;
} as unknown as { new (width?: number, height?: number): HTMLImageElement; prototype: HTMLImageElement };
Image.prototype = HTMLImageElement.prototype;

/** https://html.spec.whatwg.org/#htmliframeelement — no nested browsing context (contentWindow/contentDocument are null). */
export class HTMLIFrameElement extends HTMLElement {
  constructor(doc?: Document, localName?: string, ns?: string | null, prefix?: string | null) {
    super(doc, localName, ns, prefix);
    // Nested browsing context on insertion/removal (window/browsing-context.ts).
    this[$impl].flags |= F_CONNECT_HOOK;
  }
  override _connectedSteps(): void {
    super._connectedSteps();
    frameConnected(this);
  }
  override _disconnectedSteps(): void {
    super._disconnectedSteps();
    frameDisconnected(this);
  }
  /** https://html.spec.whatwg.org/#dom-iframe-contentdocument (always same-origin here) */
  get contentDocument(): Document | null {
    return frameContentWindow(this)?.document ?? null;
  }
  /** https://html.spec.whatwg.org/#dom-iframe-contentwindow */
  get contentWindow(): Window | null {
    return frameContentWindow(this);
  }
  getSVGDocument(): null {
    return null;
  }
}
url(HTMLIFrameElement, "src longDesc=longdesc");
str(HTMLIFrameElement, "srcdoc name allow width height align scrolling frameBorder=frameborder");
strNullEmpty(HTMLIFrameElement, "marginHeight=marginheight marginWidth=marginwidth");
tokenList(HTMLIFrameElement, "sandbox", "sandbox", [
  "allow-downloads",
  "allow-forms",
  "allow-modals",
  "allow-orientation-lock",
  "allow-pointer-lock",
  "allow-popups",
  "allow-popups-to-escape-sandbox",
  "allow-presentation",
  "allow-same-origin",
  "allow-scripts",
  "allow-top-navigation",
  "allow-top-navigation-by-user-activation",
  "allow-top-navigation-to-custom-protocols",
]);
bool(HTMLIFrameElement, "allowFullscreen=allowfullscreen");
enumerated(HTMLIFrameElement, "referrerPolicy=referrerpolicy", REFERRER_POLICY);
enumerated(HTMLIFrameElement, "loading", LOADING);

export class HTMLEmbedElement extends HTMLElement {
  getSVGDocument(): null {
    return null;
  }
}
url(HTMLEmbedElement, "src");
str(HTMLEmbedElement, "type width height align name");

/**
 * https://html.spec.whatwg.org/#htmlobjectelement — never loads; no nested browsing context.
 * Constraint validation via the forms area's mixin: objects are always barred from constraint
 * validation (willValidate false), but setCustomValidity still sets validity.customError.
 */
export class HTMLObjectElement extends HTMLElement {
  [$customValidity] = "";
  [$validity]: ValidityState | null = null;

  get contentDocument(): null {
    return null;
  }
  get contentWindow(): null {
    return null;
  }
  getSVGDocument(): null {
    return null;
  }
  get form(): Element | null {
    const f = formOwner(this[$impl]);
    return f === null ? null : (f.node as Element);
  }
  _barredFromValidation(): boolean {
    return true;
  }
  _validityFlags(): number {
    return this[$customValidity] === "" ? 0 : V_CUSTOM_ERROR;
  }
  _validationMessage(_flags: number): string {
    return this[$customValidity];
  }
}
export interface HTMLObjectElement extends ConstraintValidation {}
installConstraintValidation(HTMLObjectElement);
url(HTMLObjectElement, "data codeBase=codebase");
str(HTMLObjectElement, "type name useMap=usemap width height align archive code standby codeType=codetype");
strNullEmpty(HTMLObjectElement, "border");
bool(HTMLObjectElement, "declare");
ulong(HTMLObjectElement, "hspace vspace");

export class HTMLParamElement extends HTMLElement {}
str(HTMLParamElement, "name value type valueType=valuetype");

export class HTMLTrackElement extends HTMLElement {
  static readonly NONE = 0;
  static readonly LOADING = 1;
  static readonly LOADED = 2;
  static readonly ERROR = 3;
  get readyState(): number {
    return 0;
  }
  get track(): null {
    return null;
  }
}
enumerated(HTMLTrackElement, "kind", { keywords: ["subtitles", "captions", "descriptions", "chapters", "metadata"], missing: "subtitles", invalid: "metadata" });
url(HTMLTrackElement, "src");
str(HTMLTrackElement, "srclang label");
bool(HTMLTrackElement, "default");

export class HTMLMapElement extends HTMLElement {
  /** https://html.spec.whatwg.org/#dom-map-areas */
  get areas(): HTMLCollection {
    return sameObject(this, AREAS, () =>
      fnCollection(this[$impl], (root, out) => {
        for (let n = nextElementInTree(root, root); n !== null; n = nextElementInTree(n, root)) {
          if (n.tag === T.area && n.ns === HTML_NS) out.push(n.node as Element);
        }
      }),
    );
  }
}
const AREAS = Symbol("areas");
str(HTMLMapElement, "name");

/** https://html.spec.whatwg.org/#htmlcanvaselement — no rendering backend. */
export class HTMLCanvasElement extends HTMLElement {
  getContext(_contextId: string, _options?: unknown): null {
    return null;
  }
  toDataURL(_type?: string, _quality?: unknown): string {
    return "data:,";
  }
  toBlob(callback: (blob: null) => void): void {
    setTimeout(() => callback(null), 0);
  }
  transferControlToOffscreen(): never {
    throw new DOMException("OffscreenCanvas is not supported.", "NotSupportedError");
  }
  captureStream(): never {
    throw new DOMException("captureStream is not supported.", "NotSupportedError");
  }
}
ulong(HTMLCanvasElement, "width", 300);
ulong(HTMLCanvasElement, "height", 150);

// --- tables -----------------------------------------------------------------------------------

function childOfType(parent: NodeImpl, tag: number): NodeImpl | null {
  for (let c = parent.first; c !== null; c = c.next) if (c.type === ELEMENT_NODE && c.tag === tag && c.ns === HTML_NS) return c;
  return null;
}

function hierarchyError(message: string): DOMException {
  return new DOMException(message, "HierarchyRequestError");
}

function indexError(index: number): DOMException {
  return new DOMException(`The index provided (${index}) is outside the valid range.`, "IndexSizeError");
}

const ROWS = Symbol("rows");
const TBODIES = Symbol("tBodies");
const CELLS = Symbol("cells");

/** https://html.spec.whatwg.org/#dom-table-rows ordering: thead rows, then table/tbody rows, then tfoot rows. */
function fillTableRows(table: NodeImpl, out: Element[]): void {
  for (let c = table.first; c !== null; c = c.next) {
    if (c.type === ELEMENT_NODE && c.tag === T.thead && c.ns === HTML_NS) pushRows(c, out);
  }
  for (let c = table.first; c !== null; c = c.next) {
    if (c.type !== ELEMENT_NODE || c.ns !== HTML_NS) continue;
    if (c.tag === T.tr) out.push(c.node as Element);
    else if (c.tag === T.tbody) pushRows(c, out);
  }
  for (let c = table.first; c !== null; c = c.next) {
    if (c.type === ELEMENT_NODE && c.tag === T.tfoot && c.ns === HTML_NS) pushRows(c, out);
  }
}

function pushRows(section: NodeImpl, out: Element[]): void {
  for (let r = section.first; r !== null; r = r.next) if (r.type === ELEMENT_NODE && r.tag === T.tr && r.ns === HTML_NS) out.push(r.node as Element);
}

export class HTMLTableElement extends HTMLElement {
  get caption(): Element | null {
    const c = childOfType(this[$impl], T.caption);
    return c === null ? null : (c.node as Element);
  }
  set caption(value: Element | null) {
    const old = childOfType(this[$impl], T.caption);
    if (old !== null) this.removeChild(old.node);
    if (value !== null) this.insertBefore(value, this.firstChild);
  }
  createCaption(): Element {
    const c = childOfType(this[$impl], T.caption);
    if (c !== null) return c.node as Element;
    const el = this[$impl].doc.createElement("caption");
    this.insertBefore(el, this.firstChild);
    return el;
  }
  deleteCaption(): void {
    const c = childOfType(this[$impl], T.caption);
    if (c !== null) this.removeChild(c.node);
  }
  get tHead(): Element | null {
    const c = childOfType(this[$impl], T.thead);
    return c === null ? null : (c.node as Element);
  }
  set tHead(value: Element | null) {
    if (value !== null && value[$impl].tag !== T.thead) throw hierarchyError("Not a thead element.");
    const old = childOfType(this[$impl], T.thead);
    if (old !== null) this.removeChild(old.node);
    if (value !== null) this.insertBefore(value, this._afterCaptionAndColgroups());
  }
  createTHead(): Element {
    const c = childOfType(this[$impl], T.thead);
    if (c !== null) return c.node as Element;
    const el = this[$impl].doc.createElement("thead");
    this.insertBefore(el, this._afterCaptionAndColgroups());
    return el;
  }
  deleteTHead(): void {
    const c = childOfType(this[$impl], T.thead);
    if (c !== null) this.removeChild(c.node);
  }
  get tFoot(): Element | null {
    const c = childOfType(this[$impl], T.tfoot);
    return c === null ? null : (c.node as Element);
  }
  set tFoot(value: Element | null) {
    if (value !== null && value[$impl].tag !== T.tfoot) throw hierarchyError("Not a tfoot element.");
    const old = childOfType(this[$impl], T.tfoot);
    if (old !== null) this.removeChild(old.node);
    if (value !== null) this.appendChild(value);
  }
  createTFoot(): Element {
    const c = childOfType(this[$impl], T.tfoot);
    if (c !== null) return c.node as Element;
    return this.appendChild(this[$impl].doc.createElement("tfoot"));
  }
  deleteTFoot(): void {
    const c = childOfType(this[$impl], T.tfoot);
    if (c !== null) this.removeChild(c.node);
  }
  get tBodies(): HTMLCollection {
    return sameObject(this, TBODIES, () =>
      fnCollection(this[$impl], (root, out) => {
        for (let c = root.first; c !== null; c = c.next) if (c.type === ELEMENT_NODE && c.tag === T.tbody && c.ns === HTML_NS) out.push(c.node as Element);
      }),
    );
  }
  createTBody(): Element {
    const el = this[$impl].doc.createElement("tbody");
    let lastBody: NodeImpl | null = null;
    for (let c = this[$impl].first; c !== null; c = c.next) if (c.type === ELEMENT_NODE && c.tag === T.tbody && c.ns === HTML_NS) lastBody = c;
    this.insertBefore(el, lastBody === null ? null : lastBody.next === null ? null : lastBody.next.node);
    return el;
  }
  get rows(): HTMLCollection {
    return sameObject(this, ROWS, () => fnCollection(this[$impl], fillTableRows));
  }
  /** https://html.spec.whatwg.org/#dom-table-insertrow */
  insertRow(index = -1): Element {
    index = Number(index) | 0;
    const rows = this.rows;
    const n = rows.length;
    if (index < -1 || index > n) throw indexError(index);
    const doc = this[$impl].doc;
    const tr = doc.createElement("tr");
    if (n === 0 && childOfType(this[$impl], T.tbody) === null) {
      this.appendChild(doc.createElement("tbody")).appendChild(tr);
    } else if (n === 0) {
      let lastBody: Element | null = null;
      for (let c = this[$impl].first; c !== null; c = c.next) if (c.type === ELEMENT_NODE && c.tag === T.tbody && c.ns === HTML_NS) lastBody = c.node as Element;
      lastBody!.appendChild(tr);
    } else if (index === -1 || index === n) {
      rows.item(n - 1)!.parentNode!.appendChild(tr);
    } else {
      const ref = rows.item(index)!;
      ref.parentNode!.insertBefore(tr, ref);
    }
    return tr;
  }
  deleteRow(index: number): void {
    index = Number(index) | 0;
    const rows = this.rows;
    const n = rows.length;
    if (index === -1) {
      if (n === 0) return;
      index = n - 1;
    }
    if (index < 0 || index >= n) throw indexError(index);
    rows.item(index)!.remove();
  }
  _afterCaptionAndColgroups(): Element | null {
    for (let c = this[$impl].first; c !== null; c = c.next) {
      if (c.type === ELEMENT_NODE && !((c.tag === T.caption || c.tag === T.colgroup) && c.ns === HTML_NS)) return c.node as Element;
    }
    return null;
  }
}
str(HTMLTableElement, "align border frame rules summary width");
strNullEmpty(HTMLTableElement, "bgColor=bgcolor cellPadding=cellpadding cellSpacing=cellspacing");

export class HTMLTableCaptionElement extends HTMLElement {}
str(HTMLTableCaptionElement, "align");

export class HTMLTableColElement extends HTMLElement {}
clampedUlong(HTMLTableColElement, "span", "span", 1, 1, 1000);
str(HTMLTableColElement, "align ch=char chOff=charoff vAlign=valign width");

export class HTMLTableSectionElement extends HTMLElement {
  get rows(): HTMLCollection {
    return sameObject(this, ROWS, () => fnCollection(this[$impl], pushRows));
  }
  insertRow(index = -1): Element {
    index = Number(index) | 0;
    const rows = this.rows;
    const n = rows.length;
    if (index < -1 || index > n) throw indexError(index);
    const tr = this[$impl].doc.createElement("tr");
    if (index === -1 || index === n) this.appendChild(tr);
    else this.insertBefore(tr, rows.item(index));
    return tr;
  }
  deleteRow(index: number): void {
    index = Number(index) | 0;
    const rows = this.rows;
    const n = rows.length;
    if (index === -1) {
      if (n === 0) return;
      index = n - 1;
    }
    if (index < 0 || index >= n) throw indexError(index);
    rows.item(index)!.remove();
  }
}
str(HTMLTableSectionElement, "align ch=char chOff=charoff vAlign=valign");

export class HTMLTableRowElement extends HTMLElement {
  /** https://html.spec.whatwg.org/#dom-tr-rowindex */
  get rowIndex(): number {
    const p = this[$impl].parent;
    if (p === null) return -1;
    let table: NodeImpl | null = null;
    if (p.tag === T.table && p.ns === HTML_NS) table = p;
    else if ((p.tag === T.thead || p.tag === T.tbody || p.tag === T.tfoot) && p.ns === HTML_NS && p.parent !== null && p.parent.tag === T.table) table = p.parent;
    if (table === null) return -1;
    const rows: Element[] = [];
    fillTableRows(table, rows);
    return rows.indexOf(this);
  }
  get sectionRowIndex(): number {
    const p = this[$impl].parent;
    if (p === null) return -1;
    const rows: Element[] = [];
    if (p.tag === T.table) fillTableRows(p, rows);
    else pushRows(p, rows);
    return rows.indexOf(this);
  }
  get cells(): HTMLCollection {
    return sameObject(this, CELLS, () =>
      fnCollection(this[$impl], (root, out) => {
        for (let c = root.first; c !== null; c = c.next) if (c.type === ELEMENT_NODE && (c.tag === T.td || c.tag === T.th) && c.ns === HTML_NS) out.push(c.node as Element);
      }),
    );
  }
  insertCell(index = -1): Element {
    index = Number(index) | 0;
    const cells = this.cells;
    const n = cells.length;
    if (index < -1 || index > n) throw indexError(index);
    const td = this[$impl].doc.createElement("td");
    if (index === -1 || index === n) this.appendChild(td);
    else this.insertBefore(td, cells.item(index));
    return td;
  }
  deleteCell(index: number): void {
    index = Number(index) | 0;
    const cells = this.cells;
    const n = cells.length;
    if (index === -1) {
      if (n === 0) return;
      index = n - 1;
    }
    if (index < 0 || index >= n) throw indexError(index);
    cells.item(index)!.remove();
  }
}
str(HTMLTableRowElement, "align ch=char chOff=charoff vAlign=valign");
strNullEmpty(HTMLTableRowElement, "bgColor=bgcolor");

export class HTMLTableCellElement extends HTMLElement {
  get cellIndex(): number {
    const p = this[$impl].parent;
    if (p === null || p.tag !== T.tr) return -1;
    let i = 0;
    for (let c = p.first; c !== null; c = c.next) {
      if (c === this[$impl]) return i;
      if (c.type === ELEMENT_NODE && (c.tag === T.td || c.tag === T.th) && c.ns === HTML_NS) i++;
    }
    return -1;
  }
}
clampedUlong(HTMLTableCellElement, "colSpan", "colspan", 1, 1, 1000);
clampedUlong(HTMLTableCellElement, "rowSpan", "rowspan", 1, 0, 65534);
str(HTMLTableCellElement, "headers abbr axis align ch=char chOff=charoff vAlign=valign width height");
strNullEmpty(HTMLTableCellElement, "bgColor=bgcolor");
enumerated(HTMLTableCellElement, "scope", { keywords: ["row", "col", "rowgroup", "colgroup"] });
bool(HTMLTableCellElement, "noWrap=nowrap");

// --- legacy -----------------------------------------------------------------------------------

export class HTMLDirectoryElement extends HTMLElement {}
bool(HTMLDirectoryElement, "compact");

export class HTMLFontElement extends HTMLElement {}
strNullEmpty(HTMLFontElement, "color");
str(HTMLFontElement, "face size");

export class HTMLFrameSetElement extends HTMLElement {}
installEventHandlers(HTMLFrameSetElement.prototype, "body");
str(HTMLFrameSetElement, "cols rows");

export class HTMLFrameElement extends HTMLElement {
  get contentDocument(): null {
    return null;
  }
  get contentWindow(): null {
    return null;
  }
}
str(HTMLFrameElement, "name scrolling frameBorder=frameborder");
strNullEmpty(HTMLFrameElement, "marginHeight=marginheight marginWidth=marginwidth");
url(HTMLFrameElement, "src longDesc=longdesc");
bool(HTMLFrameElement, "noResize=noresize");

export class HTMLMarqueeElement extends HTMLElement {
  start(): void {}
  stop(): void {}
}
str(HTMLMarqueeElement, "behavior bgColor=bgcolor direction height width");
ulong(HTMLMarqueeElement, "hspace vspace");
long(HTMLMarqueeElement, "loop", -1);
ulong(HTMLMarqueeElement, "scrollAmount=scrollamount", 6);
ulong(HTMLMarqueeElement, "scrollDelay=scrolldelay", 85);
bool(HTMLMarqueeElement, "trueSpeed=truespeed");

/** https://html.spec.whatwg.org/#htmlunknownelement */
export class HTMLUnknownElement extends HTMLElement {}

