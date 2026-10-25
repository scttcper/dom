/**
 * Proxy-free collections: NodeList, HTMLCollection, DOMTokenList, DOMStringMap, NamedNodeMap.
 *
 * Spec:
 *   - NodeList — https://dom.spec.whatwg.org/#interface-nodelist
 *   - HTMLCollection — https://dom.spec.whatwg.org/#interface-htmlcollection
 *   - getElementsByTagName / ClassName — https://dom.spec.whatwg.org/#concept-getelementsbytagname
 *   - DOMTokenList — https://dom.spec.whatwg.org/#interface-domtokenlist
 *   - DOMStringMap (dataset) — https://html.spec.whatwg.org/#domstringmap
 *   - NamedNodeMap / Attr — https://dom.spec.whatwg.org/#interface-namednodemap
 *   - indexed iterable interfaces — https://webidl.spec.whatwg.org/#es-iterable
 */
import { beforeEach, describe, expect, test } from "vitest";
import { createWindow, NodeList, HTMLCollection, type Document } from "@ctrl/dom";
import { $mode } from "../../src/keys.ts";

let document: Document;

beforeEach(() => {
  document = createWindow().document;
});

describe("NodeList — https://dom.spec.whatwg.org/#interface-nodelist", () => {
  test("childNodes is live, and indices are own data properties kept in sync by the mutation algorithms", () => {
    const div = document.createElement("div");
    const list = div.childNodes;
    expect(list).toBe(div.childNodes);
    const a = div.appendChild(document.createElement("a"));
    const b = div.appendChild(document.createTextNode("b"));
    expect(list.length).toBe(2);
    expect([list[0], list[1], list[2]]).toEqual([a, b, undefined]);
    expect(Object.keys(list)).toEqual(["0", "1"]);
    div.insertBefore(document.createComment("c"), a);
    expect(list[0].nodeType).toBe(8);
    expect(list[1]).toBe(a);
    a.remove();
    expect(Object.keys(list)).toEqual(["0", "1"]);
    div.textContent = "";
    expect(list.length).toBe(0);
    expect(list[0]).toBeUndefined();
  });

  test("iteration: forEach/keys/entries are Array.prototype's (WebIDL indexed iterable), values and @@iterator one fast iterator, and it sees live changes", () => {
    const div = document.createElement("div");
    div.append("a", "b");
    // Intentional difference (docs/deviations.md): values/@@iterator are not %Array.prototype.values%.
    expect(NodeList.prototype[Symbol.iterator]).toBe(NodeList.prototype.values);
    expect(NodeList.prototype.values).not.toBe(Array.prototype.values);
    expect(NodeList.prototype.values.name).toBe("values");
    expect(NodeList.prototype.forEach).toBe(Array.prototype.forEach);
    expect(NodeList.prototype.keys).toBe(Array.prototype.keys);
    expect(Array.from(div.childNodes).length).toBe(2);
    expect([...div.childNodes.keys()]).toEqual([0, 1]);
    const seen: string[] = [];
    for (const n of div.childNodes) {
      seen.push(n.textContent!);
      if (seen.length === 1) div.append("c");
    }
    expect(seen).toEqual(["a", "b", "c"]);
    expect(Object.prototype.toString.call(div.childNodes)).toBe("[object NodeList]");
  });

  test("values() follows %ArrayIteratorPrototype%.next: index and length read each step, done stays done (https://tc39.es/ecma262/#sec-%arrayiteratorprototype%.next)", () => {
    const div = document.createElement("div");
    div.append("a");
    const it = div.childNodes.values();
    expect(Object.prototype.toString.call(it)).toBe("[object Array Iterator]");
    expect(it.next()).toEqual({ value: div.firstChild, done: false });
    expect(it.next()).toEqual({ value: undefined, done: true });
    div.append("b"); // exhausted iterators stay exhausted, as Array iterators do
    expect(it.next()).toEqual({ value: undefined, done: true });
    // Removal during iteration: the next index is read against the current list.
    div.append("c");
    const seen: string[] = [];
    for (const n of div.childNodes) {
      seen.push(n.textContent!);
      if (n.textContent === "a") div.removeChild(div.firstChild!);
    }
    expect(seen).toEqual(["a", "c"]);
  });

  test("values() works on static lists, through iterator helpers, and on any array-like like Array.prototype.values", () => {
    document.body!.innerHTML = "<p>1</p><p>2</p><p>3</p>";
    const list = document.querySelectorAll("p");
    expect(Array.from(list).map((p) => p.textContent)).toEqual(["1", "2", "3"]);
    expect([...list].length).toBe(3);
    expect(list.values().map((p) => p.textContent).toArray()).toEqual(["1", "2", "3"]);
    expect([...NodeList.prototype.values.call({ length: 2, 0: "x", 1: "y" } as never)]).toEqual(["x", "y"]);
    expect(() => NodeList.prototype.values.call(null as never)).toThrow(TypeError);
  });

  test("querySelectorAll returns a static NodeList", () => {
    document.body!.innerHTML = "<p></p><p></p>";
    const list = document.querySelectorAll("p");
    document.body!.append(document.createElement("p"));
    expect(list.length).toBe(2);
    expect(list.item(5)).toBeNull();
  });
});

