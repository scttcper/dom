// Markup serialization: innerHTML / outerHTML / getHTML() / XMLSerializer.
// https://html.spec.whatwg.org/#serialising-html-fragments
// https://html.spec.whatwg.org/#fragment-serializing-algorithm-steps
// https://w3c.github.io/DOM-Parsing/#dfn-xml-serialization
//
// Both serializers build one string with `+=` (V8 ropes) while walking NodeImpl links.

import {
  CDATA_SECTION_NODE,
  COMMENT_NODE,
  DOCUMENT_FRAGMENT_NODE,
  DOCUMENT_NODE,
  DOCUMENT_TYPE_NODE,
  ELEMENT_NODE,
  HTML_NS,
  MATHML_NS,
  PROCESSING_INSTRUCTION_NODE,
  SVG_NS,
  TEXT_NODE,
  XLINK_NS,
  XMLNS_NS,
  XML_NS,
} from "../nodes/constants.ts";
import type { NodeImpl } from "../nodes/NodeImpl.ts";
import { T } from "../nodes/tags.ts";
import { $clonable, $delegatesFocus, $impl, $isHTML, $mode, $serializable, $shadowRoot, $slotAssignment } from "../keys.ts";

// --- HTML ------------------------------------------------------------------------------------

/** Element types that serialize as void (HTML namespace). https://html.spec.whatwg.org/#serializes-as-void */
function isVoidTag(tag: number): boolean {
  switch (tag) {
    case T.area:
    case T.base:
    case T.basefont:
    case T.bgsound:
    case T.br:
    case T.col:
    case T.embed:
    case T.frame:
    case T.hr:
    case T.img:
    case T.input:
    case T.keygen:
    case T.link:
    case T.meta:
    case T.param:
    case T.source:
    case T.track:
    case T.wbr:
      return true;
  }
  return false;
}

/** Parents whose Text children are serialized literally (HTML namespace). */
function isRawTextTag(tag: number): boolean {
  switch (tag) {
    case T.style:
    case T.script:
    case T.xmp:
    case T.iframe:
    case T.noembed:
    case T.noframes:
    case T.plaintext:
      return true;
  }
  // noscript: only when scripting is enabled for the node; scripting is always disabled here.
  return false;
}

/** https://html.spec.whatwg.org/#escapingString (non-attribute mode). */
export function escapeText(s: string): string {
  const len = s.length;
  let i = 0;
  for (; i < len; i++) {
    const c = s.charCodeAt(i);
    if (c === 38 || c === 60 || c === 62 || c === 0xa0) break;
  }
  if (i === len) return s;
  let out = s.slice(0, i);
  let last = i;
  for (; i < len; i++) {
    const c = s.charCodeAt(i);
    let rep = "";
    if (c === 38) rep = "&amp;";
    else if (c === 60) rep = "&lt;";
    else if (c === 62) rep = "&gt;";
    else if (c === 0xa0) rep = "&nbsp;";
    else continue;
    out += s.slice(last, i) + rep;
    last = i + 1;
  }
  return out + s.slice(last);
}

/** https://html.spec.whatwg.org/#escapingString (attribute mode). */
export function escapeAttribute(s: string): string {
  const len = s.length;
  let i = 0;
  for (; i < len; i++) {
    const c = s.charCodeAt(i);
    if (c === 38 || c === 34 || c === 60 || c === 62 || c === 0xa0) break;
  }
  if (i === len) return s;
  let out = s.slice(0, i);
  let last = i;
  for (; i < len; i++) {
    const c = s.charCodeAt(i);
    let rep = "";
    if (c === 38) rep = "&amp;";
    else if (c === 34) rep = "&quot;";
    else if (c === 60) rep = "&lt;";
    else if (c === 62) rep = "&gt;";
    else if (c === 0xa0) rep = "&nbsp;";
    else continue;
    out += s.slice(last, i) + rep;
    last = i + 1;
  }
  return out + s.slice(last);
}

/** https://html.spec.whatwg.org/#attribute's-serialised-name */
function serializedAttrName(ns: string | null, name: string, localName: string): string {
  if (ns === null) return localName;
  if (ns === XML_NS) return "xml:" + localName;
  if (ns === XMLNS_NS) return localName === "xmlns" ? "xmlns" : "xmlns:" + localName;
  if (ns === XLINK_NS) return "xlink:" + localName;
  return name;
}

