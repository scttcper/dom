// WebIDL value conversions used by event constructors and init dictionaries.
// https://webidl.spec.whatwg.org/#es-type-mapping
//
// Fast paths first: init dictionaries almost always carry already-correct primitives, so each
// converter checks `typeof` once before falling back to the generic algorithm.

/** https://webidl.spec.whatwg.org/#es-DOMString */
export function toDOMString(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "symbol") throw new TypeError("Cannot convert a Symbol value to a string");
  return String(v);
}

/** https://webidl.spec.whatwg.org/#es-double — throws on non-finite values. */
export function toDouble(v: unknown, what: string): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) throw new TypeError(`${what} is not a finite floating-point value.`);
  return n;
}

/** https://webidl.spec.whatwg.org/#es-float */
export function toFloat(v: unknown, what: string): number {
  const n = toDouble(v, what);
  const f = Math.fround(n);
  if (!Number.isFinite(f)) throw new TypeError(`${what} is outside the range of a float.`);
  return f;
}

function integerPart(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n);
}

/** https://webidl.spec.whatwg.org/#es-long */
export function toLong(v: unknown): number {
  if (typeof v === "number" && (v | 0) === v) return v;
  return integerPart(v) | 0;
}

/** https://webidl.spec.whatwg.org/#es-unsigned-long */
export function toUnsignedLong(v: unknown): number {
  if (typeof v === "number" && v >>> 0 === v) return v;
  return integerPart(v) >>> 0;
}

/** https://webidl.spec.whatwg.org/#es-short */
export function toShort(v: unknown): number {
  return (integerPart(v) << 16) >> 16;
}

/** https://webidl.spec.whatwg.org/#es-unsigned-short */
export function toUnsignedShort(v: unknown): number {
  return integerPart(v) & 0xffff;
}

/** A dictionary argument: undefined/null → null (use defaults), objects pass, others throw. */
export function toDictionary(v: unknown, iface: string): Record<string, unknown> | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "object" && typeof v !== "function") {
    throw new TypeError(`Failed to construct '${iface}': The provided value is not of type '${iface}Init'.`);
  }
  return v as Record<string, unknown>;
}
