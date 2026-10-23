// A small namespace-aware XML parser for DOMParser (text/xml, application/xml,
// application/xhtml+xml, image/svg+xml) and for the XML fragment parsing algorithm
// (innerHTML & co. on elements of XML documents).
// https://html.spec.whatwg.org/#dom-domparser-parsefromstring
// https://html.spec.whatwg.org/#xml-fragment-parsing-algorithm
// https://www.w3.org/TR/xml/ and https://www.w3.org/TR/xml-names/
//
// Non-validating: DOCTYPE internal subsets are skipped (internal general entities declared
// there are honoured for simple replacement text), external entities are never loaded.
// On a well-formedness error the document gets a single <parsererror> element in the
// Mozilla parsererror namespace whose text is the error message — what jsdom does (and the
// shape Firefox uses), so `doc.getElementsByTagName("parsererror")` checks keep working.

import {
  ELEMENT_NODE,
  HTML_NS,
  XMLNS_NS,
  XML_NS,
} from "../nodes/constants.ts";
import type { Document } from "../nodes/Document.ts";
import type { NodeImpl } from "../nodes/NodeImpl.ts";
import { createElementImpl } from "../nodes/create.ts";
import { append, appendDetached } from "../nodes/tree.ts";
import { appendAttributeDetached } from "../nodes/attributes.ts";
import { CDATASection, Comment, ProcessingInstruction, Text } from "../nodes/CharacterData.ts";
import { DocumentFragment } from "../nodes/DocumentFragment.ts";
import { DocumentType } from "../nodes/DocumentType.ts";

export const PARSERERROR_NS = "http://www.mozilla.org/newlayout/xml/parsererror.xml";

class XMLParseError extends Error {}

const PREDEFINED: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

function isNameStartCode(c: number): boolean {
  return (
    (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || c === 58 || c === 95 ||
    (c >= 0xc0 && c <= 0xd6) || (c >= 0xd8 && c <= 0xf6) || (c >= 0xf8 && c <= 0x2ff) ||
    (c >= 0x370 && c <= 0x37d) || (c >= 0x37f && c <= 0x1fff) || (c >= 0x200c && c <= 0x200d) ||
    (c >= 0x2070 && c <= 0x218f) || (c >= 0x2c00 && c <= 0x2fef) || (c >= 0x3001 && c <= 0xd7ff) ||
    (c >= 0xf900 && c <= 0xfdcf) || (c >= 0xfdf0 && c <= 0xfffd) || (c >= 0xd800 && c <= 0xdbff)
  );
}

function isNameCode(c: number): boolean {
  return (
    isNameStartCode(c) || (c >= 48 && c <= 57) || c === 45 || c === 46 || c === 0xb7 ||
    (c >= 0x300 && c <= 0x36f) || (c >= 0x203f && c <= 0x2040) || (c >= 0xdc00 && c <= 0xdfff)
  );
}

function isWs(c: number): boolean {
  return c === 0x20 || c === 0x9 || c === 0xa || c === 0xd;
}

/** XML `Char` (rejects C0 controls other than tab/LF/CR, U+FFFE/U+FFFF, lone surrogates). */
function checkChars(s: string, p: XMLParser): void {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x20 && c !== 0x9 && c !== 0xa && c !== 0xd) p.fail("invalid character");
    if (c === 0xfffe || c === 0xffff) p.fail("invalid character");
  }
}

interface Scope {
  /** prefix ("" = default) → namespace ("" = none) */
  bindings: Map<string, string>;
}

class XMLParser {
  src: string;
  pos: number;
  doc: Document;
  entities: Map<string, string>;

  constructor(src: string, doc: Document) {
    // https://www.w3.org/TR/xml/#sec-line-ends
    this.src = src.replace(/\r\n?/g, "\n");
    this.pos = 0;
    this.doc = doc;
    this.entities = new Map();
  }

  fail(message: string): never {
    const before = this.src.slice(0, this.pos);
    const line = before.split("\n").length;
    const column = this.pos - before.lastIndexOf("\n");
    throw new XMLParseError(`${message} (line ${line}, column ${column})`);
  }

  private startsWith(s: string): boolean {
    return this.src.startsWith(s, this.pos);
  }

  private skipWs(): boolean {
    const start = this.pos;
    while (this.pos < this.src.length && isWs(this.src.charCodeAt(this.pos))) this.pos++;
    return this.pos > start;
  }