interface ShadowLike {
  [$impl]: NodeImpl;
  [$mode]: string;
  [$delegatesFocus]: boolean;
  [$serializable]: boolean;
  [$slotAssignment]: string;
  [$clonable]: boolean;
}

function templateContentsOf(el: NodeImpl): NodeImpl {
  const content = (el.node as unknown as { content?: { [$impl]: NodeImpl } }).content;
  return content === undefined || content === null ? el : content[$impl];
}

let htmlOut = "";
let optSerializable = false;
let optRoots: readonly unknown[] | null = null;

/** https://html.spec.whatwg.org/#html-fragment-serialisation-algorithm — appends to htmlOut. */
function htmlChildren(node: NodeImpl): void {
  if (node.type === ELEMENT_NODE) {
    if (node.ns === HTML_NS && isVoidTag(node.tag)) return;
    if (optSerializable || optRoots !== null) htmlShadowRoot(node);
    if (node.tag === T.template && node.ns === HTML_NS) node = templateContentsOf(node);
  }
  for (let c = node.first; c !== null; c = c.next) {
    switch (c.type) {
      case ELEMENT_NODE:
        htmlElement(c);
        break;
      case TEXT_NODE:
      case CDATA_SECTION_NODE: {
        const p = c.parent;
        if (p !== null && p.type === ELEMENT_NODE && p.ns === HTML_NS && isRawTextTag(p.tag)) htmlOut += c.data;
        else htmlOut += escapeText(c.data);
        break;
      }
      case COMMENT_NODE:
        htmlOut += "<!--" + c.data + "-->";
        break;
      case PROCESSING_INSTRUCTION_NODE:
        htmlOut += "<?" + c.name + " " + c.data + "?>";
        break;
      case DOCUMENT_TYPE_NODE:
        htmlOut += "<!DOCTYPE " + c.name + ">";
        break;
    }
  }
}

function htmlElement(el: NodeImpl): void {
  const ns = el.ns;
  const tagName =
    ns === HTML_NS || ns === SVG_NS || ns === MATHML_NS || el.prefix === null ? el.name : el.prefix + ":" + el.name;
  let s = "<" + tagName;
  // TODO(html): customized built-in "is" value without an is attribute (custom-elements.ts isValueOf).
  const attrs = el.attrs;
  if (attrs !== null) {
    for (let i = 0; i < attrs.length; i++) {
      const a = attrs[i];
      s += " " + (a.ns === null ? a.localName : serializedAttrName(a.ns, a.name, a.localName)) + '="' + escapeAttribute(a.value) + '"';
    }
  }
  htmlOut += s + ">";
  if (ns === HTML_NS && isVoidTag(el.tag)) return;
  htmlChildren(el);
  htmlOut += "</" + tagName + ">";
}

function htmlShadowRoot(host: NodeImpl): void {
  const shadow = (host.node as unknown as { [$shadowRoot]?: ShadowLike | null })[$shadowRoot];
  if (shadow === undefined || shadow === null) return;
  const include = (optSerializable && shadow[$serializable]) || (optRoots !== null && optRoots.includes(shadow));
  if (!include) return;
  let s = '<template shadowrootmode="' + (shadow[$mode] === "open" ? "open" : "closed") + '"';
  if (shadow[$delegatesFocus]) s += ' shadowrootdelegatesfocus=""';
  if (shadow[$serializable]) s += ' shadowrootserializable=""';
  if (shadow[$slotAssignment] === "manual") s += ' shadowrootslotassignment="manual"';
  if (shadow[$clonable]) s += ' shadowrootclonable=""';
  // TODO(html): shadowrootcustomelementregistry when scoped custom element registries land.
  htmlOut += s + ">";
  htmlChildren(shadow[$impl]);
  htmlOut += "</template>";
}

