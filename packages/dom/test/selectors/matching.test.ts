/**
 * Selector matching behavior of this engine: fast paths, caches, pseudo-classes, internal API.
 *
 * Specs:
 *   DOM §4.2.6 scope-match a selectors string — https://dom.spec.whatwg.org/#scope-match-a-selectors-string
 *   Selectors 4 — https://drafts.csswg.org/selectors-4/
 *     §4 logical combinations (:is/:where/:not/:has) — https://drafts.csswg.org/selectors-4/#logical-combination
 *     §14 tree-structural pseudo-classes — https://drafts.csswg.org/selectors-4/#structural-pseudos
 *     §6.3 case-sensitivity — https://drafts.csswg.org/selectors-4/#attribute-case
 *   HTML §4.16.2 case-sensitivity of selectors — https://html.spec.whatwg.org/#case-sensitivity-of-selectors
 *   HTML §4.16.3 pseudo-classes — https://html.spec.whatwg.org/#pseudo-classes
 *
 * The differential section runs the same selectors on jsdom (its engine is
 * @asamuzakjp/dom-selector) and compares the matched ids.
 */
import { beforeEach, describe, expect, test } from "vitest";
import { JSDOM } from "jsdom";
import { createWindow, type Document } from "@ctrl/dom";
import {
  compileSelectorList,
  matchesSelector,
  matchingSpecificity,
  serializeSelector,
  setHoverTarget,
  setActiveTarget,
  KEY_ID,
  KEY_CLASS,
  KEY_TAG,
  KEY_NONE,
} from "../../src/selectors/internal.ts";
import { $impl, $version } from "../../src/keys.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEl = any;

let document: Document;
const ids = (list: ArrayLike<AnyEl>) => Array.from(list, (e: AnyEl) => e.id);
const $$ = (sel: string, root: AnyEl = document) => ids(root.querySelectorAll(sel));
const impl = (el: AnyEl) => el[$impl];

beforeEach(() => {
  document = createWindow().document;
});

describe("scope-match a selectors string — https://dom.spec.whatwg.org/#scope-match-a-selectors-string", () => {
  test("step 2: an invalid selector throws a SyntaxError with the browser's message shape", () => {
    expect(() => document.querySelector("div[a")).not.toThrow(); // `[` blocks close at EOF (css-syntax)
    expect(() => document.querySelector("div[")).toThrow(expect.objectContaining({ name: "SyntaxError" }));
    expect(() => document.querySelector("#1")).toThrow(
      expect.objectContaining({ name: "SyntaxError", message: "Failed to execute 'querySelector' on 'Document': '#1' is not a valid selector." }),
    );
    expect(() => document.body!.matches(":foo")).toThrow(expect.objectContaining({ message: "Failed to execute 'matches' on 'Element': ':foo' is not a valid selector." }));
    expect(() => document.createDocumentFragment().querySelectorAll("a,")).toThrow(
      expect.objectContaining({ message: "Failed to execute 'querySelectorAll' on 'DocumentFragment': 'a,' is not a valid selector." }),
    );
  });

  test("invalid selectors keep throwing when served from the compiled-selector cache", () => {
    expect(() => document.querySelector(":nope")).toThrow();
    expect(() => document.querySelector(":nope")).toThrow();
  });

  test("results are descendants only, in tree order, without duplicates for overlapping lists", () => {
    document.body!.innerHTML = `<div id=a class=x><p id=b class=x><span id=c class="x y"></span></p></div>`;
    const a = document.getElementById("a")!;
    expect($$(".x, .y, span, p", a)).toEqual(["b", "c"]);
    expect($$("div .x")).toEqual(["b", "c"]);
  });

  test("selectors match against the whole tree, not just the subtree (ancestors outside the root count)", () => {
    document.body!.innerHTML = `<section id=s><div id=a><p id=b></p></div></section>`;
    const a = document.getElementById("a")!;
    expect($$("section p", a)).toEqual(["b"]);
    expect($$("section > div > p", a)).toEqual(["b"]);
  });

  test("pseudo-elements never match querySelector/matches, but are valid", () => {
    document.body!.innerHTML = `<p id=a></p>`;
    expect($$("p::before")).toEqual([]);
    expect($$("p::before, p")).toEqual(["a"]);
    expect(document.getElementById("a")!.matches("p::after")).toBe(false);
    expect(document.getElementById("a")!.closest("p::marker")).toBeNull();
  });
});

