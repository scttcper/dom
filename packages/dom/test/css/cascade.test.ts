/**
 * Cascade, getComputedStyle and the fast internal style API.
 *
 * Specs:
 *   CSS Cascade 5 §6 cascading — https://drafts.csswg.org/css-cascade-5/#cascading
 *   CSS Cascade 5 §6.4 layers — https://drafts.csswg.org/css-cascade-5/#layering
 *   CSS Cascade 5 §7 defaulting — https://drafts.csswg.org/css-cascade-5/#defaulting
 *   CSS Variables 2 §3 var() — https://drafts.csswg.org/css-variables-2/#using-variables
 *   CSS Nesting 1 — https://drafts.csswg.org/css-nesting-1/#nesting
 *   CSSOM getComputedStyle — https://drafts.csswg.org/cssom/#dom-window-getcomputedstyle
 *   HTML rendering (UA styles) — https://html.spec.whatwg.org/#rendering
 *   Media Queries 5 — https://drafts.csswg.org/mediaqueries-5/#evaluating
 */
import { beforeEach, describe, expect, test } from "vitest";
import { createWindow, CSS, CSSStyleSheet, type Window, type Document, type Element } from "@ctrl/dom";
import {
  computedValue,
  computedVisibility,
  hasAuthorStyles,
  isDisplayNone,
  pointerEvents,
  pseudoContent,
  NodeCache,
} from "@ctrl/dom/internal";
import { $css, $impl, $styleVersion } from "../../src/keys.ts";

let window: Window;
let document: Document;
beforeEach(() => {
  window = createWindow();
  document = window.document;
});

function html(markup: string): void {
  document.body!.innerHTML = markup;
}
const $ = (sel: string): Element => document.querySelector(sel)!;
const cs = (sel: string, pseudo?: string) =>
  window.getComputedStyle($(sel), pseudo) as unknown as Record<string, string> & {
    getPropertyValue(p: string): string;
    length: number;
  };

describe("UA defaults — https://html.spec.whatwg.org/#rendering", () => {
  test("display per element and the hidden-elements rules", () => {
    html(
      `<div id=d></div><span id=s></span><li id=l></li><table id=t></table><button id=b hidden></button><dialog id=g></dialog><input id=h type=hidden><x-y id=c></x-y>`,
    );
    expect(cs("#d").display).toBe("block");
    expect(cs("#s").display).toBe("inline");
    expect(cs("#l").display).toBe("list-item");
    expect(cs("#t").display).toBe("table");
    expect(cs("#b").display).toBe("none");
    expect(cs("#g").display).toBe("none");
    expect(cs("#h").display).toBe("none");
    expect(cs("#c").display).toBe("inline");
    expect(window.getComputedStyle(document.head!).display).toBe("none");
  });

  test("author rules override [hidden] (normal UA importance) but not input[type=hidden] (!important)", () => {
    html(
      `<style>[hidden]{display:block} input{display:block !important}</style><p hidden id=p></p><input type=hidden id=i>`,
    );
    expect(cs("#p").display).toBe("block");
    expect(cs("#i").display).toBe("none");
  });

  test("links get UA color/cursor; initial values compute (font-weight 400, margin 0px)", () => {
    html(`<a href="#" id=a>x</a><div id=d></div>`);
    expect(cs("#a").cursor).toBe("pointer");
    expect(cs("#d").fontWeight).toBe("400");
    expect(cs("#d").marginTop).toBe("0px");
    expect(cs("#d").visibility).toBe("visible");
    expect(cs("#d").color).toBe("rgb(0, 0, 0)");
  });
});