function runHtml(node: NodeImpl, serializable: boolean, roots: readonly unknown[] | null, outer: boolean): string {
  const prevOut = htmlOut;
  const prevSer = optSerializable;
  const prevRoots = optRoots;
  htmlOut = "";
  optSerializable = serializable;
  optRoots = roots;
  try {
    if (outer) {
      switch (node.type) {
        case ELEMENT_NODE:
          htmlElement(node);
          break;
        case DOCUMENT_NODE:
        case DOCUMENT_FRAGMENT_NODE:
          htmlChildren(node);
          break;
        default: {
          // A fictional parent with `node` as its only child.
          const p = node.parent;
          if (node.type === TEXT_NODE || node.type === CDATA_SECTION_NODE) {
            htmlOut = p !== null && p.type === ELEMENT_NODE && p.ns === HTML_NS && isRawTextTag(p.tag) ? node.data : escapeText(node.data);
          } else if (node.type === COMMENT_NODE) htmlOut = "<!--" + node.data + "-->";
          else if (node.type === PROCESSING_INSTRUCTION_NODE) htmlOut = "<?" + node.name + " " + node.data + "?>";
          else if (node.type === DOCUMENT_TYPE_NODE) htmlOut = "<!DOCTYPE " + node.name + ">";
        }
      }
    } else {
      htmlChildren(node);
    }
    return htmlOut;
  } finally {
    htmlOut = prevOut;
    optSerializable = prevSer;
    optRoots = prevRoots;
  }
}

/** Is `node`'s node document an HTML document? */
function inHTMLDocument(node: NodeImpl): boolean {
  return (node.doc as unknown as { [$isHTML]: boolean })[$isHTML];
}

/**
 * innerHTML getter: https://html.spec.whatwg.org/#fragment-serializing-algorithm-steps with
 * require well-formed = true (HTML serialization in HTML documents, XML otherwise).
 */
export function serializeChildren(node: NodeImpl): string {
  if (inHTMLDocument(node)) return runHtml(node, false, null, false);
  let s = "";
  let target = node;
  if (node.type === ELEMENT_NODE && node.tag === T.template && node.ns === HTML_NS) target = templateContentsOf(node);
  for (let c = target.first; c !== null; c = c.next) s += serializeXML(c, true);
  return s;
}

/** outerHTML getter: the fragment serializing algorithm on a fictional parent of `node`. */
export function serializeNode(node: NodeImpl): string {
  if (inHTMLDocument(node)) return runHtml(node, false, null, true);
  return serializeXML(node, true);
}

export interface GetHTMLOptions {
  serializableShadowRoots?: boolean;
  shadowRoots?: readonly unknown[];
}

/**
 * Element.getHTML() / ShadowRoot.getHTML(): https://html.spec.whatwg.org/#dom-element-gethtml
 * (always the HTML fragment serialization algorithm). `shadowRoots` holds ShadowRoot wrappers.
 */
export function getHTML(node: NodeImpl, options?: GetHTMLOptions): string {
  const serializable = options?.serializableShadowRoots === true;
  const roots = options?.shadowRoots;
  return runHtml(node, serializable, roots !== undefined && roots.length !== 0 ? roots : null, false);
}

/** HTML fragment serialization of `node`'s children, regardless of the document type. */
export function serializeHTMLChildren(node: NodeImpl): string {
  return runHtml(node, false, null, false);
}

// --- XML -------------------------------------------------------------------------------------
// https://w3c.github.io/DOM-Parsing/#dfn-xml-serialization

class XmlError extends Error {}

function invalid(message: string): never {
  throw new XmlError(message);
}

type PrefixMap = Map<string | null, string[]>;

function copyMap(map: PrefixMap): PrefixMap {
  const out: PrefixMap = new Map();
  for (const [k, v] of map) out.set(k, v.slice());
  return out;
}

/** https://w3c.github.io/DOM-Parsing/#dfn-retrieving-a-preferred-prefix-string */
function preferredPrefix(map: PrefixMap, preferred: string | null, ns: string | null): string | null {
  const list = map.get(ns);
  if (list === undefined || list.length === 0) return null;
  for (let i = 0; i < list.length; i++) if (list[i] === preferred) return list[i];
  return list[list.length - 1];
}

function prefixFound(map: PrefixMap, prefix: string, ns: string | null): boolean {
  const list = map.get(ns);
  return list !== undefined && list.includes(prefix);
}

function addPrefix(map: PrefixMap, prefix: string, ns: string | null): void {
  const list = map.get(ns);
  if (list === undefined) map.set(ns, [prefix]);
  else list.push(prefix);
}

class PrefixIndex {
  value = 1;
}

/** https://w3c.github.io/DOM-Parsing/#dfn-generating-a-prefix */
function generatePrefix(map: PrefixMap, ns: string | null, index: PrefixIndex): string {
  const prefix = "ns" + String(index.value++);
  addPrefix(map, prefix, ns);
  return prefix;
}