describe("fast paths — #id, .class, tag, [attr], [attr=v], *", () => {
  test("#id uses the document index for connected roots and honors duplicates in tree order", () => {
    document.body!.innerHTML = `<div id=root><p id=dup></p><span id=dup></span></div><b id=dup></b>`;
    const root = document.getElementById("root")!;
    expect(Array.from(root.querySelectorAll("#dup"), (e: AnyEl) => e.localName)).toEqual(["p", "span"]);
    expect(document.querySelector("#dup")!.localName).toBe("p");
    expect(root.querySelector("#root")).toBeNull(); // the root itself is excluded
  });

  test("#id on a detached subtree scans (detached elements are not indexed)", () => {
    const div = document.createElement("div");
    div.innerHTML = `<i id=x></i>`;
    expect(div.querySelector("#x")).toBe(div.firstChild);
  });

  test("#id index answers stay correct across id changes and moves", () => {
    document.body!.innerHTML = `<div id=a></div><div id=b></div>`;
    const a = document.getElementById("a")!;
    expect(document.querySelector("#a")).toBe(a);
    a.id = "z";
    expect(document.querySelector("#a")).toBeNull();
    expect(document.querySelector("#z")).toBe(a);
    document.getElementById("b")!.appendChild(a);
    expect(document.getElementById("b")!.querySelector("#z")).toBe(a);
  });

  test("tag selectors are ASCII case-insensitive for HTML elements, case-sensitive for SVG (https://html.spec.whatwg.org/#case-sensitivity-of-selectors)", () => {
    document.body!.innerHTML = `<DIV id=d></DIV><svg id=s><foreignObject id=f></foreignObject></svg>`;
    expect($$("div")).toEqual(["d"]);
    expect($$("DIV")).toEqual(["d"]);
    expect($$("foreignObject")).toEqual(["f"]);
    expect($$("foreignobject")).toEqual([]);
  });

  test("[attr] names are lowercased for HTML elements only", () => {
    document.body!.innerHTML = `<div id=d data-TestId=x></div><svg><g id=g viewBox="0 0 1 1"></g></svg>`;
    expect($$("[data-testid=x]")).toEqual(["d"]);
    expect($$("[DATA-TESTID]")).toEqual(["d"]);
    expect($$("[viewBox]")).toEqual(["g"]);
    expect($$("[viewbox]")).toEqual([]);
  });

  test("* returns every descendant element in tree order", () => {
    document.body!.innerHTML = `<a id=1><b id=2></b>text<!--c--><i id=3></i></a>`;
    expect($$("*", document.body)).toEqual(["1", "2", "3"]);
  });

  test("static lists: each call returns a new NodeList unaffected by later mutation", () => {
    document.body!.innerHTML = `<p id=a></p>`;
    const first = document.querySelectorAll("p");
    document.body!.append(document.createElement("p"));
    expect(first.length).toBe(1);
    expect(document.querySelectorAll("p").length).toBe(2);
    expect(document.querySelectorAll("p")).not.toBe(document.querySelectorAll("p"));
  });
});