  private name(): string {
    const src = this.src;
    const start = this.pos;
    if (start >= src.length || !isNameStartCode(src.charCodeAt(start))) this.fail("expected a name");
    this.pos++;
    while (this.pos < src.length && isNameCode(src.charCodeAt(this.pos))) this.pos++;
    return src.slice(start, this.pos);
  }

  private expect(s: string): void {
    if (!this.startsWith(s)) this.fail(`expected "${s}"`);
    this.pos += s.length;
  }

  /** Character and entity references in content / attribute values. */
  private reference(): string {
    // at "&"
    this.pos++;
    const src = this.src;
    if (src.charCodeAt(this.pos) === 35) {
      this.pos++;
      let hex = false;
      if (src.charCodeAt(this.pos) === 120) {
        hex = true;
        this.pos++;
      }
      const start = this.pos;
      while (this.pos < src.length && src.charCodeAt(this.pos) !== 59) this.pos++;
      const digits = src.slice(start, this.pos);
      if (digits === "" || !(hex ? /^[0-9a-fA-F]+$/ : /^[0-9]+$/).test(digits)) this.fail("invalid character reference");
      this.expect(";");
      const code = parseInt(digits, hex ? 16 : 10);
      if (
        !(code === 0x9 || code === 0xa || code === 0xd || (code >= 0x20 && code <= 0xd7ff) ||
          (code >= 0xe000 && code <= 0xfffd) || (code >= 0x10000 && code <= 0x10ffff))
      ) {
        this.fail("character reference to an invalid character");
      }
      return String.fromCodePoint(code);
    }
    const name = this.name();
    this.expect(";");
    const predefined = PREDEFINED[name];
    if (predefined !== undefined) return predefined;
    const declared = this.entities.get(name);
    if (declared !== undefined) return declared;
    this.fail(`undefined entity "${name}"`);
  }

  private comment(parent: NodeImpl): void {
    this.pos += 4; // "<!--"
    const end = this.src.indexOf("--", this.pos);
    if (end < 0) this.fail("unterminated comment");
    if (this.src.charCodeAt(end + 2) !== 62) {
      this.pos = end;
      this.fail('"--" is not allowed in comments');
    }
    const data = this.src.slice(this.pos, end);
    checkChars(data, this);
    appendDetached(new Comment(data, this.doc)._impl, parent);
    this.pos = end + 3;
  }

  private pi(parent: NodeImpl | null): void {
    this.pos += 2; // "<?"
    const target = this.name();
    if (target.includes(":")) this.fail("processing instruction target contains a colon");
    let data = "";
    if (this.startsWith("?>")) {
      this.pos += 2;
    } else {
      if (!this.skipWs()) this.fail("expected whitespace after the processing instruction target");
      const end = this.src.indexOf("?>", this.pos);
      if (end < 0) this.fail("unterminated processing instruction");
      data = this.src.slice(this.pos, end);
      this.pos = end + 2;
    }
    if (target.toLowerCase() === "xml") {
      if (parent === null) return; // XML declaration
      this.fail("XML declaration not at the start of the document");
    }
    checkChars(data, this);
    if (parent !== null) appendDetached(new ProcessingInstruction(target, data, this.doc)._impl, parent);
  }

  private quoted(): string {
    const q = this.src.charCodeAt(this.pos);
    if (q !== 34 && q !== 39) this.fail("expected a quoted string");
    const end = this.src.indexOf(q === 34 ? '"' : "'", this.pos + 1);
    if (end < 0) this.fail("unterminated quoted string");
    const s = this.src.slice(this.pos + 1, end);
    this.pos = end + 1;
    return s;
  }

  private doctype(parent: NodeImpl): void {
    this.pos += 9; // "<!DOCTYPE"
    if (!this.skipWs()) this.fail("expected whitespace after DOCTYPE");
    const name = this.name();
    let publicId = "";
    let systemId = "";
    this.skipWs();
    if (this.startsWith("PUBLIC")) {
      this.pos += 6;
      this.skipWs();
      publicId = this.quoted();
      this.skipWs();
      if (this.src.charCodeAt(this.pos) === 34 || this.src.charCodeAt(this.pos) === 39) systemId = this.quoted();
    } else if (this.startsWith("SYSTEM")) {
      this.pos += 6;
      this.skipWs();
      systemId = this.quoted();
    }
    this.skipWs();
    if (this.src.charCodeAt(this.pos) === 91) {
      this.internalSubset();
      this.skipWs();
    }
    this.expect(">");
    appendDetached(new DocumentType(this.doc, name, publicId, systemId)._impl, parent);
  }