/** XML `Char` production. */
function hasInvalidXmlChars(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x9 || c === 0xa || c === 0xd) continue;
    if (c < 0x20 || c === 0xfffe || c === 0xffff) return true;
    if (c >= 0xd800 && c <= 0xdbff) {
      const d = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
      if (d < 0xdc00 || d > 0xdfff) return true;
      i++;
    } else if (c >= 0xdc00 && c <= 0xdfff) return true;
  }
  return false;
}

function isNameStart(c: number): boolean {
  return (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || c === 58 || c === 95 || (c >= 0xc0 && c !== 0xd7 && c !== 0xf7);
}

/** XML `Name` production (approximation over UTF-16 code units). */
function isXmlName(s: string): boolean {
  if (s.length === 0 || !isNameStart(s.charCodeAt(0))) return false;
  for (let i = 1; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (!(isNameStart(c) || (c >= 48 && c <= 57) || c === 45 || c === 46 || c === 0xb7)) return false;
  }
  return true;
}

function escapeXmlText(s: string): string {
  let out = "";
  let last = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    let rep = "";
    if (c === 38) rep = "&amp;";
    else if (c === 60) rep = "&lt;";
    else if (c === 62) rep = "&gt;";
    else continue;
    out += s.slice(last, i) + rep;
    last = i + 1;
  }
  return last === 0 ? s : out + s.slice(last);
}

/** https://w3c.github.io/DOM-Parsing/#dfn-serializing-an-attribute-value */
function serializeAttrValue(value: string | null, rwf: boolean): string {
  if (value === null) return "";
  if (rwf && hasInvalidXmlChars(value)) invalid("attribute value contains invalid characters");
  let out = "";
  let last = 0;
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    let rep = "";
    if (c === 38) rep = "&amp;";
    else if (c === 34) rep = "&quot;";
    else if (c === 60) rep = "&lt;";
    else if (c === 62) rep = "&gt;";
    // Not in DOM-Parsing (https://github.com/w3c/DOM-Parsing/issues/59), but what browsers and
    // w3c-xmlserializer (jsdom) do so that attribute values round-trip through an XML parser.
    else if (c === 9) rep = "&#x9;";
    else if (c === 10) rep = "&#xA;";
    else if (c === 13) rep = "&#xD;";
    else continue;
    out += value.slice(last, i) + rep;
    last = i + 1;
  }
  return last === 0 ? value : out + value.slice(last);
}

/** Whether `prefix` is bound to any namespace in `map`. */
function prefixBound(map: PrefixMap, prefix: string): boolean {
  for (const list of map.values()) if (list.includes(prefix)) return true;
  return false;
}

const XML_VOID = new Set([
  "area", "base", "basefont", "bgsound", "br", "col", "embed", "frame", "hr", "img", "input", "keygen", "link",
  "menuitem", "meta", "param", "source", "track", "wbr",
]);

/** https://w3c.github.io/DOM-Parsing/#dfn-recording-the-namespace-information */
function recordNamespaceInformation(el: NodeImpl, map: PrefixMap, localPrefixes: Map<string, string>): string | null {
  let defaultNs: string | null = null;
  const attrs = el.attrs;
  if (attrs === null) return null;
  for (let i = 0; i < attrs.length; i++) {
    const a = attrs[i];
    if (a.ns !== XMLNS_NS) continue;
    if (a.prefix === null) {
      defaultNs = a.value;
      continue;
    }
    const prefixDefinition = a.localName;
    let nsDefinition: string | null = a.value;
    if (nsDefinition === XML_NS) continue;
    if (nsDefinition === "") nsDefinition = null;
    if (prefixFound(map, prefixDefinition, nsDefinition)) continue;
    addPrefix(map, prefixDefinition, nsDefinition);
    localPrefixes.set(prefixDefinition, nsDefinition ?? "");
  }
  return defaultNs;
}

