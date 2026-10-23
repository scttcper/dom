// https://drafts.fxtf.org/geometry/ — minimal DOMPoint / DOMRect / DOMMatrix.
//
// Enough for getBoundingClientRect()/getClientRects() results (nodes/Element.ts,
// traversal/Range.ts), `new DOMRect(...)` in tests and libraries that feature-detect
// DOMMatrix. DOMMatrix supports the 2D subset plus identity/translate/scale/
// multiply/inverse on the full 4x4 storage.

export interface DOMPointInit {
  x?: number;
  y?: number;
  z?: number;
  w?: number;
}

export class DOMPointReadOnly {
  _x: number;
  _y: number;
  _z: number;
  _w: number;

  constructor(x = 0, y = 0, z = 0, w = 1) {
    this._x = Number(x);
    this._y = Number(y);
    this._z = Number(z);
    this._w = Number(w);
  }

  static fromPoint(other: DOMPointInit = {}): DOMPointReadOnly {
    return new this(other.x, other.y, other.z, other.w);
  }

  get x(): number {
    return this._x;
  }
  get y(): number {
    return this._y;
  }
  get z(): number {
    return this._z;
  }
  get w(): number {
    return this._w;
  }

  matrixTransform(matrix: DOMMatrixReadOnly): DOMPoint {
    const m = matrix._m;
    const { _x: x, _y: y, _z: z, _w: w } = this;
    return new DOMPoint(
      m[0] * x + m[4] * y + m[8] * z + m[12] * w,
      m[1] * x + m[5] * y + m[9] * z + m[13] * w,
      m[2] * x + m[6] * y + m[10] * z + m[14] * w,
      m[3] * x + m[7] * y + m[11] * z + m[15] * w,
    );
  }

  toJSON(): Required<DOMPointInit> {
    return { x: this._x, y: this._y, z: this._z, w: this._w };
  }
}

export class DOMPoint extends DOMPointReadOnly {
  static override fromPoint(other: DOMPointInit = {}): DOMPoint {
    return new DOMPoint(other.x, other.y, other.z, other.w);
  }
  override get x(): number {
    return this._x;
  }
  set x(v: number) {
    this._x = Number(v);
  }
  override get y(): number {
    return this._y;
  }
  set y(v: number) {
    this._y = Number(v);
  }
  override get z(): number {
    return this._z;
  }
  set z(v: number) {
    this._z = Number(v);
  }
  override get w(): number {
    return this._w;
  }
  set w(v: number) {
    this._w = Number(v);
  }
}

export interface DOMRectInit {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export class DOMRectReadOnly {
  _x: number;
  _y: number;
  _width: number;
  _height: number;

  constructor(x = 0, y = 0, width = 0, height = 0) {
    this._x = Number(x);
    this._y = Number(y);
    this._width = Number(width);
    this._height = Number(height);
  }

  static fromRect(other: DOMRectInit = {}): DOMRectReadOnly {
    return new this(other.x, other.y, other.width, other.height);
  }

  get x(): number {
    return this._x;
  }
  get y(): number {
    return this._y;
  }
  get width(): number {
    return this._width;
  }
  get height(): number {
    return this._height;
  }
  get top(): number {
    return Math.min(this._y, this._y + this._height);
  }
  get right(): number {
    return Math.max(this._x, this._x + this._width);
  }
  get bottom(): number {
    return Math.max(this._y, this._y + this._height);
  }
  get left(): number {
    return Math.min(this._x, this._x + this._width);
  }

  toJSON(): Record<string, number> {
    return { x: this._x, y: this._y, width: this._width, height: this._height, top: this.top, right: this.right, bottom: this.bottom, left: this.left };
  }
}

export class DOMRect extends DOMRectReadOnly {
  static override fromRect(other: DOMRectInit = {}): DOMRect {
    return new DOMRect(other.x, other.y, other.width, other.height);
  }
  override get x(): number {
    return this._x;
  }
  set x(v: number) {
    this._x = Number(v);
  }
  override get y(): number {
    return this._y;
  }
  set y(v: number) {
    this._y = Number(v);
  }
  override get width(): number {
    return this._width;
  }
  set width(v: number) {
    this._width = Number(v);
  }
  override get height(): number {
    return this._height;
  }
  set height(v: number) {
    this._height = Number(v);
  }
}

/** https://drafts.fxtf.org/geometry/#domrectlist */
export class DOMRectList {
  _rects: DOMRect[];
  [index: number]: DOMRect;