describe("HTMLCollection — https://dom.spec.whatwg.org/#interface-htmlcollection", () => {
  test("children / getElementsByTagName are live and support item(), namedItem(), indices and iteration", () => {
    document.body!.innerHTML = '<div id="a"></div><span name="n"></span>';
    const children = document.body!.children;
    const spans = document.getElementsByTagName("span");
    expect(children).toBeInstanceOf(HTMLCollection);
    expect(children.length).toBe(2);
    expect(children[1]).toBe(spans[0]);
    expect(children.namedItem("a")).toBe(children[0]);
    expect(children.namedItem("n")).toBe(spans[0]);
    document.body!.append(document.createElement("span"));
    expect(spans.length).toBe(2);
    expect([...spans].length).toBe(2);
    expect(Object.keys(children)).toEqual([]);
  });

  test("@@iterator reads the live snapshot each step: elements appended or removed while iterating show (https://webidl.spec.whatwg.org/#es-iterable)", () => {
    document.body!.innerHTML = "<i>1</i><i>2</i>";
    const items = document.getElementsByTagName("i");
    expect(HTMLCollection.prototype[Symbol.iterator]).not.toBe(Array.prototype.values); // docs/deviations.md
    const seen: string[] = [];
    for (const el of items) {
      seen.push(el.textContent!);
      if (seen.length === 1) document.body!.append(Object.assign(document.createElement("i"), { textContent: "3" }));
      if (seen.length === 2) items[0].remove();
    }
    // After "2" (index 1) the first is removed, so index 2 is past the end of [2, 3].
    expect(seen).toEqual(["1", "2"]);
    expect(Array.from(document.body!.children).map((e) => e.textContent)).toEqual(["2", "3"]);
  });

  test("getElementsBy* return the same collection object for the same root and argument", () => {
    expect(document.getElementsByTagName("p")).toBe(document.getElementsByTagName("p"));
    expect(document.getElementsByClassName("a b")).toBe(document.getElementsByClassName("a b"));
    expect(document.body!.getElementsByTagNameNS("*", "p")).toBe(document.body!.getElementsByTagNameNS("*", "p"));
  });

  test("getElementsByClassName matches all tokens, and ASCII case-insensitively in quirks mode", () => {
    document.body!.innerHTML = '<p class="a b"></p><p class="a"></p><p class="A B"></p>';
    expect(document.getElementsByClassName(" b  a ").length).toBe(1);
    expect(document.getElementsByClassName("").length).toBe(0);
    (document as unknown as { [$mode]: string })[$mode] = "quirks";
    expect(document.getElementsByClassName("a b").length).toBe(2);
  });

  test("indices beyond the initial prototype getters still work", () => {
    const div = document.createElement("div");
    for (let i = 0; i < 600; i++) div.append(document.createElement("i"));
    expect(div.children.length).toBe(600);
    expect(div.children[599]).toBe(div.lastElementChild);
  });

  test("document.forms supports named access (https://html.spec.whatwg.org/#dom-document-forms)", () => {
    document.body!.innerHTML = '<form name="login"></form><form id="other"></form>';
    const forms = document.forms as HTMLCollection & Record<string, unknown>;
    expect(forms.length).toBe(2);
    expect(forms.login).toBe(forms[0]);
    expect(forms.other).toBe(forms[1]);
  });
});

describe("DOMTokenList — https://dom.spec.whatwg.org/#interface-domtokenlist", () => {
  test("classList add/remove/toggle/replace/contains run the update steps on the class attribute", () => {
    const el = document.createElement("div");
    const list = el.classList;
    expect(list).toBe(el.classList);
    list.add("a", "b", "a");
    expect(el.className).toBe("a b");
    expect(list.length).toBe(2);
    expect(list[1]).toBe("b");
    expect(list.toggle("a")).toBe(false);
    expect(list.toggle("c", true)).toBe(true);
    expect(list.replace("c", "d")).toBe(true);
    expect(list.contains("d")).toBe(true);
    list.remove("b", "d");
    expect(el.getAttribute("class")).toBe("");
    expect([...list]).toEqual([]);
  });

  test("tokens are an ordered set; the value getter returns the raw attribute", () => {
    const el = document.createElement("div");
    el.className = "  x y x ";
    expect([...el.classList]).toEqual(["x", "y"]);
    expect(el.classList.value).toBe("  x y x ");
  });

  test("empty and whitespace tokens throw SyntaxError / InvalidCharacterError", () => {
    const list = document.createElement("div").classList;
    expect(() => list.add("")).toThrow(expect.objectContaining({ name: "SyntaxError" }));
    expect(() => list.add("a b")).toThrow(expect.objectContaining({ name: "InvalidCharacterError" }));
  });

  test("the update steps do not create the attribute for an empty set (https://dom.spec.whatwg.org/#concept-dtl-update)", () => {
    const el = document.createElement("div");
    el.classList.remove("a");
    expect(el.hasAttribute("class")).toBe(false);
  });

  test("supports() throws without supported tokens", () => {
    expect(() => document.createElement("div").classList.supports("a")).toThrow(TypeError);
  });
});

