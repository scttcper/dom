/**
 * The cascade's rule-matching shortcuts: the ancestor filter (WebKit SelectorFilter) and reuse of
 * matched rules that depend on :hover / :focus / :checked state (dependency revalidation, in
 * place of WebKit's "affected by" invalidation flags). Each must give exactly the computed
 * values of matching every rule from scratch.
 *
 * Specs:
 *   CSS Cascade 5 §6 cascading — https://drafts.csswg.org/css-cascade-5/#cascading
 *   CSS Cascade 5 §7.2 inheritance — https://drafts.csswg.org/css-cascade-5/#inheriting
 *   Selectors 4 §16 combinators — https://drafts.csswg.org/selectors-4/#combinators
 *   Selectors 4 §9 user action pseudo-classes — https://drafts.csswg.org/selectors-4/#useraction-pseudos
 *   HTML §4.16.3 :checked — https://html.spec.whatwg.org/#selector-checked
 *   HTML §4.16.2 case-sensitivity of selectors — https://html.spec.whatwg.org/#case-sensitivity-of-selectors
 *   CSS Scoping 1 §3 shadow encapsulation — https://drafts.csswg.org/css-scoping-1/#shadow-dom
 */
import { beforeEach, describe, expect, test } from "vitest";
import { createWindow, type Window, type Document, type Element } from "@ctrl/dom";
import { setHoverTarget } from "../../src/selectors/internal.ts";
import { $impl } from "../../src/keys.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEl = any;

let window: Window;
let document: Document;
beforeEach(() => {
  window = createWindow({ html: "<!doctype html><html><head></head><body></body></html>" });
  document = window.document;
});

function setup(css: string, markup: string): void {
  const style = document.createElement("style");
  style.textContent = css;
  document.head!.append(style);
  document.body!.innerHTML = markup;
}
const color = (id: string, w: Window = window, d: Document = document) =>
  w.getComputedStyle(d.getElementById(id) as Element).color;

