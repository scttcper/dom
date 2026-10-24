/**
 * Shortcuts the selector engine borrows from browser engines; each must give exactly the answer
 * of the plain right-to-left matcher.
 *
 * Specs:
 *   DOM §4.2.6 querySelectorAll — https://dom.spec.whatwg.org/#dom-parentnode-queryselectorall
 *   DOM §4.9 Element.matches — https://dom.spec.whatwg.org/#dom-element-matches
 *   Selectors 4 §17 matching a selector — https://drafts.csswg.org/selectors-4/#match-a-selector-against-an-element
 *   Selectors 4 §16 combinators — https://drafts.csswg.org/selectors-4/#combinators
 *   HTML §4.16.2 case-sensitivity of selectors — https://html.spec.whatwg.org/#case-sensitivity-of-selectors
 *
 * Sources of the techniques: WebKit SelectorFilter (ancestor hashes,
 * https://github.com/WebKit/WebKit/blob/main/Source/WebCore/css/SelectorFilter.h), WebKit
 * SelectorQuery (id-rooted traversal, https://github.com/WebKit/WebKit/blob/main/Source/WebCore/dom/SelectorQuery.cpp)
 * and Blink's RuleSet tag buckets (tag dispatch of selector lists). The differential section
 * compares against jsdom (@asamuzakjp/dom-selector).
 */
import { beforeEach, describe, expect, test } from "vitest";
import { JSDOM } from "jsdom";
import { createWindow, type Document } from "@rtd/dom";
import { compileSelectorList } from "../../src/selectors/internal.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEl = any;

let document: Document;
const ids = (list: ArrayLike<AnyEl>) => Array.from(list, (e: AnyEl) => e.id);
const $$ = (sel: string, root: AnyEl = document) => ids(root.querySelectorAll(sel));

beforeEach(() => {
  document = createWindow().document;
});

const hashes = (sel: string) => {
  const s = compileSelectorList(sel)!.selectors[0];
  return [s.h0, s.h1, s.h2, s.h3].filter((h) => h >= 0).length;
};

describe("ancestor hashes (WebKit SelectorFilter) — https://drafts.csswg.org/selectors-4/#combinators", () => {
  test("compounds joined by descendant or child combinators contribute their id, classes and type", () => {
    expect(hashes(".a span")).toBe(1);
    expect(hashes("#x > .a.b span")).toBe(3);
    expect(hashes("main .a > div .b p")).toBe(4); // capped at four, as in WebKit
  });

  test("compounds reached through a sibling combinator are siblings, not ancestors: no hashes", () => {
    expect(hashes(".a + span")).toBe(0);
    expect(hashes(".a ~ span")).toBe(0);
    // `.p > .a + span`: .p is the parent of .a, hence of span too.
    expect(hashes(".p > .a + span")).toBe(1);
  });

  test("no hashes from the subject, from :is()/:not()/:has() arguments or from attribute selectors", () => {
    expect(hashes(".a")).toBe(0);
    expect(hashes(":is(.a) span")).toBe(0);
    expect(hashes("[data-x] span")).toBe(0);
    expect(hashes("span:has(.a)")).toBe(0);
  });
});

describe("id-rooted querySelectorAll (WebKit SelectorQuery) — https://dom.spec.whatwg.org/#dom-parentnode-queryselectorall", () => {
  const markup = `<div id=a><ul id=list><li id=l1></li><li id=l2></li></ul><section id=s><li id=l3></li></section></div><li id=l4></li>`;

  test("an id absent from the document matches nothing", () => {
    document.body!.innerHTML = markup;
    expect($$("#nope li")).toEqual([]);
    expect(document.querySelector("#nope li")).toBeNull();
  });

  test("the id element inside the root: only its descendants are searched, in tree order", () => {
    document.body!.innerHTML = markup;
    expect($$("#list li")).toEqual(["l1", "l2"]);
    expect($$("#a > ul > li")).toEqual(["l1", "l2"]);
    expect($$("#a li", document.body)).toEqual(["l1", "l2", "l3"]);
  });

  test("the root inside the id element: the whole root is searched", () => {
    document.body!.innerHTML = markup;
    expect($$("#a li", document.getElementById("s"))).toEqual(["l3"]);
    expect($$("#a li", document.getElementById("a"))).toEqual(["l1", "l2", "l3"]);
  });

  test("the id element outside the root's tree path: nothing", () => {
    document.body!.innerHTML = markup + `<p id=other><li id=l5></li></p>`;
    expect($$("#a li", document.getElementById("other"))).toEqual([]);
  });

  test("duplicate ids fall back to the full walk", () => {
    document.body!.innerHTML = `<div id=d><i id=i1></i></div><div id=d><i id=i2></i></div>`;
    expect($$("#d i")).toEqual(["i1", "i2"]);
  });

  test("detached subtrees and shadow trees are searched without the document's id index", () => {
    const detached = document.createElement("div");
    detached.innerHTML = markup;
    expect($$("#list li", detached)).toEqual(["l1", "l2"]);
    document.body!.innerHTML = `<div id=host></div>`;
    const sr = (document.getElementById("host") as AnyEl).attachShadow({ mode: "open" });
    sr.innerHTML = markup;
    expect($$("#list li", sr)).toEqual(["l1", "l2"]);
  });

  test("quirks mode matches the id ASCII case-insensitively — https://html.spec.whatwg.org/#case-sensitivity-of-selectors", () => {
    const doc = createWindow({ html: `<div id=Box><span id=s1></span></div>` }).document as AnyEl;
    expect(doc.compatMode).toBe("BackCompat");
    expect(ids(doc.querySelectorAll("#box span"))).toEqual(["s1"]);
  });

  test("results follow the id element as the tree changes", () => {
    document.body!.innerHTML = markup;
    expect($$("#s li")).toEqual(["l3"]);
    document.getElementById("s")!.id = "t";
    expect($$("#s li")).toEqual([]);
    document.getElementById("l4")!.id = "s";
    document.getElementById("s")!.append(document.getElementById("l1")!);
    expect($$("#s li")).toEqual(["l1"]);
  });
});

