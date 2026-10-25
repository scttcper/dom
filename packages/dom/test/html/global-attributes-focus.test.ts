/**
 * HTMLElement members component tests touch: hidden (until-found), inert, draggable, spellcheck,
 * autocapitalize / autocorrect / writingSuggestions, nonce, accessKeyLabel, designMode,
 * innerText / outerText, and the focus details (tabindex parsing, focus delegates, autofocus
 * delegates, summary focusability, hasFocus, blur).
 *
 * Spec: HTML Standard
 *   - HTMLElement:                   https://html.spec.whatwg.org/#htmlelement, https://html.spec.whatwg.org/#htmlorsvgelement,
 *                                    https://html.spec.whatwg.org/#elementcssinlinestyle
 *   - hidden:                        https://html.spec.whatwg.org/#dom-hidden
 *   - draggable / spellcheck:        https://html.spec.whatwg.org/#dom-draggable, https://html.spec.whatwg.org/#dom-spellcheck
 *   - translate:                     https://html.spec.whatwg.org/#dom-translate
 *   - autocapitalize / autocorrect:  https://html.spec.whatwg.org/#dom-autocapitalize, https://html.spec.whatwg.org/#own-autocapitalization-hint,
 *                                    https://html.spec.whatwg.org/#autocapitalize-and-autocorrect-inheriting-elements,
 *                                    https://html.spec.whatwg.org/#dom-autocorrect, https://html.spec.whatwg.org/#used-autocorrection-state
 *   - writing suggestions:           https://html.spec.whatwg.org/#dom-writingsuggestions, https://html.spec.whatwg.org/#computed-writing-suggestions-value
 *   - nonce:                         https://html.spec.whatwg.org/#dom-noncedelement-nonce
 *   - access keys:                   https://html.spec.whatwg.org/#assigned-access-key
 *   - design mode:                   https://html.spec.whatwg.org/#design-mode-enabled
 *   - innerText / outerText:         https://html.spec.whatwg.org/#dom-innertext, https://html.spec.whatwg.org/#dom-outertext,
 *                                    https://html.spec.whatwg.org/#get-the-text-steps, https://html.spec.whatwg.org/#rendered-text-fragment,
 *                                    https://html.spec.whatwg.org/#merge-with-the-next-text-node
 *   - focus:                         https://html.spec.whatwg.org/#attr-tabindex, https://html.spec.whatwg.org/#sequentially-focusable,
 *                                    https://html.spec.whatwg.org/#get-the-focusable-area, https://html.spec.whatwg.org/#focus-navigation-scope-owner,
 *                                    https://html.spec.whatwg.org/#autofocus-delegate, https://html.spec.whatwg.org/#summary-for-its-parent-details,
 *                                    https://html.spec.whatwg.org/#dom-blur, https://html.spec.whatwg.org/#dom-document-hasfocus
 *   - inert:                         https://html.spec.whatwg.org/#the-inert-attribute
 *
 * jsdom lacks most of these (innerText, autocapitalize, autocorrect, writingSuggestions, inert
 * semantics, delegatesFocus), so they assert the spec directly.
 */
import { beforeEach, describe, expect, test } from "vitest";
import { createWindow } from "@ctrl/dom";
import { $impl } from "@ctrl/dom/internal";
import { sequentialFocusOrder } from "../../src/html/focus.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
let win: any;
let doc: any;
beforeEach(() => {
  win = createWindow();
  doc = win.document;
});

const $ = (id: string) => doc.getElementById(id);

describe("hidden — https://html.spec.whatwg.org/#dom-hidden", () => {
  test("getter: a boolean — true for hidden=until-found too (docs/deviations.md: the spec returns 'until-found')", () => {
    doc.body.innerHTML = `<div id=a hidden></div><div id=b hidden=UNTIL-FOUND></div><div id=c hidden=x></div><div id=d></div>`;
    expect(["a", "b", "c", "d"].map((id) => $(id).hidden)).toEqual([true, true, true, false]);
  });

  test("setter: 'until-found' writes the keyword; false, '', null, 0 and NaN remove the attribute; anything else sets ''", () => {
    const el = doc.createElement("div");
    const out: (string | null)[] = [];
    for (const v of ["Until-Found", false, "x", "", true, null, 1, 0, Number.NaN, "false"]) {
      el.hidden = v;
      out.push(el.getAttribute("hidden"));
    }
    expect(out).toEqual(["until-found", null, "", null, "", null, "", null, null, ""]);
  });

  test("hidden=until-found does not make the element display:none, plain hidden does", () => {
    doc.body.innerHTML = `<div id=a hidden>a</div><div id=b hidden=until-found>b</div>`;
    expect([win.getComputedStyle($("a")).display, win.getComputedStyle($("b")).display]).toEqual(["none", "block"]);
  });
});

