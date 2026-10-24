/**
 * getComputedStyle: cascade origins and importance, defaulting, inheritance, initial and
 * computed values.
 *
 * Specs:
 *   CSSOM §9 getComputedStyle — https://drafts.csswg.org/cssom/#dom-window-getcomputedstyle
 *   CSS Cascade 5 §6.1 cascade sorting order — https://drafts.csswg.org/css-cascade-5/#cascade-sort
 *   CSS Cascade 5 §7.1 initial values, §7.2 inheritance, §7.3 defaulting keywords —
 *     https://drafts.csswg.org/css-cascade-5/#initial-values, #inheriting, #defaulting-keywords
 *   CSS Cascade 5 §4.4 computed values — https://drafts.csswg.org/css-cascade-5/#computed
 *   CSS Fonts 4 §2.5 absolute-size mapping, relative weights — https://drafts.csswg.org/css-fonts-4/#absolute-size-mapping
 *   CSS Backgrounds 3 §3.3 border-width — https://drafts.csswg.org/css-backgrounds-3/#border-width
 *   CSS Display 3 §2.7 blockification — https://drafts.csswg.org/css-display-3/#blockify
 *   CSS Variables 2 — https://drafts.csswg.org/css-variables-2/#cycles, #serializing-custom-props, #substitute-a-var
 *   CSS Color 4 — https://drafts.csswg.org/css-color-4/#resolving-color-values (with `cssComputedColors: "rgb"`;
 *     the default keeps the author's serialization, docs/deviations.md)
 */
import { beforeEach, describe, expect, test } from "vitest";
import { createWindow, type Document, type Window } from "@rtd/dom";

/* eslint-disable @typescript-eslint/no-explicit-any */
let window: Window;
let document: Document;
beforeEach(() => {
  window = createWindow();
  document = window.document;
});

function setup(head: string, body: string): void {
  document.head!.innerHTML = head;
  document.body!.innerHTML = body;
}

function cs(sel: string, prop: string, pseudo?: string): string {
  return (window.getComputedStyle(document.querySelector(sel)!, pseudo) as any).getPropertyValue(prop);
}

describe("cascade sorting order — https://drafts.csswg.org/css-cascade-5/#cascade-sort", () => {
  test("origin and importance: UA !important beats author !important (input[type=hidden] stays display:none)", () => {
    setup(`<style>input { display: block !important }</style>`, `<input type="hidden" id="h"><input id="t">`);
    expect([cs("#h", "display"), cs("#t", "display")]).toEqual(["none", "block"]);
  });

  test("context: an inline style beats any normal rule; an important rule beats a normal inline style", () => {
    setup(`<style>#a { color: red } #b { color: red !important }</style>`, `<p id="a" style="color: blue">a</p><p id="b" style="color: blue">b</p>`);
    expect([cs("#a", "color"), cs("#b", "color")]).toEqual(["blue", "red"]);
  });

  test("context: an important inline style beats an important rule", () => {
    setup(`<style>#a { color: red !important }</style>`, `<p id="a" style="color: blue !important">a</p>`);
    expect(cs("#a", "color")).toBe("blue");
  });

  test("specificity: id > class > type, regardless of order", () => {
    setup(`<style>#x { color: red } .c { color: green } p { color: blue }</style>`, `<p id="x" class="c">x</p>`);
    expect(cs("p", "color")).toBe("red");
  });

  test("order of appearance breaks ties, across style sheets in document order", () => {
    setup(`<style>.c { color: red }</style><style>.c { color: green }</style>`, `<p class="c">x</p>`);
    expect(cs("p", "color")).toBe("green");
  });

  test(":where() contributes zero specificity; :is() the most specific argument", () => {
    setup(`<style>p { color: red } :where(#x) { color: green } :is(#y, p) { background-color: blue } #y { background-color: yellow }</style>`, `<p id="x">x</p><p id="y">y</p>`);
    expect([cs("#x", "color"), cs("#y", "background-color")]).toEqual(["red", "yellow"]);
  });

  test("layers: important declarations in an earlier layer beat later layers and unlayered ones", () => {
    setup(`<style>@layer a, b; @layer a { p { color: red !important } } @layer b { p { color: green !important } } p { color: blue !important }</style>`, `<p>x</p>`);
    expect(cs("p", "color")).toBe("red");
  });
});

