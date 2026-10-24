/**
 * Global attributes, dataset and document metadata accessors — differential against jsdom.
 *
 * Spec: HTML Standard
 *   - global attributes:                  https://html.spec.whatwg.org/#global-attributes
 *   - the title attribute:                https://html.spec.whatwg.org/#the-title-attribute
 *   - the lang attribute:                 https://html.spec.whatwg.org/#the-lang-and-xml:lang-attributes
 *   - the dir attribute:                  https://html.spec.whatwg.org/#the-dir-attribute
 *   - document.dir:                       https://html.spec.whatwg.org/#dom-document-dir
 *   - embedding custom non-visible data:  https://html.spec.whatwg.org/#embedding-custom-non-visible-data-with-the-data-*-attributes
 *   - DOMStringMap:                       https://html.spec.whatwg.org/#domstringmap
 *   - document.title:                     https://html.spec.whatwg.org/#document.title
 *   - the title element:                  https://html.spec.whatwg.org/#the-title-element
 *   - accessKey:                          https://html.spec.whatwg.org/#the-accesskey-attribute
 *
 * Components read and write these constantly (`data-*` state hooks in Radix/Headless UI,
 * `document.title` in route components, `dir` for RTL layouts); Testing Library's
 * `getByTitle` and jest-dom's `toHaveAttribute` read the reflected values.
 */
import { describe } from "vitest";
import { differential, type AnyWindow } from "../../src/harness.ts";

function errorName(fn: () => void): string {
  try {
    fn();
    return "none";
  } catch (e) {
    return (e as Error).name;
  }
}

describe("DOMStringMap — https://html.spec.whatwg.org/#domstringmap", () => {
  differential("supported property names: data-* attributes with no ASCII upper alpha, hyphen + lower letter camel-cased", (w) => {
    const el = w.document.createElement("div");
    el.setAttribute("data-foo-bar", "1");
    el.setAttribute("data-x", "2");
    el.setAttribute("data--lead", "3");
    el.setAttribute("data-a-1", "4");
    el.setAttribute("data-", "5");
    el.setAttribute("data-trailing-", "6");
    el.setAttribute("not-data", "7");
    return { keys: Object.keys(el.dataset), json: JSON.stringify(el.dataset) };
  });

  differential("setter: camelCase name becomes data-hyphenated attribute; values are stringified", (w) => {
    const el = w.document.createElement("div");
    el.dataset.fooBar = "x";
    el.dataset.n = 5;
    el.dataset.empty = "";
    el.dataset.nil = null;
    return Array.from(el.attributes as ArrayLike<AnyWindow>).map((a) => `${a.name}=${a.value}`);
  });

  differential("setter step 1: a hyphen followed by a lowercase ASCII letter throws SyntaxError", (w) => {
    const el = w.document.createElement("div");
    return { bad: errorName(() => (el.dataset["foo-bar"] = "x")), ok: errorName(() => (el.dataset["foo-1"] = "y")), attrs: el.getAttributeNames() };
  });

  differential("setter step 3: a name that is not a valid attribute local name throws InvalidCharacterError", (w) => {
    const el = w.document.createElement("div");
    return errorName(() => (el.dataset["a b"] = "x"));
  });

  differential("deleter removes the attribute; deleting an absent or hyphenated name is a no-op", (w) => {
    const el = w.document.createElement("div");
    el.setAttribute("data-foo-bar", "1");
    el.setAttribute("data-keep", "2");
    const deleted = delete el.dataset.fooBar;
    delete el.dataset.missing;
    delete el.dataset["keep-it"];
    return { deleted, attrs: el.getAttributeNames(), inAfter: "fooBar" in el.dataset };
  });

  differential("dataset is live and the same object on every access", (w) => {
    const el = w.document.createElement("div");
    const ds = el.dataset;
    el.setAttribute("data-late", "v");
    return { same: ds === el.dataset, late: ds.late, has: "late" in ds };
  });

  differential("dataset works on SVG and MathML elements (HTMLOrSVGElement)", (w) => {
    const svg = w.document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.dataset.k = "v";
    return { attr: svg.getAttribute("data-k"), read: svg.dataset.k };
  });
});

