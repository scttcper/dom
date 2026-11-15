/**
 * DOMMatrix and DOMMatrixReadOnly.
 *
 * Spec: Geometry Interfaces Module Level 1 §6 "DOMMatrix interfaces"
 *   https://drafts.csswg.org/geometry/#DOMMatrix
 *
 * jsdom has no DOMMatrix, so the oracle for the differential block is happy-dom's. It disagrees
 * with the spec in a few places; those cases are pinned to the spec instead, each with the reason.
 * Libraries feature-detect `typeof DOMMatrix` and then call the mutating `*Self` methods, so
 * every method of the interface must exist and compose like a browser's.
 */
import { Window as HappyWindow } from "happy-dom";
import { afterAll, describe, expect, test } from "vitest";
import { DOMMatrix, DOMMatrixReadOnly, DOMPoint } from "@ctrl/dom";

const M = (m: DOMMatrixReadOnly): number[] => Array.from(m.toFloat64Array());

describe("constructor — https://drafts.csswg.org/geometry/#dom-dommatrixreadonly-dommatrixreadonly", () => {
  test("a 6-element sequence is a 2D matrix, 16 elements a 3D one, anything else a TypeError", () => {
    expect(new DOMMatrix([1, 2, 3, 4, 5, 6]).is2D).toBe(true);
    expect(new DOMMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]).is2D).toBe(false);
    expect(() => new DOMMatrix([1, 2, 3])).toThrow(TypeError);
  });

  test("a string is parsed as a CSS transform list, composed left to right (https://drafts.csswg.org/geometry/#parse-a-string-into-an-abstract-matrix)", () => {
    const m = new DOMMatrix("translate(10px, 5px) scale(2)");
    expect(m.toString()).toBe("matrix(2, 0, 0, 2, 10, 5)");
    expect(new DOMMatrix("rotate(0.25turn)").b).toBe(1);
    expect(new DOMMatrix("translateX(1in)").e).toBe(96);
  });

  test("the empty string and `none` are the identity", () => {
    expect(new DOMMatrix("").isIdentity).toBe(true);
    expect(new DOMMatrix("none").isIdentity).toBe(true);
  });

  test("any 3D transform function makes the result 3D", () => {
    expect(new DOMMatrix("translate3d(1px, 2px, 0)").is2D).toBe(false);
    expect(new DOMMatrix("rotateX(10deg)").is2D).toBe(false);
    expect(new DOMMatrix("perspective(100px)").m34).toBe(-0.01);
  });

  test("an unparsable string, or one with relative lengths, throws SyntaxError", () => {
    expect(() => new DOMMatrix("foo")).toThrow(expect.objectContaining({ name: "SyntaxError" }));
    expect(() => new DOMMatrix("translate(1em)")).toThrow(expect.objectContaining({ name: "SyntaxError" }));
    expect(() => new DOMMatrix("translate(10%)")).toThrow(expect.objectContaining({ name: "SyntaxError" }));
  });
});

describe("validate and fixup — https://drafts.csswg.org/geometry/#matrix-validate-and-fixup", () => {
  test("2D step 1: an alias and its m-member must be SameValueZero (https://drafts.csswg.org/geometry/#matrix-validate-and-fixup-2d)", () => {
    expect(() => DOMMatrix.fromMatrix({ a: 1, m11: 2 })).toThrow(TypeError);
    expect(DOMMatrix.fromMatrix({ a: 0, m11: -0 }).a).toBe(-0);
    expect(DOMMatrix.fromMatrix({ e: Number.NaN, m41: Number.NaN }).e).toBeNaN();
  });

  test("2D step 2: missing m-members come from the aliases or the identity", () => {
    expect(M(DOMMatrix.fromMatrix({ b: 2, f: 6 }))).toEqual([1, 2, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 6, 0, 1]);
  });

  test("step 2: is2D: true with a non-identity 3D member throws TypeError", () => {
    expect(() => DOMMatrix.fromMatrix({ m33: 2, is2D: true })).toThrow(TypeError);
  });

  test("step 3: without is2D, any non-identity 3D member makes the matrix 3D", () => {
    expect(DOMMatrix.fromMatrix({ m34: 5 }).is2D).toBe(false);
    expect(DOMMatrix.fromMatrix({ m33: 1, m13: -0 }).is2D).toBe(true);
  });

  test("multiply() and DOMPoint.matrixTransform() accept dictionaries (https://drafts.csswg.org/geometry/#create-a-dommatrix-from-the-dictionary)", () => {
    expect(new DOMMatrix([1, 2, 3, 4, 5, 6]).multiply({ a: 2, d: 2 }).toString()).toBe("matrix(2, 4, 6, 8, 5, 6)");
    const p = new DOMPoint(3, 4).matrixTransform({ e: 10 });
    expect([p.x, p.y]).toEqual([13, 4]);
  });
});

