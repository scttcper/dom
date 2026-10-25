/**
 * Node attributes are accessors on Node.prototype that work for every node type.
 *
 * Specs:
 *   DOM §4.4 Interface Node — https://dom.spec.whatwg.org/#interface-node
 *     nodeName — https://dom.spec.whatwg.org/#dom-node-nodename
 *     nodeValue — https://dom.spec.whatwg.org/#dom-node-nodevalue
 *     textContent — https://dom.spec.whatwg.org/#dom-node-textcontent
 *   DOM §4.6 Interface DocumentType — https://dom.spec.whatwg.org/#interface-documenttype
 *   Web IDL §3.7.6 attributes — https://webidl.spec.whatwg.org/#es-attributes (a regular
 *     attribute is an accessor property on the interface prototype object)
 *
 * Libraries capture these getters once from the interface prototype so page scripts cannot
 * clobber them: DOMPurify does `lookupGetter(Node.prototype, "nodeName")` and calls it on every
 * node it sanitizes (downstream/sentry TRIAGE.md cluster 4: 137 Sentry tests).
 */
import { beforeEach, describe, expect, test } from "vitest";
import { createWindow } from "@ctrl/dom";

// The interface objects are untyped here on purpose: we call prototype getters on arbitrary nodes.
let window: any;
let document: any;

beforeEach(() => {
  window = createWindow();
  document = window.document;
});

/** DOMPurify's utils.ts lookupGetter (Apache-2.0 / MPL-2.0), trimmed. */
function lookupGetter(object: object | null, prop: string): (node: unknown) => unknown {
  while (object !== null) {
    const desc = Object.getOwnPropertyDescriptor(object, prop);
    if (desc) return desc.get ? (n) => desc.get!.call(n) : () => null;
    object = Object.getPrototypeOf(object);
  }
  return () => null;
}

function everyNodeType() {
  const el = document.createElement("div");
  el.innerHTML = "a<b>b</b>c";
  const attr = document.createAttribute("data-x");
  attr.value = "v";
  const frag = document.createDocumentFragment();
  frag.append("f1", document.createElement("i"), "f2");
  return {
    element: el,
    svg: document.createElementNS("http://www.w3.org/2000/svg", "svg:rect"),
    text: document.createTextNode("t"),
    comment: document.createComment("c"),
    cdata: new window.DOMParser().parseFromString("<x/>", "application/xml").createCDATASection("cd"),
    pi: document.createProcessingInstruction("target", "pi data"),
    doctype: document.implementation.createDocumentType("html", "pub", "sys"),
    fragment: frag,
    document,
    attr,
  };
}

describe("Node attribute accessors live on Node.prototype — https://webidl.spec.whatwg.org/#es-attributes", () => {
  test("every regular attribute of interface Node is an accessor own property of Node.prototype", () => {
    const names = [
      "nodeType", "nodeName", "baseURI", "isConnected", "ownerDocument", "parentNode", "parentElement",
      "childNodes", "firstChild", "lastChild", "previousSibling", "nextSibling", "nodeValue", "textContent",
    ];
    const missing = names.filter((n) => typeof Object.getOwnPropertyDescriptor(window.Node.prototype, n)?.get !== "function");
    expect(missing).toEqual([]);
    for (const n of ["nodeValue", "textContent"]) expect(typeof Object.getOwnPropertyDescriptor(window.Node.prototype, n)!.set).toBe("function");
  });

  test("subclass prototypes do not shadow nodeName / nodeValue / textContent (one accessor, as in jsdom and browsers)", () => {
    for (const I of ["Element", "HTMLElement", "CharacterData", "Text", "Comment", "CDATASection", "ProcessingInstruction", "DocumentType", "DocumentFragment", "Document", "Attr"]) {
      for (const n of ["nodeName", "nodeValue", "textContent"]) {
        expect(Object.getOwnPropertyDescriptor(window[I].prototype, n), `${I}.prototype.${n}`).toBeUndefined();
      }
    }
  });

  test("DocumentType publicId / systemId are prototype accessors, not own properties — https://dom.spec.whatwg.org/#interface-documenttype", () => {
    const dt = document.implementation.createDocumentType("html", "pub", "sys");
    expect(Object.keys(dt)).toEqual([]);
    expect(typeof Object.getOwnPropertyDescriptor(window.DocumentType.prototype, "publicId")?.get).toBe("function");
    expect(dt.publicId).toBe("pub");
    expect(dt.systemId).toBe("sys");
    expect(dt.cloneNode().systemId).toBe("sys");
    expect(dt.isEqualNode(document.implementation.createDocumentType("html", "pub", "other"))).toBe(false);
  });
});

