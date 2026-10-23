/**
 * Selectors API conformance (querySelector / querySelectorAll / matches) — WPT port.
 *
 * Specs:
 *   DOM §4.2.6 ParentNode querySelector(All) — https://dom.spec.whatwg.org/#dom-parentnode-queryselectorall
 *   DOM §4.2.6 scope-match a selectors string — https://dom.spec.whatwg.org/#scope-match-a-selectors-string
 *   DOM §4.9 Element.matches — https://dom.spec.whatwg.org/#dom-element-matches
 *   Selectors 4 — https://drafts.csswg.org/selectors-4/
 *
 * Ported from WPT dom/nodes:
 *   ParentNode-querySelector-All.html / .js — https://github.com/web-platform-tests/wpt/blob/master/dom/nodes/ParentNode-querySelector-All.js
 *   ParentNode-querySelector-All-content.html (the test document, copied verbatim into ./wpt/)
 *   selectors.js (the selector data, copied verbatim into ./wpt/selectors.data.js)
 *   Element-matches.js — https://github.com/web-platform-tests/wpt/blob/master/dom/nodes/Element-matches.js
 * The harness functions keep the original assertions; the iframe is replaced by a window created
 * with the content document's markup and URL "#target" (for :target).
 */
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { createWindow } from "@rtd/dom";
import { TEST_QSA, TEST_MATCH, invalidSelectors, validSelectors, scopedSelectors, type ValidSelector } from "./wpt/selectors.data.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;

const content = readFileSync(new URL("./wpt/ParentNode-querySelector-All-content.html", import.meta.url), "utf8");

/** ParentNode-querySelector-All.js setupSpecialElements (verbatim logic). */
function setupSpecialElements(doc: AnyNode, parent: AnyNode): void {
  parent.appendChild(doc.createElement("null"));
  parent.appendChild(doc.createElement("undefined"));
  const anyNS = doc.createElement("div");
  const noNS = doc.createElement("div");
  anyNS.id = "any-namespace";
  noNS.id = "no-namespace";
  let div = [doc.createElement("div"), doc.createElementNS("http://www.w3.org/1999/xhtml", "div"), doc.createElementNS("", "div"), doc.createElementNS("http://www.example.org/ns", "div")];
  div[0].id = "any-namespace-div1";
  div[1].id = "any-namespace-div2";
  div[2].setAttribute("id", "any-namespace-div3");
  div[3].setAttribute("id", "any-namespace-div4");
  for (const d of div) anyNS.appendChild(d);
  div = [doc.createElement("div"), doc.createElementNS("http://www.w3.org/1999/xhtml", "div"), doc.createElementNS("", "div"), doc.createElementNS("http://www.example.org/ns", "div")];
  div[0].id = "no-namespace-div1";
  div[1].id = "no-namespace-div2";
  div[2].setAttribute("id", "no-namespace-div3");
  div[3].setAttribute("id", "no-namespace-div4");
  for (const d of div) noNS.appendChild(d);
  parent.appendChild(anyNS);
  parent.appendChild(noNS);
  const span = doc.getElementById("attr-presence-i1");
  span.setAttributeNS("http://www.example.org/ns", "title", "");
}

function traverse(elem: AnyNode, fn: (e: AnyNode) => void): void {
  if (elem.nodeType === 1) fn(elem);
  for (let c = elem.firstChild; c; c = c.nextSibling) traverse(c, fn);
}

function setup() {
  const window = createWindow({ url: "http://localhost/ParentNode-querySelector-All-content.html#target", html: content });
  const doc: AnyNode = window.document;
  const element = doc.getElementById("root");
  setupSpecialElements(doc, element);
  const outOfScope = element.cloneNode(true);
  traverse(outOfScope, (e) => e.setAttribute("data-clone", ""));
  const detached = element.cloneNode(true);
  const fragment = doc.createDocumentFragment();
  fragment.appendChild(element.cloneNode(true));
  const empty = doc.createElement("div");
  return { window, doc, element, outOfScope, detached, fragment, empty };
}

const ctx = setup();

function nodeType(root: AnyNode): string {
  if (root.nodeType === 9) return "document";
  if (root.nodeType === 1) return root.parentNode ? "element" : "detached";
  return "fragment";
}

function runSpecialSelectorTests(type: string, root: AnyNode): void {
  test(`${type}.querySelectorAll null`, () => {
    expect(root.querySelectorAll(null).length).toBe(1);
  });
  test(`${type}.querySelectorAll undefined`, () => {
    expect(root.querySelectorAll(undefined).length).toBe(1);
  });
  test(`${type}.querySelector null`, () => {
    const elm = root.querySelector(null);
    expect(elm).not.toBeNull();
    expect(elm.tagName.toUpperCase()).toBe("NULL");
  });
  test(`${type}.querySelector undefined`, () => {
    const elm = root.querySelector(undefined);
    expect(elm).not.toBeNull();
    expect(elm.tagName.toUpperCase()).toBe("UNDEFINED");
  });
  test(`${type}.querySelectorAll tree order`, () => {
    const result = root.querySelectorAll("*");
    let i = 0;
    traverse(root, (elem) => {
      if (elem !== root) {
        expect(elem, `index ${i}`).toBe(result[i]);
        i++;
      }
    });
    expect(result.length).toBe(i);
  });
}