describe("initial values — https://drafts.csswg.org/css-cascade-5/#initial-values", () => {
  test("non-inherited properties without declarations take their initial value", () => {
    setup("", `<div>x</div>`);
    const values = ["position", "opacity", "z-index", "float", "box-sizing", "overflow-x", "pointer-events", "margin-top", "background-color"].map((p) => cs("div", p));
    expect(values).toEqual(["static", "1", "auto", "none", "content-box", "visible", "auto", "0px", "rgba(0, 0, 0, 0)"]);
  });

  test("inherited properties at the root take their initial value", () => {
    setup("", "");
    const values = ["visibility", "font-style", "font-weight", "white-space", "cursor", "text-transform"].map((p) => cs("html", p));
    expect(values).toEqual(["visible", "normal", "400", "normal", "auto", "none"]);
  });
});

describe("inheritance — https://drafts.csswg.org/css-cascade-5/#inheriting", () => {
  test("inherited properties take the parent's computed value; others do not", () => {
    setup(`<style>div { color: green; visibility: hidden; font-style: italic; border-top-style: solid; padding-left: 4px }</style>`, `<div><span>x</span></div>`);
    expect(["color", "visibility", "font-style", "border-top-style", "padding-left"].map((p) => cs("span", p))).toEqual(["green", "hidden", "italic", "none", "0px"]);
  });

  test("the parent's computed (not specified) value is inherited: font-size em resolves before inheriting", () => {
    setup(`<style>div { font-size: 2em } span { font-size: 1.5em }</style>`, `<div><span>x</span></div>`);
    expect([cs("div", "font-size"), cs("span", "font-size")]).toEqual(["32px", "48px"]);
  });
});

describe("defaulting keywords — https://drafts.csswg.org/css-cascade-5/#defaulting-keywords", () => {
  test("initial: the property's initial value even for inherited properties", () => {
    setup(`<style>div { font-style: italic } span { font-style: initial }</style>`, `<div><span>x</span></div>`);
    expect(cs("span", "font-style")).toBe("normal");
  });

  test("inherit: the parent's value even for non-inherited properties", () => {
    setup(`<style>div { padding-left: 7px } span { padding-left: inherit }</style>`, `<div><span>x</span></div>`);
    expect(cs("span", "padding-left")).toBe("7px");
  });

  test("unset: inherit for inherited properties, initial otherwise", () => {
    setup(`<style>div { color: green; padding-left: 7px } span { color: red; padding-left: 3px } span.u { color: unset; padding-left: unset }</style>`, `<div><span class="u">x</span></div>`);
    expect([cs("span", "color"), cs("span", "padding-left")]).toEqual(["green", "0px"]);
  });

  test("revert: rolls back to the user-agent origin (div display:block, not the initial inline)", () => {
    setup(`<style>div { display: flex } div.r { display: revert }</style>`, `<div class="r">x</div>`);
    expect(cs("div", "display")).toBe("block");
  });

  test.fails("revert-layer: rolls back to the previous cascade layer, not to the UA origin", () => {
    // Known gap (docs/deviations.md, CSS): revert-layer behaves like revert (UA origin). Expected:
    // the value from layer `a` ("red"); currently the inherited/initial color is returned.
    setup(`<style>@layer a { p { color: red } } @layer b { p { color: revert-layer } }</style>`, `<p>x</p>`);
    expect(cs("p", "color")).toBe("red");
  });

  test("CSS-wide keywords set on a shorthand apply to every longhand", () => {
    setup(`<style>div { margin: 5px } span { display: block; margin: inherit }</style>`, `<div><span>x</span></div>`);
    expect(cs("span", "margin-left")).toBe("5px");
  });
});