  /** Skip the internal subset, recording simple internal general entities. */
  private internalSubset(): void {
    const src = this.src;
    this.pos++; // "["
    while (this.pos < src.length) {
      const c = src.charCodeAt(this.pos);
      if (c === 93) {
        this.pos++;
        return;
      }
      if (this.startsWith("<!--")) {
        const end = src.indexOf("-->", this.pos + 4);
        if (end < 0) this.fail("unterminated comment");
        this.pos = end + 3;
      } else if (this.startsWith("<!ENTITY")) {
        this.pos += 8;
        this.skipWs();
        let parameter = false;
        if (src.charCodeAt(this.pos) === 37) {
          parameter = true;
          this.pos++;
          this.skipWs();
        }
        const name = this.name();
        this.skipWs();
        if (src.charCodeAt(this.pos) === 34 || src.charCodeAt(this.pos) === 39) {
          const value = this.quoted();
          if (!parameter && !this.entities.has(name) && !value.includes("<") && !value.includes("&")) this.entities.set(name, value);
        }
        this.skipToDeclEnd();
      } else if (this.startsWith("<?")) {
        const end = src.indexOf("?>", this.pos);
        if (end < 0) this.fail("unterminated processing instruction");
        this.pos = end + 2;
      } else if (this.startsWith("<!")) {
        this.pos += 2;
        this.skipToDeclEnd();
      } else {
        this.pos++;
      }
    }
    this.fail("unterminated DOCTYPE internal subset");
  }

  private skipToDeclEnd(): void {
    const src = this.src;
    while (this.pos < src.length) {
      const c = src.charCodeAt(this.pos);
      if (c === 34 || c === 39) this.quoted();
      else if (c === 62) {
        this.pos++;
        return;
      } else this.pos++;
    }
    this.fail("unterminated markup declaration");
  }

  private lookup(scope: Scope, prefix: string): string | null {
    const ns = scope.bindings.get(prefix);
    if (ns === undefined || ns === "") return null;
    return ns;
  }

  /** Parse an element (at "<"); appends it to `parent`. */
  private element(parent: NodeImpl, outer: Scope): void {
    const src = this.src;
    this.pos++; // "<"
    const qname = this.name();
    const names: string[] = [];
    const values: string[] = [];
    let selfClosing = false;
    for (;;) {
      const hadWs = this.skipWs();
      if (this.pos >= src.length) this.fail("unexpected end of input in a start tag");
      const c = src.charCodeAt(this.pos);
      if (c === 62) {
        this.pos++;
        break;
      }
      if (c === 47) {
        this.expect("/>");
        selfClosing = true;
        break;
      }
      if (!hadWs) this.fail("expected whitespace between attributes");
      const an = this.name();
      this.skipWs();
      this.expect("=");
      this.skipWs();
      const av = this.attributeValue();
      if (names.includes(an)) this.fail(`duplicate attribute "${an}"`);
      names.push(an);
      values.push(av);
    }
    // Namespace declarations.
    let scope = outer;
    for (let i = 0; i < names.length; i++) {
      const an = names[i];
      if (an === "xmlns" || an.startsWith("xmlns:")) {
        if (scope === outer) scope = { bindings: new Map(outer.bindings) };
        const prefix = an === "xmlns" ? "" : an.slice(6);
        const value = values[i];
        if (prefix === "xml" && value !== XML_NS) this.fail("the xml prefix cannot be rebound");
        if (prefix === "xmlns") this.fail("the xmlns prefix cannot be declared");
        if (prefix !== "" && value === "") this.fail(`empty namespace for prefix "${prefix}"`);
        if (value === XMLNS_NS || (value === XML_NS && prefix !== "xml")) this.fail("reserved namespace");
        scope.bindings.set(prefix, value);
      }
    }
    const colon = qname.indexOf(":");
    let prefix: string | null = null;
    let localName = qname;
    let ns: string | null;
    if (colon >= 0) {
      prefix = qname.slice(0, colon);
      localName = qname.slice(colon + 1);
      if (prefix === "" || localName === "" || localName.includes(":")) this.fail(`invalid qualified name "${qname}"`);
      ns = this.lookup(scope, prefix);
      if (ns === null) this.fail(`unbound namespace prefix "${prefix}"`);
    } else {
      ns = this.lookup(scope, "");
    }
    const el = createElementImpl(this.doc, localName, ns, prefix);
    const seen = new Set<string>();
    for (let i = 0; i < names.length; i++) {
      const an = names[i];
      const ac = an.indexOf(":");
      let aPrefix: string | null = null;
      let aLocal = an;
      let aNs: string | null = null;
      if (an === "xmlns") {
        aNs = XMLNS_NS;
      } else if (ac >= 0) {
        aPrefix = an.slice(0, ac);
        aLocal = an.slice(ac + 1);
        if (aPrefix === "" || aLocal === "" || aLocal.includes(":")) this.fail(`invalid attribute name "${an}"`);
        if (aPrefix === "xmlns") aNs = XMLNS_NS;
        else if (aPrefix === "xml") aNs = XML_NS;
        else {
          aNs = this.lookup(scope, aPrefix);
          if (aNs === null) this.fail(`unbound namespace prefix "${aPrefix}"`);
        }
      }
      const key = (aNs ?? "") + " " + aLocal;
      if (seen.has(key)) this.fail(`duplicate attribute "${an}"`);
      seen.add(key);
      appendAttributeDetached(el, aLocal, values[i], aNs, aPrefix);
    }
    appendDetached(el, parent);
    if (selfClosing) return;
    this.content(el, scope);
    // End tag.
    this.expect("</");
    const endName = this.name();
    if (endName !== qname) this.fail(`mismatched end tag: expected "</${qname}>"`);
    this.skipWs();
    this.expect(">");
  }

