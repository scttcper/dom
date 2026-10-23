/**
 * Core tree mutation algorithms.
 *
 * Spec: DOM Standard §4.2.3 "Mutation algorithms"
 *   https://dom.spec.whatwg.org/#mutation-algorithms
 *
 * These tests pin the observable behavior of pre-insert / insert / remove / replace on the
 * public API, plus this implementation's bookkeeping that rides on those algorithms
 * (connectedness flags, the document id index, focus fixup).
 */
import { beforeEach, describe, expect, test } from "vitest";
import { createWindow, type Document } from "@rtd/dom";

let document: Document;

beforeEach(() => {
  document = createWindow().document;
});

describe("pre-insert validity — https://dom.spec.whatwg.org/#concept-node-ensure-pre-insertion-validity", () => {
  test("step 2: inserting an ancestor into its descendant throws HierarchyRequestError", () => {
    const outer = document.createElement("div");
    const inner = outer.appendChild(document.createElement("span"));
    expect(() => inner.appendChild(outer)).toThrow(expect.objectContaining({ name: "HierarchyRequestError" }));
  });

  test("step 3: a reference child that is not a child of the parent throws NotFoundError", () => {
    const parent = document.createElement("div");
    const stranger = document.createElement("p");
    expect(() => parent.insertBefore(document.createElement("b"), stranger)).toThrow(
      expect.objectContaining({ name: "NotFoundError" }),
    );
  });

  test("step 5: a Text node cannot be a child of a Document", () => {
    expect(() => document.appendChild(document.createTextNode("x"))).toThrow(
      expect.objectContaining({ name: "HierarchyRequestError" }),
    );
  });

  test("step 6: a document cannot get a second document element", () => {
    expect(() => document.appendChild(document.createElement("html"))).toThrow(
      expect.objectContaining({ name: "HierarchyRequestError" }),
    );
  });
});

describe("insert — https://dom.spec.whatwg.org/#concept-node-insert", () => {
  test("inserting a DocumentFragment moves its children in order and empties it", () => {
    const fragment = document.createDocumentFragment();
    const a = fragment.appendChild(document.createElement("a"));
    const b = fragment.appendChild(document.createElement("b"));
    const parent = document.createElement("div");
    parent.appendChild(fragment);
    expect([...parent.childNodes]).toEqual([a, b]);
    expect(fragment.firstChild).toBeNull();
  });

  test("pre-insert step 3: inserting a node before itself is a no-op move", () => {
    const parent = document.createElement("div");
    const a = parent.appendChild(document.createElement("a"));
    const b = parent.appendChild(document.createElement("b"));
    parent.insertBefore(a, a);
    expect([...parent.childNodes]).toEqual([a, b]);
  });

  test("inserting a node that already has a parent removes it from the old parent first (adopt)", () => {
    const from = document.createElement("div");
    const to = document.createElement("div");
    const child = from.appendChild(document.createElement("span"));
    to.appendChild(child);
    expect(from.childNodes.length).toBe(0);
    expect(child.parentNode).toBe(to);
  });

  test("connectedness and the id index follow insertion into the document", () => {
    const el = document.createElement("div");
    el.id = "target";
    expect(document.getElementById("target")).toBeNull(); // detached: not indexed
    document.body!.appendChild(el);
    expect(el.isConnected).toBe(true);
    expect(document.getElementById("target")).toBe(el);
  });
});

describe("remove — https://dom.spec.whatwg.org/#concept-node-remove", () => {
  test("removing a subtree disconnects every descendant and unindexes ids", () => {
    document.body!.innerHTML = '<section><p id="deep">x</p></section>';
    const section = document.body!.firstChild!;
    const deep = document.getElementById("deep")!;
    document.body!.removeChild(section);
    expect(deep.isConnected).toBe(false);
    expect(document.getElementById("deep")).toBeNull();
  });

  test("removeChild of a non-child throws NotFoundError (https://dom.spec.whatwg.org/#concept-node-pre-remove)", () => {
    const parent = document.createElement("div");
    expect(() => parent.removeChild(document.createElement("p"))).toThrow(expect.objectContaining({ name: "NotFoundError" }));
  });
});

describe("replace — https://dom.spec.whatwg.org/#concept-node-replace", () => {
  test("replaceChild swaps the node in place and returns the old child", () => {
    const parent = document.createElement("div");
    const a = parent.appendChild(document.createElement("a"));
    const c = parent.appendChild(document.createElement("c"));
    const b = document.createElement("b");
    expect(parent.replaceChild(b, a)).toBe(a);
    expect([...parent.childNodes]).toEqual([b, c]);
    expect(a.parentNode).toBeNull();
  });
});
