/**
 * Style-dependent CSSOM View members and UA popover display.
 *
 * Specs:
 *   CSSOM View checkVisibility() — https://drafts.csswg.org/cssom-view/#dom-element-checkvisibility
 *   CSSOM View scrolling — https://drafts.csswg.org/cssom-view/#dom-element-scrolltop
 *   CSSOM View scrollingElement — https://drafts.csswg.org/cssom-view/#dom-document-scrollingelement
 *   HTML rendering, popover — https://html.spec.whatwg.org/#flow-content-3
 *   CSSOM View offsetParent — https://drafts.csswg.org/cssom-view/#dom-htmlelement-offsetparent
 *   WebIDL namespaces (CSS) — https://webidl.spec.whatwg.org/#es-namespaces
 *
 * Deviation pinned here (docs/deviations.md): without layout, assigned scroll offsets are
 * stored (clamped at 0, no maximum) and read back, matching jsdom.
 */
import { beforeEach, describe, expect, test } from "vitest";
import { createWindow, CSS, type Window, type Document } from "@ctrl/dom";
import { hasAuthorStyles } from "@ctrl/dom/internal";

let window: Window;
let document: Document;
beforeEach(() => {
  window = createWindow();
  document = window.document;
});

type El = HTMLElementLike;
interface HTMLElementLike {
  checkVisibility(o?: object): boolean;
  scrollTop: number;
  scrollLeft: number;
  scrollTo(...a: unknown[]): void;
  scrollBy(...a: unknown[]): void;
  showPopover(): void;
  hidePopover(): void;
  setAttribute(n: string, v: string): void;
}
const $ = (sel: string) => document.querySelector(sel) as unknown as El;

describe("checkVisibility() — https://drafts.csswg.org/cssom-view/#dom-element-checkvisibility", () => {
  test("step 1: false without a box ([hidden], display:none ancestor, display:contents, disconnected)", () => {
    document.body!.innerHTML = `<button hidden>x</button><div style="display:none"><span id=s>y</span></div><p style="display:contents" id=c></p><b id=v>z</b>`;
    expect($("button").checkVisibility()).toBe(false);
    expect($("#s").checkVisibility()).toBe(false);
    expect($("#c").checkVisibility()).toBe(false);
    expect($("#v").checkVisibility()).toBe(true);
    expect((document.createElement("div") as unknown as El).checkVisibility()).toBe(false);
  });

  test("step 2: content-visibility:hidden ancestor", () => {
    document.body!.innerHTML = `<div style="content-visibility:hidden"><i>x</i></div>`;
    expect($("i").checkVisibility()).toBe(false);
  });

  test("steps 3-4: opacity and visibility only with the corresponding options", () => {
    document.body!.innerHTML = `<div style="opacity:0"><i>x</i></div><p style="visibility:hidden"><u>y</u></p>`;
    expect($("i").checkVisibility()).toBe(true);
    expect($("i").checkVisibility({ checkOpacity: true })).toBe(false);
    expect($("i").checkVisibility({ opacityProperty: true })).toBe(false);
    expect($("u").checkVisibility()).toBe(true);
    expect($("u").checkVisibility({ checkVisibilityCSS: true })).toBe(false);
    expect($("u").checkVisibility({ visibilityProperty: true })).toBe(false);
  });

  test("author style sheets count", () => {
    document.body!.innerHTML = `<style>.x{display:none}</style><div class=x><i>x</i></div>`;
    expect($("i").checkVisibility()).toBe(false);
  });
});