describe("ancestor filter (WebKit SelectorFilter) — https://drafts.csswg.org/selectors-4/#combinators", () => {
  // Rules that never match, so every element has more candidate rules with ancestor hashes than
  // the cascade's threshold for building the filter (FILTER_AFTER) and the filter path runs.
  const filler = ["span", "b", "em", "i"]
    .map(
      (t) =>
        Array.from({ length: 10 }, (_, k) => `.no${k} ${t}, #no${k} > ${t}`).join(", ") + " { color: rgb(0, 0, 99) }",
    )
    .join("\n");

  test("descendant and child rules apply exactly when the ancestors carry the names", () => {
    setup(
      `${filler}\n.theme .card span { color: rgb(1, 0, 0) } #main > div > b { color: rgb(2, 0, 0) } section em { color: rgb(3, 0, 0) } .a.b i { color: rgb(4, 0, 0) }`,
      `<div class=theme><div class=card><span id=s1></span></div></div><div class=card><span id=s2></span></div>
       <div id=main><div><b id=b1></b></div><p><b id=b2></b></p></div>
       <section><div><em id=e1></em></div></section><em id=e2></em>
       <div class="a b"><i id=i1></i></div><div class=a><div class=b><i id=i2></i></div></div>`,
    );
    expect(color("s1")).toBe("rgb(1, 0, 0)");
    expect(color("s2")).not.toBe("rgb(1, 0, 0)");
    expect(color("b1")).toBe("rgb(2, 0, 0)");
    expect(color("b2")).not.toBe("rgb(2, 0, 0)");
    expect(color("e1")).toBe("rgb(3, 0, 0)");
    expect(color("e2")).not.toBe("rgb(3, 0, 0)");
    expect(color("i1")).toBe("rgb(4, 0, 0)");
    // Both classes are on ancestors, but not on one element: the filter lets it through, the matcher rejects it.
    expect(color("i2")).not.toBe("rgb(4, 0, 0)");
  });

  test("results follow class changes on an ancestor (the filter is rebuilt per element and version)", () => {
    setup(`${filler}\n.on span { color: rgb(9, 0, 0) }`, `<div id=p><span id=s></span></div>`);
    expect(color("s")).not.toBe("rgb(9, 0, 0)");
    document.getElementById("p")!.className = "on";
    expect(color("s")).toBe("rgb(9, 0, 0)");
    document.getElementById("p")!.className = "";
    expect(color("s")).not.toBe("rgb(9, 0, 0)");
  });

  test("cached candidates still test each subject and volatile state after unrelated mutations", () => {
    setup(
      `${filler}\n.on span { color: rgb(1, 0, 0) } .on span[data-active] { color: rgb(2, 0, 0) } .on span:hover { color: rgb(3, 0, 0) }`,
      `<div class=on><span id=a></span><span id=b data-active></span></div>`,
    );
    const a = document.getElementById("a")!;
    expect(color("a")).toBe("rgb(1, 0, 0)");
    expect(color("b")).toBe("rgb(2, 0, 0)");
    document.body!.toggleAttribute("data-unrelated");
    a.setAttribute("data-active", "");
    expect(color("a")).toBe("rgb(2, 0, 0)");
    setHoverTarget(a[$impl]);
    try {
      expect(color("a")).toBe("rgb(3, 0, 0)");
    } finally {
      setHoverTarget(null);
    }
    expect(color("a")).toBe("rgb(2, 0, 0)");
    document.body!.append(a);
    expect(color("a")).toBe("rgb(0, 0, 0)");
  });

  test("cached ancestor rejections follow id changes and replacement stylesheet indexes", () => {
    setup(`${filler}\n#on span { color: rgb(1, 0, 0) }`, `<div id=off><span id=s></span></div>`);
    expect(color("s")).toBe("rgb(0, 0, 0)");
    document.getElementById("off")!.id = "on";
    expect(color("s")).toBe("rgb(1, 0, 0)");
    document.querySelector("style")!.textContent = `${filler}\n#on span { color: rgb(2, 0, 0) }`;
    expect(color("s")).toBe("rgb(2, 0, 0)");
  });

  test("type selectors on mixed-case non-HTML ancestors (foreignObject)", () => {
    setup(
      `foreignObject p { color: rgb(5, 0, 0) } FOREIGNOBJECT i { color: rgb(6, 0, 0) }`,
      `<svg><foreignObject><p id=p></p><i id=i></i></foreignObject></svg>`,
    );
    expect(color("p")).toBe("rgb(5, 0, 0)");
    // Type selectors match non-HTML elements case-sensitively.
    expect(color("i")).not.toBe("rgb(6, 0, 0)");
  });

  test("quirks mode: ancestor classes and ids match ASCII case-insensitively", () => {
    const w = createWindow({
      html: `<style>.Outer span { color: rgb(7, 0, 0) } #BOX i { color: rgb(8, 0, 0) }</style><div class=outer><span id=s></span></div><div id=box><i id=i></i></div>`,
    });
    expect((w.document as AnyEl).compatMode).toBe("BackCompat");
    expect(color("s", w, w.document)).toBe("rgb(7, 0, 0)");
    expect(color("i", w, w.document)).toBe("rgb(8, 0, 0)");
  });

  test("shadow trees: descendant rules do not reach outer ancestors; :host rules still apply", () => {
    document.body!.innerHTML = `<div class=outer><div id=host></div></div>`;
    const sr = (document.getElementById("host") as AnyEl).attachShadow({ mode: "open" });
    sr.innerHTML = `<style>${filler}\n.outer span { color: rgb(1, 1, 1) } :host span { color: rgb(2, 2, 2) } .in span { color: rgb(3, 3, 3) }</style><span id=a></span><div class=in><span id=b></span></div>`;
    expect(window.getComputedStyle(sr.getElementById("a")).color).toBe("rgb(2, 2, 2)");
    expect(window.getComputedStyle(sr.getElementById("b")).color).toBe("rgb(3, 3, 3)");
  });
});

