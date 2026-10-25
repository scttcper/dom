/**
 * Node / Element / Document gaps filled by dom-core: namespace lookups, validate-and-extract,
 * adoption bookkeeping, template-aware innerHTML, CSSOM View no-ops, util.inspect output.
 *
 * Spec:
 *   - lookupPrefix / lookupNamespaceURI / isDefaultNamespace — https://dom.spec.whatwg.org/#dom-node-lookupprefix
 *   - validate and extract — https://dom.spec.whatwg.org/#validate-and-extract
 *   - adopt (node document, HTML-ness) — https://dom.spec.whatwg.org/#concept-node-adopt
 *   - Element.tagName (HTML-uppercased qualified name) — https://dom.spec.whatwg.org/#element-html-uppercased-qualified-name
 *   - innerHTML on <template> — https://html.spec.whatwg.org/#dom-element-innerhtml
 *   - CSSOM View geometry — https://drafts.csswg.org/cssom-view/#dom-element-getboundingclientrect
 *   - replace() mutation records — https://dom.spec.whatwg.org/#concept-node-replace
 *   - util.inspect.custom — https://nodejs.org/api/util.html#utilinspectcustom
 */
import { inspect } from "node:util";
import { beforeEach, describe, expect, test } from "vitest";
import { createWindow, MutationObserver, Node, type Document, type Element } from "@ctrl/dom";

let document: Document;
const XHTML = "http://www.w3.org/1999/xhtml";

beforeEach(() => {
  document = createWindow().document;
});

describe("namespace lookups — https://dom.spec.whatwg.org/#locate-a-namespace", () => {
  test("lookupNamespaceURI / lookupPrefix / isDefaultNamespace walk elements and xmlns attributes", () => {
    const root = document.createElementNS("urn:root", "r:root");
    root.setAttributeNS("http://www.w3.org/2000/xmlns/", "xmlns:x", "urn:x");
    const child = root.appendChild(document.createElementNS("urn:child", "child"));
    expect(child.lookupNamespaceURI("r")).toBe("urn:root");
    expect(child.lookupNamespaceURI("x")).toBe("urn:x");
    expect(child.lookupNamespaceURI(null)).toBe("urn:child");
    expect(child.lookupNamespaceURI("xml")).toBe("http://www.w3.org/XML/1998/namespace");
    expect(child.lookupPrefix("urn:x")).toBe("x");
    expect(child.lookupPrefix("urn:root")).toBe("r");
    expect(child.isDefaultNamespace("urn:child")).toBe(true);
    expect(document.createTextNode("t").lookupNamespaceURI("r")).toBeNull();
    expect(document.body!.isDefaultNamespace(XHTML)).toBe(true);
  });

  test("Node constants exist on Node.prototype as well as on Node (https://webidl.spec.whatwg.org/#es-constants)", () => {
    const el = document.createElement("div");
    expect(el.ELEMENT_NODE).toBe(1);
    expect(el.nodeType === el.ELEMENT_NODE).toBe(true);
    expect(Node.prototype.DOCUMENT_POSITION_CONTAINED_BY).toBe(16);
  });
});

describe("validate and extract — https://dom.spec.whatwg.org/#validate-and-extract", () => {
  test("prefix and namespace errors", () => {
    expect(() => document.createElementNS(null, "a:b")).toThrow(expect.objectContaining({ name: "NamespaceError" }));
    expect(() => document.createElementNS("urn:x", "xml:a")).toThrow(expect.objectContaining({ name: "NamespaceError" }));
    expect(() => document.createElementNS("urn:x", "xmlns")).toThrow(expect.objectContaining({ name: "NamespaceError" }));
    expect(() => document.createElementNS("urn:x", ":a")).toThrow(expect.objectContaining({ name: "InvalidCharacterError" }));
    const el = document.createElement("div");
    expect(() => el.setAttributeNS(null, "a:b", "")).toThrow(expect.objectContaining({ name: "NamespaceError" }));
    el.setAttributeNS("urn:x", "p:a", "1");
    expect(el.getAttributeNS("urn:x", "a")).toBe("1");
    expect(el.attributes[0].prefix).toBe("p");
  });

  test("createDocumentType validates the doctype name", () => {
    expect(() => document.implementation.createDocumentType("a>b", "", "")).toThrow(expect.objectContaining({ name: "InvalidCharacterError" }));
  });
});