  constructor(rects: DOMRect[] = []) {
    this._rects = rects;
    for (let i = 0; i < rects.length; i++) Object.defineProperty(this, i, { value: rects[i], enumerable: true });
  }
  get length(): number {
    return this._rects.length;
  }
  item(index: number): DOMRect | null {
    return this._rects[index] ?? null;
  }
  [Symbol.iterator](): IterableIterator<DOMRect> {
    return this._rects[Symbol.iterator]();
  }
}

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function multiply(a: number[], b: number[]): number[] {
  // Column-major 4x4: result = a * b
  const out: number[] = Array.from({ length: 16 }, () => 0);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[col * 4 + k];
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

/** https://drafts.fxtf.org/geometry/#dommatrixreadonly — storage is column-major m11..m44. */
export class DOMMatrixReadOnly {
  _m: number[];
  _is2D: boolean;

  constructor(init?: string | number[]) {
    if (init === undefined || init === "" || init === "none") {
      this._m = IDENTITY.slice();
      this._is2D = true;
    } else if (Array.isArray(init) || ArrayBuffer.isView(init)) {
      const a = Array.from(init as ArrayLike<number>, Number);
      if (a.length === 6) {
        this._m = [a[0], a[1], 0, 0, a[2], a[3], 0, 0, 0, 0, 1, 0, a[4], a[5], 0, 1];
        this._is2D = true;
      } else if (a.length === 16) {
        this._m = a;
        this._is2D = false;
      } else {
        throw new TypeError(`Failed to construct 'DOMMatrix': The sequence must contain 6 elements for a 2D matrix or 16 elements for a 3D matrix.`);
      }
    } else {
      const m = /^\s*matrix\(([^)]*)\)\s*$/.exec(String(init));
      if (m === null) throw new DOMException(`Failed to construct 'DOMMatrix': Failed to parse '${String(init)}'.`, "SyntaxError");
      const a = m[1].split(/[\s,]+/).filter(Boolean).map(Number);
      this._m = [a[0], a[1], 0, 0, a[2], a[3], 0, 0, 0, 0, 1, 0, a[4], a[5], 0, 1];
      this._is2D = true;
    }
  }

  static fromMatrix(other: Partial<Record<string, number>> = {}): DOMMatrixReadOnly {
    const m = new this();
    if (other.a !== undefined || other.m11 !== undefined) {
      m._m[0] = other.m11 ?? other.a ?? 1;
      m._m[1] = other.m12 ?? other.b ?? 0;
      m._m[4] = other.m21 ?? other.c ?? 0;
      m._m[5] = other.m22 ?? other.d ?? 1;
      m._m[12] = other.m41 ?? other.e ?? 0;
      m._m[13] = other.m42 ?? other.f ?? 0;
    }
    return m;
  }

  static fromFloat64Array(array: Float64Array): DOMMatrixReadOnly {
    return new this(Array.from(array));
  }

  static fromFloat32Array(array: Float32Array): DOMMatrixReadOnly {
    return new this(Array.from(array));
  }

  get a(): number {
    return this._m[0];
  }
  get b(): number {
    return this._m[1];
  }
  get c(): number {
    return this._m[4];
  }
  get d(): number {
    return this._m[5];
  }
  get e(): number {
    return this._m[12];
  }
  get f(): number {
    return this._m[13];
  }
  get m11(): number {
    return this._m[0];
  }
  get m12(): number {
    return this._m[1];
  }
  get m13(): number {
    return this._m[2];
  }
  get m14(): number {
    return this._m[3];
  }
  get m21(): number {
    return this._m[4];
  }
  get m22(): number {
    return this._m[5];
  }
  get m23(): number {
    return this._m[6];
  }
  get m24(): number {
    return this._m[7];
  }
  get m31(): number {
    return this._m[8];
  }
  get m32(): number {
    return this._m[9];
  }
  get m33(): number {
    return this._m[10];
  }
  get m34(): number {
    return this._m[11];
  }
  get m41(): number {
    return this._m[12];
  }
  get m42(): number {
    return this._m[13];
  }
  get m43(): number {
    return this._m[14];
  }
  get m44(): number {
    return this._m[15];
  }
  get is2D(): boolean {
    return this._is2D;
  }
  get isIdentity(): boolean {
    for (let i = 0; i < 16; i++) if (this._m[i] !== IDENTITY[i]) return false;
    return true;
  }

  multiply(other: DOMMatrixReadOnly): DOMMatrix {
    const r = new DOMMatrix(multiply(this._m, other._m));
    r._is2D = this._is2D && other._is2D;
    return r;
  }

  translate(tx = 0, ty = 0, tz = 0): DOMMatrix {
    const t = new DOMMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, tx, ty, tz, 1]);
    t._is2D = tz === 0;
    return this.multiply(t);
  }

  scale(sx = 1, sy = sx, sz = 1): DOMMatrix {
    const s = new DOMMatrix([sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, sz, 0, 0, 0, 0, 1]);
    s._is2D = sz === 1;
    return this.multiply(s);
  }

  /** 2D inverse (3D matrices other than affine 2D return NaN-filled matrices, as unsupported). */
  inverse(): DOMMatrix {
    const [a, b, , , c, d, , , , , , , e, f] = this._m;
    const det = a * d - b * c;
    if (!this._is2D || det === 0) {
      const r = new DOMMatrix(Array.from({ length: 16 }, () => Number.NaN));
      r._is2D = false;
      return r;
    }
    return new DOMMatrix([d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det]);
  }

  transformPoint(point: DOMPointInit = {}): DOMPoint {
    return DOMPoint.fromPoint(point).matrixTransform(this);
  }

  toFloat64Array(): Float64Array {
    return Float64Array.from(this._m);
  }

  toFloat32Array(): Float32Array {
    return Float32Array.from(this._m);
  }

  toJSON(): Record<string, number | boolean> {
    const o: Record<string, number | boolean> = { a: this.a, b: this.b, c: this.c, d: this.d, e: this.e, f: this.f };
    const names = ["m11", "m12", "m13", "m14", "m21", "m22", "m23", "m24", "m31", "m32", "m33", "m34", "m41", "m42", "m43", "m44"];
    for (let i = 0; i < 16; i++) o[names[i]] = this._m[i];
    o.is2D = this._is2D;
    o.isIdentity = this.isIdentity;
    return o;
  }

  toString(): string {
    if (this._is2D) return `matrix(${this.a}, ${this.b}, ${this.c}, ${this.d}, ${this.e}, ${this.f})`;
    return `matrix3d(${this._m.join(", ")})`;
  }
}

export class DOMMatrix extends DOMMatrixReadOnly {
  static override fromMatrix(other: Partial<Record<string, number>> = {}): DOMMatrix {
    return DOMMatrixReadOnly.fromMatrix.call(DOMMatrix, other) as DOMMatrix;
  }
  override get a(): number {
    return this._m[0];
  }
  set a(v: number) {
    this._m[0] = Number(v);
  }
  override get b(): number {
    return this._m[1];
  }
  set b(v: number) {
    this._m[1] = Number(v);
  }
  override get c(): number {
    return this._m[4];
  }
  set c(v: number) {
    this._m[4] = Number(v);
  }
  override get d(): number {
    return this._m[5];
  }
  set d(v: number) {
    this._m[5] = Number(v);
  }
  override get e(): number {
    return this._m[12];
  }
  set e(v: number) {
    this._m[12] = Number(v);
  }
  override get f(): number {
    return this._m[13];
  }
  set f(v: number) {
    this._m[13] = Number(v);
  }
}