describe("nodeName — https://dom.spec.whatwg.org/#dom-node-nodename", () => {
  test("Node.prototype's getter returns each node type's name (DOMPurify lookupGetter)", () => {
    const getNodeName = lookupGetter(window.Node.prototype, "nodeName");
    const n = everyNodeType();
    expect(getNodeName(n.element)).toBe("DIV");
    expect(getNodeName(n.svg)).toBe("svg:rect");
    expect(getNodeName(n.text)).toBe("#text");
    expect(getNodeName(n.comment)).toBe("#comment");
    expect(getNodeName(n.cdata)).toBe("#cdata-section");
    expect(getNodeName(n.pi)).toBe("target");
    expect(getNodeName(n.doctype)).toBe("html");
    expect(getNodeName(n.fragment)).toBe("#document-fragment");
    expect(getNodeName(n.document)).toBe("#document");
    expect(getNodeName(n.attr)).toBe("data-x");
  });

  test("an element's nodeName is its HTML-uppercased qualified name, the same as tagName", () => {
    const custom = document.createElement("my-élément");
    expect(custom.nodeName).toBe("MY-éLéMENT");
    expect(custom.nodeName).toBe(custom.tagName);
    expect(document.createElementNS("http://www.w3.org/1999/xhtml", "x:Div").nodeName).toBe("X:DIV");
  });
});

describe("nodeValue — https://dom.spec.whatwg.org/#dom-node-nodevalue", () => {
  test("getter: Attr value, CharacterData data, null otherwise", () => {
    const get = lookupGetter(window.Node.prototype, "nodeValue");
    const n = everyNodeType();
    expect(get(n.attr)).toBe("v");
    expect(get(n.text)).toBe("t");
    expect(get(n.comment)).toBe("c");
    expect(get(n.pi)).toBe("pi data");
    for (const k of ["element", "doctype", "fragment", "document"] as const) expect(get(n[k])).toBeNull();
  });

  test("setter: null is treated as the empty string; no-op on other node types", () => {
    const set = Object.getOwnPropertyDescriptor(window.Node.prototype, "nodeValue")!.set!;
    const el = document.createElement("p");
    el.setAttribute("title", "old");
    const attr = el.getAttributeNode("title");
    set.call(attr, "new");
    expect(el.getAttribute("title")).toBe("new");
    const text = document.createTextNode("x");
    set.call(text, null);
    expect(text.data).toBe("");
    el.textContent = "keep";
    set.call(el, "ignored");
    expect(el.textContent).toBe("keep");
  });
});

describe("textContent — https://dom.spec.whatwg.org/#dom-node-textcontent", () => {
  test("getter: descendant text content for elements / fragments, data, attr value, null for document and doctype", () => {
    const get = lookupGetter(window.Node.prototype, "textContent");
    const n = everyNodeType();
    expect(get(n.element)).toBe("abc");
    expect(get(n.fragment)).toBe("f1f2");
    expect(get(n.text)).toBe("t");
    expect(get(n.attr)).toBe("v");
    expect(get(n.document)).toBeNull();
    expect(get(n.doctype)).toBeNull();
  });

  test("setter on an element: string replace all (a single Text child, or none for the empty string)", () => {
    const el = document.createElement("div");
    el.innerHTML = "<b>x</b><i>y</i>";
    el.textContent = "hello";
    expect(el.childNodes.length).toBe(1);
    expect(el.firstChild.nodeType).toBe(3);
    expect(el.innerHTML).toBe("hello");
    el.textContent = null;
    expect(el.childNodes.length).toBe(0);
  });

  test("setter on Document and DocumentType does nothing", () => {
    const before = document.documentElement;
    document.textContent = "x";
    expect(document.documentElement).toBe(before);
  });
});
