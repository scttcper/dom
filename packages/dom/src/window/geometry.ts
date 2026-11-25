// https://drafts.csswg.org/geometry/ — DOMPoint / DOMRect / DOMMatrix.
//
// Used for getBoundingClientRect()/getClientRects() results (nodes/Element.ts,
// traversal/Range.ts), `new DOMRect(...)` in tests and libraries that feature-detect
// DOMMatrix. DOMMatrix implements the whole interface on 4x4 storage: every *Self mutator,
// dictionary conversion with validate-and-fixup, and parsing CSS transform lists.

export interface DOMPointInit {
  x?: number;
  y?: number;
  z?: number;
  w?: number;
}

import { defineInterfaceShape, exposeMembers } from "../webidl-runtime.ts";

// The coordinates are private fields: invisible to spreads, `Object.keys` and Jest's
// symbol-aware equality, like jsdom's internal slots, without hiding symbol-keyed fields on every
// construction (getBoundingClientRect builds a DOMRect per call). The writable subclasses set
// them through these functions, captured in each base class's static block.
let setPoint: (p: DOMPointReadOnly, i: number, v: number) => void;
let setRect: (r: DOMRectReadOnly, i: number, v: number) => void;

export class DOMPointReadOnly {
  #x: number;
  #y: number;
  #z: number;
  #w: number;

  static {
    setPoint = (p, i, v) => {
      if (i === 0) p.#x = v;
      else if (i === 1) p.#y = v;
      else if (i === 2) p.#z = v;
      else p.#w = v;
    };
  }

  constructor(x = 0, y = 0, z = 0, w = 1) {
    this.#x = Number(x);
    this.#y = Number(y);
    this.#z = Number(z);
    this.#w = Number(w);
  }

  static fromPoint(other: DOMPointInit = {}): DOMPointReadOnly {
    return new this(other.x, other.y, other.z, other.w);
  }

  get x(): number {
    return this.#x;
  }
  get y(): number {
    return this.#y;
  }
  get z(): number {
    return this.#z;
  }
  get w(): number {
    return this.#w;
  }