describe("cascade sort — https://drafts.csswg.org/css-cascade-5/#cascade-sort", () => {
  test("specificity, then order of appearance; inline beats rules; !important beats inline", () => {
    html(`<style>#x{color:red} .a{color:blue} .a.b{width:1px} .b{width:2px} .imp{height:1px !important}</style>
      <div id=x class="a b imp" style="height: 5px; margin-top: 3px"></div>`);
    expect(cs("#x").color).toBe("red");
    expect(cs("#x").width).toBe("1px");
    expect(cs("#x").height).toBe("1px");
    expect(cs("#x").marginTop).toBe("3px");
  });

  test("layers: unlayered beats layered; later layers beat earlier; important reverses", () => {
    html(`<style>@layer base, theme;
      @layer theme { .t { color: green; width: 1px !important } }
      @layer base { #e { color: red; width: 2px !important } }
      .u { height: 3px } @layer theme { #e { height: 9px } }</style><div id=e class="t u"></div>`);
    expect(cs("#e").color).toBe("green");
    expect(cs("#e").width).toBe("2px");
    expect(cs("#e").height).toBe("3px");
  });

  test("inheritance and inherit/initial/unset/revert keywords", () => {
    html(`<style>.p{color:green; visibility:hidden; width: 5px} .c1{color:initial} .c2{width:inherit} .c3{visibility:unset} .c4{display:revert}</style>
      <div class=p><span class=c1 id=a></span><span class=c2 id=b></span><span class=c3 id=c></span><span id=d style="display:block" class=c4></span></div>`);
    expect(cs("#a").color).toBe("rgb(0, 0, 0)");
    expect(cs("#b").width).toBe("5px");
    expect(cs("#c").visibility).toBe("hidden");
    expect(cs("#b").color).toBe("green");
  });

  test("var() substitution with fallbacks, inheritance and cycles", () => {
    html(`<style>:root{--c: blue; --w: 3px} .a{--w: 4px; --x: var(--y); --y: var(--x)} .b{width: var(--w); color: var(--c); height: var(--nope, 7px); margin: var(--w) 1px; top: var(--x, 1px)}</style>
      <div class=a><p class=b id=b></p></div>`);
    expect(cs("#b").width).toBe("4px");
    expect(cs("#b").color).toBe("blue");
    expect(cs("#b").height).toBe("7px");
    expect(cs("#b").marginTop).toBe("4px");
    expect(cs("#b").marginLeft).toBe("1px");
    expect(cs("#b").top).toBe("1px");
    expect(cs("#b").getPropertyValue("--w")).toBe("4px");
  });

  test("CSS nesting: & selectors, relative nested rules, nested @media", () => {
    html(`<style>.card { color: red; & > .t { color: blue } .d { width: 1px } &:not(.x) { height: 2px } @media (min-width: 1px) { top: 3px } }</style>
      <div class=card id=c><b class=t id=t></b><i><u class=d id=d></u></i></div>`);
    expect(cs("#c").color).toBe("red");
    expect(cs("#t").color).toBe("blue");
    expect(cs("#d").width).toBe("1px");
    expect(cs("#c").height).toBe("2px");
    expect(cs("#c").top).toBe("3px");
  });

  test("computed colors keep the author's serialization by default (jest-dom toHaveStyle compat); currentcolor resolves", () => {
    html(
      `<style>.a{color: blue; background-color: #ff0000; border-color: currentcolor; border-style: solid}</style><div class=a id=a></div>`,
    );
    expect(cs("#a").color).toBe("blue");
    expect(cs("#a").backgroundColor).toBe("rgb(255, 0, 0)");
    expect(cs("#a").borderTopColor).toBe("blue");
    const probe = document.createElement("div") as unknown as { style: Record<string, string> };
    probe.style.backgroundColor = "#ff0000";
    expect(cs("#a").backgroundColor).toBe(probe.style.backgroundColor);
  });

  test("::before / ::after styles and content", () => {
    html(
      `<style>.q::before{content:"« "} .q::after{content: attr(data-x) "!"; color: red}</style><span class=q id=q data-x="hey">t</span>`,
    );
    expect(cs("#q", "::before").content).toBe('"« "');
    expect(cs("#q", "::after").color).toBe("red");
    expect(cs("#q").content).toBe("normal");
    expect(pseudoContent(($("#q") as unknown as { [$impl]: never })[$impl], "::after")).toBe("hey!");
  });
});

