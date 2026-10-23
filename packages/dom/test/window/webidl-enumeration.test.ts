/**
 * Enumerability of WebIDL interface members and hidden implementation state.
 *
 * Spec: WebIDL §3.7.6 Attributes (https://webidl.spec.whatwg.org/#es-attributes) and §3.7.7
 * Operations (https://webidl.spec.whatwg.org/#es-operations): attribute accessors and regular
 * operations are defined on the interface prototype with [[Enumerable]]: true.
 *
 * Libraries copy these objects with `for...in` (Radix copies `control.validity` key by key), so
 * the loop must yield the attribute names and nothing from our internals.
 */
import { beforeEach, describe, expect, test } from "vitest";
import { createWindow, type Document } from "@rtd/dom";

let window: ReturnType<typeof createWindow>;
let document: Document;

beforeEach(() => {
  window = createWindow();
  document = window.document;
});

const keysOf = (o: object) => {
  const keys: string[] = [];
  for (const k in o) keys.push(k);
  return keys;
};

describe("ValidityState — https://html.spec.whatwg.org/#validitystate", () => {
  test("for...in yields exactly the eleven validity attributes", () => {
    document.body!.innerHTML = "<input required>";
    const validity = (document.querySelector("input") as unknown as { validity: object }).validity;
    expect(keysOf(validity)).toEqual([
      "valueMissing", "typeMismatch", "patternMismatch", "tooLong", "tooShort", "rangeUnderflow",
      "rangeOverflow", "stepMismatch", "badInput", "customError", "valid",
    ]);
    expect(Object.keys(validity)).toEqual([]);
  });
});

describe("DOMRect / DOMPoint / DOMMatrix — https://drafts.fxtf.org/geometry/", () => {
  test("for...in over a DOMRect yields its attributes and toJSON; spread copies nothing", () => {
    const rect = document.body!.getBoundingClientRect();
    expect(keysOf(rect)).toEqual(["x", "y", "width", "height", "top", "right", "bottom", "left", "toJSON"]);
    expect({ ...rect }).toEqual({});
  });

  test("internal state is not an own enumerable property", () => {
    const W = window as unknown as { DOMPoint: new (x?: number, y?: number) => object; DOMMatrix: new () => object };
    expect(Object.keys(new W.DOMPoint(1, 2))).toEqual([]);
    expect(Object.keys(new W.DOMMatrix())).toEqual([]);
  });

  test("writable variants still update through their setters", () => {
    const W = window as unknown as { DOMRect: new (x?: number, y?: number, w?: number, h?: number) => { x: number; right: number } };
    const r = new W.DOMRect(1, 2, 3, 4);
    r.x = 10;
    expect([r.x, r.right]).toEqual([10, 13]);
  });
});
