/**
 * Interface objects of the node classes, XMLDocument, the "other applicable specifications"
 * extension hooks of the mutation algorithms, and declarative shadow roots.
 *
 * Spec: DOM Standard §4.5–4.9 node interfaces, §4.2.3 mutation algorithm extension points, §4.8 ShadowRoot
 *   - Document / XMLDocument / DOMImplementation: https://dom.spec.whatwg.org/#interface-document,
 *     https://dom.spec.whatwg.org/#xmldocument, https://dom.spec.whatwg.org/#interface-domimplementation
 *   - Element / DocumentFragment: https://dom.spec.whatwg.org/#interface-element, https://dom.spec.whatwg.org/#interface-documentfragment
 *   - attribute change steps: https://dom.spec.whatwg.org/#concept-element-attributes-change-ext
 *   - children changed steps: https://dom.spec.whatwg.org/#concept-node-children-changed-ext
 *   - adopting steps: https://dom.spec.whatwg.org/#concept-node-adopt-ext
 *   - moving steps: https://dom.spec.whatwg.org/#concept-node-move-ext
 *   - valid shadow host name: https://dom.spec.whatwg.org/#valid-shadow-host-name
 *   - declarative / available to element internals: https://dom.spec.whatwg.org/#shadowroot-declarative,
 *     https://dom.spec.whatwg.org/#shadowroot-available-to-element-internals
 */
import { describe, expect, test } from "vitest";
import { createWindow } from "@rtd/dom";
import { differential, type AnyWindow } from "../../../../tests/compat/src/harness.ts";

const chain = (proto: AnyWindow) => {
  const out: string[] = [];
  for (let p = proto; p !== null && p !== Object.prototype; p = Object.getPrototypeOf(p)) out.push(p.constructor.name);
  return out;
};

/** Members the DOM Standard's IDL lists on each interface (operations and attributes, not inherited ones). */
const IDL: Record<string, string[]> = {
  Document: ["implementation", "URL", "documentURI", "compatMode", "characterSet", "charset", "inputEncoding", "contentType", "doctype", "documentElement", "getElementsByTagName", "getElementsByTagNameNS", "getElementsByClassName", "createElement", "createElementNS", "createDocumentFragment", "createTextNode", "createCDATASection", "createComment", "createProcessingInstruction", "importNode", "adoptNode", "createAttribute", "createAttributeNS", "createEvent", "createRange", "createNodeIterator", "createTreeWalker", "getElementById", "children", "firstElementChild", "lastElementChild", "childElementCount", "prepend", "append", "replaceChildren", "querySelector", "querySelectorAll"],
  Element: ["namespaceURI", "prefix", "localName", "tagName", "id", "className", "classList", "slot", "hasAttributes", "attributes", "getAttributeNames", "getAttribute", "getAttributeNS", "setAttribute", "setAttributeNS", "removeAttribute", "removeAttributeNS", "toggleAttribute", "hasAttribute", "hasAttributeNS", "getAttributeNode", "getAttributeNodeNS", "setAttributeNode", "setAttributeNodeNS", "removeAttributeNode", "attachShadow", "shadowRoot", "closest", "matches", "webkitMatchesSelector", "getElementsByTagName", "getElementsByTagNameNS", "getElementsByClassName", "insertAdjacentElement", "insertAdjacentText", "assignedSlot", "before", "after", "replaceWith", "remove", "previousElementSibling", "nextElementSibling"],
  DocumentFragment: ["getElementById", "children", "firstElementChild", "lastElementChild", "childElementCount", "prepend", "append", "replaceChildren", "querySelector", "querySelectorAll"],
  DOMImplementation: ["createDocumentType", "createDocument", "createHTMLDocument", "hasFeature"],
  CharacterData: ["data", "length", "substringData", "appendData", "insertData", "deleteData", "replaceData", "previousElementSibling", "nextElementSibling", "before", "after", "replaceWith", "remove"],
  Text: ["splitText", "wholeText", "assignedSlot"],
};

