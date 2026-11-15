/**
 * Geometry interfaces: the algorithm steps web-platform-tests css/geometry leaves out
 * (wpt-geometry.test.ts runs those files; dommatrix.test.ts covers the DOMMatrix methods).
 *
 * Spec: Geometry Interfaces Module Level 1
 *   - §2 DOMPointReadOnly toJSON(): https://drafts.csswg.org/geometry/#dom-dompointreadonly-tojson
 *   - §4 The DOMRectList interface: https://drafts.csswg.org/geometry/#domrectlist
 *   - §5 The DOMQuad interface: https://drafts.csswg.org/geometry/#DOMQuad
 *   - §6 DOMMatrixReadOnly fromFloat32Array() / fromFloat64Array():
 *     https://drafts.csswg.org/geometry/#dom-dommatrixreadonly-fromfloat32array
 *     https://drafts.csswg.org/geometry/#dom-dommatrixreadonly-fromfloat64array
 *   - §6 DOMMatrixReadOnly toFloat32Array() / toFloat64Array():
 *     https://drafts.csswg.org/geometry/#dom-dommatrixreadonly-tofloat32array
 *     https://drafts.csswg.org/geometry/#dom-dommatrixreadonly-tofloat64array
 *   - §6 DOMMatrixReadOnly toJSON(): https://drafts.csswg.org/geometry/#dom-dommatrixreadonly-tojson
 * WebIDL: default toJSON steps https://webidl.spec.whatwg.org/#default-tojson-steps and
 * unsigned long conversion https://webidl.spec.whatwg.org/#es-unsigned-long.
 */
import { describe, expect, test } from "vitest";
import {
  DOMMatrix,
  DOMMatrixReadOnly,
  DOMPoint,
  DOMPointReadOnly,
  DOMQuad,
  DOMRect,
  DOMRectList,
  createWindow,
} from "@ctrl/dom";

describe("DOMPointReadOnly toJSON() — https://drafts.csswg.org/geometry/#dom-dompointreadonly-tojson", () => {
  test("the default toJSON steps serialize x, y, z, w in IDL order (https://webidl.spec.whatwg.org/#default-tojson-steps)", () => {
    for (const point of [new DOMPointReadOnly(1, 2, 3, 4), new DOMPoint(1, 2, 3, 4)]) {
      const json = point.toJSON();
      expect(Object.keys(json)).toEqual(["x", "y", "z", "w"]);
      expect(json).toEqual({ x: 1, y: 2, z: 3, w: 4 });
      expect(JSON.stringify(point)).toBe('{"x":1,"y":2,"z":3,"w":4}');
    }
  });
});