/** https://w3c.github.io/DOM-Parsing/#dfn-serializing-an-element-s-attributes */
function serializeAttributes(
  el: NodeImpl,
  map: PrefixMap,
  index: PrefixIndex,
  localPrefixes: Map<string, string>,
  ignoreNsDefinition: boolean,
  rwf: boolean,
): string {
  let result = "";
  const attrs = el.attrs;
  if (attrs === null) return result;
  const seen = rwf ? new Set<string>() : null;
  for (let i = 0; i < attrs.length; i++) {
    const a = attrs[i];
    if (seen !== null) {
      const key = (a.ns ?? "") + "\u0000" + a.localName;
      if (seen.has(key)) invalid("duplicate attribute");
      seen.add(key);
    }
    const attrNs = a.ns;
    // A no-namespace attribute named "xmlns" (setAttribute("xmlns", ...)) is not a namespace
    // declaration, and would contradict (or duplicate) the declaration the element's own
    // namespace produces: browsers drop it (WPT "Drop inconsistent xmlns=... by matching on
    // local name"; https://github.com/w3c/DOM-Parsing/issues/47).
    if (attrNs === null && a.localName === "xmlns") {
      if (rwf) invalid("invalid attribute name");
      continue;
    }
    let candidate: string | null = null;
    if (attrNs !== null) {
      candidate = preferredPrefix(map, a.prefix, attrNs);
      if (attrNs === XMLNS_NS) {
        if (
          a.value === XML_NS ||
          (a.prefix === null && ignoreNsDefinition) ||
          (a.prefix !== null && (!localPrefixes.has(a.localName) || localPrefixes.get(a.localName) !== a.value))
        ) {
          continue;
        }
        if (rwf && a.value === XMLNS_NS) invalid("xmlns namespace declared as a value");
        if (rwf && a.value === "") invalid("empty namespace declaration");
        if (a.prefix === "xmlns") candidate = "xmlns";
      } else if (candidate === null) {
        // Deviation from "generate a prefix", matching browsers (WPT "Check if no special handling
        // for XLink namespace unlike HTML serializer"): an XLink attribute keeps its own prefix
        // when that prefix is not bound yet; other namespaces get a generated prefix
        // (https://github.com/w3c/DOM-Parsing/issues/29).
        if (attrNs === XLINK_NS && a.prefix !== null && !localPrefixes.has(a.prefix) && !prefixBound(map, a.prefix)) {
          candidate = a.prefix;
          addPrefix(map, candidate, attrNs);
        } else {
          candidate = generatePrefix(map, attrNs, index);
        }
        result += " xmlns:" + candidate + '="' + serializeAttrValue(attrNs, rwf) + '"';
      }
    }
    result += " ";
    if (candidate !== null) result += candidate + ":";
    if (rwf && (a.localName.includes(":") || !isXmlName(a.localName) || (a.localName === "xmlns" && attrNs === null))) {
      invalid("invalid attribute name");
    }
    result += a.localName + '="' + serializeAttrValue(a.value, rwf) + '"';
  }
  return result;
}

function serializeElementXML(el: NodeImpl, namespace: string | null, map: PrefixMap, index: PrefixIndex, rwf: boolean): string {
  const localName = el.name;
  if (rwf && (localName.includes(":") || !isXmlName(localName))) invalid("invalid element name");
  let markup = "<";
  let qualifiedName = "";
  let skipEndTag = false;
  let ignoreNsDefinition = false;
  map = copyMap(map);
  const localPrefixes = new Map<string, string>();
  const localDefaultNs = recordNamespaceInformation(el, map, localPrefixes);
  let inheritedNs = namespace;
  const ns = el.ns;
  if (inheritedNs === ns) {
    if (localDefaultNs !== null) ignoreNsDefinition = true;
    qualifiedName = ns === XML_NS ? "xml:" + localName : localName;
    markup += qualifiedName;
  } else {
    let prefix = el.prefix;
    let candidate = preferredPrefix(map, prefix, ns);
    if (prefix === "xmlns") {
      if (rwf) invalid("element prefix xmlns");
      candidate = prefix;
    }
    if (candidate !== null) {
      qualifiedName = candidate + ":" + localName;
      if (localDefaultNs !== null && localDefaultNs !== XML_NS) inheritedNs = localDefaultNs === "" ? null : localDefaultNs;
      markup += qualifiedName;
    } else if (prefix !== null) {
      if (localPrefixes.has(prefix)) prefix = generatePrefix(map, ns, index);
      else addPrefix(map, prefix, ns);
      qualifiedName = prefix + ":" + localName;
      markup += qualifiedName + " xmlns:" + prefix + '="' + serializeAttrValue(ns, rwf) + '"';
      if (localDefaultNs !== null) inheritedNs = localDefaultNs === "" ? null : localDefaultNs;
    } else if (localDefaultNs === null || localDefaultNs !== ns) {
      ignoreNsDefinition = true;
      qualifiedName = localName;
      inheritedNs = ns;
      markup += qualifiedName + ' xmlns="' + serializeAttrValue(ns, rwf) + '"';
    } else {
      qualifiedName = localName;
      inheritedNs = ns;
      markup += qualifiedName;
    }
  }
  markup += serializeAttributes(el, map, index, localPrefixes, ignoreNsDefinition, rwf);
  const isTemplate = ns === HTML_NS && localName === "template";
  const children = isTemplate ? templateContentsOf(el) : el;
  if (ns === HTML_NS && children.first === null && XML_VOID.has(localName)) {
    markup += " /";
    skipEndTag = true;
  } else if (ns !== HTML_NS && children.first === null) {
    markup += "/";
    skipEndTag = true;
  }
  markup += ">";
  if (skipEndTag) return markup;
  for (let c = children.first; c !== null; c = c.next) markup += xmlNode(c, inheritedNs, map, index, rwf);
  return markup + "</" + qualifiedName + ">";
}