describe("computed values — https://drafts.csswg.org/css-cascade-5/#computed", () => {
  test("font-size absolute keywords map to the UA table (https://drafts.csswg.org/css-fonts-4/#absolute-size-mapping)", () => {
    const sizes = ["xx-small", "x-small", "small", "medium", "large", "x-large", "xx-large", "xxx-large"];
    setup("", sizes.map((s) => `<p style="font-size: ${s}">x</p>`).join(""));
    expect([...document.querySelectorAll("p")].map((p) => (window.getComputedStyle(p) as any).fontSize)).toEqual([
      "9px", "10px", "13px", "16px", "18px", "24px", "32px", "48px",
    ]);
  });

  test("font-size: percentages, rem, smaller/larger and absolute units resolve to px", () => {
    setup(`<style>html { font-size: 20px } div { font-size: 10px }</style>`, `<div><b style="font-size: 150%">a</b><i style="font-size: 2rem">b</i><u style="font-size: larger">c</u><s style="font-size: 12pt">d</s></div>`);
    expect([cs("b", "font-size"), cs("i", "font-size"), cs("u", "font-size"), cs("s", "font-size")]).toEqual(["15px", "40px", "12px", "16px"]);
  });

  test("font-weight: keywords become numbers; bolder/lighter follow the relative weight table (https://drafts.csswg.org/css-fonts-4/#relative-weights)", () => {
    setup(`<style>div { font-weight: 300 }</style>`, `<div><b style="font-weight: bolder">a</b><i style="font-weight: lighter">b</i></div><p style="font-weight: bold">c</p>`);
    expect([cs("b", "font-weight"), cs("i", "font-weight"), cs("p", "font-weight")]).toEqual(["400", "100", "700"]);
  });

  test("border widths: thin/medium/thick are 1px/3px/5px, and 0px when the border style is none (https://drafts.csswg.org/css-backgrounds-3/#border-width)", () => {
    setup("", `<p id="a" style="border: thick solid">a</p><p id="b" style="border-width: 4px">b</p><p id="c" style="border-top: thin dotted">c</p>`);
    expect([cs("#a", "border-top-width"), cs("#b", "border-top-width"), cs("#c", "border-top-width")]).toEqual(["5px", "0px", "1px"]);
  });

  test("currentcolor resolves to the element's color", () => {
    setup(`<style>p { color: green; border-top: 1px solid currentcolor }</style>`, `<p>x</p>`);
    expect(cs("p", "border-top-color")).toBe("green");
  });

  test("display none on an ancestor does not change a descendant's own computed display", () => {
    setup("", `<div style="display: none"><p>x</p></div>`);
    expect(cs("p", "display")).toBe("block");
  });
});

describe("blockification — https://drafts.csswg.org/css-display-3/#blockify", () => {
  test("::before/::after of a flex or grid container are blockified", () => {
    setup(`<style>.f::before { content: "a"; display: inline } .g::after { content: "b" }</style>`, `<div class="f" style="display: flex"></div><div class="g" style="display: inline-grid"></div>`);
    expect([cs(".f", "display", "::before"), cs(".g", "display", "::after")]).toEqual(["block", "block"]);
  });

  // Intentional difference (docs/deviations.md, CSS): only pseudo-elements are blockified.
  // Spec: flex/grid items, floats and absolutely positioned boxes compute display:block
  // (https://drafts.csswg.org/css-display-3/#blockify, https://drafts.csswg.org/css2/#dis-pos-flo).
  test("children of a flex container keep their specified display (deviation: not blockified, as in jsdom)", () => {
    setup("", `<div style="display: flex"><span>x</span></div>`);
    expect(cs("span", "display")).toBe("inline");
  });

  test("floated and absolutely positioned elements keep their specified display (deviation: not blockified, as in jsdom)", () => {
    setup("", `<span id="f" style="float: left">a</span><span id="p" style="position: absolute">b</span>`);
    expect([cs("#f", "display"), cs("#p", "display")]).toEqual(["inline", "inline"]);
  });
});