describe("mutable transformation methods — https://drafts.csswg.org/geometry/#dommatrix", () => {
  test("every *Self method returns the same matrix (https://drafts.csswg.org/geometry/#dom-dommatrix-translateself)", () => {
    const m = new DOMMatrix();
    expect(m.translateSelf(1, 2)).toBe(m);
    expect(m.scaleSelf(2)).toBe(m);
    expect(m.scale3dSelf(1)).toBe(m);
    expect(m.rotateSelf(10)).toBe(m);
    expect(m.rotateFromVectorSelf(1, 1)).toBe(m);
    expect(m.rotateAxisAngleSelf(0, 0, 1, 5)).toBe(m);
    expect(m.skewXSelf(1)).toBe(m);
    expect(m.skewYSelf(1)).toBe(m);
    expect(m.multiplySelf()).toBe(m);
    expect(m.preMultiplySelf()).toBe(m);
    expect(m.invertSelf()).toBe(m);
    expect(m.setMatrixValue("none")).toBe(m);
  });

  test("translateSelf step 2: a non-zero tz makes the matrix 3D", () => {
    expect(new DOMMatrix().translateSelf(1, 2, -0).is2D).toBe(true);
    expect(new DOMMatrix().translateSelf(1, 2, 3).is2D).toBe(false);
  });

  test("scaleSelf: scaleY defaults to scaleX and the scale is about the origin (https://drafts.csswg.org/geometry/#dom-dommatrix-scaleself)", () => {
    expect(new DOMMatrix().scaleSelf(2).toString()).toBe("matrix(2, 0, 0, 2, 0, 0)");
    // Scaling by 2 about (10, 20) maps (10, 20) to itself.
    const p = new DOMMatrix().scaleSelf(2, 2, 1, 10, 20).transformPoint({ x: 10, y: 20 });
    expect([p.x, p.y]).toEqual([10, 20]);
    expect(new DOMMatrix().scaleSelf(1, 1, 2).is2D).toBe(false);
  });

  test("scale3dSelf step 4: a scale other than 1 makes the matrix 3D (https://drafts.csswg.org/geometry/#dom-dommatrix-scale3dself)", () => {
    expect(new DOMMatrix().scale3dSelf(1).is2D).toBe(true);
    expect(M(new DOMMatrix().scale3dSelf(2))).toEqual([2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1]);
  });

  test("rotateSelf step 1: a lone argument rotates about Z; X or Y make it 3D (https://drafts.csswg.org/geometry/#dom-dommatrix-rotateself)", () => {
    const m = new DOMMatrix().rotateSelf(90);
    // Same values as browsers: cos(90deg) is not exactly 0 in floating point.
    expect(m.toString()).toBe("matrix(6.123233995736766e-17, 1, -1, 6.123233995736766e-17, 0, 0)");
    expect(new DOMMatrix().rotateSelf(0, 0, 10).is2D).toBe(true);
    // With rotY given, the first argument stays an X rotation.
    expect(new DOMMatrix().rotateSelf(10, 0).is2D).toBe(false);
    expect(new DOMMatrix().rotateSelf(0, 10).is2D).toBe(false);
  });

  test("rotateFromVectorSelf: the angle from (1, 0) to (x, y), 0 for the zero vector (https://drafts.csswg.org/geometry/#dom-dommatrix-rotatefromvectorself)", () => {
    expect(new DOMMatrix().rotateFromVectorSelf(0, 1).b).toBe(1);
    expect(new DOMMatrix().rotateFromVectorSelf(-0, 0).isIdentity).toBe(true);
  });

  test("rotateAxisAngleSelf step 2: a non-zero x or y makes the matrix 3D (https://drafts.csswg.org/geometry/#dom-dommatrix-rotateaxisangleself)", () => {
    expect(new DOMMatrix().rotateAxisAngleSelf(0, 0, 1, 30).is2D).toBe(true);
    expect(new DOMMatrix().rotateAxisAngleSelf(1, 0, 0, 30).is2D).toBe(false);
    expect(M(new DOMMatrix().rotateAxisAngleSelf(0, 0, 2, 30))).toEqual(M(new DOMMatrix().rotateSelf(30)));
  });

  test("skewXSelf / skewYSelf post-multiply a skew in degrees (https://drafts.csswg.org/geometry/#dom-dommatrix-skewxself)", () => {
    expect(new DOMMatrix().skewXSelf(45).c).toBeCloseTo(1, 15);
    expect(new DOMMatrix().skewYSelf(45).b).toBeCloseTo(1, 15);
  });

  test("multiplySelf is this × other, preMultiplySelf other × this (https://drafts.csswg.org/geometry/#dom-dommatrix-premultiplyself)", () => {
    const a = (): DOMMatrix => new DOMMatrix([1, 2, 3, 4, 5, 6]);
    const b = new DOMMatrix([6, 5, 4, 3, 2, 1]);
    expect(a().multiplySelf(b).toString()).toBe("matrix(21, 32, 13, 20, 10, 14)");
    expect(a().preMultiplySelf(b).toString()).toBe("matrix(14, 11, 34, 27, 56, 44)");
    expect(a().multiplySelf({ m33: 2 }).is2D).toBe(false);
  });

  test("invertSelf: a singular matrix becomes all NaN and 3D (https://drafts.csswg.org/geometry/#dom-dommatrix-invertself)", () => {
    const m = new DOMMatrix([0, 0, 0, 0, 0, 0]).invertSelf();
    expect(M(m).every(Number.isNaN)).toBe(true);
    expect(m.is2D).toBe(false);
    const s = new DOMMatrix([2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 4, 0, 1, 2, 3, 1]);
    expect(s.inverse().multiply(s).isIdentity).toBe(true);
  });

  test("setMatrixValue replaces the matrix or throws SyntaxError (https://drafts.csswg.org/geometry/#dom-dommatrix-setmatrixvalue)", () => {
    const m = new DOMMatrix().translateSelf(0, 0, 5);
    expect(m.setMatrixValue("translate(1px, 2px)").toString()).toBe("matrix(1, 0, 0, 1, 1, 2)");
    expect(m.is2D).toBe(true);
    expect(() => m.setMatrixValue("nope(1)")).toThrow(expect.objectContaining({ name: "SyntaxError" }));
  });
});