describe("inert — https://html.spec.whatwg.org/#the-inert-attribute", () => {
  test("inert subtrees are not focusable; the content attribute works in every compat profile", () => {
    doc.body.innerHTML = `<div id=box inert><button id=b>b</button></div><button id=c>c</button>`;
    $("b").focus();
    const blocked = doc.activeElement === $("b");
    $("box").removeAttribute("inert");
    $("b").focus();
    expect([blocked, doc.activeElement.id]).toEqual([false, "b"]);
  });

  test("an inert subtree drops out of the sequential focus navigation order", () => {
    doc.body.innerHTML = `<div id=box><button id=b>b</button></div><button id=c>c</button>`;
    $("box").setAttribute("inert", "");
    expect(sequentialFocusOrder(doc).map((e: any) => e.id)).toEqual(["c"]);
  });
});

describe("draggable / spellcheck — https://html.spec.whatwg.org/#dom-draggable", () => {
  test("draggable defaults to true for img and a[href] only; the setter writes 'true'/'false'", () => {
    doc.body.innerHTML = `<img id=i><a id=a href=x>a</a><a id=n>n</a><div id=d></div><div id=t draggable=TRUE></div><img id=f draggable=false>`;
    const before = ["i", "a", "n", "d", "t", "f"].map((id) => $(id).draggable);
    $("d").draggable = true;
    expect([before, $("d").getAttribute("draggable")]).toEqual([[true, true, false, false, true, false], "true"]);
  });

  test("spellcheck: explicit true/false (and ''), otherwise inherited, default true; the setter writes 'true'/'false' (https://html.spec.whatwg.org/#dom-spellcheck)", () => {
    doc.body.innerHTML = `<div id=p spellcheck=false><span id=c></span><span id=e spellcheck></span></div><div id=d></div>`;
    const values = ["p", "c", "e", "d"].map((id) => $(id).spellcheck);
    $("d").spellcheck = false;
    expect([values, $("d").getAttribute("spellcheck")]).toEqual([[false, false, true, true], "false"]);
  });
});

describe("autocapitalize — https://html.spec.whatwg.org/#dom-autocapitalize", () => {
  test("keywords map to states (on → sentences, off → none), invalid and missing are ''", () => {
    const el = doc.createElement("div");
    const out = ["on", "off", "NONE", "sentences", "words", "characters", "bogus"].map(
      (v) => (el.setAttribute("autocapitalize", v), el.autocapitalize),
    );
    el.removeAttribute("autocapitalize");
    expect([...out, el.autocapitalize]).toEqual([
      "sentences",
      "none",
      "none",
      "sentences",
      "words",
      "characters",
      "sentences",
      "",
    ]);
  });

  test("inheriting form controls use their form owner's hint (https://html.spec.whatwg.org/#own-autocapitalization-hint, https://html.spec.whatwg.org/#autocapitalize-and-autocorrect-inheriting-elements)", () => {
    doc.body.innerHTML = `<form id=f autocapitalize=words><input id=i><textarea id=t></textarea><div id=d></div><input id=own autocapitalize=characters></form>`;
    expect(["i", "t", "d", "own"].map((id) => $(id).autocapitalize)).toEqual(["words", "words", "", "characters"]);
  });
});

describe("autocorrect — https://html.spec.whatwg.org/#dom-autocorrect", () => {
  test("on by default; 'off' turns it off; url/email/password inputs never autocorrect (https://html.spec.whatwg.org/#used-autocorrection-state)", () => {
    doc.body.innerHTML = `<div id=d></div><div id=off autocorrect=off></div><input id=pw type=password autocorrect=on><form autocorrect=off><input id=inh></form>`;
    expect(["d", "off", "pw", "inh"].map((id) => $(id).autocorrect)).toEqual([true, false, false, false]);
    $("d").autocorrect = false;
    expect($("d").getAttribute("autocorrect")).toBe("off");
  });
});

describe("writingSuggestions — https://html.spec.whatwg.org/#dom-writingsuggestions", () => {
  test("the computed value inherits 'false' from ancestors; '' and invalid values are true (https://html.spec.whatwg.org/#computed-writing-suggestions-value)", () => {
    doc.body.innerHTML = `<div writingsuggestions=false><span id=a></span><span id=b writingsuggestions></span><span id=c writingsuggestions=bogus></span></div><span id=d></span>`;
    expect(["a", "b", "c", "d"].map((id) => $(id).writingSuggestions)).toEqual(["false", "true", "true", "true"]);
  });
});