describe("style sheet changes invalidate computed styles — https://drafts.csswg.org/cssom/#the-cssstylesheet-interface", () => {
  test("insertRule/deleteRule (emotion production mode), <style> text changes, removal", () => {
    html(`<style id=s></style><div class="css-1" id=e></div>`);
    const sheet = (document.getElementById("s") as unknown as { sheet: CSSStyleSheet }).sheet;
    const before = document[$styleVersion];
    sheet.insertRule(".css-1{display:none}", 0);
    expect(document[$styleVersion]).toBeGreaterThan(before);
    expect(cs("#e").display).toBe("none");
    sheet.deleteRule(0);
    expect(cs("#e").display).toBe("block");
    document.getElementById("s")!.textContent = ".css-1{display:flex}";
    expect(cs("#e").display).toBe("flex");
    document.getElementById("s")!.remove();
    expect(cs("#e").display).toBe("block");
  });

  test("rule.style edits and selectorText changes apply", () => {
    html(`<style>.a{color:red}</style><div class=b id=e></div>`);
    const rule = (document as unknown as { styleSheets: { [i: number]: CSSStyleSheet } }).styleSheets[0]
      .cssRules[0] as unknown as { selectorText: string; style: { color: string } };
    rule.selectorText = ".b";
    expect(cs("#e").color).toBe("red");
    rule.style.color = "green";
    expect(cs("#e").color).toBe("green");
  });

  test("constructable sheets via adoptedStyleSheets (assignment and push)", () => {
    html(`<div class=a id=e></div>`);
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(".a{width:10px}");
    const d = document as unknown as { adoptedStyleSheets: CSSStyleSheet[] };
    d.adoptedStyleSheets = [sheet];
    expect(cs("#e").width).toBe("10px");
    const other = new CSSStyleSheet();
    other.replaceSync(".a{width:20px}");
    d.adoptedStyleSheets.push(other);
    expect(cs("#e").width).toBe("20px");
  });

  test("shadow trees that come and go leave no style bookkeeping behind (https://drafts.csswg.org/cssom/#remove-a-css-style-sheet)", () => {
    const shadows = () => (document[$css] as { shadows: { refs: Set<unknown> } | null }).shadows?.refs.size ?? 0;
    const render = () => {
      const host = document.createElement("div");
      document.body!.appendChild(host);
      const root = (host as unknown as { attachShadow(init: object): { innerHTML: string } }).attachShadow({
        mode: "open",
      });
      root.innerHTML = "<style>p { color: red }</style><p>x</p>";
      return host;
    };
    const live = render();
    for (let i = 0; i < 50; i++) render().remove();
    // Only the connected shadow tree still has a sheet; the removed ones were released.
    expect(shadows()).toBe(1);
    expect(window.getComputedStyle(live).display).toBe("block");
    live.remove();
    expect(shadows()).toBe(0);
  });

  test("a shadow root's adoptedStyleSheets array, once read, is watched for push (https://drafts.csswg.org/cssom/#dom-documentorshadowroot-adoptedstylesheets)", () => {
    html(`<div id=host></div>`);
    const root = (
      document.getElementById("host") as unknown as { attachShadow(init: object): ShadowRoot }
    ).attachShadow({ mode: "open" }) as unknown as {
      innerHTML: string;
      adoptedStyleSheets: CSSStyleSheet[];
      querySelector(s: string): Element;
    };
    root.innerHTML = "<p class=a>x</p>";
    const p = root.querySelector("p");
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(".a{width:10px}");
    root.adoptedStyleSheets.push(sheet);
    expect(window.getComputedStyle(p).width).toBe("10px");
    const other = new CSSStyleSheet();
    other.replaceSync(".a{width:20px}");
    root.adoptedStyleSheets = [other];
    expect(window.getComputedStyle(p).width).toBe("20px");
    root.adoptedStyleSheets.push(sheet);
    expect(window.getComputedStyle(p).width).toBe("10px");
  });

  test("document.styleSheets is live and in tree order", () => {
    html(`<style id=b>.b{}</style>`);
    const head = document.head!;
    const a = document.createElement("style");
    a.textContent = ".a{}";
    head.appendChild(a);
    const list = (document as unknown as { styleSheets: { length: number; [i: number]: { ownerNode: unknown } } })
      .styleSheets;
    expect(list.length).toBe(2);
    expect(list[0].ownerNode).toBe(a);
  });

  test("media rules follow the viewport (resizeTo)", () => {
    html(`<style>@media (max-width: 600px) { .m { display: none } }</style><div class=m id=m></div>`);
    expect(cs("#m").display).toBe("block");
    (window as unknown as { resizeTo(w: number, h: number): void }).resizeTo(500, 800);
    expect(cs("#m").display).toBe("none");
  });
});