describe("node interfaces — https://dom.spec.whatwg.org/#interface-element", () => {
  differential("prototype chains of the node interfaces (https://dom.spec.whatwg.org/#interface-document)", (w) => {
    const d = w.document;
    return {
      document: chain(Object.getPrototypeOf(d)),
      xml: chain(Object.getPrototypeOf(d.implementation.createDocument(null, null, null))),
      element: chain(Object.getPrototypeOf(d.createElementNS("urn:x", "x"))),
      fragment: chain(Object.getPrototypeOf(d.createDocumentFragment())),
      comment: chain(Object.getPrototypeOf(d.createComment(""))),
      cdata: chain(Object.getPrototypeOf(d.implementation.createDocument(null, null, null).createCDATASection("x"))),
      implementation: chain(Object.getPrototypeOf(d.implementation)),
    };
  });

  test("every member of each interface's IDL is reachable from its prototype (https://dom.spec.whatwg.org/#interface-documentfragment, https://dom.spec.whatwg.org/#interface-domimplementation)", () => {
    const window = createWindow() as unknown as Record<string, any>;
    const missing: string[] = [];
    for (const [name, members] of Object.entries(IDL)) {
      for (const m of members) if (!(m in window[name].prototype)) missing.push(`${name}.${m}`);
    }
    expect(missing).toEqual([]);
  });

  differential("the interface objects are not constructible except Document, DocumentFragment, Text and Comment", (w) => {
    const make = (name: string) => {
      try {
        const o = new w[name]();
        return Object.getPrototypeOf(o) === w[name].prototype ? "ok" : "wrong prototype";
      } catch (e) {
        return (e as Error).name;
      }
    };
    return Object.fromEntries(["Document", "DocumentFragment", "Text", "Comment", "Node", "Element", "CharacterData", "DOMImplementation", "Attr", "DocumentType"].map((n) => [n, make(n)]));
  });
});

describe("XMLDocument — https://dom.spec.whatwg.org/#xmldocument", () => {
  differential("createDocument returns an XMLDocument whose content type follows the namespace; createHTMLDocument returns a plain Document", (w) => {
    const impl = w.document.implementation;
    const docs = {
      none: impl.createDocument(null, null, null),
      xhtml: impl.createDocument("http://www.w3.org/1999/xhtml", "html", null),
      svg: impl.createDocument("http://www.w3.org/2000/svg", "svg", null),
      html: impl.createHTMLDocument("t"),
      ctor: new w.Document(),
    };
    return Object.fromEntries(Object.entries(docs).map(([k, d]: [string, AnyWindow]) => [k, [d instanceof w.XMLDocument, d.contentType, d.documentElement?.localName ?? null, d.compatMode]]));
  });

  differential("XML documents keep case: createElement does not lowercase and tagName is the qualified name", (w) => {
    const doc = w.document.implementation.createDocument(null, null, null);
    const el = doc.createElement("MyEl");
    el.setAttribute("Attr", "1");
    return [el.localName, el.tagName, el.namespaceURI, el.getAttributeNames(), el.getAttribute("attr")];
  });
});

describe("extension hooks of the mutation algorithms — https://dom.spec.whatwg.org/#concept-element-attributes-change-ext", () => {
  differential("attribute change steps: HTML elements react to content attribute changes (input value while not dirty, img alt, id index)", (w) => {
    const d = w.document;
    const input = d.body.appendChild(d.createElement("input"));
    input.setAttribute("value", "a");
    const clean = input.value;
    input.value = "typed";
    input.setAttribute("value", "b");
    const el = d.body.appendChild(d.createElement("p"));
    el.setAttribute("id", "found");
    const byId = d.getElementById("found") === el;
    el.removeAttribute("id");
    return { clean, dirty: input.value, defaultValue: input.defaultValue, byId, afterRemove: d.getElementById("found") };
  });

  differential("children changed steps: textarea default value, title text and option label follow their children (https://dom.spec.whatwg.org/#concept-node-children-changed-ext)", (w) => {
    const d = w.document;
    const ta = d.body.appendChild(d.createElement("textarea"));
    ta.append("one");
    const first = ta.value;
    ta.firstChild.data = "two";
    const title = d.head.appendChild(d.createElement("title"));
    title.append("Page ", "title");
    const select = d.body.appendChild(d.createElement("select"));
    const option = select.appendChild(d.createElement("option"));
    option.append("Label");
    return { first, second: ta.value, title: d.title, option: [option.text, option.label, select.value] };
  });

  differential("adopting steps: adoptNode moves the subtree to the new document and runs custom elements' adoptedCallback (https://dom.spec.whatwg.org/#concept-node-adopt-ext)", (w) => {
    const d = w.document;
    const log: string[] = [];
    w.customElements.define(
      "x-adopt",
      class extends w.HTMLElement {
        adoptedCallback(oldDoc: AnyWindow, newDoc: AnyWindow) {
          log.push(`adopted ${oldDoc === d} ${newDoc !== d}`);
        }
      },
    );
    const el = d.body.appendChild(d.createElement("x-adopt"));
    const child = el.appendChild(d.createElement("span"));
    const other = d.implementation.createHTMLDocument("t");
    other.adoptNode(el);
    return { log, owner: el.ownerDocument === other, childOwner: child.ownerDocument === other, parent: el.parentNode };
  });

  test("moving steps: moveBefore keeps a connected subtree connected and runs connectedMoveCallback instead of disconnected/connected (https://dom.spec.whatwg.org/#concept-node-move-ext)", () => {
    const window = createWindow() as unknown as Record<string, any>;
    const document = window.document;
    const log: string[] = [];
    window.customElements.define(
      "x-move",
      class extends window.HTMLElement {
        connectedCallback() {
          log.push("connected");
        }
        disconnectedCallback() {
          log.push("disconnected");
        }
        connectedMoveCallback() {
          log.push("moved");
        }
      },
    );
    const [a, b] = [document.createElement("div"), document.createElement("div")];
    document.body.append(a, b);
    const el = a.appendChild(document.createElement("x-move"));
    const input = el.appendChild(document.createElement("input"));
    input.focus();
    log.length = 0;
    b.moveBefore(el, null);
    expect(log).toEqual(["moved"]);
    expect(el.parentNode).toBe(b);
    expect(document.activeElement).toBe(input);
  });
});