describe("tag dispatch of selector lists (Blink RuleSet buckets) — https://drafts.csswg.org/selectors-4/#grouping", () => {
  test("Testing Library's role selectors: explicit role or implicit tags, in tree order", () => {
    document.body!.innerHTML = `<h1 id=a></h1><div id=b role="heading banner"></div><h3 id=c class=x></h3><p id=d></p><h7 id=e></h7>`;
    expect($$('*[role~="heading"],h1,h2,h3,h4,h5,h6')).toEqual(["a", "b", "c"]);
    expect($$("p,h3.x,h7")).toEqual(["c", "d", "e"]);
    expect($$("h3.y,h1,div[role]")).toEqual(["a", "b"]);
  });

  test("elements that are not HTML elements in an HTML document match type selectors by local name", () => {
    document.body!.innerHTML = `<svg><a id=svga></a><foreignObject id=fo></foreignObject></svg><a id=htmla></a>`;
    expect($$("a,b")).toEqual(["svga", "htmla"]);
    expect($$("foreignObject,b")).toEqual(["fo"]);
    expect($$("foreignobject,b")).toEqual([]);
    const xml = document.implementation.createDocument("http://www.w3.org/1999/xhtml", "html", null) as AnyEl;
    const div = xml.createElementNS("http://www.w3.org/1999/xhtml", "div");
    div.id = "xd";
    xml.documentElement.append(div, xml.createElementNS("http://www.w3.org/1999/xhtml", "DIV"));
    expect(ids(xml.querySelectorAll("div,span"))).toEqual(["xd"]);
  });

  test("lists inside :is() / :not() and Element.matches use the same dispatch", () => {
    document.body!.innerHTML = `<b id=b></b><i id=i></i><u id=u class=k></u>`;
    expect($$(":not(b,i,span.k)", document.body)).toEqual(["u"]);
    expect($$(":not(b,i,u.k)", document.body)).toEqual([]);
    expect($$("body :is(i,u.k)")).toEqual(["i", "u"]);
    expect(document.getElementById("u")!.matches("i,u.k,b")).toBe(true);
    expect(document.getElementById("u")!.matches("i,u.j,b")).toBe(false);
  });
});

describe("Element.matches without per-call setup — https://dom.spec.whatwg.org/#dom-element-matches", () => {
  test(":scope and :nth-* keep their per-call handling", () => {
    document.body!.innerHTML = `<ul id=u><li id=a></li><li id=b></li></ul>`;
    const b = document.getElementById("b")!;
    expect(b.matches(":scope")).toBe(true);
    expect(b.matches(":nth-child(2)")).toBe(true);
    expect(b.matches("li:nth-child(1)")).toBe(false);
    expect(b.matches("ul > li")).toBe(true);
  });
});

describe("differential: the same selectors on jsdom", () => {
  const fixture = `<main id=app class="app"><header class="bar"><nav id=nav><a id=n1 href="#">x</a><a id=n2 class="cur" href="#">y</a></nav></header>
<section id=list class="panel"><ul class="items"><li id=i1 class="item"><span id=sp1 class="label">a</span></li><li id=i2 class="item odd"><span id=sp2>b</span></li></ul>
<form id=f><label id=lb for=t>T</label><input id=t type=text><input id=c type=checkbox><button id=btn>Go</button><textarea id=ta></textarea></form></section>
<aside id=side><h2 id=h2>Side</h2><div id=dv role=heading>h</div><p id=para class="label">p</p></aside></main><div id=out><span id=sp3 class="label"></span></div>`;
  const selectors = [
    "#app li", "#list .label", "#nav > a", "#side .label", "#out span", "#missing span", "#app #list li > span",
    "main .panel span", ".app .bar a.cur", "section > ul li span", "aside p", "form input", "#f > input + input",
    '*[role~="heading"],h1,h2,h3,h4,h5,h6', '*[role~="textbox"],input,textarea', "button,input,a.cur", "li.odd,span.label,p",
    ":is(h2,p).label,div", "ul li:not(.odd), a", "#app :is(span,button)",
  ];
  test.each(selectors)("%s", (sel) => {
    const jsdom = new JSDOM(`<!doctype html><body>${fixture}</body>`).window.document;
    const ours = createWindow({ html: `<!doctype html><body>${fixture}</body>` }).document as AnyEl;
    expect(ids(ours.querySelectorAll(sel))).toEqual(ids(jsdom.querySelectorAll(sel)));
    // Element roots are not compared: jsdom 30 drops matches whose id / ancestor compound lies
    // outside the root (`list.querySelectorAll("#app li")` is [] there, though matches() is true
    // for each li — https://dom.spec.whatwg.org/#scope-match-a-selectors-string matches against
    // the whole tree). The id-rooted section above pins those cases.
    for (const el of jsdom.querySelectorAll("*")) {
      if (el.id === "") continue;
      expect([el.id, ours.getElementById(el.id).matches(sel)]).toEqual([el.id, el.matches(sel)]);
    }
  });
});
