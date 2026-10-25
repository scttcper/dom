/**
 * Editable content: the contenteditable attribute, isContentEditable, editing hosts and
 * document.designMode.
 *
 * Spec: HTML Standard §6.8 "Editing"
 *   - contenteditable content attribute:  https://html.spec.whatwg.org/#attr-contenteditable
 *   - contentEditable IDL attribute:      https://html.spec.whatwg.org/#dom-contenteditable
 *   - isContentEditable:                  https://html.spec.whatwg.org/#dom-iscontenteditable
 *   - editing host:                       https://html.spec.whatwg.org/#editing-host
 *   - editable:                           https://html.spec.whatwg.org/#editable
 *   - designMode:                         https://html.spec.whatwg.org/#dom-document-designmode
 *   - focusable area (editing hosts):     https://html.spec.whatwg.org/#focusable-area
 *
 * jsdom has no isContentEditable or designMode, so there is no differential oracle: rich text
 * components (Lexical, Slate, TipTap) and user-event's `type()` on editing hosts depend on these.
 */
import { beforeEach, describe, expect, test } from "vitest";
import { createWindow } from "@ctrl/dom";

let document: any;

beforeEach(() => {
  document = createWindow().document;
});

describe("contentEditable IDL attribute — https://html.spec.whatwg.org/#dom-contenteditable", () => {
  test('getter maps the attribute\'s state: empty and true → "true", ASCII case-insensitive keywords, invalid → "inherit"', () => {
    const el = document.createElement("div");
    const states: string[] = [];
    for (const v of [null, "", "true", "TRUE", "false", "Plaintext-Only", "yes"]) {
      if (v === null) el.removeAttribute("contenteditable");
      else el.setAttribute("contenteditable", v);
      states.push(el.contentEditable);
    }
    expect(states).toEqual(["inherit", "true", "true", "true", "false", "plaintext-only", "inherit"]);
  });

  test("setter: true/false/plaintext-only (case-insensitive) write the lowercase keyword", () => {
    const el = document.createElement("div");
    el.contentEditable = "TRUE";
    expect(el.getAttribute("contenteditable")).toBe("true");
    el.contentEditable = "Plaintext-Only";
    expect(el.getAttribute("contenteditable")).toBe("plaintext-only");
    el.contentEditable = "false";
    expect(el.getAttribute("contenteditable")).toBe("false");
  });

  test('setter: "inherit" removes the attribute; anything else throws SyntaxError and leaves it alone', () => {
    const el = document.createElement("div");
    el.setAttribute("contenteditable", "true");
    expect(() => (el.contentEditable = "")).toThrow(expect.objectContaining({ name: "SyntaxError" }));
    expect(() => (el.contentEditable = "on")).toThrow(expect.objectContaining({ name: "SyntaxError" }));
    expect(el.getAttribute("contenteditable")).toBe("true");
    el.contentEditable = "INHERIT";
    expect(el.hasAttribute("contenteditable")).toBe(false);
  });
});

describe("isContentEditable — https://html.spec.whatwg.org/#dom-iscontenteditable", () => {
  test("an editing host (true or plaintext-only state) and its descendants are editable", () => {
    document.body.innerHTML =
      '<div id=a contenteditable><p><b id=b>x</b></p></div><div id=c contenteditable="plaintext-only"><i id=d></i></div>';
    const ids = ["a", "b", "c", "d"].map((id) => document.getElementById(id).isContentEditable);
    expect(ids).toEqual([true, true, true, true]);
  });

  test("editable step 2: a false-state descendant and its subtree are not editable", () => {
    document.body.innerHTML =
      '<div contenteditable><section contenteditable="false"><span id=s></span></section></div>';
    expect(document.querySelector("section").isContentEditable).toBe(false);
    expect(document.getElementById("s").isContentEditable).toBe(false);
  });

  test("a true-state element inside a non-editable island is an editing host again", () => {
    document.body.innerHTML =
      '<div contenteditable><p contenteditable="false"><em contenteditable="true"><u id=u></u></em></p></div>';
    expect(document.querySelector("em").isContentEditable).toBe(true);
    expect(document.getElementById("u").isContentEditable).toBe(true);
  });

  test("an invalid value is the inherit state: the element follows its parent", () => {
    document.body.innerHTML =
      '<div contenteditable><span contenteditable="bogus" id=x></span></div><span contenteditable="bogus" id=y></span>';
    expect(document.getElementById("x").isContentEditable).toBe(true);
    expect(document.getElementById("y").isContentEditable).toBe(false);
  });

  test("elements without an editing host ancestor are not editable; the result does not need a connected element", () => {
    const host = document.createElement("div");
    host.contentEditable = "true";
    const child = host.appendChild(document.createElement("span"));
    expect(document.body.isContentEditable).toBe(false);
    expect(host.isContentEditable).toBe(true);
    expect(child.isContentEditable).toBe(true);
  });

  test("is live: removing the host's attribute makes descendants non-editable", () => {
    document.body.innerHTML = "<div contenteditable><span id=s></span></div>";
    const s = document.getElementById("s");
    expect(s.isContentEditable).toBe(true);
    document.querySelector("div").removeAttribute("contenteditable");
    expect(s.isContentEditable).toBe(false);
  });
});

describe("editing hosts are focusable areas — https://html.spec.whatwg.org/#focusable-area", () => {
  test("focus() on an editing host focuses it; an editable descendant that is not a host is not a focusable area", () => {
    document.body.innerHTML = "<div id=host contenteditable><p id=p>text</p></div>";
    const host = document.getElementById("host");
    document.getElementById("p").focus();
    expect(document.activeElement).toBe(document.body);
    host.focus();
    expect(document.activeElement).toBe(host);
  });

  test("a false-state element is not focusable just for being inside a host", () => {
    document.body.innerHTML = '<div contenteditable><p id=p contenteditable="false">x</p></div>';
    document.getElementById("p").focus();
    expect(document.activeElement).toBe(document.body);
  });
});

describe("designMode — https://html.spec.whatwg.org/#dom-document-designmode", () => {
  test('getter: "off" by default', () => {
    expect(document.designMode).toBe("off");
    expect(document.body.isContentEditable).toBe(false);
  });

  test('setter step 1: "on" (ASCII case-insensitive) enables design mode; the document\'s elements become editable', () => {
    document.body.innerHTML = "<p><b id=b></b></p>";
    document.designMode = "ON";
    expect(document.designMode).toBe("on");
    // https://html.spec.whatwg.org/#editing-host: a child HTML element of a Document whose design
    // mode enabled is true is an editing host; everything under it is editable.
    expect(document.documentElement.isContentEditable).toBe(true);
    expect(document.body.isContentEditable).toBe(true);
    expect(document.getElementById("b").isContentEditable).toBe(true);
  });

  test("a contenteditable=false element stays non-editable in design mode", () => {
    document.body.innerHTML = '<p contenteditable="false"><b id=b></b></p>';
    document.designMode = "on";
    expect(document.getElementById("b").isContentEditable).toBe(false);
  });

  test('setter step 2: "off" disables it again; other values are ignored', () => {
    document.designMode = "on";
    document.designMode = "maybe";
    expect(document.designMode).toBe("on");
    document.designMode = "Off";
    expect(document.designMode).toBe("off");
    expect(document.body.isContentEditable).toBe(false);
  });

  test("design mode is per document", () => {
    const other: any = createWindow().document;
    document.designMode = "on";
    expect(other.designMode).toBe("off");
    expect(other.body.isContentEditable).toBe(false);
  });
});