describe("dataset — https://html.spec.whatwg.org/#domstringmap", () => {
  test("camelCase properties map to data-* attributes both ways", () => {
    const el = document.createElement("div");
    el.dataset.testId = "x";
    expect(el.getAttribute("data-test-id")).toBe("x");
    el.setAttribute("data-foo-bar", "y");
    expect(el.dataset.fooBar).toBe("y");
    expect("fooBar" in el.dataset).toBe(true);
    expect(Object.keys(el.dataset)).toEqual(["testId", "fooBar"]);
    delete el.dataset.testId;
    expect(el.hasAttribute("data-test-id")).toBe(false);
  });

  test("setting a name with '-' followed by a lowercase letter throws SyntaxError", () => {
    const el = document.createElement("div");
    expect(() => {
      el.dataset["a-b"] = "1";
    }).toThrow(expect.objectContaining({ name: "SyntaxError" }));
  });
});

describe("NamedNodeMap and Attr nodes — https://dom.spec.whatwg.org/#interface-namednodemap", () => {
  test("attributes exposes lazily created, cached Attr nodes that reflect the element", () => {
    const el = document.createElement("div");
    el.setAttribute("id", "a");
    el.setAttribute("title", "t");
    const attrs = el.attributes;
    expect(attrs.length).toBe(2);
    const id = attrs[0];
    expect(id).toBe(el.getAttributeNode("id"));
    expect(id.ownerElement).toBe(el);
    id.value = "b";
    expect(el.id).toBe("b");
    expect(Array.from(attrs, (a) => a.name)).toEqual(["id", "title"]);
  });

  // https://webidl.spec.whatwg.org/#LegacyUnenumerableNamedProperties and
  // https://dom.spec.whatwg.org/#ref-for-dfn-supported-property-names. react-hook-form's
  // getCheckboxValue reads a checked checkbox's value only when `'value' in option.attributes`
  // (downstream/react-hook-form/repros/namednodemap-named-properties.test.ts).
  test("named properties: supported names are the attributes' qualified names, unenumerable, shadowed by members", () => {
    const el = document.createElement("input");
    el.setAttribute("value", "test");
    el.setAttribute("data-x", "1");
    el.setAttribute("length", "9");
    const attrs = el.attributes as unknown as Record<string, any>;
    expect("value" in attrs).toBe(true);
    expect(attrs.value).toBe(el.getAttributeNode("value"));
    expect(attrs["data-x"].value).toBe("1");
    expect("type" in attrs).toBe(false);
    expect(attrs.type).toBeUndefined();
    // Names with ASCII upper alpha are not supported on HTML elements in HTML documents.
    expect("VALUE" in attrs).toBe(false);
    // Visibility: interface members win over a same-named attribute.
    expect(attrs.length).toBe(3);
    expect(typeof attrs.item).toBe("function");
    // Unenumerable: for…in / Object.keys see neither names nor the internal element slot.
    expect(Object.keys(attrs)).toEqual([]);
    expect(Object.getOwnPropertyNames(attrs)).toEqual(["value", "data-x"]);
    expect(Object.getOwnPropertyDescriptor(attrs, "value")).toMatchObject({ writable: false, enumerable: false, configurable: true });
    // Live: follows attribute changes; methods still work through the named-property layer.
    el.removeAttribute("value");
    expect("value" in attrs).toBe(false);
    expect(attrs.getNamedItem("data-x")?.value).toBe("1");
    expect(attrs.item(0)?.name).toBe("data-x");
    expect(el.attributes).toBe(attrs);
    expect(Object.prototype.toString.call(attrs)).toBe("[object NamedNodeMap]");
  });

  test("named properties keep case on non-HTML elements", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 1 1");
    expect("viewBox" in svg.attributes).toBe(true);
    expect((svg.attributes as any).viewBox.value).toBe("0 0 1 1");
  });

  test("removing an attribute detaches its Attr node, keeping the value", () => {
    const el = document.createElement("div");
    el.setAttribute("x", "1");
    const attr = el.getAttributeNode("x")!;
    el.removeAttribute("x");
    expect(attr.ownerElement).toBeNull();
    expect(attr.value).toBe("1");
  });

  test("setAttributeNode replaces and returns the old Attr; using an owned Attr elsewhere throws InUseAttributeError", () => {
    const a = document.createElement("div");
    const b = document.createElement("div");
    a.setAttribute("x", "1");
    const old = a.getAttributeNode("x");
    const fresh = document.createAttribute("x");
    fresh.value = "2";
    expect(a.setAttributeNode(fresh)).toBe(old);
    expect(a.getAttribute("x")).toBe("2");
    expect(() => b.setAttributeNode(fresh)).toThrow(expect.objectContaining({ name: "InUseAttributeError" }));
    expect(a.removeAttributeNode(fresh)).toBe(fresh);
    expect(a.hasAttribute("x")).toBe(false);
  });
});