describe("attributes — https://drafts.csswg.org/geometry/#dommatrix-attributes", () => {
  test("setting a 3D member to a non-identity value clears is2D; the identity value does not", () => {
    const m = new DOMMatrix();
    m.m33 = 1;
    m.m13 = -0;
    expect(m.is2D).toBe(true);
    m.m13 = 1;
    expect(m.is2D).toBe(false);
    expect(m.toString()).toBe("matrix3d(1, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)");
  });

  test("the a-f aliases and m11-m44 share storage", () => {
    const m = new DOMMatrix();
    m.a = 5;
    m.m42 = 7;
    expect([m.m11, m.f]).toEqual([5, 7]);
  });
});

describe("DOMMatrixReadOnly operations — https://drafts.csswg.org/geometry/#dommatrixreadonly", () => {
  test("operations return a new DOMMatrix and leave the receiver unchanged (https://drafts.csswg.org/geometry/#dom-dommatrixreadonly-translate)", () => {
    const ro = new DOMMatrixReadOnly([1, 2, 3, 4, 5, 6]);
    const t = ro.translate(1, 2);
    expect(t).toBeInstanceOf(DOMMatrix);
    expect(ro.toString()).toBe("matrix(1, 2, 3, 4, 5, 6)");
    expect("translateSelf" in ro).toBe(false);
  });

  test("flipX / flipY negate the first / second column (https://drafts.csswg.org/geometry/#dom-dommatrixreadonly-flipx)", () => {
    expect(new DOMMatrix([1, 2, 3, 4, 5, 6]).flipX().toString()).toBe("matrix(-1, -2, 3, 4, 5, 6)");
    expect(new DOMMatrix([1, 2, 3, 4, 5, 6]).flipY().toString()).toBe("matrix(1, 2, -3, -4, 5, 6)");
  });

  test("scaleNonUniform scales x and y independently (https://drafts.csswg.org/geometry/#dom-dommatrixreadonly-scalenonuniform)", () => {
    expect(new DOMMatrix().scaleNonUniform(2, 3).toString()).toBe("matrix(2, 0, 0, 3, 0, 0)");
  });

  test("the stringifier throws InvalidStateError for non-finite values (https://drafts.csswg.org/geometry/#dommatrixreadonly-stringification-behavior)", () => {
    expect(() => String(new DOMMatrix([Number.NaN, 0, 0, 1, 0, 0]))).toThrow(
      expect.objectContaining({ name: "InvalidStateError" }),
    );
  });
});