describe("The DOMRectList interface — https://drafts.csswg.org/geometry/#domrectlist", () => {
  // DOMRectList has no constructor; with layout "lite", Element.getClientRects() returns one box.
  function rects(): DOMRectList {
    const { document } = createWindow({ layout: "lite", html: "<div id=x style='height:10px'>x</div>" });
    return document.getElementById("x")!.getClientRects();
  }

  test("length is the number of associated DOMRect objects", () => {
    const list = rects();
    expect(list).toBeInstanceOf(DOMRectList);
    expect(list.length).toBe(1);
  });

  test("item(index) returns the DOMRect at index, zero-based", () => {
    const list = rects();
    expect(list.item(0)).toBeInstanceOf(DOMRect);
    expect(list.item(0)!.height).toBe(10);
  });

  test("item(index) returns null when index >= the number of DOMRect objects", () => {
    const list = rects();
    expect(list.item(1)).toBeNull();
    // -1 converts to unsigned long 4294967295 (https://webidl.spec.whatwg.org/#es-unsigned-long).
    expect(list.item(-1)).toBeNull();
  });

  test("the indexed getter is item(): same object at supported indices, undefined elsewhere (https://webidl.spec.whatwg.org/#dfn-support-indexed-properties)", () => {
    const list = rects();
    expect(list[0]).toBe(list.item(0));
    expect(list[1]).toBeUndefined();
    expect(Object.keys(list)).toEqual(["0"]);
  });

  test("an interface with an indexed getter and length iterates its rects in index order (https://webidl.spec.whatwg.org/#define-the-iteration-methods)", () => {
    const list = rects();
    expect([...list]).toEqual([list.item(0)]);
  });

  test("item(index) converts index to unsigned long first: item(0.5) and item(2 ** 32) are item(0) (https://webidl.spec.whatwg.org/#es-unsigned-long)", () => {
    const list = rects();
    expect(list.item(0.5)).toBe(list.item(0));
    expect(list.item(2 ** 32)).toBe(list.item(0));
  });

  test("the indexed properties are the only own properties: read-only, enumerable, and the rect storage is not observable (https://webidl.spec.whatwg.org/#dfn-support-indexed-properties)", () => {
    const rects = [new DOMRect(1, 2, 3, 4), new DOMRect(5, 6, 7, 8)];
    const list = new DOMRectList(rects);
    expect(Reflect.ownKeys(list)).toEqual(["0", "1"]);
    expect(Object.getOwnPropertyDescriptor(list, 0)).toEqual({
      value: rects[0],
      writable: false,
      enumerable: true,
      configurable: false,
    });
    expect(Reflect.set(list, 0, rects[1])).toBe(false);
    expect(list[0]).toBe(rects[0]);
    expect(Reflect.ownKeys(new DOMRectList())).toEqual([]);
  });
});

describe("DOMMatrixReadOnly fromFloat32Array() / fromFloat64Array() — https://drafts.csswg.org/geometry/#dom-dommatrixreadonly-fromfloat32array", () => {
  test("step 1: 6 elements create a 2D matrix from a, b, c, d, e, f", () => {
    const values = [1, 2, 3, 4, 5, 6];
    for (const m of [
      DOMMatrixReadOnly.fromFloat32Array(new Float32Array(values)),
      DOMMatrixReadOnly.fromFloat64Array(new Float64Array(values)),
    ]) {
      expect(m.is2D).toBe(true);
      expect([m.a, m.b, m.c, m.d, m.e, m.f]).toEqual([1, 2, 3, 4, 5, 6]);
      expect([m.m33, m.m44]).toEqual([1, 1]);
    }
  });

  test("step 2: 16 elements create a 3D matrix, column-major m11..m44", () => {
    const values = Array.from({ length: 16 }, (_, i) => i + 1);
    const m = DOMMatrixReadOnly.fromFloat64Array(new Float64Array(values));
    expect(m.is2D).toBe(false);
    expect([m.m11, m.m12, m.m13, m.m14, m.m21, m.m41, m.m44]).toEqual([1, 2, 3, 4, 5, 13, 16]);
    // Even the identity is 3D when it comes from 16 elements.
    expect(DOMMatrixReadOnly.fromFloat32Array(new DOMMatrix().toFloat32Array()).is2D).toBe(false);
  });

  test("step 3: any other number of elements throws a TypeError (https://drafts.csswg.org/geometry/#dom-dommatrixreadonly-fromfloat64array)", () => {
    for (const length of [0, 5, 7, 15, 17]) {
      expect(() => DOMMatrixReadOnly.fromFloat32Array(new Float32Array(length))).toThrow(TypeError);
      expect(() => DOMMatrix.fromFloat64Array(new Float64Array(length))).toThrow(TypeError);
    }
  });

  test("DOMMatrix's static methods create a DOMMatrix, DOMMatrixReadOnly's a DOMMatrixReadOnly (https://drafts.csswg.org/geometry/#dom-dommatrix-fromfloat32array)", () => {
    const six = new Float32Array([1, 0, 0, 1, 0, 0]);
    expect(DOMMatrix.fromFloat32Array(six)).toBeInstanceOf(DOMMatrix);
    expect(DOMMatrixReadOnly.fromFloat32Array(six)).not.toBeInstanceOf(DOMMatrix);
    expect(DOMMatrix.fromFloat64Array(new Float64Array(six))).toBeInstanceOf(DOMMatrix);
  });
});