describe("version-stamped result cache — Document[$version] (docs/ARCHITECTURE.md, performance invariant 4)", () => {
  test("repeated queries return fresh NodeLists with identical contents", () => {
    document.body!.innerHTML = `<p id=a class=x></p><p id=b class=x></p>`;
    const l1 = document.querySelectorAll(".x");
    const l2 = document.querySelectorAll(".x");
    expect(l1).not.toBe(l2);
    expect(ids(l1)).toEqual(ids(l2));
  });

  test("tree, attribute and text mutations invalidate cached results", () => {
    document.body!.innerHTML = `<p id=a class=x></p><p id=b></p>`;
    expect($$(".x")).toEqual(["a"]);
    expect(document.querySelector(".x")!.id).toBe("a");
    document.getElementById("b")!.className = "x";
    expect($$(".x")).toEqual(["a", "b"]);
    document.getElementById("a")!.remove();
    expect(document.querySelector(".x")!.id).toBe("b");
    expect($$("p:empty")).toEqual(["b"]);
    document.getElementById("b")!.textContent = "t";
    expect($$("p:empty")).toEqual([]);
    (document.getElementById("b")!.firstChild as AnyEl).data = "";
    expect($$("p:empty")).toEqual(["b"]);
  });

  test("mutations of a detached tree invalidate its cached results", () => {
    const div = document.createElement("div");
    div.innerHTML = `<i class=x></i>`;
    expect(div.querySelectorAll(".x").length).toBe(1);
    div.append(document.createElement("i"));
    (div.lastChild as AnyEl).className = "x";
    expect(div.querySelectorAll(".x").length).toBe(2);
  });

  test("results are per root", () => {
    document.body!.innerHTML = `<div id=r1><b id=x1></b></div><div id=r2><b id=x2></b></div>`;
    expect($$("b", document.getElementById("r1"))).toEqual(["x1"]);
    expect($$("b", document.getElementById("r2"))).toEqual(["x2"]);
  });

  test("state pseudo-classes (not covered by the version) are never served from the cache", () => {
    document.body!.innerHTML = `<input id=c type=checkbox><input id=i>`;
    expect($$(":checked")).toEqual([]);
    (document.getElementById("c") as AnyEl).checked = true;
    expect($$(":checked")).toEqual(["c"]);
    (document.getElementById("i") as AnyEl).focus();
    expect($$("input:focus")).toEqual(["i"]);
    (document.getElementById("c") as AnyEl).focus();
    expect($$("input:focus")).toEqual(["c"]);
  });
});

describe("attribute selectors — https://drafts.csswg.org/selectors-4/#attribute-selectors", () => {
  beforeEach(() => {
    document.body!.innerHTML = `<input id=a type=CHECKBOX title="Hello World" lang=en-US class="one two"><div id=b title=hello data-x=""></div>`;
  });

  test("HTML case-insensitive attribute values ([type] etc.) match ASCII case-insensitively (https://html.spec.whatwg.org/#case-sensitivity-of-selectors)", () => {
    expect($$("[type=checkbox]")).toEqual(["a"]);
    expect($$("[type=checkbox s]")).toEqual([]);
    expect($$("[title=hello]")).toEqual(["b"]); // title is case-sensitive
  });

  test("the i flag forces ASCII case-insensitive matching; s forces sensitive", () => {
    expect($$("[title=hello i]")).toEqual(["a", "b"].filter((id) => id === "b"));
    expect($$("[title^=HELLO i]")).toEqual(["a", "b"]);
    expect($$("[title*=WORLD i]")).toEqual(["a"]);
  });

  test("operators: ~= |= ^= $= *=, and empty-value rules", () => {
    expect($$("[class~=two]")).toEqual(["a"]);
    expect($$("[class~='one two']")).toEqual([]);
    expect($$("[lang|=en]")).toEqual(["a"]);
    expect($$("[title$=World]")).toEqual(["a"]);
    expect($$("[title^='']")).toEqual([]);
    expect($$("[data-x='']")).toEqual(["b"]);
    expect($$("[data-x]")).toEqual(["b"]);
  });

  test("namespaced attributes: [attr] matches only no-namespace attributes; [*|attr] any", () => {
    const el = document.getElementById("b")!;
    el.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", "#x");
    expect($$("[href]")).toEqual([]);
    expect($$("[*|href]")).toEqual(["b"]);
    expect(() => document.querySelector("[xlink|href]")).toThrow(expect.objectContaining({ name: "SyntaxError" }));
  });
});