describe("matched rules reused while volatile state holds — https://drafts.csswg.org/selectors-4/#useraction-pseudos", () => {
  test(":hover rules follow the hover target without a DOM mutation", () => {
    setup(
      `.btn:hover { color: rgb(0, 0, 9) } .btn { color: rgb(0, 0, 1) }`,
      `<div id=wrap><button id=b class=btn></button></div>`,
    );
    expect(color("b")).toBe("rgb(0, 0, 1)");
    expect(color("b")).toBe("rgb(0, 0, 1)");
    setHoverTarget((document.getElementById("b") as AnyEl)[$impl]);
    try {
      expect(color("b")).toBe("rgb(0, 0, 9)");
    } finally {
      setHoverTarget(null);
    }
    expect(color("b")).toBe("rgb(0, 0, 1)");
  });

  test("inherited values are recomputed when an ancestor's volatile state changes", () => {
    setup(
      `.p:hover { color: rgb(9, 0, 0) } .c:focus { outline-style: solid }`,
      `<div id=p class=p><input id=c class=c></div>`,
    );
    expect(color("c")).not.toBe("rgb(9, 0, 0)");
    setHoverTarget((document.getElementById("p") as AnyEl)[$impl]);
    try {
      expect(color("p")).toBe("rgb(9, 0, 0)");
      expect(color("c")).toBe("rgb(9, 0, 0)");
    } finally {
      setHoverTarget(null);
    }
    expect(color("c")).not.toBe("rgb(9, 0, 0)");
  });

  test("a child without volatile rules inherits from a hovered parent — https://drafts.csswg.org/css-cascade-5/#inheriting", () => {
    // Before dependency tracking the child's record was cached with the unhovered parent's color.
    setup(`.p:hover { color: rgb(9, 0, 0) }`, `<div id=p class=p><span id=s></span></div>`);
    expect(color("s")).toBe("rgb(0, 0, 0)");
    setHoverTarget((document.getElementById("p") as AnyEl)[$impl]);
    try {
      expect(color("s")).toBe("rgb(9, 0, 0)");
    } finally {
      setHoverTarget(null);
    }
    expect(color("s")).toBe("rgb(0, 0, 0)");
  });

  test(":focus and :focus-within follow focus changes", () => {
    setup(
      `input:focus { color: rgb(0, 9, 0) } form:focus-within { color: rgb(0, 5, 0) }`,
      `<form id=f><input id=i></form>`,
    );
    const input = document.getElementById("i") as AnyEl;
    expect(color("i")).not.toBe("rgb(0, 9, 0)");
    expect(color("f")).not.toBe("rgb(0, 5, 0)");
    input.focus();
    expect(color("i")).toBe("rgb(0, 9, 0)");
    expect(color("f")).toBe("rgb(0, 5, 0)");
    input.blur();
    expect(color("i")).not.toBe("rgb(0, 9, 0)");
    expect(color("f")).not.toBe("rgb(0, 5, 0)");
  });

  test(":checked on a sibling (state of another element) follows checkedness — https://html.spec.whatwg.org/#selector-checked", () => {
    setup(
      `input:checked + label { color: rgb(0, 0, 7) } input:checked { color: rgb(0, 0, 8) }`,
      `<input id=c type=checkbox><label id=l>x</label>`,
    );
    const box = document.getElementById("c") as AnyEl;
    expect(color("l")).not.toBe("rgb(0, 0, 7)");
    box.checked = true;
    expect(color("c")).toBe("rgb(0, 0, 8)");
    expect(color("l")).toBe("rgb(0, 0, 7)");
    box.checked = false;
    expect(color("c")).not.toBe("rgb(0, 0, 8)");
    expect(color("l")).not.toBe("rgb(0, 0, 7)");
  });

  test("::before rules with :hover follow the hover target", () => {
    setup(`.t:hover::before { content: "on" } .t::before { content: "off" }`, `<span id=t class=t></span>`);
    const t = document.getElementById("t") as Element;
    expect(window.getComputedStyle(t, "::before").content).toBe('"off"');
    setHoverTarget((t as AnyEl)[$impl]);
    try {
      expect(window.getComputedStyle(t, "::before").content).toBe('"on"');
    } finally {
      setHoverTarget(null);
    }
    expect(window.getComputedStyle(t, "::before").content).toBe('"off"');
  });
});