// translateSelf, scaleSelf, rotateSelf and the skews update only the columns their matrix
// touches instead of running a 4x4 product. That is only valid for finite matrices, so these pin
// the boundary: each result must equal post-multiplying the full matrix, entry for entry
// (`toEqual` tells -0 from +0 and treats NaN as equal to itself).
describe("post-multiplied transformations equal the full 4x4 product — https://drafts.csswg.org/geometry/#dommatrix", () => {
  const rad = (30 * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const tan = Math.tan(rad);
  // [name, the operation, the same transformation as a 16-element matrix]
  const operations: [string, (m: DOMMatrix) => DOMMatrix, number[]][] = [
    ["translateSelf", (m) => m.translateSelf(3, 4, 5), [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 3, 4, 5, 1]],
    ["scaleSelf", (m) => m.scaleSelf(2, 3, 4), [2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 4, 0, 0, 0, 0, 1]],
    ["rotateSelf", (m) => m.rotateSelf(30), [cos, sin, 0, 0, -sin, cos, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]],
    ["rotateSelf(0)", (m) => m.rotateSelf(0), [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]],
    [
      "rotateAxisAngleSelf",
      (m) => m.rotateAxisAngleSelf(0, 0, -2, 30),
      [cos, -sin, 0, 0, sin, cos, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    ],
    ["skewXSelf", (m) => m.skewXSelf(30), [1, 0, 0, 0, tan, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]],
    ["skewYSelf", (m) => m.skewYSelf(30), [1, tan, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]],
    [
      "translateSelf(Infinity)",
      (m) => m.translateSelf(Infinity, 1),
      [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, Infinity, 1, 0, 1],
    ],
    ["scaleSelf(NaN)", (m) => m.scaleSelf(Number.NaN, 2), [Number.NaN, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]],
  ];
  const identity = new DOMMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const receivers: [string, number[]][] = [
    ["a finite 2D matrix", [1, 2, 3, 4, 5, 6]],
    ["a finite 3D matrix", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]],
    ["-0 entries (the product sums from +0, so they become +0)", [-0, 0, 0, -0, -0, -0]],
    ["a 3D matrix with -0 entries", [-0, -0, -0, -0, -0, -0, -0, -0, -0, -0, -0, -0, -0, -0, -0, -0]],
    ["an Infinity entry (Infinity * 0 is NaN in the untouched columns)", [1, 0, 0, 1, Infinity, 0]],
    ["a NaN entry", [1, Number.NaN, 0, 1, 0, 0]],
    ["a NaN entry in a 3D matrix", [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, Number.NaN, 0, 0, 0, 1]],
    ["finite entries whose sum overflows", [1e308, 1e308, 1e308, 1e308, 0, 0]],
    ["finite entries whose product overflows", [1e308, 0, 0, 1e200, 1e308, -1e308]],
  ];
  for (const [receiver, values] of receivers) {
    for (const [name, operation, matrix] of operations) {
      test(`${name} on ${receiver}`, () => {
        const expected = new DOMMatrix(values).multiplySelf(new DOMMatrix(matrix));
        // rotateSelf steps 6-7: the Y and X rotations by 0 are two more products with the identity.
        if (name.startsWith("rotateSelf")) expected.multiplySelf(identity).multiplySelf(identity);
        expect(M(operation(new DOMMatrix(values)))).toEqual(M(expected));
      });
    }
  }

  test("translateSelf step 1 pins: -0 becomes +0, and an infinite translation poisons the untouched columns (https://drafts.csswg.org/geometry/#dom-dommatrix-translateself)", () => {
    expect(M(new DOMMatrix([-0, 0, 0, -0, -0, 0]).translate(1, 2))).toEqual([
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
    ]);
    const nan = Number.NaN;
    expect(M(new DOMMatrix([1, 0, 0, 1, Infinity, 0]).translate(1, 2))).toEqual([
      nan,
      0,
      0,
      0,
      nan,
      1,
      0,
      0,
      nan,
      0,
      1,
      0,
      Infinity,
      2,
      0,
      1,
    ]);
  });

  test("rotateSelf steps 5-7 with zero X and Y rotations still multiply by the identity when the Z step overflowed (https://drafts.csswg.org/geometry/#dom-dommatrix-rotateself)", () => {
    // m11 = 1.5e308 * cos(45deg) + 1.5e308 * sin(45deg) overflows to Infinity in the Z step; the
    // Y and X steps then multiply it by the identity's zeros, which makes the whole row NaN.
    const m = new DOMMatrix([1.5e308, 1, 1.5e308, 1, 0, 0]).rotateSelf(45);
    const nan = Number.NaN;
    expect(M(m)).toEqual([nan, 1.414213562373095, 0, 0, nan, 1.1102230246251565e-16, 0, 0, nan, 0, 1, 0, nan, 0, 0, 1]);
    expect(m.is2D).toBe(true);
  });
});

describe("sequence conversion — https://drafts.csswg.org/geometry/#dom-dommatrixreadonly-dommatrixreadonly", () => {
  test("arrays and typed arrays are converted element by element with ToNumber", () => {
    expect(new DOMMatrix(["1", "2", 3, 4, 5, 6] as unknown as number[]).toString()).toBe("matrix(1, 2, 3, 4, 5, 6)");
    // A hole reads as undefined, which converts to NaN.
    // oxlint-disable-next-line no-sparse-arrays
    expect(new DOMMatrix([1, , 3, 4, 5, 6] as number[]).b).toBeNaN();
    expect(new DOMMatrix(new Float32Array([1, 2, 3, 4, 5, 6])).toString()).toBe("matrix(1, 2, 3, 4, 5, 6)");
    expect(M(new DOMMatrix(new Float64Array(16).fill(0.5)))).toEqual(new Array(16).fill(0.5));
    expect(new DOMMatrix(new Float64Array(16)).is2D).toBe(false);
  });

  test("other iterables, and arrays with their own iterator, are iterated (https://webidl.spec.whatwg.org/#es-sequence)", () => {
    expect(new DOMMatrix(new Set([1, 2, 3, 4, 5, 6]) as unknown as number[]).toString()).toBe(
      "matrix(1, 2, 3, 4, 5, 6)",
    );
    const reversed = [1, 2, 3, 4, 5, 6];
    reversed[Symbol.iterator] = function* () {
      yield* [6, 5, 4, 3, 2, 1];
    } as (typeof reversed)[typeof Symbol.iterator];
    expect(new DOMMatrix(reversed).toString()).toBe("matrix(6, 5, 4, 3, 2, 1)");
    const short = [1, 2, 3, 4, 5, 6];
    short[Symbol.iterator] = function* () {
      yield 1;
    } as (typeof short)[typeof Symbol.iterator];
    expect(() => new DOMMatrix(short)).toThrow(TypeError);
  });

  test("a matrix has no own properties: internal slots are not observable", () => {
    const m = new DOMMatrix([1, 2, 3, 4, 5, 6]);
    expect(Reflect.ownKeys(m)).toEqual([]);
    expect({ ...m }).toEqual({});
    m.translateSelf(1, 2).m33 = 2;
    expect(Reflect.ownKeys(m)).toEqual([]);
  });
});

describe("transformPoint — https://drafts.csswg.org/geometry/#dom-dommatrixreadonly-transformpoint", () => {
  test("the point is converted like DOMPoint.fromPoint: x, y, z default to 0 and w to 1", () => {
    const m = new DOMMatrix([2, 1, -1, 3, 10, 20]);
    const p = m.transformPoint({ x: "3" as unknown as number, w: 2 });
    expect(p).toBeInstanceOf(DOMPoint);
    expect([p.x, p.y, p.z, p.w]).toEqual([26, 43, 0, 2]);
    const origin = m.transformPoint();
    expect([origin.x, origin.y, origin.z, origin.w]).toEqual([10, 20, 0, 1]);
  });

  test("the result equals DOMPoint.matrixTransform for 3D matrices and points (https://drafts.csswg.org/geometry/#transform-a-point-with-a-matrix)", () => {
    const m = new DOMMatrix([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    const init = { x: 1.5, y: -2, z: 3, w: 0.5 };
    expect(m.transformPoint(init).toJSON()).toEqual(DOMPoint.fromPoint(init).matrixTransform(m).toJSON());
    expect(m.transformPoint(init).toJSON()).toEqual({ x: 25, y: 28, z: 31, w: 34 });
  });
});

// Differential against happy-dom's DOMMatrix. Values must agree within 1e-9: happy-dom rounds
// trigonometric results to 15 significant digits (and snaps cos(90deg) to 0), browsers and we
// do not.
describe("parse a string into an abstract matrix — https://drafts.csswg.org/geometry/#parse-a-string-into-an-abstract-matrix", () => {
  const syntaxError = expect.objectContaining({ name: "SyntaxError" });

  test("step 1: only the empty string is the identity; CSS whitespace or comments alone are a parse error", () => {
    expect(new DOMMatrix("").isIdentity).toBe(true);
    expect(() => new DOMMatrix(" \t\n")).toThrow(syntaxError);
    expect(() => new DOMMatrix("/* x */")).toThrow(syntaxError);
  });

  test("step 2: comments are whitespace, including an unterminated one at the end (https://drafts.csswg.org/css-syntax-3/#consume-comments)", () => {
    expect(new DOMMatrix("translate(1px,/**/2px)/*a*/scale(2)").toString()).toBe("matrix(2, 0, 0, 2, 1, 2)");
    expect(new DOMMatrix("scale(2) /* trailing").a).toBe(2);
  });

  test("step 2: only CSS whitespace separates tokens, so U+00A0 is a parse error", () => {
    expect(() => new DOMMatrix("\u00a0none")).toThrow(syntaxError);
    expect(() => new DOMMatrix("scale(2)\u00a0")).toThrow(syntaxError);
  });

  test("step 2: a function needs `(` right after its name and balanced parentheses", () => {
    expect(() => new DOMMatrix("scale (2)")).toThrow(syntaxError);
    expect(() => new DOMMatrix("scale(2")).toThrow(syntaxError);
    expect(() => new DOMMatrix("none scale(2)")).toThrow(syntaxError);
  });

  test("perspective(none) is the identity, and still makes the matrix 3D (https://drafts.csswg.org/css-transforms-2/#funcdef-perspective)", () => {
    const m = new DOMMatrix("perspective(none)");
    expect(m.isIdentity).toBe(true);
    expect(m.is2D).toBe(false);
  });

  test("calc() evaluates + - * / and parentheses over absolute lengths, angles, numbers and percentages (https://drafts.csswg.org/css-values-4/#calc-func)", () => {
    expect(new DOMMatrix("translateX(calc((1in - 6px) / 2))").e).toBe(45);
    expect(new DOMMatrix("translate(calc(2 * calc(1px + 2px)), calc(-1px * -3))").toString()).toBe(
      "matrix(1, 0, 0, 1, 6, 3)",
    );
    expect(new DOMMatrix("rotate(calc(0.25turn - 90deg))").isIdentity).toBe(true);
    expect(new DOMMatrix("scale(calc(50% + 50%), calc(2 / 4))").toString()).toBe("matrix(1, 0, 0, 0.5, 0, 0)");
  });

  test("calc() is type-checked (https://drafts.csswg.org/css-values-4/#calc-type-checking)", () => {
    // A sum needs one type; a product needs a number on one side; a quotient a number divisor.
    expect(() => new DOMMatrix("translateX(calc(1px + 2deg))")).toThrow(syntaxError);
    expect(() => new DOMMatrix("translateX(calc(1px * 2px))")).toThrow(syntaxError);
    expect(() => new DOMMatrix("translateX(calc(2 / 1px))")).toThrow(syntaxError);
    // calc(0) is a <number>, not the unitless <length> 0 that translateX(0) allows.
    expect(new DOMMatrix("translateX(0)").isIdentity).toBe(true);
    expect(() => new DOMMatrix("translateX(calc(0))")).toThrow(syntaxError);
    // `+` and `-` need whitespace on both sides.
    expect(() => new DOMMatrix("translateX(calc(1px+2px))")).toThrow(syntaxError);
  });

  test("calc() rejects what needs layout or a tree: relative units and other functions", () => {
    expect(() => new DOMMatrix("translateX(calc(1em + 1px))")).toThrow(syntaxError);
    expect(() => new DOMMatrix("translateX(calc(10% + 1px))")).toThrow(syntaxError);
    expect(() => new DOMMatrix("translateX(min(1px, 2px))")).toThrow(syntaxError);
    expect(() => new DOMMatrix("translateX(calc(1px * var(--x)))")).toThrow(syntaxError);
  });
});

describe("interface object shape — https://webidl.spec.whatwg.org/#es-operations", () => {
  test("constructors and all-optional operations have length 0; operations with a required argument count it", () => {
    expect(DOMMatrix.length).toBe(0);
    expect(DOMMatrixReadOnly.length).toBe(0);
    expect(DOMMatrix.fromMatrix.length).toBe(0);
    expect(DOMMatrix.prototype.multiplySelf.length).toBe(0);
    expect(DOMMatrix.prototype.scaleSelf.length).toBe(0);
    expect(DOMMatrix.prototype.setMatrixValue.length).toBe(1);
    expect(DOMMatrix.fromFloat64Array.length).toBe(1);
    expect(DOMPoint.prototype.matrixTransform.length).toBe(0);
  });

  test("the class string names the interface (https://webidl.spec.whatwg.org/#dfn-class-string)", () => {
    expect(Object.prototype.toString.call(new DOMMatrix())).toBe("[object DOMMatrix]");
    expect(Object.prototype.toString.call(new DOMMatrixReadOnly())).toBe("[object DOMMatrixReadOnly]");
    expect(Object.prototype.toString.call(new DOMPoint())).toBe("[object DOMPoint]");
  });
});

describe("invertSelf on a 2D matrix — https://drafts.csswg.org/geometry/#dom-dommatrix-invertself", () => {
  test("the 3D entries of a 2D matrix stay exactly the identity's", () => {
    const m = new DOMMatrix([7, 0, 0, 7, 3, 4]).inverse();
    expect([m.m33, m.m44, m.m13, m.m34]).toEqual([1, 1, 0, 0]);
    expect(m.is2D).toBe(true);
    expect(m.multiply(new DOMMatrix([7, 0, 0, 7, 3, 4])).isIdentity).toBe(true);
  });

  test("a singular 2D matrix becomes all NaN and 3D, like a 3D one", () => {
    const m = new DOMMatrix([1, 2, 2, 4, 0, 0]).invertSelf();
    expect(M(m).every(Number.isNaN)).toBe(true);
    expect(m.is2D).toBe(false);
  });
});

describe("regression: libraries that feature-detect DOMMatrix — https://drafts.csswg.org/geometry/#dommatrix", () => {
  // zrender (createCanvasPattern) takes the browser path when `typeof DOMMatrix === "function"`
  // and composes the pattern transform in place; this threw "translateSelf is not a function"
  // when DOMMatrix only had the read-only operations.
  test("translateSelf → rotateSelf(0, 0, deg) → scaleSelf composes like a browser and stays 2D", () => {
    expect(typeof DOMMatrix).toBe("function");
    const matrix = new DOMMatrix();
    matrix.translateSelf(10, 20);
    matrix.rotateSelf(0, 0, 90);
    matrix.scaleSelf(2, 3);
    expect(matrix.is2D).toBe(true);
    // CanvasPattern.setTransform reads a DOMMatrix2DInit: a-f.
    const { a, b, c, d, e, f } = matrix;
    expect([a, b, c, d, e, f].map((v) => Math.round(v * 1e12) / 1e12)).toEqual([0, 2, -3, 0, 10, 20]);
    const p = matrix.transformPoint({ x: 1, y: 1 });
    expect([Math.round(p.x), Math.round(p.y)]).toEqual([7, 22]);
  });
});

describe("differential: happy-dom", () => {
  const happy = new HappyWindow();
  afterAll(() => happy.happyDOM.close());
  type Ctors = { M: typeof DOMMatrix; R: typeof DOMMatrixReadOnly };
  const ours: Ctors = { M: DOMMatrix, R: DOMMatrixReadOnly };
  const theirs = { M: happy.DOMMatrix, R: happy.DOMMatrixReadOnly } as unknown as Ctors;

  const cases: [string, (C: Ctors) => DOMMatrixReadOnly][] = [
    ["identity", (C) => new C.M()],
    ["2D sequence", (C) => new C.M([1, 2, 3, 4, 5, 6])],
    ["3D sequence", (C) => new C.M([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])],
    ["parse matrix()", (C) => new C.M("matrix(1, 2, 3, 4, 5, 6)")],
    ["parse transform list", (C) => new C.M("translate(10px, 5px) scale(2) rotate(30deg)")],
    ["parse translate3d", (C) => new C.M("translate3d(1px, 2px, 3px)")],
    ["parse rotateX", (C) => new C.M("rotateX(30deg)")],
    ["parse rotate3d", (C) => new C.M("rotate3d(1, 2, 3, 40deg)")],
    ["parse turn", (C) => new C.M("rotate(0.25turn)")],
    ["translate", (C) => new C.M().translate(10, 20)],
    ["translate 3D", (C) => new C.M().translate(10, 20, 30)],
    ["translateSelf", (C) => new C.M([1, 2, 3, 4, 5, 6]).translateSelf(7, 8)],
    ["scale", (C) => new C.M().scale(2)],
    ["scale about origin", (C) => new C.M([1, 2, 3, 4, 5, 6]).scale(2, 3, 1, 10, 20)],
    ["scale 3D", (C) => new C.M().scale(2, 2, 3)],
    ["scaleSelf", (C) => new C.M([1, 2, 3, 4, 5, 6]).scaleSelf(2, 3)],
    ["scaleNonUniform", (C) => new C.M().scaleNonUniform(2, 3)],
    ["scale3d", (C) => new C.M().scale3d(2, 1, 2, 3)],
    ["rotate", (C) => new C.M().rotate(30)],
    ["rotate 90", (C) => new C.M().rotate(90)],
    ["rotate X Y Z", (C) => new C.M().rotate(10, 20, 30)],
    ["rotateSelf", (C) => new C.M([1, 2, 3, 4, 5, 6]).rotateSelf(45)],
    ["rotateFromVector", (C) => new C.M().rotateFromVector(1, 1)],
    ["rotateFromVector zero", (C) => new C.M().rotateFromVector(0, 0)],
    ["rotateAxisAngle Z", (C) => new C.M().rotateAxisAngle(0, 0, 1, 30)],
    ["rotateAxisAngle arbitrary", (C) => new C.M().rotateAxisAngle(1, 2, 3, 30)],
    ["rotateAxisAngle zero axis", (C) => new C.M().rotateAxisAngle(0, 0, 0, 30)],
    ["skewX", (C) => new C.M().skewX(30)],
    ["skewY", (C) => new C.M().skewY(30)],
    ["skewXSelf", (C) => new C.M([1, 2, 3, 4, 5, 6]).skewXSelf(10)],
    ["flipX", (C) => new C.M([1, 2, 3, 4, 5, 6]).flipX()],
    ["flipY", (C) => new C.M([1, 2, 3, 4, 5, 6]).flipY()],
    ["multiply", (C) => new C.M([1, 2, 3, 4, 5, 6]).multiply(new C.M([6, 5, 4, 3, 2, 1]))],
    ["multiply dictionary", (C) => new C.M([1, 2, 3, 4, 5, 6]).multiply({ a: 2, d: 2 })],
    ["multiply 3D dictionary", (C) => new C.M().multiply({ m33: 2 })],
    ["multiplySelf", (C) => new C.M([1, 2, 3, 4, 5, 6]).multiplySelf(new C.M([6, 5, 4, 3, 2, 1]))],
    ["inverse 2D", (C) => new C.M([1, 2, 3, 4, 5, 6]).inverse()],
    ["inverse 3D", (C) => new C.M([2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 4, 0, 1, 2, 3, 1]).inverse()],
    ["inverse rotated 3D", (C) => new C.M().rotate(10, 20, 30).translate(1, 2, 3).inverse()],
    ["setMatrixValue", (C) => new C.M().setMatrixValue("translate(5px, 6px) rotate(10deg)")],
    ["fromMatrix 2D", (C) => C.M.fromMatrix({ a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 })],
    ["fromMatrix 3D", (C) => C.M.fromMatrix({ m11: 2, m34: 5 })],
    ["fromMatrix empty", (C) => C.M.fromMatrix()],
    ["fromFloat64Array", (C) => C.M.fromFloat64Array(new Float64Array([1, 2, 3, 4, 5, 6]))],
    ["DOMMatrixReadOnly translate", (C) => new C.R([1, 2, 3, 4, 5, 6]).translate(1, 2)],
  ];

  for (const [name, run] of cases) {
    test(`${name} matches happy-dom`, () => {
      const a = run(ours);
      const b = run(theirs);
      expect(a.is2D).toBe(b.is2D);
      const ma = M(a);
      const mb = Array.from(b.toFloat64Array());
      for (let i = 0; i < 16; i++) expect(ma[i]).toBeCloseTo(mb[i], 9);
    });
  }

  // Cases where happy-dom 21 departs from the spec; we follow the spec (tested above).
  test("divergences: happy-dom's preMultiplySelf post-multiplies; we compute other × this (https://drafts.csswg.org/geometry/#dom-dommatrix-premultiplyself)", () => {
    const run = (C: Ctors): string =>
      new C.M([1, 2, 3, 4, 5, 6]).preMultiplySelf(new C.M([6, 5, 4, 3, 2, 1])).toString();
    expect(run(theirs)).toBe(
      new DOMMatrix([1, 2, 3, 4, 5, 6]).multiplySelf(new DOMMatrix([6, 5, 4, 3, 2, 1])).toString(),
    );
    expect(run(ours)).toBe("matrix(14, 11, 34, 27, 56, 44)");
  });

  test("divergences: happy-dom's skew(ax, ay) multiplies two skews; CSS defines one matrix (https://drafts.csswg.org/css-transforms-1/#funcdef-transform-skew)", () => {
    expect(new theirs.M("skew(10deg, 20deg)").a).not.toBe(1);
    expect(new DOMMatrix("skew(10deg, 20deg)").a).toBe(1);
  });

  test("divergences: happy-dom keeps is2D after `m13 = 1`, parses garbage as identity, and skips the TypeError/InvalidStateError checks", () => {
    const h = new theirs.M();
    h.m13 = 1;
    expect(h.is2D).toBe(true);
    expect(new theirs.M("foo").isIdentity).toBe(true);
    expect(() => theirs.M.fromMatrix({ a: 1, m11: 2 })).not.toThrow();
    expect(String(new theirs.M([Number.NaN, 0, 0, 1, 0, 0]))).toBe("matrix(NaN, 0, 0, 1, 0, 0)");
  });
});
