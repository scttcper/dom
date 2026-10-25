/**
 * The template element: template contents, the appropriate template contents owner document,
 * and the template's cloning and adopting steps.
 *
 * Spec: HTML Standard §4.12.3 "The template element"
 *   - the template element:               https://html.spec.whatwg.org/#the-template-element
 *   - template contents / content IDL:    https://html.spec.whatwg.org/#template-contents
 *                                         https://html.spec.whatwg.org/#dom-template-content
 *   - appropriate template contents owner document:
 *                                         https://html.spec.whatwg.org/#appropriate-template-contents-owner-document
 *   - adopting steps:                     https://html.spec.whatwg.org/#the-template-element:concept-node-adopt-ext
 *   - cloning steps:                      https://html.spec.whatwg.org/#the-template-element:concept-node-clone-ext
 *   - shadowRootMode & co.:               https://html.spec.whatwg.org/#dom-template-shadowrootmode
 *
 * Basic content/clone behavior is in elements.test.ts; these pin the owner-document rules.
 * Lit/Stencil-style rendering and `document.importNode(template.content, true)` rely on them.
 */
import { beforeEach, describe, expect, test } from "vitest";
import { createWindow } from "@ctrl/dom";

let document: any;

beforeEach(() => {
  document = createWindow().document;
});

describe("appropriate template contents owner document — https://html.spec.whatwg.org/#appropriate-template-contents-owner-document", () => {
  test("step 1: templates of one document share one inert owner document without a browsing context", () => {
    const a = document.createElement("template");
    const b = document.createElement("template");
    const owner = a.content.ownerDocument;
    expect(owner).not.toBe(document);
    expect(b.content.ownerDocument).toBe(owner);
    expect(owner.defaultView).toBeNull();
  });

  test("step 1.1: the owner of an owner document is itself (nested templates)", () => {
    document.body.innerHTML = "<template id=outer><template id=inner><b>x</b></template></template>";
    const outer = document.getElementById("outer");
    const inner = outer.content.firstChild;
    expect(inner.localName).toBe("template");
    expect(inner.content.ownerDocument).toBe(outer.content.ownerDocument);
  });

  test("step 1.1.1: an HTML document gets an HTML owner document", () => {
    const owner = document.createElement("template").content.ownerDocument;
    expect(owner.createElement("DIV").localName).toBe("div");
  });

  test("another document gets its own owner document", () => {
    const other = document.implementation.createHTMLDocument("");
    const t1 = document.createElement("template");
    const t2 = other.createElement("template");
    expect(t1.content.ownerDocument).not.toBe(t2.content.ownerDocument);
  });

  test("the content fragment is the same object on every access; children are not the template's children", () => {
    document.body.innerHTML = "<template><p>a</p></template>";
    const t = document.querySelector("template");
    expect(t.content).toBe(t.content);
    expect(t.childNodes.length).toBe(0);
    expect(t.content.childNodes.length).toBe(1);
    expect(t.innerHTML).toBe("<p>a</p>");
  });

  test("innerHTML on a template sets its contents, not its children", () => {
    const t = document.createElement("template");
    t.innerHTML = "<span>1</span><span>2</span>";
    expect(t.childNodes.length).toBe(0);
    expect(t.content.children.length).toBe(2);
    expect(t.content.firstChild.ownerDocument).toBe(t.content.ownerDocument);
  });
});

describe("template adopting steps — https://html.spec.whatwg.org/#the-template-element:concept-node-adopt-ext", () => {
  test("steps 1–2: adopting a template moves its contents to the new document's owner document", () => {
    const t = document.createElement("template");
    const child = t.content.appendChild(document.createElement("span"));
    const other = document.implementation.createHTMLDocument("");
    other.body.appendChild(t);
    const newOwner = other.createElement("template").content.ownerDocument;
    expect(t.ownerDocument).toBe(other);
    expect(t.content.ownerDocument).toBe(newOwner);
    expect(child.ownerDocument).toBe(newOwner);
    expect(t.content.firstChild).toBe(child);
  });

  test("adopting a subtree that contains a template adopts the nested contents too", () => {
    document.body.innerHTML = "<div><template><i></i></template></div>";
    const div = document.querySelector("div");
    const t = div.querySelector("template");
    const other = document.implementation.createHTMLDocument("");
    other.adoptNode(div);
    expect(t.content.ownerDocument).toBe(other.createElement("template").content.ownerDocument);
    expect(t.content.firstChild.ownerDocument).toBe(t.content.ownerDocument);
  });

  test("importNode(template.content, true) clones the fragment into the importing document", () => {
    document.body.innerHTML = "<template><b id=b>x</b></template>";
    const t = document.querySelector("template");
    const clone = document.importNode(t.content, true);
    expect(clone.ownerDocument).toBe(document);
    expect(clone.firstChild.ownerDocument).toBe(document);
    document.body.appendChild(clone);
    expect(document.getElementById("b")).not.toBeNull();
    // The template's own contents are untouched.
    expect(t.content.childNodes.length).toBe(1);
  });
});

describe("template cloning steps — https://html.spec.whatwg.org/#the-template-element:concept-node-clone-ext", () => {
  test("step 2: deep clones copy the contents into the copy's own contents (owned by the copy's owner document)", () => {
    document.body.innerHTML = "<template><p>a<b>b</b></p></template>";
    const t = document.querySelector("template");
    const copy = t.cloneNode(true);
    expect(copy.content).not.toBe(t.content);
    expect(copy.innerHTML).toBe("<p>a<b>b</b></p>");
    expect(copy.content.firstChild).not.toBe(t.content.firstChild);
    expect(copy.content.firstChild.ownerDocument).toBe(t.content.ownerDocument);
  });

  test("step 1: shallow clones get empty contents", () => {
    document.body.innerHTML = "<template><p>a</p></template>";
    const copy = document.querySelector("template").cloneNode(false);
    expect(copy.content.childNodes.length).toBe(0);
  });

  test("importNode(template, true) into another document clones the contents into that document's owner", () => {
    document.body.innerHTML = "<template><p>a</p></template>";
    const other = document.implementation.createHTMLDocument("");
    const copy = other.importNode(document.querySelector("template"), true);
    expect(copy.content.firstChild.ownerDocument).toBe(other.createElement("template").content.ownerDocument);
  });
});

describe("declarative shadow root attributes — https://html.spec.whatwg.org/#dom-template-shadowrootmode", () => {
  test("shadowRootMode is limited to open/closed with no missing/invalid default", () => {
    const t = document.createElement("template");
    expect(t.shadowRootMode).toBe("");
    t.setAttribute("shadowrootmode", "OPEN");
    expect(t.shadowRootMode).toBe("open");
    t.setAttribute("shadowrootmode", "bogus");
    expect(t.shadowRootMode).toBe("");
  });

  test("shadowRootSlotAssignment defaults to named; boolean flags reflect", () => {
    const t = document.createElement("template");
    expect(t.shadowRootSlotAssignment).toBe("named");
    t.setAttribute("shadowrootslotassignment", "manual");
    expect(t.shadowRootSlotAssignment).toBe("manual");
    t.shadowRootDelegatesFocus = true;
    t.shadowRootClonable = true;
    t.shadowRootSerializable = true;
    expect(t.getAttributeNames().sort()).toEqual([
      "shadowrootclonable",
      "shadowrootdelegatesfocus",
      "shadowrootserializable",
      "shadowrootslotassignment",
    ]);
  });
});