describe("DOMMatrixReadOnly toFloat32Array() / toFloat64Array() — https://drafts.csswg.org/geometry/#dom-dommatrixreadonly-tofloat32array", () => {
  test("return the 16 elements m11..m44 in column-major order, as a new array each call (https://drafts.csswg.org/geometry/#dom-dommatrixreadonly-tofloat64array)", () => {
    const m = new DOMMatrix([1, 2, 3, 4, 5, 6]);
    const f64 = m.toFloat64Array();
    expect(f64).toBeInstanceOf(Float64Array);
    expect(Array.from(f64)).toEqual([1, 2, 0, 0, 3, 4, 0, 0, 0, 0, 1, 0, 5, 6, 0, 1]);
    expect(m.toFloat64Array()).not.toBe(f64);
  });

  test("toFloat32Array rounds each element to the nearest float32", () => {
    const f32 = new DOMMatrix([0.1, 0, 0, 1, 0, 0]).toFloat32Array();
    expect(f32).toBeInstanceOf(Float32Array);
    expect(f32[0]).toBe(Math.fround(0.1));
  });
});

describe("DOMMatrixReadOnly toJSON() — https://drafts.csswg.org/geometry/#dom-dommatrixreadonly-tojson", () => {
  test("the default toJSON steps serialize every attribute in IDL order, is2D and isIdentity last (https://webidl.spec.whatwg.org/#default-tojson-steps)", () => {
    const json = new DOMMatrixReadOnly([1, 2, 3, 4, 5, 6]).toJSON();
    expect(Object.keys(json)).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
      "f",
      "m11",
      "m12",
      "m13",
      "m14",
      "m21",
      "m22",
      "m23",
      "m24",
      "m31",
      "m32",
      "m33",
      "m34",
      "m41",
      "m42",
      "m43",
      "m44",
      "is2D",
      "isIdentity",
    ]);
    expect(json).toMatchObject({ a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, m41: 5, m42: 6, is2D: true, isIdentity: false });
  });

  test("a mutable DOMMatrix serializes its current values", () => {
    const m = new DOMMatrix();
    expect(m.toJSON()).toMatchObject({ is2D: true, isIdentity: true });
    m.m13 = 2;
    expect(m.toJSON()).toMatchObject({ m13: 2, is2D: false, isIdentity: false });
  });
});