describe("logical combinations — https://drafts.csswg.org/selectors-4/#logical-combination", () => {
  beforeEach(() => {
    document.body!.innerHTML = `
      <ul id=list>
        <li id=l1><a id=a1 href=#>x</a></li>
        <li id=l2 class=sel><span id=s2></span></li>
        <li id=l3></li>
      </ul>
      <p id=p1></p><p id=p2 class=x></p>`;
  });

  test(":is/:where match any argument; :is() with only invalid arguments matches nothing", () => {
    expect($$(":is(.sel, #l3)")).toEqual(["l2", "l3"]);
    expect($$("li:where(:not(.sel))")).toEqual(["l1", "l3"]);
    expect($$(":is(:unknown, #p1)")).toEqual(["p1"]);
    expect($$(":is(:unknown)")).toEqual([]);
  });

  test(":not() with complex arguments", () => {
    expect($$("li:not(ul > .sel)")).toEqual(["l1", "l3"]);
    expect($$("p:not(.x, #nope)")).toEqual(["p1"]);
  });

  test(":has() with descendant, child, next-sibling and subsequent-sibling relative selectors (https://drafts.csswg.org/selectors-4/#relational)", () => {
    expect($$("li:has(a)")).toEqual(["l1"]);
    expect($$("ul:has(> li > span)")).toEqual(["list"]);
    expect($$("li:has(+ .sel)")).toEqual(["l1"]);
    expect($$("li:has(~ #l3)")).toEqual(["l1", "l2"]);
    expect($$("p:has(+ p.x)")).toEqual(["p1"]);
    expect($$("ul:has(+ p ~ .x)")).toEqual(["list"]);
    expect($$(":has(> #l2 span)")).toEqual(["list"]);
    expect($$("li:not(:has(*))")).toEqual(["l3"]);
  });

  test(":has() with a compound containing an ancestor combinator outside the anchor", () => {
    expect($$("li:has(body li a)")).toEqual([]); // the leftmost compound must still be a descendant of the anchor
    expect($$("ul:has(li a)")).toEqual(["list"]);
  });

  test(":has() re-evaluates after mutations (no invalidation state)", () => {
    expect($$("li:has(b)")).toEqual([]);
    document.getElementById("l3")!.append(document.createElement("b"));
    expect($$("li:has(b)")).toEqual(["l3"]);
  });
});

describe("tree-structural pseudo-classes — https://drafts.csswg.org/selectors-4/#structural-pseudos", () => {
  function table(rows: number): void {
    document.body!.innerHTML = `<table><tbody id=tb>${Array.from({ length: rows }, (_, i) => `<tr id=r${i + 1} class=${i % 3 === 0 ? "a" : "b"}><td></td></tr>`).join("")}</tbody></table>`;
  }

  test(":nth-child(An+B) and :nth-last-child over a wide parent", () => {
    table(10);
    expect($$("tr:nth-child(odd)")).toEqual(["r1", "r3", "r5", "r7", "r9"]);
    expect($$("tr:nth-child(3n+1)")).toEqual(["r1", "r4", "r7", "r10"]);
    expect($$("tr:nth-child(-n+2)")).toEqual(["r1", "r2"]);
    expect($$("tr:nth-last-child(2)")).toEqual(["r9"]);
    expect($$("tr:nth-last-child(-n+3)")).toEqual(["r8", "r9", "r10"]);
  });

  test(":nth-child(An+B of S) counts only siblings matching S", () => {
    table(10);
    expect($$("tr:nth-child(2 of .a)")).toEqual(["r4"]);
    expect($$("tr:nth-last-child(1 of .b)")).toEqual(["r9"]);
    expect($$("tr:nth-child(odd of .b)")).toEqual(["r2", "r5", "r8"]);
  });

  test("index memos are invalidated by mutations between queries", () => {
    table(4);
    expect($$("tr:nth-child(2)")).toEqual(["r2"]);
    document.getElementById("r1")!.remove();
    expect($$("tr:nth-child(2)")).toEqual(["r3"]);
    expect(document.getElementById("r3")!.matches(":nth-child(2)")).toBe(true);
  });

  test(":nth-of-type and friends compare local name and namespace", () => {
    document.body!.innerHTML = `<div id=d><p id=p1></p><span id=s1></span><p id=p2></p><span id=s2></span><p id=p3></p></div>`;
    expect($$("p:nth-of-type(2)")).toEqual(["p2"]);
    expect($$("span:last-of-type")).toEqual(["s2"]);
    expect($$("#d > :first-of-type")).toEqual(["p1", "s1"]);
    expect($$("p:nth-last-of-type(1)")).toEqual(["p3"]);
    expect($$("body > :only-of-type")).toEqual(["d"]);
  });

  test("elements without a parent match :first-child etc. (Selectors 4)", () => {
    const el = document.createElement("div");
    expect(el.matches(":first-child:last-child:only-child:nth-child(1)")).toBe(true);
  });

  test(":empty ignores comments but not text (even whitespace)", () => {
    document.body!.innerHTML = `<p id=a></p><p id=b><!--c--></p><p id=c> </p><p id=d><i></i></p>`;
    expect($$("p:empty")).toEqual(["a", "b"]);
  });

  test(":root matches only the document element", () => {
    expect(document.querySelectorAll(":root")[0]).toBe(document.documentElement);
    const frag = document.createDocumentFragment();
    frag.append(document.createElement("html"));
    expect(frag.querySelector(":root")).toBeNull();
  });

  test(":scope is the context element; on a Document it is the document element (https://drafts.csswg.org/selectors-4/#the-scope-pseudo)", () => {
    document.body!.innerHTML = `<div id=a><div id=b><div id=c></div></div></div>`;
    const a = document.getElementById("a")!;
    expect($$(":scope > div", a)).toEqual(["b"]);
    expect($$(":scope div div", a)).toEqual(["c"]);
    expect(document.querySelector(":scope")).toBe(document.documentElement);
    expect(document.getElementById("c")!.closest(":scope")!.id).toBe("c");
    expect(a.matches(":scope")).toBe(true);
  });
});

