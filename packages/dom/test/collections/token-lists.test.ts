/**
 * DOMTokenList methods one by one, and the HTMLCollection / NodeList accessors, differential
 * against jsdom. classList is how React components and tests toggle state classes; namedItem and
 * getElementsByTagNameNS back form and SVG lookups.
 *
 * Spec: DOM Standard §7.1 "Interface DOMTokenList", §4.2.10 "Old-style collections"
 *   - token set / update steps / attribute change steps: https://dom.spec.whatwg.org/#concept-dtl-tokens
 *   - Element.classList: https://dom.spec.whatwg.org/#dom-element-classlist
 *   - item / contains / add / remove / toggle / replace / supports / value:
 *     https://dom.spec.whatwg.org/#dom-domtokenlist-item and following
 *   - HTMLCollection item / namedItem: https://dom.spec.whatwg.org/#interface-htmlcollection
 *   - NodeList item: https://dom.spec.whatwg.org/#dom-nodelist-item
 *   - list of elements with namespace and local name: https://dom.spec.whatwg.org/#concept-getelementsbytagnamens
 *   - indexed properties: https://webidl.spec.whatwg.org/#dfn-support-indexed-properties
 */
import { describe, expect, test } from "vitest";
import { createWindow } from "@ctrl/dom";
import { describeNode, differential, type AnyWindow } from "../../../../tests/compat/src/harness.ts";

const tryName = (f: () => unknown) => {
  try {
    return f();
  } catch (e) {
    return `throws ${(e as Error).name}`;
  }
};

function classed(w: AnyWindow, value: string | null) {
  const el = w.document.createElement("div");
  if (value !== null) el.setAttribute("class", value);
  return el;
}

describe("token set — https://dom.spec.whatwg.org/#concept-dtl-tokens", () => {
  differential("the attribute is parsed as an ordered set: split on ASCII whitespace, duplicates dropped, order kept", (w) => {
    const el = classed(w, "  b a\tb\n\fc a ");
    return { length: el.classList.length, tokens: [...el.classList], value: el.classList.value, string: String(el.classList) };
  });

  differential("attribute change steps: setting, removing and changing the attribute re-parses the live token set", (w) => {
    const el = classed(w, "a b");
    const list = el.classList;
    el.setAttribute("class", "c");
    const set = [...list];
    el.removeAttribute("class");
    const removed = [list.length, list.value];
    el.className = "x y x";
    return { set, removed, className: [...list], same: el.classList === list };
  });

  differential("update steps: an empty token set does not create a missing attribute but does empty an existing one (https://dom.spec.whatwg.org/#concept-dtl-update)", (w) => {
    const missing = classed(w, null);
    missing.classList.remove("a");
    missing.classList.toggle("a", false);
    const existing = classed(w, "a");
    existing.classList.remove("a");
    return { missing: missing.hasAttribute("class"), existing: existing.getAttribute("class") };
  });
});