describe("scroll offsets without layout — https://drafts.csswg.org/cssom-view/#dom-element-scrolltop", () => {
  test("assigned scrollTop/scrollLeft read back, clamped at 0", () => {
    document.body!.innerHTML = `<div></div>`;
    const el = $("div");
    el.scrollTop = 40;
    el.scrollLeft = 2;
    expect([el.scrollTop, el.scrollLeft]).toEqual([40, 2]);
    el.scrollTop = -5;
    expect(el.scrollTop).toBe(0);
  });

  test("scrollTo / scrollBy (numbers and options)", () => {
    document.body!.innerHTML = `<div></div>`;
    const el = $("div");
    el.scrollTo(3, 4);
    expect([el.scrollLeft, el.scrollTop]).toEqual([3, 4]);
    el.scrollBy({ top: 10 });
    expect(el.scrollTop).toBe(14);
    el.scrollTo({ left: 1 });
    expect([el.scrollLeft, el.scrollTop]).toEqual([1, 14]);
  });

  test("document.scrollingElement is the root element in no-quirks mode", () => {
    expect((document as unknown as { scrollingElement: unknown }).scrollingElement).toBe(document.documentElement);
  });
});

describe("popover UA display — https://html.spec.whatwg.org/#flow-content-3", () => {
  test("[popover] is display:none until shown", () => {
    document.body!.innerHTML = `<div popover id=p>x</div>`;
    const p = $("#p");
    expect(window.getComputedStyle(p as never).display).toBe("none");
    p.showPopover();
    expect(window.getComputedStyle(p as never).display).toBe("block");
    p.hidePopover();
    expect(window.getComputedStyle(p as never).display).toBe("none");
  });
});

describe("hasAuthorStyles", () => {
  test("O(1) false for a document that never had inline styles or sheets; tracks inline styles", () => {
    document.body!.innerHTML = `<div><span></span></div>`;
    expect(hasAuthorStyles(document)).toBe(false);
    $("span").setAttribute("style", "color: red");
    expect(hasAuthorStyles(document)).toBe(true);
    $("span").setAttribute("style", "");
    expect(hasAuthorStyles(document)).toBe(false);
  });
});

describe("offsetParent — https://drafts.csswg.org/cssom-view/#dom-htmlelement-offsetparent", () => {
  const op = (sel: string) => (document.querySelector(sel) as unknown as { offsetParent: unknown }).offsetParent;

  test("step 3: nearest positioned ancestor, else body", () => {
    document.body!.innerHTML = `<div id=rel style="position:relative"><p><i id=a></i></p></div><span id=b></span>`;
    expect(op("#a")).toBe(document.getElementById("rel"));
    expect(op("#b")).toBe(document.body);
    expect(op("#rel")).toBe(document.body);
  });

  test("step 3: td/th/table only for static elements", () => {
    document.body!.innerHTML = `<table id=t><tr><td id=td><b id=s></b><b id=r style="position:relative"></b></td></tr></table>`;
    expect(op("#s")).toBe(document.getElementById("td"));
    expect(op("#r")).toBe(document.body);
  });

  test("step 1: null for body, html, position:fixed, display:none (self or ancestor), disconnected", () => {
    document.body!.innerHTML = `<div id=f style="position:fixed"></div><div style="display:none"><i id=h></i></div><style>.abs{position:absolute}</style><div class=abs><u id=u></u></div>`;
    expect(op("body")).toBe(null);
    expect((document.documentElement as unknown as { offsetParent: unknown }).offsetParent).toBe(null);
    expect(op("#f")).toBe(null);
    expect(op("#h")).toBe(null);
    expect(op("#u")).toBe(document.querySelector(".abs"));
    expect((document.createElement("div") as unknown as { offsetParent: unknown }).offsetParent).toBe(null);
  });
});

describe("CSS namespace object — https://webidl.spec.whatwg.org/#es-namespaces", () => {
  test("operations are writable/configurable data properties; the object is not frozen", () => {
    expect(Object.getOwnPropertyDescriptor(CSS, "supports")).toMatchObject({ writable: true, enumerable: true, configurable: true });
    expect(Object.isFrozen(CSS)).toBe(false);
    expect(Object.prototype.toString.call(CSS)).toBe("[object CSS]");
    expect((window as unknown as { CSS: unknown }).CSS).toBe(CSS);
  });
});