describe("element-state pseudo-classes — https://html.spec.whatwg.org/#pseudo-classes", () => {
  test(":link/:any-link match a/area with href; :visited never matches", () => {
    document.body!.innerHTML = `<a id=a href=x></a><a id=b></a><map><area id=c href=y></map><link id=l href=z>`;
    expect($$(":any-link")).toEqual(["a", "c"]);
    expect($$(":link")).toEqual(["a", "c"]);
    expect($$(":visited")).toEqual([]);
  });

  test(":hover/:active follow the pointer state hooks and match ancestors", () => {
    document.body!.innerHTML = `<div id=o><button id=b></button></div>`;
    expect($$(":hover")).toEqual([]);
    setHoverTarget(impl(document.getElementById("b")));
    setActiveTarget(impl(document.getElementById("b")));
    try {
      expect($$("div:hover, button:hover")).toEqual(["o", "b"]);
      expect($$(":active", document.body)).toEqual(["o", "b"]);
    } finally {
      setHoverTarget(null);
      setActiveTarget(null);
    }
  });

  test(":focus/:focus-within follow document focus", () => {
    document.body!.innerHTML = `<div id=o><input id=i></div>`;
    (document.getElementById("i") as AnyEl).focus();
    expect($$(":focus")).toEqual(["i"]);
    expect($$("div:focus-within")).toEqual(["o"]);
  });

  test(":checked/:disabled/:enabled/:required read form state (https://html.spec.whatwg.org/#selector-checked)", () => {
    document.body!.innerHTML = `<fieldset id=f disabled><legend><input id=inlegend></legend><input id=x></fieldset><input id=c type=checkbox><input id=r required><select><option id=o selected>a</option></select>`;
    (document.getElementById("c") as AnyEl).checked = true;
    expect($$(":checked")).toEqual(["c", "o"]);
    expect($$("input:disabled")).toEqual(["x"]);
    expect($$("input:enabled")).toEqual(["inlegend", "c", "r"]);
    expect($$(":required")).toEqual(["r"]);
  });

  test(":lang() uses inherited lang/xml:lang with extended filtering (https://drafts.csswg.org/selectors-4/#the-lang-pseudo)", () => {
    document.body!.innerHTML = `<div lang=de-Latn-DE id=a><p id=b></p></div><div lang=fr id=c></div><div lang=en-US id=d></div>`;
    expect($$(":lang(de-DE)")).toEqual(["a", "b"]);
    expect($$(":lang(fr, \"*-US\")")).toEqual(["c", "d"]);
    expect($$("p:lang(de)")).toEqual(["b"]);
  });

  test(":dir() uses directionality: dir attribute, auto text detection, inheritance (https://html.spec.whatwg.org/#the-directionality)", () => {
    document.body!.innerHTML = `<div id=r dir=rtl><p id=rp></p></div><div id=auto dir=auto>שלום</div><div id=l><bdi id=bd>مرحبا</bdi></div>`;
    expect($$("div:dir(rtl), p:dir(rtl), bdi:dir(rtl)")).toEqual(["r", "rp", "auto", "bd"]);
    expect($$("#l:dir(ltr)")).toEqual(["l"]);
  });

  test(":target matches the element indicated by the URL fragment", () => {
    const w = createWindow({ url: "http://localhost/page#t", html: "<p id=t></p><a name=n></a>" });
    expect(Array.from(w.document.querySelectorAll(":target"), (e: AnyEl) => e.id)).toEqual(["t"]);
  });

  test(":heading / :heading(n) (https://drafts.csswg.org/selectors-5/#headings)", () => {
    document.body!.innerHTML = `<h1 id=a></h1><h3 id=b></h3><h7 id=c></h7><header id=d></header>`;
    expect($$(":heading")).toEqual(["a", "b"]);
    expect($$(":heading(3, 4)")).toEqual(["b"]);
  });
});