describe("custom properties — https://drafts.csswg.org/css-variables-2/", () => {
  test("custom properties inherit and are read with getPropertyValue (case-sensitive names)", () => {
    setup(`<style>div { --Gap: 4px }</style>`, `<div><span>x</span></div>`);
    expect([cs("span", "--Gap"), cs("span", "--gap")]).toEqual(["4px", ""]);
  });

  test("values keep their token text (https://drafts.csswg.org/css-variables-2/#serializing-custom-props)", () => {
    setup(`<style>p { --shadow:  0 1px  2px rgba(0,0,0,.5) ; }</style>`, `<p>x</p>`);
    expect(cs("p", "--shadow")).toBe("0 1px  2px rgba(0,0,0,.5)");
  });

  test("var() substitutes, with fallbacks for missing variables (https://drafts.csswg.org/css-variables-2/#substitute-a-var)", () => {
    setup(`<style>p { --c: green; color: var(--c); background-color: var(--missing, blue); padding: var(--p, 1px 2px) }</style>`, `<p>x</p>`);
    expect([cs("p", "color"), cs("p", "background-color"), cs("p", "padding-left")]).toEqual(["green", "blue", "2px"]);
  });

  test("cycles make every variable in the cycle guaranteed-invalid; properties using them are unset (https://drafts.csswg.org/css-variables-2/#cycles)", () => {
    setup(`<style>div { color: green } p { --a: var(--b); --b: var(--a); --ok: 1px; color: var(--a); padding-left: var(--a) }</style>`, `<div><p>x</p></div>`);
    expect([cs("p", "--a"), cs("p", "--b"), cs("p", "--ok"), cs("p", "color"), cs("p", "padding-left")]).toEqual(["", "", "1px", "green", "0px"]);
  });

  test("a var() that substitutes to an invalid value makes the declaration invalid at computed-value time (unset) (https://drafts.csswg.org/css-variables-2/#invalid-at-computed-value-time)", () => {
    // `color: var(--n)` with --n: 12 is unset: color inherits green (not the earlier `red`).
    setup(`<style>div { color: green } p { --n: 12; --d: bogus; color: red; color: var(--n); display: var(--d) }</style>`, `<div><p>x</p></div>`);
    expect([cs("p", "color"), cs("p", "display")]).toEqual(["green", "inline"]);
  });
});

describe("resolving color values (cssComputedColors: \"rgb\") — https://drafts.csswg.org/css-color-4/#resolving-color-values", () => {
  beforeEach(() => {
    window = createWindow({ cssComputedColors: "rgb" } as any);
    document = window.document;
  });

  test("hex notation: 3, 4, 6 and 8 digits; 8-bit alpha serializes as the shortest decimal that maps back to the same byte (https://drafts.csswg.org/css-color-4/#hex-notation)", () => {
    setup("", `<p id="a" style="color: #0f0">a</p><p id="b" style="color: #0f08">b</p><p id="c" style="color: #00ff00">c</p><p id="d" style="color: #00ff0080">d</p>`);
    expect(["#a", "#b", "#c", "#d"].map((s) => cs(s, "color"))).toEqual(["rgb(0, 255, 0)", "rgba(0, 255, 0, 0.533)", "rgb(0, 255, 0)", "rgba(0, 255, 0, 0.5)"]);
  });

  test("named colors and transparent (https://drafts.csswg.org/css-color-4/#named-colors)", () => {
    setup("", `<p id="a" style="color: rebeccapurple; background-color: transparent">a</p>`);
    expect([cs("#a", "color"), cs("#a", "background-color")]).toEqual(["rgb(102, 51, 153)", "rgba(0, 0, 0, 0)"]);
  });

  test("hsl() converts to sRGB (https://drafts.csswg.org/css-color-4/#hsl-to-rgb)", () => {
    setup("", `<p id="a" style="color: hsl(120 100% 25%)">a</p><p id="b" style="color: hsla(0, 100%, 50%, 0.25)">b</p>`);
    expect([cs("#a", "color"), cs("#b", "color")]).toEqual(["rgb(0, 128, 0)", "rgba(255, 0, 0, 0.25)"]);
  });

  test("hwb() converts to sRGB (https://drafts.csswg.org/css-color-4/#hwb-to-rgb)", () => {
    setup("", `<p id="a" style="color: hwb(240 0% 0%)">a</p><p id="b" style="color: hwb(0 100% 100%)">b</p>`);
    expect([cs("#a", "color"), cs("#b", "color")]).toEqual(["rgb(0, 0, 255)", "rgb(128, 128, 128)"]);
  });

  test("alpha: 1 is omitted; percentages become numbers (https://drafts.csswg.org/css-color-4/#serializing-alpha-values)", () => {
    setup("", `<p id="a" style="color: rgb(255 0 0 / 100%)">a</p><p id="b" style="color: rgb(255 0 0 / 50%)">b</p>`);
    expect([cs("#a", "color"), cs("#b", "color")]).toEqual(["rgb(255, 0, 0)", "rgba(255, 0, 0, 0.5)"]);
  });

  test("currentcolor in another property resolves to the computed color", () => {
    setup(`<style>p { color: #f00; outline: 1px solid currentcolor }</style>`, `<p>x</p>`);
    expect(cs("p", "outline-color")).toBe("rgb(255, 0, 0)");
  });
});
