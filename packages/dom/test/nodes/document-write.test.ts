/**
 * document.open / write / writeln / close and getAnimations().
 *
 * Specs:
 *   - HTML §8.4 Dynamic markup insertion: https://html.spec.whatwg.org/#dynamic-markup-insertion
 *     (document.open: https://html.spec.whatwg.org/#dom-document-open,
 *      document.write: https://html.spec.whatwg.org/#dom-document-write,
 *      document.close: https://html.spec.whatwg.org/#dom-document-close)
 *   - Web Animations: https://drafts.csswg.org/web-animations-1/#dom-animatable-getanimations
 *
 * There is no script-inserted parser here (scripts never run), so write() re-parses the markup
 * written since open() synchronously; see docs/deviations.md. Libraries and tests use this to
 * fill iframe documents (e.g. Floating UI's iframe focus tests).
 */
import { beforeEach, describe, expect, test } from "vitest";
import { createWindow, type Document } from "@rtd/dom";

let document: Document;

beforeEach(() => {
  document = createWindow().document;
});

describe("document.open — https://html.spec.whatwg.org/#dom-document-open", () => {
  test("empties the document and returns it", () => {
    document.body!.innerHTML = "<p>old</p>";
    expect(document.open()).toBe(document);
    expect(document.childNodes.length).toBe(0);
  });

  test("throws InvalidStateError for XML documents", () => {
    const xml = document.implementation.createDocument(null, "root");
    expect(() => (xml as Document).open()).toThrow(expect.objectContaining({ name: "InvalidStateError" }));
  });
});

describe("document.write — https://html.spec.whatwg.org/#dom-document-write", () => {
  test("markup is parsed into the document and queryable immediately", () => {
    document.open();
    document.write('<div id="root"></div>');
    expect(document.getElementById("root")).not.toBeNull();
    expect(document.body!.innerHTML).toBe('<div id="root"></div>');
  });

  test("successive writes accumulate; close() ends the session", () => {
    document.open();
    document.write("<p>a</p>");
    document.writeln("<p>b</p>");
    document.close();
    expect(document.body!.innerHTML).toBe("<p>a</p><p>b</p>\n");
  });

  test("write() without open() implicitly opens (replacing the document)", () => {
    document.body!.innerHTML = "<p>old</p>";
    document.write("<span>new</span>");
    expect(document.querySelector("p")).toBeNull();
    expect(document.querySelector("span")).not.toBeNull();
  });

  test("works on an iframe's document", () => {
    document.body!.innerHTML = "<iframe></iframe>";
    const frameDoc = (document.querySelector("iframe") as unknown as { contentDocument: Document }).contentDocument;
    frameDoc.open();
    frameDoc.write('<div id="rootIframe"></div>');
    frameDoc.close();
    expect(frameDoc.getElementById("rootIframe")).not.toBeNull();
  });
});

describe("getAnimations — https://drafts.csswg.org/web-animations-1/#dom-animatable-getanimations", () => {
  test("elements and documents report no running animations (no animation engine)", () => {
    document.body!.innerHTML = "<div><span></span></div>";
    expect(document.body!.getAnimations({ subtree: true })).toEqual([]);
    expect(document.getAnimations()).toEqual([]);
  });
});