describe("quirks mode — https://drafts.csswg.org/selectors-4/#case-sensitive", () => {
  test("class and id selectors match ASCII case-insensitively in quirks mode", () => {
    const w = createWindow({ html: "<p id=Foo class=Bar></p>" });
    const doc = w.document as AnyEl;
    expect(doc.compatMode).toBe("BackCompat");
    expect(doc.querySelector(".bar")?.id).toBe("Foo");
    expect(doc.querySelector("#foo")?.id).toBe("Foo");
    const std = createWindow({ html: "<!doctype html><p id=Foo class=Bar></p>" }).document as AnyEl;
    expect(std.querySelector(".bar")).toBeNull();
  });
});

describe("internal compiled-selector API (css cascade) — https://drafts.csswg.org/selectors-4/#specificity-rules", () => {
  test("compileSelectorList returns per-complex specificity, bucketing key and pseudo-element", () => {
    const list = compileSelectorList("#a .b, div.c::before, :hover, ul li")!;
    const [a, b, c, d] = list.selectors;
    expect(a.specificityTuple).toEqual([1, 1, 0]);
    expect([a.keyKind, a.key]).toEqual([KEY_CLASS, "b"]);
    expect([b.keyKind, b.key, b.pseudoElement]).toEqual([KEY_CLASS, "c", "before"]);
    expect(b.specificityTuple).toEqual([0, 1, 2]);
    expect([c.keyKind, c.volatile]).toEqual([KEY_NONE, true]);
    expect([d.keyKind, d.key, d.volatile]).toEqual([KEY_TAG, "li", false]);
    expect(compileSelectorList("#x")!.selectors[0].keyKind).toBe(KEY_ID);
    expect(list.serialized).toBe("#a .b, div.c::before, :hover, ul li");
  });

  test("invalid lists return null (the rule is dropped)", () => {
    expect(compileSelectorList("a,,b")).toBeNull();
    expect(compileSelectorList("ns|a")).toBeNull();
  });

  test("@namespace prefixes and default namespace", () => {
    document.body!.innerHTML = `<svg><circle id=c></circle></svg><div id=d></div>`;
    const svg = compileSelectorList("s|circle", { namespaces: new Map([["s", "http://www.w3.org/2000/svg"]]) })!;
    expect(matchesSelector(svg.selectors[0], impl(document.getElementById("c")))).toBe(true);
    const html = compileSelectorList("*", { defaultNamespace: "http://www.w3.org/1999/xhtml" })!;
    expect(matchesSelector(html.selectors[0], impl(document.getElementById("c")))).toBe(false);
    expect(matchesSelector(html.selectors[0], impl(document.getElementById("d")))).toBe(true);
  });

  test("matchesSelector targets pseudo-elements only when requested", () => {
    document.body!.innerHTML = `<p id=p class=c></p>`;
    const p = impl(document.getElementById("p"));
    const [plain, before] = compileSelectorList("p, p.c::before")!.selectors;
    expect(matchesSelector(plain, p)).toBe(true);
    expect(matchesSelector(plain, p, "::before")).toBe(false);
    expect(matchesSelector(before, p)).toBe(false);
    expect(matchesSelector(before, p, "::before")).toBe(true);
    expect(matchesSelector(before, p, ":before")).toBe(true);
    expect(matchingSpecificity(compileSelectorList("p, #p, .c")!, p)).toBe(compileSelectorList("#p")!.selectors[0].specificity);
  });

  test("serializeSelector follows CSSOM (https://drafts.csswg.org/cssom/#serialize-a-selector)", () => {
    expect(serializeSelector("div>p+a ,  *.x[ title = 'a\"b' i ]")).toBe('div > p + a, .x[title="a\\"b" i]');
    expect(serializeSelector(":NTH-CHILD( 2N + 1 of .a )")).toBe(":nth-child(2n+1 of .a)");
    expect(serializeSelector("a,")).toBeNull();
  });
});