describe("fast internal API (src/css/internal.ts)", () => {
  const impl = (sel: string) => ($(sel) as unknown as { [$impl]: Parameters<typeof isDisplayNone>[0] })[$impl];

  test("without author styles: UA + inline checks, no style records allocated for plain elements", () => {
    html(
      `<div id=a><span id=b></span></div><p id=c style="visibility:hidden"><i id=d></i></p><template id=t></template>`,
    );
    expect(hasAuthorStyles(document)).toBe(true); // the inline style counts
    expect(isDisplayNone(impl("#a"))).toBe(false);
    expect(isDisplayNone(impl("#t"))).toBe(true);
    expect(computedVisibility(impl("#d"))).toBe("hidden");
    expect(computedVisibility(impl("#b"))).toBe("visible");
    expect(pointerEvents(impl("#b"))).toBe("auto");
    const cache = impl("#b").cache as NodeCache | null;
    expect(cache === null || cache.style === null).toBe(true);
  });

  test("hasAuthorStyles is false for a plain document", () => {
    html(`<div></div>`);
    expect(hasAuthorStyles(document)).toBe(false);
  });

  test("with sheets: cached per element and invalidated by mutations", () => {
    html(
      `<style>.h{display:none} .v{visibility:hidden} .n{pointer-events:none}</style><div id=a class="v n"><span id=b></span></div>`,
    );
    expect(isDisplayNone(impl("#a"))).toBe(false);
    expect(computedVisibility(impl("#b"))).toBe("hidden");
    expect(pointerEvents(impl("#b"))).toBe("none");
    $("#a").classList.add("h");
    expect(isDisplayNone(impl("#a"))).toBe(true);
    expect(computedValue(impl("#a"), "display")).toBe("none");
  });
});

describe("CSS namespace — https://drafts.csswg.org/cssom/#the-css-namespace", () => {
  test("CSS.supports property/value and condition forms", () => {
    expect(CSS.supports("display", "flex")).toBe(true);
    expect(CSS.supports("display", "nope")).toBe(false);
    expect(CSS.supports("(display: grid) and (not (color: nope))")).toBe(true);
    expect(CSS.supports("selector(a > b)")).toBe(true);
    expect(CSS.supports("--x", "anything")).toBe(true);
  });

  test("CSS.escape", () => {
    expect(CSS.escape("1a")).toBe("\\31 a");
    expect(CSS.escape("a.b")).toBe("a\\.b");
  });

  test("matchMedia evaluates through the css media query engine", () => {
    const mm = (q: string) =>
      (window as unknown as { matchMedia(q: string): { matches: boolean } }).matchMedia(q).matches;
    expect(mm("(min-width: 1000px) and (orientation: landscape)")).toBe(true);
    expect(mm("(width >= 1100px)")).toBe(false);
    expect(mm("screen and (prefers-reduced-motion: no-preference)")).toBe(true);
    expect(mm("print")).toBe(false);
    expect(mm("not print")).toBe(true);
  });
});