/** https://w3c.github.io/DOM-Parsing/#dfn-xml-serialization-algorithm */
function xmlNode(node: NodeImpl, namespace: string | null, map: PrefixMap, index: PrefixIndex, rwf: boolean): string {
  switch (node.type) {
    case ELEMENT_NODE:
      return serializeElementXML(node, namespace, map, index, rwf);
    case DOCUMENT_NODE: {
      if (rwf) {
        let hasElement = false;
        for (let c = node.first; c !== null; c = c.next) if (c.type === ELEMENT_NODE) hasElement = true;
        if (!hasElement) invalid("document without a document element");
      }
      let s = "";
      for (let c = node.first; c !== null; c = c.next) s += xmlNode(c, namespace, map, index, rwf);
      return s;
    }
    case DOCUMENT_FRAGMENT_NODE: {
      let s = "";
      for (let c = node.first; c !== null; c = c.next) s += xmlNode(c, namespace, map, index, rwf);
      return s;
    }
    case COMMENT_NODE: {
      const d = node.data;
      if (rwf && (hasInvalidXmlChars(d) || d.includes("--") || d.endsWith("-"))) invalid("invalid comment");
      return "<!--" + d + "-->";
    }
    case TEXT_NODE: {
      const d = node.data;
      if (rwf && hasInvalidXmlChars(d)) invalid("invalid text");
      return escapeXmlText(d);
    }
    case CDATA_SECTION_NODE:
      return "<![CDATA[" + node.data + "]]>";
    case DOCUMENT_TYPE_NODE: {
      const dt = node.node as unknown as { publicId: string; systemId: string };
      if (rwf) {
        if (hasInvalidXmlChars(dt.publicId)) invalid("invalid doctype public id");
        if (hasInvalidXmlChars(dt.systemId) || (dt.systemId.includes('"') && dt.systemId.includes("'"))) {
          invalid("invalid doctype system id");
        }
      }
      let s = "<!DOCTYPE " + node.name;
      if (dt.publicId !== "") s += ' PUBLIC "' + dt.publicId + '"';
      if (dt.systemId !== "" && dt.publicId === "") s += " SYSTEM";
      if (dt.systemId !== "") s += ' "' + dt.systemId + '"';
      return s + ">";
    }
    case PROCESSING_INSTRUCTION_NODE: {
      if (rwf && (node.name.includes(":") || node.name.toLowerCase() === "xml" || hasInvalidXmlChars(node.data) || node.data.includes("?>"))) {
        invalid("invalid processing instruction");
      }
      return "<?" + node.name + " " + node.data + "?>";
    }
  }
  return "";
}

/**
 * https://w3c.github.io/DOM-Parsing/#dfn-concept-serialize-xml — throws an
 * "InvalidStateError" DOMException when `requireWellFormed` and the node cannot be serialized.
 * XMLSerializer.serializeToString passes false.
 */
export function serializeXML(node: NodeImpl, requireWellFormed: boolean): string {
  const map: PrefixMap = new Map();
  map.set(XML_NS, ["xml"]);
  try {
    return xmlNode(node, null, map, new PrefixIndex(), requireWellFormed);
  } catch (e) {
    if (e instanceof XmlError) throw new DOMException(`The node could not be serialized as XML: ${e.message}.`, "InvalidStateError");
    throw e;
  }
}