  /** https://drafts.csswg.org/geometry/#dom-dompointreadonly-matrixtransform */
  matrixTransform(matrix?: DOMMatrixInit): DOMPoint {
    // Step 1: create a DOMMatrix from the dictionary (a matrix instance is read directly).
    const m = matrixFromInit(matrix, "matrixTransform", "DOMPointReadOnly");
    // Step 2.
    return transformedPoint(m, this.#x, this.#y, this.#z, this.#w);
  }

  toJSON(): Required<DOMPointInit> {
    return { x: this.#x, y: this.#y, z: this.#z, w: this.#w };
  }
}

export class DOMPoint extends DOMPointReadOnly {
  static override fromPoint(other: DOMPointInit = {}): DOMPoint {
    return new DOMPoint(other.x, other.y, other.z, other.w);
  }
  override get x(): number {
    return super.x;
  }
  set x(v: number) {
    setPoint(this, 0, Number(v));
  }
  override get y(): number {
    return super.y;
  }
  set y(v: number) {
    setPoint(this, 1, Number(v));
  }
  override get z(): number {
    return super.z;
  }
  set z(v: number) {
    setPoint(this, 2, Number(v));
  }
  override get w(): number {
    return super.w;
  }
  set w(v: number) {
    setPoint(this, 3, Number(v));
  }
}

export interface DOMRectInit {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export class DOMRectReadOnly {
  #x: number;
  #y: number;
  #width: number;
  #height: number;

  static {
    setRect = (r, i, v) => {
      if (i === 0) r.#x = v;
      else if (i === 1) r.#y = v;
      else if (i === 2) r.#width = v;
      else r.#height = v;
    };
  }

  constructor(x = 0, y = 0, width = 0, height = 0) {
    this.#x = Number(x);
    this.#y = Number(y);
    this.#width = Number(width);
    this.#height = Number(height);
  }

  static fromRect(other: DOMRectInit = {}): DOMRectReadOnly {
    return new this(other.x, other.y, other.width, other.height);
  }

  get x(): number {
    return this.#x;
  }
  get y(): number {
    return this.#y;
  }
  get width(): number {
    return this.#width;
  }
  get height(): number {
    return this.#height;
  }
  get top(): number {
    return Math.min(this.#y, this.#y + this.#height);
  }
  get right(): number {
    return Math.max(this.#x, this.#x + this.#width);
  }
  get bottom(): number {
    return Math.max(this.#y, this.#y + this.#height);
  }
  get left(): number {
    return Math.min(this.#x, this.#x + this.#width);
  }

  toJSON(): Record<string, number> {
    return {
      x: this.#x,
      y: this.#y,
      width: this.#width,
      height: this.#height,
      top: this.top,
      right: this.right,
      bottom: this.bottom,
      left: this.left,
    };
  }
}

export class DOMRect extends DOMRectReadOnly {
  static override fromRect(other: DOMRectInit = {}): DOMRect {
    return new DOMRect(other.x, other.y, other.width, other.height);
  }
  override get x(): number {
    return super.x;
  }
  set x(v: number) {
    setRect(this, 0, Number(v));
  }
  override get y(): number {
    return super.y;
  }
  set y(v: number) {
    setRect(this, 1, Number(v));
  }
  override get width(): number {
    return super.width;
  }
  set width(v: number) {
    setRect(this, 2, Number(v));
  }
  override get height(): number {
    return super.height;
  }
  set height(v: number) {
    setRect(this, 3, Number(v));
  }
}

/** https://drafts.fxtf.org/geometry/#domrectlist */
export class DOMRectList {
  // A private field, like the coordinates above: nothing to hide per construction.
  #rects: DOMRect[];
  [index: number]: DOMRect;

  constructor(rects: DOMRect[] = []) {
    this.#rects = rects;
    for (let i = 0; i < rects.length; i++) Object.defineProperty(this, i, { value: rects[i], enumerable: true });
  }
  get length(): number {
    return this.#rects.length;
  }
  /** https://drafts.csswg.org/geometry/#dom-domrectlist-item */
  item(index: number): DOMRect | null {
    // `unsigned long index`: https://webidl.spec.whatwg.org/#es-unsigned-long (ToUint32).
    return this.#rects[index >>> 0] ?? null;
  }
  [Symbol.iterator](): IterableIterator<DOMRect> {
    return this.#rects[Symbol.iterator]();
  }
}

// --- DOMMatrix ---------------------------------------------------------------------------------
// Storage is one packed array of 17 doubles per matrix, held in a private field (invisible to
// spreads and `Object.keys`, like DOMPoint/DOMRect above). Index 0..15 is the column-major 4x4
// matrix m11, m12, m13, m14, m21, ..., m44, so a = [0], b = [1], c = [4], d = [5], e = [12],
// f = [13]; index 16 is the is2D flag (1 or 0), so a copy is one array literal and the module's
// algorithms need a single accessor (`matrixOf`, captured in the base class's static block).
//
// Results are kept bit-identical to the textbook product `sum = 0; sum += a[k] * b[k]`: the
// specialized paths below drop only terms that are exactly ±0 for finite operands and fall back
// to the full product otherwise (Infinity * 0 is NaN, and `0 + x` turns -0 into +0).

/** https://drafts.csswg.org/geometry/#dictdef-dommatrix2dinit */
export interface DOMMatrix2DInit {
  a?: number;
  b?: number;
  c?: number;
  d?: number;
  e?: number;
  f?: number;
  m11?: number;
  m12?: number;
  m21?: number;
  m22?: number;
  m41?: number;
  m42?: number;
}

/** https://drafts.csswg.org/geometry/#dictdef-dommatrixinit */
export interface DOMMatrixInit extends DOMMatrix2DInit {
  m13?: number;
  m14?: number;
  m23?: number;
  m24?: number;
  m31?: number;
  m32?: number;
  m33?: number;
  m34?: number;
  m43?: number;
  m44?: number;
  is2D?: boolean;
}

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const DEG_TO_RAD = Math.PI / 180;
/** Index of the is2D flag in a matrix's storage. */
const IS_2D = 16;
// The flag's values are not integers so that every storage array literal is created with
// double elements: an all-integer literal would start as small-integer elements and be
// reallocated on its first fractional store, and the mix would make every read polymorphic.
const FLAG_2D = 0.5;
const FLAG_3D = 1.5;

/** The storage of a matrix: set in DOMMatrixReadOnly's static block. */
let matrixOf: (matrix: DOMMatrixReadOnly) => number[];
/** Storage for the DOMMatrix that `createMatrix` is constructing, adopted by the constructor. */
let pendingStorage: number[] | null = null;

/** A new DOMMatrix that owns `storage`, without running the constructor's argument handling. */
function createMatrix(storage: number[]): DOMMatrix {
  pendingStorage = storage;
  return new DOMMatrix();
}

function copyOf(src: DOMMatrixReadOnly): DOMMatrix {
  const s = matrixOf(src);
  // oxfmt-ignore
  return createMatrix([
    s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7], s[8], s[9], s[10], s[11], s[12], s[13], s[14], s[15], s[16],
  ]);
}

/**
 * The operand of the transformation being applied: a 4x4 matrix built by `set16` and consumed
 * by `multiplyInto` before any user code can run, so one buffer serves every operation. (The
 * fractional initial value gives it double elements, like matrix storage.)
 */
const SCRATCH: number[] = [0.5, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function set16(
  out: number[],
  m11: number,
  m12: number,
  m13: number,
  m14: number,
  m21: number,
  m22: number,
  m23: number,
  m24: number,
  m31: number,
  m32: number,
  m33: number,
  m34: number,
  m41: number,
  m42: number,
  m43: number,
  m44: number,
): number[] {
  out[0] = m11;
  out[1] = m12;
  out[2] = m13;
  out[3] = m14;
  out[4] = m21;
  out[5] = m22;
  out[6] = m23;
  out[7] = m24;
  out[8] = m31;
  out[9] = m32;
  out[10] = m33;
  out[11] = m34;
  out[12] = m41;
  out[13] = m42;
  out[14] = m43;
  out[15] = m44;
  return out;
}

/**
 * Column-major 4x4 product `out = a * b` (`m * b` is "post-multiply" in the spec's wording,
 * `a * m` "pre-multiply"). Every operand is read before the first write, so `out` may be `a`
 * and/or `b`. Each entry is the textbook `0 + p0 + p1 + p2 + p3`, bit for bit: starting from +0
 * only matters when all four products are -0, which `- -0` (that is `+ 0`: -0 becomes +0, every
 * other value is unchanged) fixes at the end. V8 compiles `x - -0` to one float add, but `0 + x`
 * and `x + 0` (a small-integer constant) made this function 2-6x slower.
 */
function multiplyInto(out: number[], a: number[], b: number[]): void {
  const a0 = a[0];
  const a1 = a[1];
  const a2 = a[2];
  const a3 = a[3];
  const a4 = a[4];
  const a5 = a[5];
  const a6 = a[6];
  const a7 = a[7];
  const a8 = a[8];
  const a9 = a[9];
  const a10 = a[10];
  const a11 = a[11];
  const a12 = a[12];
  const a13 = a[13];
  const a14 = a[14];
  const a15 = a[15];
  const b0 = b[0];
  const b1 = b[1];
  const b2 = b[2];
  const b3 = b[3];
  const b4 = b[4];
  const b5 = b[5];
  const b6 = b[6];
  const b7 = b[7];
  const b8 = b[8];
  const b9 = b[9];
  const b10 = b[10];
  const b11 = b[11];
  const b12 = b[12];
  const b13 = b[13];
  const b14 = b[14];
  const b15 = b[15];
  out[0] = a0 * b0 + a4 * b1 + a8 * b2 + a12 * b3 - -0;
  out[1] = a1 * b0 + a5 * b1 + a9 * b2 + a13 * b3 - -0;
  out[2] = a2 * b0 + a6 * b1 + a10 * b2 + a14 * b3 - -0;
  out[3] = a3 * b0 + a7 * b1 + a11 * b2 + a15 * b3 - -0;
  out[4] = a0 * b4 + a4 * b5 + a8 * b6 + a12 * b7 - -0;
  out[5] = a1 * b4 + a5 * b5 + a9 * b6 + a13 * b7 - -0;
  out[6] = a2 * b4 + a6 * b5 + a10 * b6 + a14 * b7 - -0;
  out[7] = a3 * b4 + a7 * b5 + a11 * b6 + a15 * b7 - -0;
  out[8] = a0 * b8 + a4 * b9 + a8 * b10 + a12 * b11 - -0;
  out[9] = a1 * b8 + a5 * b9 + a9 * b10 + a13 * b11 - -0;
  out[10] = a2 * b8 + a6 * b9 + a10 * b10 + a14 * b11 - -0;
  out[11] = a3 * b8 + a7 * b9 + a11 * b10 + a15 * b11 - -0;
  out[12] = a0 * b12 + a4 * b13 + a8 * b14 + a12 * b15 - -0;
  out[13] = a1 * b12 + a5 * b13 + a9 * b14 + a13 * b15 - -0;
  out[14] = a2 * b12 + a6 * b13 + a10 * b14 + a14 * b15 - -0;
  out[15] = a3 * b12 + a7 * b13 + a11 * b14 + a15 * b15 - -0;
}

/** https://drafts.csswg.org/geometry/#transform-a-point-with-a-matrix */
function transformedPoint(m: number[], x: number, y: number, z: number, w: number): DOMPoint {
  return new DOMPoint(
    m[0] * x + m[4] * y + m[8] * z + m[12] * w,
    m[1] * x + m[5] * y + m[9] * z + m[13] * w,
    m[2] * x + m[6] * y + m[10] * z + m[14] * w,
    m[3] * x + m[7] * y + m[11] * z + m[15] * w,
  );
}

/**
 * True when all sixteen entries of `m` are finite: then `entry * 0` is exactly ±0 and the
 * specialized products below may drop those terms. (Their sum is finite only if every entry is;
 * a sum that overflows merely sends a finite matrix down the general path.)
 */
function allFinite(m: number[]): boolean {
  const sum =
    m[0] + m[1] + m[2] + m[3] + m[4] + m[5] + m[6] + m[7] + m[8] + m[9] + m[10] + m[11] + m[12] + m[13] + m[14] + m[15];
  return sum - sum === 0;
}

/** `m = m * translation(tx, ty, tz)`: only the fourth column changes. */
function translateBy(m: number[], tx: number, ty: number, tz: number): void {
  const a0 = m[0];
  const a1 = m[1];
  const a2 = m[2];
  const a3 = m[3];
  const a4 = m[4];
  const a5 = m[5];
  const a6 = m[6];
  const a7 = m[7];
  const a8 = m[8];
  const a9 = m[9];
  const a10 = m[10];
  const a11 = m[11];
  const a12 = m[12];
  const a13 = m[13];
  const a14 = m[14];
  const a15 = m[15];
  if (!allFinite(m)) {
    multiplyInto(m, m, set16(SCRATCH, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, tx, ty, tz, 1));
    return;
  }
  m[0] = a0 - -0;
  m[1] = a1 - -0;
  m[2] = a2 - -0;
  m[3] = a3 - -0;
  m[4] = a4 - -0;
  m[5] = a5 - -0;
  m[6] = a6 - -0;
  m[7] = a7 - -0;
  m[8] = a8 - -0;
  m[9] = a9 - -0;
  m[10] = a10 - -0;
  m[11] = a11 - -0;
  m[12] = a0 * tx + a4 * ty + a8 * tz + a12 - -0;
  m[13] = a1 * tx + a5 * ty + a9 * tz + a13 - -0;
  m[14] = a2 * tx + a6 * ty + a10 * tz + a14 - -0;
  m[15] = a3 * tx + a7 * ty + a11 * tz + a15 - -0;
}

/** `m = m * scale(sx, sy, sz)`: each of the first three columns is scaled. */
function scaleBy(m: number[], sx: number, sy: number, sz: number): void {
  const a0 = m[0];
  const a1 = m[1];
  const a2 = m[2];
  const a3 = m[3];
  const a4 = m[4];
  const a5 = m[5];
  const a6 = m[6];
  const a7 = m[7];
  const a8 = m[8];
  const a9 = m[9];
  const a10 = m[10];
  const a11 = m[11];
  const a12 = m[12];
  const a13 = m[13];
  const a14 = m[14];
  const a15 = m[15];
  if (!allFinite(m)) {
    multiplyInto(m, m, set16(SCRATCH, sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, sz, 0, 0, 0, 0, 1));
    return;
  }
  m[0] = a0 * sx - -0;
  m[1] = a1 * sx - -0;
  m[2] = a2 * sx - -0;
  m[3] = a3 * sx - -0;
  m[4] = a4 * sy - -0;
  m[5] = a5 * sy - -0;
  m[6] = a6 * sy - -0;
  m[7] = a7 * sy - -0;
  m[8] = a8 * sz - -0;
  m[9] = a9 * sz - -0;
  m[10] = a10 * sz - -0;
  m[11] = a11 * sz - -0;
  m[12] = a12 - -0;
  m[13] = a13 - -0;
  m[14] = a14 - -0;
  m[15] = a15 - -0;
}

/**
 * `m = m * b` where `b` is the identity except for m11, m12, m21 and m22 (a Z rotation or a
 * skew): only the first two columns change.
 */
function multiplyBy2x2(m: number[], b11: number, b12: number, b21: number, b22: number): void {
  const a0 = m[0];
  const a1 = m[1];
  const a2 = m[2];
  const a3 = m[3];
  const a4 = m[4];
  const a5 = m[5];
  const a6 = m[6];
  const a7 = m[7];
  const a8 = m[8];
  const a9 = m[9];
  const a10 = m[10];
  const a11 = m[11];
  const a12 = m[12];
  const a13 = m[13];
  const a14 = m[14];
  const a15 = m[15];
  if (!allFinite(m)) {
    multiplyInto(m, m, set16(SCRATCH, b11, b12, 0, 0, b21, b22, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1));
    return;
  }
  m[0] = a0 * b11 + a4 * b12 - -0;
  m[1] = a1 * b11 + a5 * b12 - -0;
  m[2] = a2 * b11 + a6 * b12 - -0;
  m[3] = a3 * b11 + a7 * b12 - -0;
  m[4] = a0 * b21 + a4 * b22 - -0;
  m[5] = a1 * b21 + a5 * b22 - -0;
  m[6] = a2 * b21 + a6 * b22 - -0;
  m[7] = a3 * b21 + a7 * b22 - -0;
  m[8] = a8 - -0;
  m[9] = a9 - -0;
  m[10] = a10 - -0;
  m[11] = a11 - -0;
  m[12] = a12 - -0;
  m[13] = a13 - -0;
  m[14] = a14 - -0;
  m[15] = a15 - -0;
}

/** `m = m * skew(ax, ay)`, angles in degrees. */
function skewBy(m: number[], ax: number, ay: number): void {
  multiplyBy2x2(m, 1, Math.tan(ay * DEG_TO_RAD), Math.tan(ax * DEG_TO_RAD), 1);
}

/** The skew matrix for the angles `ax` and `ay` in degrees, in SCRATCH. */
function skewing(ax: number, ay: number): number[] {
  return set16(SCRATCH, 1, Math.tan(ay * DEG_TO_RAD), 0, 0, Math.tan(ax * DEG_TO_RAD), 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
}

/**
 * Rotation by `deg` degrees about the axis (x, y, z), in SCRATCH.
 * https://drafts.csswg.org/css-transforms-2/#Rotate3dDefined
 * Rotations about a single coordinate axis use sin/cos directly, as Blink and WebKit do, so
 * `rotate(90)` yields cos(90deg) = 6.123233995736766e-17 rather than the half-angle formula's
 * 2.220446049250313e-16. A zero-length axis is the identity, as in browsers.
 */
function rotation(x: number, y: number, z: number, deg: number): number[] {
  const rad = deg * DEG_TO_RAD;
  if (x === 0 && y === 0) {
    if (z === 0) return set16(SCRATCH, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
    // A negative z axis rotates the other way.
    const s = z > 0 ? Math.sin(rad) : -Math.sin(rad);
    const c = Math.cos(rad);
    return set16(SCRATCH, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
  }
  if (y === 0 && z === 0) {
    const s = x > 0 ? Math.sin(rad) : -Math.sin(rad);
    const c = Math.cos(rad);
    return set16(SCRATCH, 1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1);
  }
  if (x === 0 && z === 0) {
    const s = y > 0 ? Math.sin(rad) : -Math.sin(rad);
    const c = Math.cos(rad);
    return set16(SCRATCH, c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1);
  }
  const len = Math.hypot(x, y, z);
  x /= len;
  y /= len;
  z /= len;
  const half = rad / 2;
  const sc = Math.sin(half) * Math.cos(half);
  const sq = Math.sin(half) ** 2;
  return set16(
    SCRATCH,
    1 - 2 * (y * y + z * z) * sq,
    2 * (x * y * sq + z * sc),
    2 * (x * z * sq - y * sc),
    0,
    2 * (x * y * sq - z * sc),
    1 - 2 * (x * x + z * z) * sq,
    2 * (y * z * sq + x * sc),
    0,
    2 * (x * z * sq + y * sc),
    2 * (y * z * sq - x * sc),
    1 - 2 * (x * x + y * y) * sq,
    0,
    0,
    0,
    0,
    1,
  );
}

/** `m = m * rotation(x, y, z, deg)`. */
function rotateBy(m: number[], x: number, y: number, z: number, deg: number): void {
  if (x === 0 && y === 0 && z !== 0) {
    // About the Z axis (see `rotation`): only the first two columns change.
    const rad = deg * DEG_TO_RAD;
    const s = z > 0 ? Math.sin(rad) : -Math.sin(rad);
    const c = Math.cos(rad);
    multiplyBy2x2(m, c, s, -s, c);
  } else multiplyInto(m, m, rotation(x, y, z, deg));
}

/** https://drafts.csswg.org/geometry/#dom-dommatrix-rotateself steps 5-7: Z, then Y, then X. */
function rotateEuler(m: number[], rotX: number, rotY: number, rotZ: number): void {
  rotateBy(m, 0, 0, 1, rotZ);
  // A rotation by ±0 degrees is the identity matrix (with a -0 entry), and multiplying by it
  // changes nothing in a finite matrix without -0 entries, which the Z step just produced.
  if (rotX === 0 && rotY === 0 && allFinite(m)) return;
  multiplyInto(m, m, rotation(0, 1, 0, rotY));
  multiplyInto(m, m, rotation(1, 0, 0, rotX));
}

/**
 * General 4x4 inverse in place by cofactor expansion; false (and `m` untouched) when the
 * determinant is 0 or not finite.
 * Same formulation as gl-matrix's mat4.invert (MIT, https://github.com/toji/gl-matrix).
 */
function invert(m: number[]): boolean {
  const a00 = m[0];
  const a01 = m[1];
  const a02 = m[2];
  const a03 = m[3];
  const a10 = m[4];
  const a11 = m[5];
  const a12 = m[6];
  const a13 = m[7];
  const a20 = m[8];
  const a21 = m[9];
  const a22 = m[10];
  const a23 = m[11];
  const a30 = m[12];
  const a31 = m[13];
  const a32 = m[14];
  const a33 = m[15];
  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;
  const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (det === 0 || !Number.isFinite(det)) return false;
  const inv = 1 / det;
  m[0] = (a11 * b11 - a12 * b10 + a13 * b09) * inv;
  m[1] = (a02 * b10 - a01 * b11 - a03 * b09) * inv;
  m[2] = (a31 * b05 - a32 * b04 + a33 * b03) * inv;
  m[3] = (a22 * b04 - a21 * b05 - a23 * b03) * inv;
  m[4] = (a12 * b08 - a10 * b11 - a13 * b07) * inv;
  m[5] = (a00 * b11 - a02 * b08 + a03 * b07) * inv;
  m[6] = (a32 * b02 - a30 * b05 - a33 * b01) * inv;
  m[7] = (a20 * b05 - a22 * b02 + a23 * b01) * inv;
  m[8] = (a10 * b10 - a11 * b08 + a13 * b06) * inv;
  m[9] = (a01 * b08 - a00 * b10 - a03 * b06) * inv;
  m[10] = (a30 * b04 - a31 * b02 + a33 * b00) * inv;
  m[11] = (a21 * b02 - a20 * b04 - a23 * b00) * inv;
  m[12] = (a11 * b07 - a10 * b09 - a12 * b06) * inv;
  m[13] = (a00 * b09 - a01 * b07 + a02 * b06) * inv;
  m[14] = (a31 * b01 - a30 * b03 - a32 * b00) * inv;
  m[15] = (a20 * b03 - a21 * b01 + a22 * b00) * inv;
  return true;
}

/**
 * Affine (2D) inverse in place of a, b, c, d, e, f; false (and `m` untouched) when the
 * determinant is 0 or not finite. The other entries of a 2D matrix are the identity's.
 */
function invert2D(m: number[]): boolean {
  const a = m[0];
  const b = m[1];
  const c = m[4];
  const d = m[5];
  const e = m[12];
  const f = m[13];
  const det = a * d - b * c;
  if (det === 0 || !Number.isFinite(det)) return false;
  m[0] = d / det;
  m[1] = -b / det;
  m[4] = -c / det;
  m[5] = a / det;
  m[12] = (c * f - d * e) / det;
  m[13] = (b * e - a * f) / det;
  return true;
}

function sameValueZero(x: number, y: number): boolean {
  return x === y || (x !== x && y !== y);
}

const ALIASES_2D = ["a", "m11", "b", "m12", "c", "m21", "d", "m22", "e", "m41", "f", "m42"] as const;
const INDEX_2D = [0, 1, 4, 5, 12, 13];
// The 3D members with their identity value; `is2D` must be false when any differs.
const MEMBERS_3D = ["m13", "m14", "m23", "m24", "m31", "m32", "m33", "m34", "m43", "m44"] as const;
const INDEX_3D = [2, 3, 6, 7, 8, 9, 10, 11, 14, 15];

/** WebIDL `unrestricted double` dictionary member: undefined when absent. */
function member(init: object, key: string): number | undefined {
  const v = (init as Record<string, unknown>)[key];
  return v === undefined ? undefined : Number(v);
}

/**
 * https://drafts.csswg.org/geometry/#create-a-dommatrix-from-the-dictionary, running
 * https://drafts.csswg.org/geometry/#matrix-validate-and-fixup (which first runs
 * https://drafts.csswg.org/geometry/#matrix-validate-and-fixup-2d). Returns matrix storage the
 * caller must only read: a matrix instance's own storage, otherwise a new array.
 */
function matrixFromInit(init: unknown, method: string, iface: string): number[] {
  if (init instanceof DOMMatrixReadOnly) return matrixOf(init);
  const out = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, FLAG_2D];
  if (init === undefined || init === null) return out;
  if (typeof init !== "object" && typeof init !== "function") {
    throw new TypeError(
      `Failed to execute '${method}' on '${iface}': The provided value is not of type 'DOMMatrixInit'.`,
    );
  }
  // 2D validate and fixup, steps 1-2: an alias and its m-member must agree; then m-members
  // default to the alias, or to the identity value.
  for (let i = 0; i < 12; i += 2) {
    const alias = member(init, ALIASES_2D[i]);
    const full = member(init, ALIASES_2D[i + 1]);
    if (alias !== undefined && full !== undefined && !sameValueZero(alias, full)) {
      throw new TypeError(
        `Failed to execute '${method}' on '${iface}': The '${ALIASES_2D[i]}' property should equal the '${ALIASES_2D[i + 1]}' property.`,
      );
    }
    const v = full ?? alias;
    if (v !== undefined) out[INDEX_2D[i >> 1]] = v;
  }
  // 3D validate and fixup, steps 2-3.
  let is3D = false;
  for (let i = 0; i < 10; i++) {
    const idx = INDEX_3D[i];
    const def = idx === 10 || idx === 15 ? 1 : 0;
    const v = member(init, MEMBERS_3D[i]);
    out[idx] = v ?? def;
    if (v !== undefined && v !== def) is3D = true;
  }
  const is2D = (init as DOMMatrixInit).is2D;
  if (is2D === undefined) {
    if (is3D) out[IS_2D] = FLAG_3D;
    return out;
  }
  if (Boolean(is2D) && is3D) {
    throw new TypeError(
      `Failed to execute '${method}' on '${iface}': The is2D member is set to true but the input matrix is a 3d matrix.`,
    );
  }
  if (!is2D) out[IS_2D] = FLAG_3D;
  return out;
}

// Absolute lengths in px: https://drafts.csswg.org/css-values-4/#absolute-lengths
const LENGTH_UNITS: Record<string, number> = {
  px: 1,
  cm: 96 / 2.54,
  mm: 96 / 25.4,
  q: 96 / 101.6,
  in: 96,
  pt: 4 / 3,
  pc: 16,
};
// https://drafts.csswg.org/css-values-4/#angles, in degrees.
const ANGLE_UNITS: Record<string, number> = { deg: 1, rad: 180 / Math.PI, grad: 0.9, turn: 360 };

// The built-in iterators of arrays and typed arrays, to recognize sequences that can be read by index.
const ARRAY_ITERATOR = Array.prototype[Symbol.iterator];
const TYPED_ARRAY_ITERATOR = Object.getPrototypeOf(Int8Array.prototype)[Symbol.iterator] as unknown;

// A CSS <number> (https://drafts.csswg.org/css-syntax-3/#consume-number) and its unit.
const ARG = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?)([a-z%]*)$/;
const NUMBER_PREFIX = /[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?([a-z]+|%)?/y;
const COMMENT = /\/\*[\s\S]*?(?:\*\/|$)/g;
const UPPER = /[A-Z]+/g;

// The arguments of the transform function being parsed, and their readers: null marks a failure
// (including an index past the last argument). `argCalc[i]` marks a calc() result, which is
// typed: a unitless calc() is a <number>, never the <length>/<angle> literal `0`.
const argNums: number[] = [];
const argUnits: string[] = [];
const argCalc: boolean[] = [];

function argNumber(i: number): number | null {
  return argUnits[i] === "" ? argNums[i] : null;
}
function argNumberOrPercent(i: number): number | null {
  const unit = argUnits[i];
  return unit === "" ? argNums[i] : unit === "%" ? argNums[i] / 100 : null;
}
function argLength(i: number): number | null {
  const unit = argUnits[i];
  if (unit === "") return argNums[i] === 0 && !argCalc[i] ? 0 : null;
  return unit in LENGTH_UNITS ? argNums[i] * LENGTH_UNITS[unit] : null;
}
function argAngle(i: number): number | null {
  const unit = argUnits[i];
  if (unit === "") return argNums[i] === 0 && !argCalc[i] ? 0 : null;
  return unit in ANGLE_UNITS ? argNums[i] * ANGLE_UNITS[unit] : null;
}

function isCssWhitespace(c: number): boolean {
  return c === 32 || c === 9 || c === 10 || c === 13 || c === 12;
}

/** Trim CSS whitespace (not JS's wider set: U+00A0 is not whitespace in CSS). */
function trimCss(s: string): string {
  let start = 0;
  let end = s.length;
  while (start < end && isCssWhitespace(s.charCodeAt(start))) start++;
  while (end > start && isCssWhitespace(s.charCodeAt(end - 1))) end--;
  return start === 0 && end === s.length ? s : s.slice(start, end);
}

// --- calc() ------------------------------------------------------------------------------------
// https://drafts.csswg.org/css-values-4/#calc-func, limited to what a matrix can use without
// layout: + - * / and parentheses over numbers, absolute lengths, angles and percentages, with
// nested calc(). Other math functions (sign(), min(), ...), tree-counting functions
// (sibling-index()) and relative units fail, so the string throws SyntaxError.

/** A calc() value's type (https://drafts.csswg.org/css-values-4/#calc-type-checking). */
const CALC_NUMBER = 0;
const CALC_LENGTH = 1; // in px
const CALC_ANGLE = 2; // in deg
const CALC_PERCENT = 3;
const CALC_UNIT = ["", "px", "deg", "%"];

let calcText = "";
let calcPos = 0;
let calcType = CALC_NUMBER;

function calcSkipWhitespace(): boolean {
  const start = calcPos;
  while (calcPos < calcText.length && isCssWhitespace(calcText.charCodeAt(calcPos))) calcPos++;
  return calcPos !== start;
}

/** <calc-value>: a number with an optional unit, `( <calc-sum> )` or a nested calc(). */
function calcValue(): number | null {
  if (calcText.startsWith("calc(", calcPos)) calcPos += 5;
  else if (calcText.charCodeAt(calcPos) === 40 /* ( */) calcPos++;
  else {
    NUMBER_PREFIX.lastIndex = calcPos;
    const m = NUMBER_PREFIX.exec(calcText);
    if (m === null) return null;
    calcPos = NUMBER_PREFIX.lastIndex;
    const unit = m[1];
    const v = Number(unit === undefined ? m[0] : m[0].slice(0, -unit.length));
    if (unit === undefined) calcType = CALC_NUMBER;
    else if (unit === "%") calcType = CALC_PERCENT;
    else if (unit in LENGTH_UNITS) {
      calcType = CALC_LENGTH;
      return v * LENGTH_UNITS[unit];
    } else if (unit in ANGLE_UNITS) {
      calcType = CALC_ANGLE;
      return v * ANGLE_UNITS[unit];
    } else return null;
    return v;
  }
  calcSkipWhitespace();
  const v = calcSum();
  calcSkipWhitespace();
  if (v === null || calcText.charCodeAt(calcPos) !== 41 /* ) */) return null;
  calcPos++;
  return v;
}

/** <calc-product>: values joined by `*` (one side a number) or `/` (by a number). */
function calcProduct(): number | null {
  let v = calcValue();
  if (v === null) return null;
  let type = calcType;
  for (;;) {
    const save = calcPos;
    calcSkipWhitespace();
    const op = calcText.charCodeAt(calcPos);
    if (op !== 42 /* * */ && op !== 47 /* / */) {
      calcPos = save;
      calcType = type;
      return v;
    }
    calcPos++;
    calcSkipWhitespace();
    const rhs = calcValue();
    if (rhs === null) return null;
    if (op === 42) {
      if (type !== CALC_NUMBER && calcType !== CALC_NUMBER) return null;
      if (type === CALC_NUMBER) type = calcType;
      v *= rhs;
    } else {
      if (calcType !== CALC_NUMBER) return null;
      v /= rhs;
    }
  }
}

/** <calc-sum>: products joined by ` + ` / ` - ` (whitespace required), all of one type. */
function calcSum(): number | null {
  let v = calcProduct();
  if (v === null) return null;
  const type = calcType;
  for (;;) {
    const save = calcPos;
    const op = calcSkipWhitespace() ? calcText.charCodeAt(calcPos) : 0;
    if ((op !== 43 /* + */ && op !== 45) /* - */ || !isCssWhitespace(calcText.charCodeAt(calcPos + 1))) {
      calcPos = save;
      calcType = type;
      return v;
    }
    calcPos++;
    calcSkipWhitespace();
    const rhs = calcProduct();
    if (rhs === null || calcType !== type) return null;
    v = op === 43 ? v + rhs : v - rhs;
  }
}

/** Evaluate a whole `calc(...)` argument into argNums/argUnits/argCalc; false on failure. */
function pushCalcArg(text: string): boolean {
  calcText = text;
  calcPos = 0;
  const v = calcValue();
  if (v === null || calcPos !== text.length) return false;
  argNums.push(v);
  argUnits.push(CALC_UNIT[calcType]);
  argCalc.push(true);
  return true;
}

/** Split a function's argument text at top-level commas into argNums/argUnits; false on failure. */
function parseArgs(raw: string): boolean {
  argNums.length = 0;
  argUnits.length = 0;
  argCalc.length = 0;
  if (trimCss(raw) === "") return true;
  let start = 0;
  let depth = 0;
  for (let i = 0; i <= raw.length; i++) {
    const c = i === raw.length ? 44 : raw.charCodeAt(i);
    if (c === 40) depth++;
    else if (c === 41) depth--;
    else if (c === 44 /* , */ && depth === 0) {
      const arg = trimCss(raw.slice(start, i));
      start = i + 1;
      const a = ARG.exec(arg);
      if (a !== null) {
        argNums.push(Number(a[1]));
        argUnits.push(a[2]);
        argCalc.push(false);
      } else if (arg === "none") {
        // perspective(none)
        argNums.push(Number.NaN);
        argUnits.push("none");
        argCalc.push(false);
      } else if (!arg.startsWith("calc(") || !pushCalcArg(arg)) return false;
    }
  }
  return true;
}
/** Exactly `count` arguments, each read with `read`; null when the count or any argument is off. */
function argsAll(read: (i: number) => number | null, count: number): number[] | null {
  if (argNums.length !== count) return null;
  const r: number[] = [];
  for (let i = 0; i < count; i++) {
    const v = read(i);
    if (v === null) return null;
    r.push(v);
  }
  return r;
}

/**
 * https://drafts.csswg.org/geometry/#parse-a-string-into-an-abstract-matrix — the CSS
 * `transform` grammar (https://drafts.csswg.org/css-transforms-2/#transform-functions),
 * accepting only absolute lengths. Returns new matrix storage, or null on failure.
 */
function parseTransformList(input: string): number[] | null {
  const out = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, FLAG_2D];
  // Step 1: only the empty string itself is the identity; whitespace alone is a parse error.
  if (input === "") return out;
  // Step 2: parse with the CSS grammar. Comments are whitespace
  // (https://drafts.csswg.org/css-syntax-3/#consume-comments), keywords and units are ASCII
  // case-insensitive.
  let text = input.includes("/*") ? input.replace(COMMENT, " ") : input;
  text = trimCss(text.replace(UPPER, (s) => s.toLowerCase()));
  if (text === "none") return out;
  if (text === "") return null;
  const len = text.length;
  let pos = 0;
  while (pos < len) {
    // <transform-function>: an ident immediately followed by `(`, its arguments up to the
    // matching `)`, then optional whitespace.
    const nameStart = pos;
    for (let c = text.charCodeAt(pos); (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 45;) {
      c = text.charCodeAt(++pos);
    }
    if (pos === nameStart || text.charCodeAt(pos) !== 40 /* ( */) return null;
    const name = text.slice(nameStart, pos);
    const argsStart = ++pos;
    for (let depth = 0; ; pos++) {
      if (pos === len) return null;
      const c = text.charCodeAt(pos);
      if (c === 40) depth++;
      else if (c === 41 && depth-- === 0) break;
    }
    const raw = text.slice(argsStart, pos++);
    while (pos < len && isCssWhitespace(text.charCodeAt(pos))) pos++;
    if (!parseArgs(raw)) return null;
    const n = argNums.length;
    let m: number[] | null = null;
    let fn3D = false;
    switch (name) {
      case "matrix": {
        const v = argsAll(argNumber, 6);
        if (v !== null) m = set16(SCRATCH, v[0], v[1], 0, 0, v[2], v[3], 0, 0, 0, 0, 1, 0, v[4], v[5], 0, 1);
        break;
      }
      case "matrix3d": {
        const v = argsAll(argNumber, 16);
        if (v !== null) {
          // oxfmt-ignore
          m = set16(
            SCRATCH,
            v[0], v[1], v[2], v[3], v[4], v[5], v[6], v[7], v[8], v[9], v[10], v[11], v[12], v[13], v[14], v[15],
          );
        }
        fn3D = true;
        break;
      }
      case "translate":
      case "translatex":
      case "translatey":
      case "translatez":
      case "translate3d":
      case "scale":
      case "scalex":
      case "scaley":
      case "scalez":
      case "scale3d": {
        // The axis suffix: "" (x, then y: the identity for translate(), x for scale()), "x",
        // "y", "z" or "3d" (x, y, z); the other axes keep the identity value.
        const scale = name.startsWith("scale");
        const axis = name.slice(scale ? 5 : 9);
        const v = argsAll(scale ? argNumberOrPercent : argLength, axis === "3d" ? 3 : axis === "" && n === 2 ? 2 : 1);
        fn3D = axis === "z" || axis === "3d";
        if (v === null) break;
        const id = scale ? 1 : 0;
        let x = id;
        let y = id;
        let z = id;
        if (axis === "x") x = v[0];
        else if (axis === "y") y = v[0];
        else if (axis === "z") z = v[0];
        else {
          x = v[0];
          y = v[1] ?? (scale ? x : 0);
          if (axis === "3d") z = v[2];
        }
        m = scale
          ? set16(SCRATCH, x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1)
          : set16(SCRATCH, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1);
        break;
      }
      case "rotate":
      case "rotatex":
      case "rotatey":
      case "rotatez": {
        // rotate() is rotateZ() in 2D.
        const v = argsAll(argAngle, 1);
        const axis = name.slice(6);
        if (v !== null) {
          m = rotation(axis === "x" ? 1 : 0, axis === "y" ? 1 : 0, axis === "x" || axis === "y" ? 0 : 1, v[0]);
        }
        fn3D = axis !== "";
        break;
      }
      case "rotate3d": {
        const x = argNumber(0);
        const y = argNumber(1);
        const z = argNumber(2);
        const a = n === 4 ? argAngle(3) : null;
        if (x !== null && y !== null && z !== null && a !== null) m = rotation(x, y, z, a);
        fn3D = true;
        break;
      }
      case "skew":
      case "skewx":
      case "skewy": {
        const v = argsAll(argAngle, name === "skew" && n === 2 ? 2 : 1);
        if (v !== null) m = name === "skewy" ? skewing(0, v[0]) : skewing(v[0], v[1] ?? 0);
        break;
      }
      case "perspective": {
        // https://drafts.csswg.org/css-transforms-2/#funcdef-perspective: `none` is the
        // identity; lengths below 1px are clamped to 1px.
        if (n === 1 && argUnits[0] === "none") m = set16(SCRATCH, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
        else {
          const v = argsAll(argLength, 1);
          if (v !== null && v[0] >= 0) {
            m = set16(SCRATCH, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, -1 / Math.max(v[0], 1), 0, 0, 0, 1);
          }
        }
        fn3D = true;
        break;
      }
    }
    if (m === null) return null;
    if (fn3D) out[IS_2D] = FLAG_3D;
    multiplyInto(out, out, m);
  }
  return out;
}

/**
 * https://drafts.csswg.org/geometry/#dommatrixreadonly — storage is column-major m11..m44.
 * The non-mutating operations copy the matrix and run the matching *Self algorithm on the copy.
 */
export class DOMMatrixReadOnly {
  #m: number[];

  static {
    matrixOf = (matrix) => matrix.#m;
  }

  /** https://drafts.csswg.org/geometry/#dom-dommatrixreadonly-dommatrixreadonly */
  constructor(init?: string | ArrayLike<number>) {
    if (init === undefined) {
      const adopted = pendingStorage;
      if (adopted === null) this.#m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, FLAG_2D];
      else {
        pendingStorage = null;
        this.#m = adopted;
      }
    } else if (
      typeof init === "object" &&
      init !== null &&
      (Array.isArray(init) || ArrayBuffer.isView(init) || Symbol.iterator in init)
    ) {
      // WebIDL converts a sequence by iterating it. An array or typed array of a valid length
      // that still has the built-in iterator is read by index instead, which yields the same
      // values without the iterator protocol or an intermediate array.
      let a = init as ArrayLike<number>;
      const iterator = (init as Iterable<number>)[Symbol.iterator];
      if (
        (a.length !== 6 && a.length !== 16) ||
        !(
          (iterator === ARRAY_ITERATOR && Array.isArray(init)) ||
          (iterator === TYPED_ARRAY_ITERATOR && ArrayBuffer.isView(init))
        )
      ) {
        a = Array.from(init as Iterable<number>, Number);
      }
      if (a.length === 6) {
        // oxfmt-ignore
        this.#m = [
          Number(a[0]), Number(a[1]), 0, 0, Number(a[2]), Number(a[3]), 0, 0, 0, 0, 1, 0, Number(a[4]), Number(a[5]), 0, 1,
          FLAG_2D,
        ];
      } else if (a.length === 16) {
        // oxfmt-ignore
        this.#m = [
          Number(a[0]), Number(a[1]), Number(a[2]), Number(a[3]), Number(a[4]), Number(a[5]), Number(a[6]), Number(a[7]),
          Number(a[8]), Number(a[9]), Number(a[10]), Number(a[11]), Number(a[12]), Number(a[13]), Number(a[14]), Number(a[15]),
          FLAG_3D,
        ];
      } else {
        throw new TypeError(
          `Failed to construct '${new.target === DOMMatrix ? "DOMMatrix" : "DOMMatrixReadOnly"}': The sequence must contain 6 elements for a 2D matrix or 16 elements for a 3D matrix.`,
        );
      }
    } else {
      // WebIDL `(DOMString or sequence<unrestricted double>)`: a string, or anything else
      // stringified.
      const s = String(init);
      const m = parseTransformList(s);
      if (m === null) {
        throw new DOMException(
          `Failed to construct '${new.target === DOMMatrix ? "DOMMatrix" : "DOMMatrixReadOnly"}': Failed to parse '${s}'.`,
          "SyntaxError",
        );
      }
      this.#m = m;
    }
  }

  /** https://drafts.csswg.org/geometry/#dom-dommatrixreadonly-frommatrix */
  static fromMatrix(other?: DOMMatrixInit): DOMMatrixReadOnly {
    const r = new this();
    const src = matrixFromInit(other, "fromMatrix", this.name);
    const m = r.#m;
    for (let i = 0; i < 17; i++) m[i] = src[i];
    return r;
  }

  /** https://drafts.csswg.org/geometry/#dom-dommatrixreadonly-fromfloat32array */
  static fromFloat32Array(array: Float32Array): DOMMatrixReadOnly {
    return fromArray(this, array, "fromFloat32Array");
  }

  /** https://drafts.csswg.org/geometry/#dom-dommatrixreadonly-fromfloat64array */
  static fromFloat64Array(array: Float64Array): DOMMatrixReadOnly {
    return fromArray(this, array, "fromFloat64Array");
  }

  // https://drafts.csswg.org/geometry/#dommatrix-attributes
  get a(): number {
    return this.#m[0];
  }
  get b(): number {
    return this.#m[1];
  }
  get c(): number {
    return this.#m[4];
  }
  get d(): number {
    return this.#m[5];
  }
  get e(): number {
    return this.#m[12];
  }
  get f(): number {
    return this.#m[13];
  }
  get m11(): number {
    return this.#m[0];
  }
  get m12(): number {
    return this.#m[1];
  }
  get m13(): number {
    return this.#m[2];
  }
  get m14(): number {
    return this.#m[3];
  }
  get m21(): number {
    return this.#m[4];
  }
  get m22(): number {
    return this.#m[5];
  }
  get m23(): number {
    return this.#m[6];
  }
  get m24(): number {
    return this.#m[7];
  }
  get m31(): number {
    return this.#m[8];
  }
  get m32(): number {
    return this.#m[9];
  }
  get m33(): number {
    return this.#m[10];
  }
  get m34(): number {
    return this.#m[11];
  }
  get m41(): number {
    return this.#m[12];
  }
  get m42(): number {
    return this.#m[13];
  }
  get m43(): number {
    return this.#m[14];
  }
  get m44(): number {
    return this.#m[15];
  }
  /** https://drafts.csswg.org/geometry/#dom-dommatrixreadonly-is2d */
  get is2D(): boolean {
    return this.#m[IS_2D] === FLAG_2D;
  }
  /** https://drafts.csswg.org/geometry/#dom-dommatrixreadonly-isidentity */
  get isIdentity(): boolean {
    const m = this.#m;
    for (let i = 0; i < 16; i++) if (m[i] !== IDENTITY[i]) return false;
    return true;
  }

  /** https://drafts.csswg.org/geometry/#dom-dommatrixreadonly-translate */
  translate(tx?: number, ty?: number, tz?: number): DOMMatrix {
    return copyOf(this).translateSelf(tx, ty, tz);
  }

  /** https://drafts.csswg.org/geometry/#dom-dommatrixreadonly-scale */
  scale(
    scaleX?: number,
    scaleY?: number,
    scaleZ?: number,
    originX?: number,
    originY?: number,
    originZ?: number,
  ): DOMMatrix {
    return copyOf(this).scaleSelf(scaleX, scaleY, scaleZ, originX, originY, originZ);
  }

  /** https://drafts.csswg.org/geometry/#dom-dommatrixreadonly-scalenonuniform */
  scaleNonUniform(scaleX = 1, scaleY = 1): DOMMatrix {
    return copyOf(this).scaleSelf(scaleX, scaleY, 1, 0, 0, 0);
  }

  /** https://drafts.csswg.org/geometry/#dom-dommatrixreadonly-scale3d */
  scale3d(scale?: number, originX?: number, originY?: number, originZ?: number): DOMMatrix {
    return copyOf(this).scale3dSelf(scale, originX, originY, originZ);
  }

  /** https://drafts.csswg.org/geometry/#dom-dommatrixreadonly-rotate */
  rotate(rotX?: number, rotY?: number, rotZ?: number): DOMMatrix {
    return copyOf(this).rotateSelf(rotX, rotY, rotZ);
  }

  /** https://drafts.csswg.org/geometry/#dom-dommatrixreadonly-rotatefromvector */
  rotateFromVector(x?: number, y?: number): DOMMatrix {
    return copyOf(this).rotateFromVectorSelf(x, y);
  }

  /** https://drafts.csswg.org/geometry/#dom-dommatrixreadonly-rotateaxisangle */
  rotateAxisAngle(x?: number, y?: number, z?: number, angle?: number): DOMMatrix {
    return copyOf(this).rotateAxisAngleSelf(x, y, z, angle);
  }

  /** https://drafts.csswg.org/geometry/#dom-dommatrixreadonly-skewx */
  skewX(sx?: number): DOMMatrix {
    return copyOf(this).skewXSelf(sx);
  }

  /** https://drafts.csswg.org/geometry/#dom-dommatrixreadonly-skewy */
  skewY(sy?: number): DOMMatrix {
    return copyOf(this).skewYSelf(sy);
  }

  /** https://drafts.csswg.org/geometry/#dom-dommatrixreadonly-multiply */
  multiply(other?: DOMMatrixInit): DOMMatrix {
    const r = copyOf(this);
    const o = matrixFromInit(other, "multiply", "DOMMatrixReadOnly");
    const m = matrixOf(r);
    multiplyInto(m, m, o);
    if (o[IS_2D] !== FLAG_2D) m[IS_2D] = FLAG_3D;
    return r;
  }

  /** https://drafts.csswg.org/geometry/#dom-dommatrixreadonly-flipx */
  flipX(): DOMMatrix {
    const r = copyOf(this);
    scaleBy(matrixOf(r), -1, 1, 1);
    return r;
  }

  /** https://drafts.csswg.org/geometry/#dom-dommatrixreadonly-flipy */
  flipY(): DOMMatrix {
    const r = copyOf(this);
    scaleBy(matrixOf(r), 1, -1, 1);
    return r;
  }

  /** https://drafts.csswg.org/geometry/#dom-dommatrixreadonly-inverse */
  inverse(): DOMMatrix {
    return copyOf(this).invertSelf();
  }

  /** https://drafts.csswg.org/geometry/#dom-dommatrixreadonly-transformpoint */
  transformPoint(point: DOMPointInit = {}): DOMPoint {
    // DOMPoint.fromPoint(point).matrixTransform(this) without the intermediate point: read the
    // members in dictionary order, then convert them as the DOMPoint constructor would.
    const px = point.x;
    const py = point.y;
    const pz = point.z;
    const pw = point.w;
    return transformedPoint(
      this.#m,
      px === undefined ? 0 : Number(px),
      py === undefined ? 0 : Number(py),
      pz === undefined ? 0 : Number(pz),
      pw === undefined ? 1 : Number(pw),
    );
  }

  /** https://drafts.csswg.org/geometry/#dom-dommatrixreadonly-tofloat32array */
  toFloat32Array(): Float32Array {
    const m = this.#m;
    const out = new Float32Array(16);
    for (let i = 0; i < 16; i++) out[i] = m[i];
    return out;
  }

  /** https://drafts.csswg.org/geometry/#dom-dommatrixreadonly-tofloat64array */
  toFloat64Array(): Float64Array {
    const m = this.#m;
    const out = new Float64Array(16);
    for (let i = 0; i < 16; i++) out[i] = m[i];
    return out;
  }

  /** https://drafts.csswg.org/geometry/#dom-dommatrixreadonly-tojson */
  toJSON(): Record<string, number | boolean> {
    const m = this.#m;
    return {
      a: m[0],
      b: m[1],
      c: m[4],
      d: m[5],
      e: m[12],
      f: m[13],
      m11: m[0],
      m12: m[1],
      m13: m[2],
      m14: m[3],
      m21: m[4],
      m22: m[5],
      m23: m[6],
      m24: m[7],
      m31: m[8],
      m32: m[9],
      m33: m[10],
      m34: m[11],
      m41: m[12],
      m42: m[13],
      m43: m[14],
      m44: m[15],
      is2D: m[IS_2D] === FLAG_2D,
      isIdentity: this.isIdentity,
    };
  }

  /** https://drafts.csswg.org/geometry/#dommatrixreadonly-stringification-behavior */
  toString(): string {
    const m = this.#m;
    // Step 1: non-finite values cannot be serialized.
    for (let i = 0; i < 16; i++) {
      if (!Number.isFinite(m[i])) {
        throw new DOMException(
          `Failed to execute 'toString' on '${this instanceof DOMMatrix ? "DOMMatrix" : "DOMMatrixReadOnly"}': Cannot be serialized with NaN or Infinity values.`,
          "InvalidStateError",
        );
      }
    }
    if (m[IS_2D] === FLAG_2D) return `matrix(${m[0]}, ${m[1]}, ${m[4]}, ${m[5]}, ${m[12]}, ${m[13]})`;
    return `matrix3d(${m[0]}, ${m[1]}, ${m[2]}, ${m[3]}, ${m[4]}, ${m[5]}, ${m[6]}, ${m[7]}, ${m[8]}, ${m[9]}, ${m[10]}, ${m[11]}, ${m[12]}, ${m[13]}, ${m[14]}, ${m[15]})`;
  }
}

function fromArray<T extends DOMMatrixReadOnly>(
  C: new (init?: ArrayLike<number>) => T,
  array: Float32Array | Float64Array,
  method: string,
): T {
  if (array.length !== 6 && array.length !== 16) {
    throw new TypeError(
      `Failed to execute '${method}' on '${C.name}': The sequence must contain 6 elements for a 2D matrix or 16 elements for a 3D matrix.`,
    );
  }
  return new C(array);
}

/** https://drafts.csswg.org/geometry/#dommatrix */
export class DOMMatrix extends DOMMatrixReadOnly {
  /** https://drafts.csswg.org/geometry/#dom-dommatrix-frommatrix */
  static override fromMatrix(other?: DOMMatrixInit): DOMMatrix {
    return DOMMatrixReadOnly.fromMatrix.call(DOMMatrix, other) as DOMMatrix;
  }

  static override fromFloat32Array(array: Float32Array): DOMMatrix {
    return fromArray(DOMMatrix, array, "fromFloat32Array");
  }

  static override fromFloat64Array(array: Float64Array): DOMMatrix {
    return fromArray(DOMMatrix, array, "fromFloat64Array");
  }

  // https://drafts.csswg.org/geometry/#dommatrix-attributes — the 2D members just store;
  // m13/m14/m23/m24/m31/m32/m34/m43 clear is2D unless set to ±0, m33/m44 unless set to 1.
  override get a(): number {
    return matrixOf(this)[0];
  }
  set a(v: number) {
    matrixOf(this)[0] = Number(v);
  }
  override get b(): number {
    return matrixOf(this)[1];
  }
  set b(v: number) {
    matrixOf(this)[1] = Number(v);
  }
  override get c(): number {
    return matrixOf(this)[4];
  }
  set c(v: number) {
    matrixOf(this)[4] = Number(v);
  }
  override get d(): number {
    return matrixOf(this)[5];
  }
  set d(v: number) {
    matrixOf(this)[5] = Number(v);
  }
  override get e(): number {
    return matrixOf(this)[12];
  }
  set e(v: number) {
    matrixOf(this)[12] = Number(v);
  }
  override get f(): number {
    return matrixOf(this)[13];
  }
  set f(v: number) {
    matrixOf(this)[13] = Number(v);
  }
  override get m11(): number {
    return matrixOf(this)[0];
  }
  set m11(v: number) {
    matrixOf(this)[0] = Number(v);
  }
  override get m12(): number {
    return matrixOf(this)[1];
  }
  set m12(v: number) {
    matrixOf(this)[1] = Number(v);
  }
  override get m13(): number {
    return matrixOf(this)[2];
  }
  set m13(v: number) {
    set3D(this, 2, v, 0);
  }
  override get m14(): number {
    return matrixOf(this)[3];
  }
  set m14(v: number) {
    set3D(this, 3, v, 0);
  }
  override get m21(): number {
    return matrixOf(this)[4];
  }
  set m21(v: number) {
    matrixOf(this)[4] = Number(v);
  }
  override get m22(): number {
    return matrixOf(this)[5];
  }
  set m22(v: number) {
    matrixOf(this)[5] = Number(v);
  }
  override get m23(): number {
    return matrixOf(this)[6];
  }
  set m23(v: number) {
    set3D(this, 6, v, 0);
  }
  override get m24(): number {
    return matrixOf(this)[7];
  }
  set m24(v: number) {
    set3D(this, 7, v, 0);
  }
  override get m31(): number {
    return matrixOf(this)[8];
  }
  set m31(v: number) {
    set3D(this, 8, v, 0);
  }
  override get m32(): number {
    return matrixOf(this)[9];
  }
  set m32(v: number) {
    set3D(this, 9, v, 0);
  }
  override get m33(): number {
    return matrixOf(this)[10];
  }
  set m33(v: number) {
    set3D(this, 10, v, 1);
  }
  override get m34(): number {
    return matrixOf(this)[11];
  }
  set m34(v: number) {
    set3D(this, 11, v, 0);
  }
  override get m41(): number {
    return matrixOf(this)[12];
  }
  set m41(v: number) {
    matrixOf(this)[12] = Number(v);
  }
  override get m42(): number {
    return matrixOf(this)[13];
  }
  set m42(v: number) {
    matrixOf(this)[13] = Number(v);
  }
  override get m43(): number {
    return matrixOf(this)[14];
  }
  set m43(v: number) {
    set3D(this, 14, v, 0);
  }
  override get m44(): number {
    return matrixOf(this)[15];
  }
  set m44(v: number) {
    set3D(this, 15, v, 1);
  }

  /** https://drafts.csswg.org/geometry/#dom-dommatrix-multiplyself */
  multiplySelf(other?: DOMMatrixInit): DOMMatrix {
    const o = matrixFromInit(other, "multiplySelf", "DOMMatrix");
    const m = matrixOf(this);
    multiplyInto(m, m, o);
    if (o[IS_2D] !== FLAG_2D) m[IS_2D] = FLAG_3D;
    return this;
  }

  /** https://drafts.csswg.org/geometry/#dom-dommatrix-premultiplyself */
  preMultiplySelf(other?: DOMMatrixInit): DOMMatrix {
    const o = matrixFromInit(other, "preMultiplySelf", "DOMMatrix");
    const m = matrixOf(this);
    multiplyInto(m, o, m);
    if (o[IS_2D] !== FLAG_2D) m[IS_2D] = FLAG_3D;
    return this;
  }

  /** https://drafts.csswg.org/geometry/#dom-dommatrix-translateself */
  translateSelf(tx = 0, ty = 0, tz = 0): DOMMatrix {
    tz = Number(tz);
    tx = Number(tx);
    ty = Number(ty);
    const m = matrixOf(this);
    // Step 1: post-multiply a translation.
    translateBy(m, tx, ty, tz);
    // Step 2: a non-zero tz makes the matrix 3D.
    if (tz !== 0) m[IS_2D] = FLAG_3D;
    return this;
  }

  /** https://drafts.csswg.org/geometry/#dom-dommatrix-scaleself */
  scaleSelf(scaleX = 1, scaleY?: number, scaleZ = 1, originX = 0, originY = 0, originZ = 0): DOMMatrix {
    scaleX = Number(scaleX);
    scaleZ = Number(scaleZ);
    originX = Number(originX);
    originY = Number(originY);
    originZ = Number(originZ);
    const m = matrixOf(this);
    // Step 1: translate by the origin.
    translateOrigin(m, originX, originY, originZ);
    // Steps 2-3: scaleY defaults to scaleX; post-multiply the non-uniform scale.
    scaleBy(m, scaleX, scaleY === undefined ? scaleX : Number(scaleY), scaleZ);
    // Steps 4-5: translate back.
    translateOrigin(m, -originX, -originY, -originZ);
    // Step 6.
    if (scaleZ !== 1) m[IS_2D] = FLAG_3D;
    return this;
  }

  /** https://drafts.csswg.org/geometry/#dom-dommatrix-scale3dself */
  scale3dSelf(scale = 1, originX = 0, originY = 0, originZ = 0): DOMMatrix {
    scale = Number(scale);
    originX = Number(originX);
    originY = Number(originY);
    originZ = Number(originZ);
    const m = matrixOf(this);
    // Steps 1-3: translate by the origin, scale uniformly, translate back.
    translateOrigin(m, originX, originY, originZ);
    scaleBy(m, scale, scale, scale);
    translateOrigin(m, -originX, -originY, -originZ);
    // Step 4.
    if (scale !== 1) m[IS_2D] = FLAG_3D;
    return this;
  }

  /** https://drafts.csswg.org/geometry/#dom-dommatrix-rotateself */
  rotateSelf(rotX = 0, rotY?: number, rotZ?: number): DOMMatrix {
    rotX = Number(rotX);
    // Step 1: a lone argument is the Z rotation.
    if (rotY === undefined && rotZ === undefined) {
      rotZ = rotX;
      rotX = 0;
      rotY = 0;
    }
    // Steps 2-3.
    rotY = rotY === undefined ? 0 : Number(rotY);
    rotZ = rotZ === undefined ? 0 : Number(rotZ);
    const m = matrixOf(this);
    // Step 4.
    if (rotX !== 0 || rotY !== 0) m[IS_2D] = FLAG_3D;
    // Steps 5-7: Z, then Y, then X.
    rotateEuler(m, rotX, rotY, rotZ);
    return this;
  }

  /** https://drafts.csswg.org/geometry/#dom-dommatrix-rotatefromvectorself */
  rotateFromVectorSelf(x = 0, y = 0): DOMMatrix {
    x = Number(x);
    y = Number(y);
    // Step 1: the angle from (1, 0) to (x, y); 0 when both are zero.
    const deg = x === 0 && y === 0 ? 0 : Math.atan2(y, x) / DEG_TO_RAD;
    rotateBy(matrixOf(this), 0, 0, 1, deg);
    return this;
  }

  /** https://drafts.csswg.org/geometry/#dom-dommatrix-rotateaxisangleself */
  rotateAxisAngleSelf(x = 0, y = 0, z = 0, angle = 0): DOMMatrix {
    x = Number(x);
    y = Number(y);
    z = Number(z);
    angle = Number(angle);
    const m = matrixOf(this);
    // Step 1.
    rotateBy(m, x, y, z, angle);
    // Step 2.
    if (x !== 0 || y !== 0) m[IS_2D] = FLAG_3D;
    return this;
  }

  /** https://drafts.csswg.org/geometry/#dom-dommatrix-skewxself */
  skewXSelf(sx = 0): DOMMatrix {
    sx = Number(sx);
    skewBy(matrixOf(this), sx, 0);
    return this;
  }

  /** https://drafts.csswg.org/geometry/#dom-dommatrix-skewyself */
  skewYSelf(sy = 0): DOMMatrix {
    sy = Number(sy);
    skewBy(matrixOf(this), 0, sy);
    return this;
  }

  /** https://drafts.csswg.org/geometry/#dom-dommatrix-invertself */
  invertSelf(): DOMMatrix {
    const m = matrixOf(this);
    // Step 1. A 2D matrix keeps its identity 3D entries exactly: the affine inverse touches only
    // a-f, where the 4x4 cofactor expansion would round m33/m44 (scale(0.6) gave 0.9999999999999999).
    if (m[IS_2D] === FLAG_2D ? !invert2D(m) : !invert(m)) {
      // Step 2: a non-invertible matrix becomes all NaN and 3D.
      for (let i = 0; i < 16; i++) m[i] = Number.NaN;
      m[IS_2D] = FLAG_3D;
    }
    return this;
  }

  /** https://drafts.csswg.org/geometry/#dom-dommatrix-setmatrixvalue */
  setMatrixValue(transformList: string): DOMMatrix {
    const parsed = parseTransformList(String(transformList));
    if (parsed === null) {
      throw new DOMException(
        `Failed to execute 'setMatrixValue' on 'DOMMatrix': Failed to parse '${String(transformList)}'.`,
        "SyntaxError",
      );
    }
    const m = matrixOf(this);
    for (let i = 0; i < 17; i++) m[i] = parsed[i];
    return this;
  }
}

// translateSelf without argument conversion, for the origin steps of scaleSelf/scale3dSelf.
function translateOrigin(m: number[], tx: number, ty: number, tz: number): void {
  if (tx === 0 && ty === 0 && tz === 0) return;
  translateBy(m, tx, ty, tz);
  if (tz !== 0) m[IS_2D] = FLAG_3D;
}

function set3D(matrix: DOMMatrix, index: number, value: number, identity: number): void {
  const v = Number(value);
  const m = matrixOf(matrix);
  m[index] = v;
  if (v !== identity) m[IS_2D] = FLAG_3D;
}

exposeMembers(DOMPointReadOnly, DOMPoint, DOMRectReadOnly, DOMRect, DOMRectList, DOMMatrixReadOnly, DOMMatrix);
// Operations with a required argument; every other geometry operation's length is 0.
const REQUIRED_ARGS = { setMatrixValue: 1, fromFloat32Array: 1, fromFloat64Array: 1, item: 1 };
for (const C of [DOMPointReadOnly, DOMPoint, DOMRectReadOnly, DOMRect, DOMRectList, DOMMatrixReadOnly, DOMMatrix]) {
  defineInterfaceShape(C, REQUIRED_ARGS);
}