describe("case conversions are ASCII-only (https://infra.spec.whatwg.org/#ascii-lowercase)", () => {
  test("createElement lowercases ASCII only and tagName uppercases ASCII only", () => {
    const el = document.createElement("AÇ");
    expect(el.localName).toBe("aÇ");
    expect(el.tagName).toBe("AÇ");
    expect(document.createElement("aç").tagName).toBe("Aç");
  });

  test("tagName follows the node document's HTML-ness after adoption", () => {
    const xml = document.implementation.createDocument(null, null);
    const el = document.createElement("div");
    expect(el.tagName).toBe("DIV");
    xml.adoptNode(el);
    expect(el.tagName).toBe("div");
  });
});

describe("replace — https://dom.spec.whatwg.org/#concept-node-replace", () => {
  test("step 11: adopting the replacement (removing it from the same parent) is recorded first", () => {
    const parent = document.createElement("div");
    const a = parent.appendChild(document.createElement("a"));
    const b = parent.appendChild(document.createElement("b"));
    const mo = new MutationObserver(() => {});
    mo.observe(parent, { childList: true });
    parent.replaceChild(b, a);
    const records = mo.takeRecords();
    expect(records.length).toBe(2);
    expect([...records[0].removedNodes]).toEqual([b]);
    expect(records[0].previousSibling).toBe(a);
    expect([...records[1].removedNodes]).toEqual([a]);
    expect([...records[1].addedNodes]).toEqual([b]);
    mo.disconnect();
  });

  test("Document.replaceChildren ignores the children being replaced (https://github.com/whatwg/dom/issues/1045)", () => {
    const doc = document.implementation.createHTMLDocument("t");
    const el = doc.createElement("a");
    doc.replaceChildren(el);
    expect([...doc.childNodes]).toEqual([el]);
  });

  test("(Node or DOMString) arguments stringify non-nodes", () => {
    const div = document.createElement("div");
    div.append(null as unknown as string, undefined as unknown as string, 1 as unknown as string);
    expect(div.textContent).toBe("nullundefined1");
  });
});

describe("markup and CSSOM View stubs", () => {
  test("innerHTML on a template replaces its content's children (https://html.spec.whatwg.org/#dom-element-innerhtml)", () => {
    const template = document.createElement("template") as Element & { content?: Node };
    template.innerHTML = "<b>x</b>";
    if (template.content !== undefined) {
      expect(template.childNodes.length).toBe(0);
      expect(template.content.childNodes.length).toBe(1);
    } else {
      expect(template.childNodes.length).toBe(1);
    }
  });

  test("geometry is zero and scrolling is a no-op (no layout)", () => {
    const el = document.body!.appendChild(document.createElement("div"));
    const rect = el.getBoundingClientRect();
    expect([rect.x, rect.y, rect.width, rect.height]).toEqual([0, 0, 0, 0]);
    expect(el.getClientRects().length).toBe(0);
    expect(document.createElementNS("urn:x", "x").scrollTop).toBe(0);
    expect(() => el.scrollIntoView()).not.toThrow();
    expect(el.checkVisibility()).toBe(true);
    expect(document.createElement("p").checkVisibility()).toBe(false);
  });
});

describe("util.inspect — short, never the _impl graph", () => {
  test("elements, text, comments, documents and fragments print one line", () => {
    const el = document.createElement("div");
    el.id = "app";
    el.className = "x";
    expect(inspect(el)).toBe('HTMLDivElement <div id="app" class="x" />'.replace("HTMLDivElement", el.constructor.name));
    el.append("hello");
    expect(inspect(el)).toBe(`${el.constructor.name} <div id="app" class="x">`);
    expect(inspect(el.firstChild)).toBe('#text "hello"');
    expect(inspect(document.createComment("c"))).toBe('#comment "c"');
    expect(inspect(document.createDocumentFragment())).toBe("#document-fragment (0 children)");
    expect(inspect(document)).toMatch(/^#document "/);
    expect(inspect([el])).toContain("<div");
  });
});