describe("The DOMQuad interface — https://drafts.csswg.org/geometry/#DOMQuad", () => {
  test("fromQuad() builds new points from DOMPointInit dictionaries, defaulting missing ones (https://drafts.csswg.org/geometry/#dom-domquad-fromquad)", () => {
    const src = { p1: { x: 1, y: 2 }, p3: new DOMPoint(5, 6, 7, 8) };
    const q = DOMQuad.fromQuad(src);
    expect([q.p1.x, q.p1.y, q.p1.z, q.p1.w]).toEqual([1, 2, 0, 1]);
    expect([q.p2.x, q.p2.y, q.p2.z, q.p2.w]).toEqual([0, 0, 0, 1]);
    expect(q.p3).not.toBe(src.p3);
    expect(q.p3).toBeInstanceOf(DOMPoint);
    expect(DOMQuad.fromQuad().getBounds().width).toBe(0);
  });

  test("fromRect() and fromQuad() reject a non-object dictionary with TypeError (https://webidl.spec.whatwg.org/#js-dictionary)", () => {
    expect(() => DOMQuad.fromRect(1 as never)).toThrow(TypeError);
    expect(() => DOMQuad.fromQuad({ p1: 1 as never })).toThrow(TypeError);
    expect(DOMQuad.fromRect(null as never).p3.x).toBe(0);
  });

  test("p1-p4 are [SameObject] DOMPoints and getBounds() returns a new DOMRect (https://drafts.csswg.org/geometry/#dom-domquad-getbounds)", () => {
    const q = DOMQuad.fromRect({ x: 1, y: 2, width: 3, height: 4 });
    expect(q.p1).toBe(q.p1);
    q.p3.x = 10;
    const b = q.getBounds();
    expect(b).toBeInstanceOf(DOMRect);
    expect([b.x, b.y, b.width, b.height]).toEqual([1, 2, 9, 4]);
    expect(q.getBounds()).not.toBe(b);
  });

  test("toJSON() serializes p1-p4 through DOMPoint's toJSON (https://webidl.spec.whatwg.org/#default-tojson-steps)", () => {
    const q = DOMQuad.fromRect({ x: 1, y: 2, width: 3, height: 4 });
    expect(JSON.parse(JSON.stringify(q))).toEqual({
      p1: { x: 1, y: 2, z: 0, w: 1 },
      p2: { x: 4, y: 2, z: 0, w: 1 },
      p3: { x: 4, y: 6, z: 0, w: 1 },
      p4: { x: 1, y: 6, z: 0, w: 1 },
    });
    expect(Object.keys(q.toJSON())).toEqual(["p1", "p2", "p3", "p4"]);
  });

  test("fromRect() and fromQuad() hold four new points, and leave the next constructor call unaffected (https://drafts.csswg.org/geometry/#dom-domquad-fromrect)", () => {
    const rect = DOMQuad.fromRect({ x: 1, y: 2, width: 3, height: 4 });
    expect(new Set([rect.p1, rect.p2, rect.p3, rect.p4]).size).toBe(4);
    expect(rect.toJSON()).toEqual({
      p1: { x: 1, y: 2, z: 0, w: 1 },
      p2: { x: 4, y: 2, z: 0, w: 1 },
      p3: { x: 4, y: 6, z: 0, w: 1 },
      p4: { x: 1, y: 6, z: 0, w: 1 },
    });
    // fromQuad() copies the given points, even DOMPoint instances and repeated ones.
    const point = new DOMPoint(7, 8, 9, 2);
    const quad = DOMQuad.fromQuad({ p1: point, p3: point });
    expect(quad.p1).not.toBe(point);
    expect(quad.p3).not.toBe(quad.p1);
    expect(quad.p1.toJSON()).toEqual({ x: 7, y: 8, z: 9, w: 2 });
    quad.p1.x = 0;
    expect(point.x).toBe(7);
    // A constructor call right after a static factory converts its own arguments.
    const next = new DOMQuad(point);
    expect(next.p1).not.toBe(point);
    expect(next.p1.toJSON()).toEqual({ x: 7, y: 8, z: 9, w: 2 });
    expect(next.p2.toJSON()).toEqual({ x: 0, y: 0, z: 0, w: 1 });
    expect(new DOMQuad().p1.toJSON()).toEqual({ x: 0, y: 0, z: 0, w: 1 });
  });

  test("DOMPointInit members are read in lexicographic order, each converted before the next is read (https://webidl.spec.whatwg.org/#js-dictionary)", () => {
    const log: string[] = [];
    const member = (name: string, value: number) => ({
      get() {
        log.push(`get ${name}`);
        return {
          valueOf() {
            log.push(`convert ${name}`);
            return value;
          },
        };
      },
    });
    const init = Object.defineProperties(
      {},
      { x: member("x", 1), y: member("y", 2), z: member("z", 3), w: member("w", 4) },
    );
    expect(new DOMQuad(init).p1.toJSON()).toEqual({ x: 1, y: 2, z: 3, w: 4 });
    expect(log).toEqual(["get w", "convert w", "get x", "convert x", "get y", "convert y", "get z", "convert z"]);
  });

  test("the class string is DOMQuad and internals stay hidden (https://webidl.spec.whatwg.org/#dfn-class-string)", () => {
    const q = new DOMQuad();
    expect(Object.prototype.toString.call(q)).toBe("[object DOMQuad]");
    expect(Object.keys(q)).toEqual([]);
    expect(Object.keys(DOMQuad.prototype)).toEqual(["p1", "p2", "p3", "p4", "getBounds", "toJSON"]);
  });
});