describe("differential vs jsdom (@asamuzakjp/dom-selector) — https://drafts.csswg.org/selectors-4/", () => {
  const html = `<!doctype html><html><body>
    <main id=main class="app root">
      <header id=hdr><h1 id=t>Title</h1><nav id=nav><a id=n1 href="/a">A</a><a id=n2>B</a><a id=n3 href="#c" class="active">C</a></nav></header>
      <form id=f action="/x">
        <label id=lb for=name>Name</label><input id=name name=name type=text required>
        <input id=cb type=checkbox checked><input id=dis disabled value=v><textarea id=ta></textarea>
        <select id=sel><option id=o1 value=1>1</option><option id=o2 selected>2</option></select>
        <button id=btn type=submit>Go</button>
      </form>
      <ul id=ul>${Array.from({ length: 12 }, (_, i) => `<li id=li${i} data-i="${i}" class="${i % 2 ? "odd" : "even"}${i === 5 ? " five" : ""}">${i % 4 === 0 ? `<b id=b${i}>x</b>` : ""}</li>`).join("")}</ul>
      <div id=empty></div><p id=para lang=en-GB>text <span id=sp dir=rtl>x</span></p>
      <svg id=svg viewBox="0 0 1 1"><g id=g class=shape><rect id=rect></rect></g></svg>
    </main></body></html>`;
  const selectors = [
    "*", "#main", ".odd", "li", "[data-i]", "[data-i='3']", "[data-i^='1']", "[class~=five]", "label[for=name]", "a[href]",
    "main > header a", "header + form", "h1 ~ nav", "li:nth-child(3n)", "li:nth-child(odd of .even)", "li:nth-last-child(-n+2)",
    "li:first-child, li:last-child", "li:only-child", "ul > :nth-of-type(2)", "li:not(.odd)", "li:not(:has(b))", "li:has(> b)",
    ":is(header, form) :is(a, input)", ":where(#nav) a.active", "ul:has(.five)", "li:has(+ .five)", "li:has(~ #li11)",
    ":empty", ":root", "input:checked", "input:disabled", "input:enabled", ":required", ":optional", "option:checked",
    ":any-link", "svg g", "g.shape > rect", "[viewBox]", "*:lang(en)", "p :dir(rtl)", "body main#main.app.root",
    "li:nth-child(2n+1):not(:last-child)", "form :not(input, label)", "#ul li:nth-last-of-type(odd)", "a:not([href])",
    "[class|=odd]", "[class$=ive]", "[class*=hap]", "input[type=TEXT]", "input[type=text s]", "li[class=EVEN i]",
  ];
  const jsdom = new JSDOM(html);
  const ctrlDom = createWindow({ html });
  for (const sel of selectors) {
    test(`${sel}`, () => {
      const want = Array.from(jsdom.window.document.querySelectorAll(sel), (e: AnyEl) => e.id);
      expect(Array.from(ctrlDom.document.querySelectorAll(sel), (e: AnyEl) => e.id)).toEqual(want);
    });
  }
});