  /** https://www.w3.org/TR/xml/#AVNormalize */
  private attributeValue(): string {
    const src = this.src;
    const q = src.charCodeAt(this.pos);
    if (q !== 34 && q !== 39) this.fail("expected a quoted attribute value");
    this.pos++;
    let out = "";
    let last = this.pos;
    for (;;) {
      if (this.pos >= src.length) this.fail("unterminated attribute value");
      const c = src.charCodeAt(this.pos);
      if (c === q) break;
      if (c === 60) this.fail('"<" is not allowed in attribute values');
      if (c === 38) {
        out += src.slice(last, this.pos);
        out += this.reference();
        last = this.pos;
        continue;
      }
      if (c === 0x9 || c === 0xa || c === 0xd) {
        out += src.slice(last, this.pos) + " ";
        last = this.pos + 1;
      }
      this.pos++;
    }
    out += src.slice(last, this.pos);
    this.pos++;
    checkChars(out, this);
    return out;
  }

  /** Element content up to (not including) the end tag "</". */
  private content(parent: NodeImpl, scope: Scope): void {
    const src = this.src;
    let text = "";
    for (;;) {
      if (this.pos >= src.length) this.fail("unexpected end of input: unclosed element");
      const c = src.charCodeAt(this.pos);
      if (c === 60) {
        if (src.charCodeAt(this.pos + 1) === 47) break;
        this.flushText(parent, text);
        text = "";
        if (this.startsWith("<!--")) this.comment(parent);
        else if (this.startsWith("<![CDATA[")) {
          const end = src.indexOf("]]>", this.pos + 9);
          if (end < 0) this.fail("unterminated CDATA section");
          const data = src.slice(this.pos + 9, end);
          checkChars(data, this);
          appendDetached(new CDATASection(data, this.doc)._impl, parent);
          this.pos = end + 3;
        } else if (this.startsWith("<?")) this.pi(parent);
        else if (this.startsWith("<!")) this.fail("unexpected markup declaration");
        else this.element(parent, scope);
        continue;
      }
      if (c === 38) {
        text += this.reference();
        continue;
      }
      const start = this.pos;
      while (this.pos < src.length) {
        const d = src.charCodeAt(this.pos);
        if (d === 60 || d === 38) break;
        this.pos++;
      }
      const run = src.slice(start, this.pos);
      if (run.includes("]]>")) {
        this.pos = start + run.indexOf("]]>");
        this.fail('"]]>" is not allowed in content');
      }
      text += run;
    }
    this.flushText(parent, text);
  }