describe("DOMTokenList methods — https://dom.spec.whatwg.org/#interface-domtokenlist", () => {
  differential("item returns the token at the index or null; indexed properties mirror it (https://dom.spec.whatwg.org/#dom-domtokenlist-item)", (w) => {
    const list = classed(w, "a b").classList;
    return [list.item(0), list.item(1), list.item(2), list.item(-1), list[1], list[2], list.item(2 ** 32)];
  });

  differential("contains compares exact tokens, case-sensitively, without validation (https://dom.spec.whatwg.org/#dom-domtokenlist-contains)", (w) => {
    const list = classed(w, "a B").classList;
    return [list.contains("a"), list.contains("b"), list.contains("B"), list.contains(""), list.contains("a B")];
  });

  differential("add: validates every token before changing anything, appends new ones once, then runs the update steps (https://dom.spec.whatwg.org/#dom-domtokenlist-add)", (w) => {
    const el = classed(w, "a");
    const mo = new w.MutationObserver(() => {});
    mo.observe(el, { attributes: true });
    el.classList.add("b", "a", "c", "b");
    const after = el.className;
    const empty = tryName(() => el.classList.add("d", ""));
    const space = tryName(() => el.classList.add("e", "f g"));
    el.classList.add();
    return { after, empty, space, unchanged: el.className, records: mo.takeRecords().length };
  });

  differential("remove: validates, removes every occurrence, and serializes the remaining set (https://dom.spec.whatwg.org/#dom-domtokenlist-remove)", (w) => {
    const el = classed(w, "a  b a c");
    el.classList.remove("a", "zz");
    return { value: el.getAttribute("class"), errors: [tryName(() => el.classList.remove("")), tryName(() => el.classList.remove("a b"))] };
  });

  differential("toggle: force true only adds, force false only removes; returns whether the token is present (https://dom.spec.whatwg.org/#dom-domtokenlist-toggle)", (w) => {
    const el = classed(w, "a");
    const list = el.classList;
    const out = [list.toggle("a"), list.toggle("a"), list.toggle("a", true), list.toggle("a", true), list.toggle("b", false), list.toggle("a", false), list.toggle("a", false)];
    return { out, value: el.getAttribute("class"), errors: [tryName(() => list.toggle("")), tryName(() => list.toggle(" x"))] };
  });

  differential("replace: false without changes when token is absent; replaces in place and dedupes when newToken is already present (https://dom.spec.whatwg.org/#dom-domtokenlist-replace)", (w) => {
    const el = classed(w, "a b c");
    const list = el.classList;
    const absent = list.replace("zz", "y");
    const afterAbsent = el.getAttribute("class");
    const inPlace = list.replace("b", "x");
    const afterInPlace = el.getAttribute("class");
    list.replace("c", "a");
    const deduped = el.getAttribute("class");
    return { absent, afterAbsent, inPlace, afterInPlace, deduped, errors: [tryName(() => list.replace("", "a")), tryName(() => list.replace("a", "b c")), tryName(() => list.replace("zz", ""))] };
  });

  test("supports: TypeError without supported tokens; relList checks the lowercased token against the element's supported tokens (https://dom.spec.whatwg.org/#dom-domtokenlist-supports)", () => {
    // Not differential: jsdom has no relList on <a>/<area>/<form>.
    const document = createWindow().document;
    expect(() => document.createElement("div").classList.supports("a")).toThrow(TypeError);
    const supports = (tag: string, tokens: string[]) => tokens.map((t) => (document.createElement(tag) as unknown as { relList: { supports(t: string): boolean } }).relList.supports(t));
    // https://html.spec.whatwg.org/#linkTypes: a/area/form support noreferrer, noopener, opener.
    expect(supports("a", ["noopener", "NOREFERRER", "opener", "stylesheet", "bogus"])).toEqual([true, true, true, false, false]);
    expect(supports("form", ["noopener"])).toEqual([true]);
    expect(supports("link", ["stylesheet", "PRELOAD", "icon", "modulepreload", "noopener", "bogus"])).toEqual([true, true, true, true, false, false]);
  });

  differential("value: the getter is the raw attribute value; the setter sets the attribute verbatim (https://dom.spec.whatwg.org/#dom-domtokenlist-value)", (w) => {
    const el = classed(w, " a  a ");
    const raw = el.classList.value;
    el.classList.value = " x  y x ";
    return { raw, attr: el.getAttribute("class"), tokens: [...el.classList] };
  });
});