describe("nonce — https://html.spec.whatwg.org/#dom-noncedelement-nonce", () => {
  test("the IDL attribute reads an internal slot that content attribute changes update; setting it does not touch the attribute", () => {
    const el = doc.createElement("script");
    el.setAttribute("nonce", "abc");
    const fromAttr = el.nonce;
    el.nonce = "xyz";
    expect([fromAttr, el.nonce, el.getAttribute("nonce")]).toEqual(["abc", "xyz", "abc"]);
  });
});

describe("access keys — https://html.spec.whatwg.org/#assigned-access-key", () => {
  test("accessKey reflects; a single-code-point key is assigned and labeled the way Firefox does ('Alt+Shift+S'), lists are not", () => {
    doc.body.innerHTML = `<button id=b accesskey=s>b</button><button id=c accesskey="s 0">c</button><button id=d>d</button>`;
    expect([$("b").accessKey, $("b").accessKeyLabel, $("c").accessKeyLabel, $("d").accessKeyLabel]).toEqual([
      "s",
      "Alt+Shift+S",
      "",
      "",
    ]);
  });
});

describe("design mode — https://html.spec.whatwg.org/#design-mode-enabled", () => {
  test("designMode 'on' makes every element editable (:read-write, isContentEditable); invalid values are ignored", () => {
    doc.body.innerHTML = `<p id=p>x</p>`;
    const before = [doc.designMode, $("p").isContentEditable, $("p").matches(":read-write")];
    doc.designMode = "bogus";
    doc.designMode = "ON";
    expect([before, doc.designMode, $("p").isContentEditable, $("p").matches(":read-write")]).toEqual([
      ["off", false, false],
      "on",
      true,
      true,
    ]);
  });
});

describe("innerText — https://html.spec.whatwg.org/#dom-innertext", () => {
  test("get the text steps: block boundaries, <br>, <p> margins and display:none (https://html.spec.whatwg.org/#get-the-text-steps)", () => {
    doc.body.innerHTML = `<div id=d>a<div>b</div><p>c</p>d<br>e<span style="display:none">hidden</span><span>  f   g </span></div>`;
    expect($("d").innerText).toBe("a\nb\n\nc\n\nd\ne f g");
  });

  test("a display:none element returns its text content", () => {
    doc.body.innerHTML = `<div id=d style="display:none">a<div>b</div></div>`;
    expect($("d").innerText).toBe("ab");
  });

  test("setter: line breaks become <br> elements (https://html.spec.whatwg.org/#rendered-text-fragment)", () => {
    doc.body.innerHTML = `<div id=d>old</div>`;
    $("d").innerText = "a\nb\r\nc\rd";
    expect($("d").innerHTML).toBe("a<br>b<br>c<br>d");
  });

  test("outerText setter replaces the element and merges with adjacent text nodes (https://html.spec.whatwg.org/#dom-outertext, https://html.spec.whatwg.org/#merge-with-the-next-text-node)", () => {
    doc.body.innerHTML = `<div id=w>x<span id=s>old</span>y</div>`;
    $("s").outerText = "1\n2";
    expect([$("w").innerHTML, $("w").childNodes.length]).toEqual(["x1<br>2y", 3]);
  });

  test("outerText setter on an element without a parent throws NoModificationAllowedError", () => {
    const el = doc.createElement("span");
    expect(() => (el.outerText = "x")).toThrow(expect.objectContaining({ name: "NoModificationAllowedError" }));
  });
});

describe("tabindex — https://html.spec.whatwg.org/#attr-tabindex", () => {
  test("parsed with the rules for parsing integers: leading whitespace and '+' allowed, trailing junk ignored", () => {
    doc.body.innerHTML = `<div id=a tabindex=" 3"></div><div id=b tabindex="+2"></div><div id=c tabindex="1.9"></div><div id=d tabindex="x"></div><div id=e tabindex="-5abc"></div>`;
    expect(["a", "b", "c", "d", "e"].map((id) => $(id).tabIndex)).toEqual([3, 2, 1, -1, -5]);
  });

  test("a negative tabindex is focusable but not sequentially focusable (https://html.spec.whatwg.org/#sequentially-focusable)", () => {
    doc.body.innerHTML = `<div id=a tabindex=-1>a</div><div id=b tabindex=0>b</div>`;
    $("a").focus();
    expect([doc.activeElement.id, sequentialFocusOrder(doc).map((e: any) => e.id)]).toEqual(["a", ["b"]]);
  });

  test("the first summary of a details is focusable with tabIndex 0; other summaries are not (https://html.spec.whatwg.org/#summary-for-its-parent-details)", () => {
    doc.body.innerHTML = `<details><summary id=s1>a</summary><summary id=s2>b</summary></details><summary id=s3>c</summary>`;
    expect(["s1", "s2", "s3"].map((id) => [$(id).tabIndex, ($(id).focus(), doc.activeElement === $(id))])).toEqual([
      [0, true],
      [-1, false],
      [-1, false],
    ]);
  });
});