  private flushText(parent: NodeImpl, text: string): void {
    if (text === "") return;
    checkChars(text, this);
    const last = parent.last;
    if (last !== null && last.type === 3) last.data += text;
    else appendDetached(new Text(text, this.doc)._impl, parent);
  }

  /** document ::= prolog element Misc* */
  parseDocument(root: NodeImpl): void {
    const src = this.src;
    if (src.charCodeAt(0) === 0xfeff) this.pos = 1;
    if (this.startsWith("<?xml") && isWs(src.charCodeAt(this.pos + 5))) this.pi(null);
    const scope: Scope = { bindings: new Map([["xml", XML_NS]]) };
    let sawElement = false;
    let sawDoctype = false;
    for (;;) {
      this.skipWs();
      if (this.pos >= src.length) break;
      if (this.startsWith("<!--")) this.comment(root);
      else if (this.startsWith("<?")) this.pi(root);
      else if (this.startsWith("<!DOCTYPE")) {
        if (sawDoctype || sawElement) this.fail("unexpected DOCTYPE");
        sawDoctype = true;
        this.doctype(root);
      } else if (src.charCodeAt(this.pos) === 60 && this.pos + 1 < src.length && isNameStartCode(src.charCodeAt(this.pos + 1))) {
        if (sawElement) this.fail("junk after document element");
        sawElement = true;
        this.element(root, scope);
      } else if (sawElement) this.fail("junk after document element");
      else this.fail(src.charCodeAt(this.pos) === 60 ? "not well-formed" : "text outside of the document element");
    }
    if (!sawElement) this.fail("no root element found");
  }

  /** content of an element whose in-scope namespaces are `scope` (XML fragment parsing). */
  parseFragment(root: NodeImpl, scope: Scope): void {
    this.src += "</";
    this.content(root, scope);
    if (this.pos !== this.src.length - 2) this.fail("not well-formed");
  }
}

/**
 * https://html.spec.whatwg.org/#dom-domparser-parsefromstring (XML types): parse `text` into the
 * empty XML document `doc`. On error `doc` gets a <parsererror> document element instead.
 */
export function parseXML(text: string, doc: Document, contentType: string): void {
  void contentType;
  const fragment = new DocumentFragment(doc)._impl;
  try {
    new XMLParser(String(text), doc).parseDocument(fragment);
  } catch (e) {
    if (!(e instanceof XMLParseError)) throw e;
    const error = createElementImpl(doc, "parsererror", PARSERERROR_NS, null);
    appendDetached(new Text(e.message, doc)._impl, error);
    append(error, doc._impl);
    return;
  }
  append(fragment, doc._impl);
}

/**
 * https://html.spec.whatwg.org/#xml-fragment-parsing-algorithm — `markup` parsed as the
 * content of `context` with its in-scope namespace declarations. Throws a "SyntaxError"
 * DOMException when it is not well-formed.
 */
export function parseXMLFragment(markup: string, context: NodeImpl): NodeImpl {
  const doc = context.doc;
  const fragment = new DocumentFragment(doc)._impl;
  // In-scope namespaces: walk up from the context element (nearest declaration wins); the
  // context element's own namespace is the default namespace.
  const bindings = new Map<string, string>([["xml", XML_NS]]);
  const chain: NodeImpl[] = [];
  for (let n: NodeImpl | null = context; n !== null; n = n.parent) if (n.type === ELEMENT_NODE) chain.push(n);
  for (let i = chain.length - 1; i >= 0; i--) {
    const el = chain[i];
    if (el.prefix !== null && el.ns !== null) bindings.set(el.prefix, el.ns);
    const attrs = el.attrs;
    if (attrs !== null) {
      for (const a of attrs) {
        if (a.ns !== XMLNS_NS) continue;
        bindings.set(a.prefix === null ? "" : a.localName, a.value);
      }
    }
  }
  bindings.set("", context.type === ELEMENT_NODE ? (context.ns ?? "") : HTML_NS);
  try {
    new XMLParser(String(markup), doc).parseFragment(fragment, { bindings });
  } catch (e) {
    if (e instanceof XMLParseError) throw new DOMException(`The provided markup is not well-formed XML: ${e.message}.`, "SyntaxError");
    throw e;
  }
  return fragment;
}