describe("HTMLCollection — https://dom.spec.whatwg.org/#interface-htmlcollection", () => {
  differential("item: the element at the index in tree order, or null (https://dom.spec.whatwg.org/#dom-htmlcollection-item)", (w) => {
    w.document.body.innerHTML = "<p id=a></p>t<p id=b><p id=c></p></p><!--x-->";
    const all = w.document.body.getElementsByTagName("p");
    return [all.length, describeNode(all.item(0)), describeNode(all.item(2)), all.item(3), all.item(-1)];
  });

  differential("namedItem: first element whose id is key, or an HTML-namespace element whose name is key; empty key is null (https://dom.spec.whatwg.org/#dom-htmlcollection-nameditem-key)", (w) => {
    const d = w.document;
    d.body.innerHTML = '<input name="n"><p id="n"></p><p name="pn"></p><span id="dup"></span><b id="dup"></b>';
    const svg = d.createElementNS("http://www.w3.org/2000/svg", "rect");
    svg.setAttribute("name", "svgname");
    d.body.appendChild(svg);
    const all = d.body.getElementsByTagName("*");
    return [describeNode(all.namedItem("n")), describeNode(all.namedItem("pn")), describeNode(all.namedItem("dup")), all.namedItem("svgname"), all.namedItem(""), all.namedItem("missing")];
  });

  differential("getElementsByTagNameNS: '*' matches any namespace or local name; null and empty namespace match no-namespace elements (https://dom.spec.whatwg.org/#concept-getelementsbytagnamens)", (w) => {
    const d = w.document;
    const root = d.createElement("div");
    root.append(d.createElementNS("urn:a", "x"), d.createElementNS(null, "x"), d.createElementNS("http://www.w3.org/1999/xhtml", "x"), d.createElementNS("urn:a", "p:y"));
    const count = (ns: string | null, name: string) => root.getElementsByTagNameNS(ns, name).length;
    return [count("*", "*"), count("urn:a", "*"), count("*", "x"), count(null, "x"), count("", "x"), count("urn:a", "y"), count("urn:a", "p:y"), count("http://www.w3.org/1999/xhtml", "X")];
  });
});

describe("NodeList — https://dom.spec.whatwg.org/#dom-nodelist-item", () => {
  differential("item: the node at the index or null; childNodes is live, querySelectorAll static", (w) => {
    const d = w.document;
    const p = d.createElement("p");
    p.append("a", d.createElement("b"));
    const live = p.childNodes;
    const fixed = p.querySelectorAll("*");
    const before = [describeNode(live.item(0)), describeNode(live.item(1)), live.item(2), live.item(-1)];
    p.append(d.createElement("i"));
    return { before, liveAfter: live.length, staticAfter: fixed.length, index: describeNode(live[2]) };
  });
});

describe("indexed properties — https://webidl.spec.whatwg.org/#dfn-support-indexed-properties", () => {
  differential("list[i] is item(i) for supported indices and undefined past the end, for every collection kind", (w) => {
    const d = w.document;
    d.body.innerHTML = "<p class='a b' title='t'></p><p></p>";
    const p = d.body.firstChild;
    const lists: Record<string, AnyWindow> = { htmlCollection: d.getElementsByTagName("p"), children: d.body.children, tokens: p.classList, attributes: p.attributes, childNodes: d.body.childNodes, static: d.querySelectorAll("p") };
    return Object.fromEntries(Object.entries(lists).map(([k, list]) => [k, [list[0] === list.item(0), list[list.length - 1] === list.item(list.length - 1), list[list.length], list.length]]));
  });

  differential("writing a supported index throws TypeError in strict code (no indexed setter: [[DefineOwnProperty]] returns false)", (w) => {
    "use strict";
    const d = w.document;
    d.body.innerHTML = "<p class='a b' title='t'></p><p></p>";
    const p = d.body.firstChild;
    const lists: Record<string, AnyWindow> = { htmlCollection: d.getElementsByTagName("p"), tokens: p.classList, attributes: p.attributes };
    return Object.fromEntries(
      Object.entries(lists).map(([k, list]) => {
        const before = list[0];
        return [k, [tryName(() => (list[0] = "x")), list[0] === before]];
      }),
    );
  });

  // TODO(collections): NodeList stores items as plain writable own data properties (the fast path
  // described in collections/NodeList.ts), so `childNodes[0] = x` silently replaces the entry until
  // the next mutation rebuilds the list. jsdom (and browsers) throw in strict code. Making the
  // properties non-writable costs a defineProperty per eager update on a hot path.
  test.fails("NodeList indices are read-only too: childNodes[0] = x throws in strict code and leaves the list intact [known gap: writable own index properties, docs/deviations.md]", () => {
    const document = createWindow().document;
    document.body!.innerHTML = "<p></p>";
    const list = document.body!.childNodes as unknown as Record<number, unknown>;
    const first = list[0];
    expect(() => (list[0] = "x")).toThrow(TypeError);
    expect(list[0]).toBe(first);
  });
});