describe("focus delegates — https://html.spec.whatwg.org/#get-the-focusable-area", () => {
  test("a delegatesFocus host forwards focus() to its autofocus shadow descendant first (https://html.spec.whatwg.org/#autofocus-delegate)", () => {
    const host = doc.body.appendChild(doc.createElement("div"));
    const root = host.attachShadow({ mode: "open", delegatesFocus: true });
    root.innerHTML = `<input id=first><input id=auto autofocus>`;
    host.focus();
    expect(root.activeElement.id).toBe("auto");
  });

  test("a delegatesFocus host that already contains the focused element keeps it (https://html.spec.whatwg.org/#focus-navigation-scope-owner)", () => {
    const host = doc.body.appendChild(doc.createElement("div"));
    const root = host.attachShadow({ mode: "open", delegatesFocus: true });
    root.innerHTML = `<input id=first><input id=second>`;
    root.getElementById("second").focus();
    host.focus();
    expect(root.activeElement.id).toBe("second");
  });

  test("a delegatesFocus host with nothing focusable inside is not focused", () => {
    const host = doc.body.appendChild(doc.createElement("div"));
    host.tabIndex = 0;
    host.attachShadow({ mode: "open", delegatesFocus: true }).innerHTML = `<span>x</span>`;
    host.focus();
    expect(doc.activeElement).toBe(doc.body);
  });

  test("a label is not a focusable area: focus() on it does nothing", () => {
    doc.body.innerHTML = `<label id=l for=i>l</label><input id=i>`;
    $("l").focus();
    expect(doc.activeElement).toBe(doc.body);
  });
});

describe("blur and hasFocus — https://html.spec.whatwg.org/#dom-blur", () => {
  test("blur() on the focused element moves focus to the body; on another element it does nothing", () => {
    doc.body.innerHTML = `<input id=a><input id=b>`;
    $("a").focus();
    $("b").blur();
    const kept = doc.activeElement.id;
    $("a").blur();
    expect([kept, doc.activeElement]).toEqual(["a", doc.body]);
  });

  test("document.hasFocus() is true once an element of the document is focused (as jsdom: no system focus to report otherwise) (https://html.spec.whatwg.org/#dom-document-hasfocus)", () => {
    doc.body.innerHTML = `<input id=a>`;
    const before = doc.hasFocus();
    $("a").focus();
    const other = doc.implementation.createHTMLDocument("");
    expect([before, doc.hasFocus(), other.hasFocus()]).toEqual([false, true, false]);
  });
});

describe("HTMLElement interface — https://html.spec.whatwg.org/#htmlelement", () => {
  test("style (ElementCSSInlineStyle), dataset and tabIndex live on HTML, SVG and MathML elements (https://html.spec.whatwg.org/#elementcssinlinestyle, https://html.spec.whatwg.org/#htmlorsvgelement)", () => {
    const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    const math = doc.createElementNS("http://www.w3.org/1998/Math/MathML", "math");
    const div = doc.createElement("div");
    const ok = (el: any) => [typeof el.style?.setProperty, typeof el.dataset, typeof el.tabIndex, typeof el.focus];
    svg.style.color = "red";
    expect([ok(div), ok(svg), ok(math), svg.getAttribute("style")]).toEqual([
      ["function", "object", "number", "function"],
      ["function", "object", "number", "function"],
      ["function", "object", "number", "function"],
      "color: red;",
    ]);
  });

  test("unknown and custom-looking elements are HTMLElement / HTMLUnknownElement as the spec's element interface says", () => {
    const names = ["foo", "x-foo", "bgsound", "acronym", "listing"].map((n) => doc.createElement(n).constructor.name);
    expect(names).toEqual(["HTMLUnknownElement", "HTMLElement", "HTMLUnknownElement", "HTMLElement", "HTMLPreElement"]);
  });

  test("the $impl of an element is not enumerable (internals stay hidden)", () => {
    expect(Object.keys(doc.createElement("div")).includes(String($impl))).toBe(false);
  });
});