function verifyStaticList(type: string, doc: AnyNode, root: AnyNode): void {
  test(`${type}: static NodeList, and a new NodeList per call`, () => {
    const pre = root.querySelectorAll("div");
    const preLength = pre.length;
    const div = doc.createElement("div");
    (root.body || root).appendChild(div);
    expect(pre.length).toBe(preLength);
    const post = root.querySelectorAll("div");
    expect(post.length).toBe(preLength + 1);
    div.remove();
  });
}

function runInvalidSelectorTest(type: string, root: AnyNode): void {
  for (const s of invalidSelectors) {
    test(`${type}.querySelector(All): ${s.name}: ${s.selector}`, () => {
      expect(() => root.querySelector(s.selector)).toThrow(expect.objectContaining({ name: "SyntaxError" }));
      expect(() => root.querySelectorAll(s.selector)).toThrow(expect.objectContaining({ name: "SyntaxError" }));
    });
  }
}

function runValidSelectorTest(type: string, root: AnyNode, selectors: ValidSelector[], testType: number, docType: string): void {
  const nt = nodeType(root);
  for (const s of selectors) {
    if (s.exclude && (s.exclude.includes(nt) || s.exclude.includes(docType))) continue;
    if (!(s.testType & testType)) continue;
    test(`${type}.querySelector(All): ${s.name}: ${s.selector}`, () => {
      const foundall = root.querySelectorAll(s.selector);
      const ids = [...foundall].map((e: AnyNode) => e.getAttribute("id"));
      expect(ids).toEqual(s.expect);
      for (const e of foundall) expect(e.hasAttribute("data-clone")).toBe(false);
      const found = root.querySelector(s.selector);
      if (s.expect.length > 0) expect(found).toBe(foundall[0]);
      else expect(found).toBeNull();
    });
  }
}

describe("WPT ParentNode-querySelector-All — https://dom.spec.whatwg.org/#dom-parentnode-queryselectorall", () => {
  const { doc, detached, fragment, element, empty, outOfScope } = ctx;
  describe("special selectors (WebIDL stringification)", () => {
    runSpecialSelectorTests("Document", doc);
    runSpecialSelectorTests("Detached Element", detached);
    runSpecialSelectorTests("Fragment", fragment);
    runSpecialSelectorTests("In-document Element", element);
  });
  describe("static lists", () => {
    verifyStaticList("Document", doc, doc);
    verifyStaticList("Detached Element", doc, detached);
    verifyStaticList("Fragment", doc, fragment);
    verifyStaticList("In-document Element", doc, element);
  });
  describe("invalid selectors throw SyntaxError — https://dom.spec.whatwg.org/#scope-match-a-selectors-string", () => {
    runInvalidSelectorTest("Document", doc);
    runInvalidSelectorTest("Detached Element", detached);
    runInvalidSelectorTest("Fragment", fragment);
    runInvalidSelectorTest("In-document Element", element);
    runInvalidSelectorTest("Empty Element", empty);
  });
  describe("valid selectors", () => {
    runValidSelectorTest("Document", doc, validSelectors, TEST_QSA, "html");
    runValidSelectorTest("Detached Element", detached, validSelectors, TEST_QSA, "html");
    runValidSelectorTest("Fragment", fragment, validSelectors, TEST_QSA, "html");
    describe("in-document element (with an out-of-scope clone in the body)", () => {
      // The original appends outOfScope before the in-document tests; tests run in order here.
      test("append out-of-scope clone", () => {
        doc.body.appendChild(outOfScope);
      });
      runValidSelectorTest("In-document Element", element, validSelectors, TEST_QSA, "html");
    });
  });
});

/**
 * Element-matches.js runSpecialMatchesTests/runMatchesTest — https://github.com/web-platform-tests/wpt/blob/master/dom/nodes/Element-matches.js
 * Each selector with TEST_MATCH must match every expected element (and the scoped variants with
 * the given context element).
 */
describe("WPT Element-matches — https://dom.spec.whatwg.org/#dom-element-matches", () => {
  const { window } = setupMatches();
  function setupMatches() {
    const c = setup();
    return c;
  }
  const doc: AnyNode = window.document;
  for (const s of validSelectors) {
    if (!(s.testType & TEST_MATCH) || (s.exclude && s.exclude.includes("html"))) continue;
    test(`matches: ${s.name}: ${s.selector}`, () => {
      for (const id of s.expect) {
        const el = doc.getElementById(id) ?? doc.querySelector(`[id="${id}"]`);
        expect(el, id).not.toBeNull();
        expect(el.matches(s.selector), id).toBe(true);
      }
    });
  }
  for (const s of invalidSelectors) {
    test(`matches throws: ${s.name}: ${s.selector}`, () => {
      expect(() => doc.body.matches(s.selector)).toThrow(expect.objectContaining({ name: "SyntaxError" }));
    });
  }
  for (const s of scopedSelectors) {
    if (!(s.testType & TEST_MATCH) || (s.exclude && s.exclude.includes("html"))) continue;
    test(`scoped matches: ${s.name}: ${s.selector}`, () => {
      for (const id of s.expect) {
        const el = doc.getElementById(id);
        expect(el.matches(s.selector), id).toBe(true);
      }
    });
  }
});