describe("dir, lang, title, accessKey, translate — https://html.spec.whatwg.org/#global-attributes", () => {
  differential("dir IDL is limited to known values: ltr/rtl/auto case-insensitively, else empty", (w) => {
    const el = w.document.createElement("div");
    const out: string[] = [];
    for (const v of ["ltr", "RTL", "Auto", "sideways", ""]) {
      el.setAttribute("dir", v);
      out.push(el.dir);
    }
    el.dir = "bogus";
    out.push(el.getAttribute("dir"));
    return out;
  });

  differential("lang, title and accessKey reflect their content attributes without inheritance", (w) => {
    w.document.body.innerHTML = '<div lang="fr" title="outer" accesskey="a"><span id=s></span></div>';
    const s = w.document.getElementById("s");
    const div = s.parentNode;
    div.title = "changed";
    return { divLang: div.lang, spanLang: s.lang, spanTitle: s.title, divTitleAttr: div.getAttribute("title"), accessKey: div.accessKey };
  });

  differential("translate: yes/no keywords, inherited from the parent, default yes", (w) => {
    w.document.body.innerHTML = '<div translate="no"><span id=a></span><p translate="yes"><b id=b></b></p><i translate="maybe" id=c></i></div>';
    const d = w.document;
    return { a: d.getElementById("a").translate, b: d.getElementById("b").translate, c: d.getElementById("c").translate, body: d.body.translate };
  });
});

describe("document.dir — https://html.spec.whatwg.org/#dom-document-dir", () => {
  differential("reflects the html element's dir attribute, limited to known values", (w) => {
    const d = w.document;
    const before = d.dir;
    d.dir = "rtl";
    const attr = d.documentElement.getAttribute("dir");
    d.documentElement.setAttribute("dir", "SIDEWAYS");
    const invalid = d.dir;
    d.documentElement.setAttribute("dir", "AUTO");
    return { before, attr, invalid, auto: d.dir };
  });

  differential("with no document element, the getter returns empty and the setter does nothing", (w) => {
    const d = w.document;
    d.removeChild(d.documentElement);
    d.dir = "rtl";
    return { dir: d.dir, children: d.childNodes.length };
  });
});

describe("document.title — https://html.spec.whatwg.org/#document.title", () => {
  differential("getter: strips and collapses ASCII whitespace of the first title element's child text", (w) => {
    const d = w.document;
    d.head.innerHTML = "<title>\n  Hello\t\t  world \n</title><title>second</title>";
    return d.title;
  });

  differential("getter: a title element anywhere in the document counts, the first in tree order wins", (w) => {
    const d = w.document;
    d.body.innerHTML = "<title>in body</title>";
    const fromBody = d.title;
    d.head.innerHTML = "<title>in head</title>";
    return { fromBody, fromHead: d.title };
  });

  differential("getter: only child Text nodes count (no descendant elements)", (w) => {
    const d = w.document;
    const t = d.createElement("title");
    t.append("a", d.createElement("b"), "c");
    t.firstChild.nextSibling.textContent = "IGNORED";
    d.head.appendChild(t);
    return d.title;
  });

  differential("setter: replaces the existing title element's children with one Text node", (w) => {
    const d = w.document;
    d.head.innerHTML = "<title>old<b>x</b></title>";
    d.title = "  new  ";
    const t = d.querySelector("title");
    return { title: d.title, children: t.childNodes.length, text: t.textContent };
  });

  differential("setter: creates a title element in head when there is none", (w) => {
    const d = w.document;
    d.title = "made";
    return { inHead: d.head.firstElementChild?.localName, title: d.title };
  });

  differential("setter: with no head element, nothing is created", (w) => {
    const d = w.document;
    d.documentElement.removeChild(d.head);
    d.title = "x";
    return { title: d.title, titles: d.getElementsByTagName("title").length };
  });

  differential("title element text IDL: getter is child text content, setter replaces children", (w) => {
    const d = w.document;
    d.head.innerHTML = "<title> spaced  out </title>";
    const t = d.querySelector("title");
    const before = t.text;
    t.text = "set";
    return { before, after: d.title };
  });
});