describe("shadow roots — https://dom.spec.whatwg.org/#valid-shadow-host-name", () => {
  differential("attachShadow is allowed on exactly the valid shadow host names (and valid custom element names)", (w) => {
    const d = w.document;
    const tags = ["article", "aside", "blockquote", "body", "div", "footer", "h1", "h6", "header", "main", "nav", "p", "section", "span", "x-custom", "input", "button", "a", "img", "template", "ul", "form", "video"];
    return Object.fromEntries(
      tags.map((t) => {
        try {
          d.createElement(t).attachShadow({ mode: "open" });
          return [t, "ok"];
        } catch (e) {
          return [t, (e as Error).name];
        }
      }),
    );
  });

  test("a declarative shadow root is reused by attachShadow, emptied and no longer declarative (https://dom.spec.whatwg.org/#shadowroot-declarative)", () => {
    const { document } = createWindow();
    const container = document.createElement("div");
    (container as unknown as { setHTMLUnsafe(html: string): void }).setHTMLUnsafe('<div id="h"><template shadowrootmode="open"><b>inside</b></template></div>');
    const h = container.firstChild as unknown as { shadowRoot: { innerHTML: string } | null; attachShadow(init: object): unknown };
    const declarative = h.shadowRoot!;
    expect(declarative.innerHTML).toBe("<b>inside</b>");
    // attach a shadow root step 4.2–4.4: same mode, declarative → remove its children and return it.
    expect(h.attachShadow({ mode: "open" })).toBe(declarative);
    expect(declarative.innerHTML).toBe("");
    // Now it is no longer declarative: a second call throws (step 4.1).
    expect(() => h.attachShadow({ mode: "open" })).toThrow(expect.objectContaining({ name: "NotSupportedError" }));
  });

  test("ElementInternals.shadowRoot exposes only roots available to element internals (https://dom.spec.whatwg.org/#shadowroot-available-to-element-internals)", () => {
    const window = createWindow() as unknown as Record<string, any>;
    const document = window.document;
    let internals: { shadowRoot: unknown } | null = null;
    window.customElements.define(
      "x-internals",
      class extends window.HTMLElement {
        constructor() {
          super();
          internals = this.attachInternals();
        }
      },
    );
    const el = document.createElement("x-internals");
    const root = el.attachShadow({ mode: "closed" });
    expect(internals!.shadowRoot).toBe(root);
    // A root attached before the element became custom is not available to its internals.
    const early = document.createElement("x-late");
    const earlyRoot = early.attachShadow({ mode: "open" });
    let lateInternals: { shadowRoot: unknown } | null = null;
    window.customElements.define(
      "x-late",
      class extends window.HTMLElement {
        constructor() {
          super();
          lateInternals = this.attachInternals();
        }
      },
    );
    window.customElements.upgrade(early);
    expect(earlyRoot).not.toBeNull();
    expect(lateInternals!.shadowRoot).toBeNull();
  });
});
