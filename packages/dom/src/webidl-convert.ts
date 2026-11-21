// WebIDL conversions of JavaScript values to IDL types, for constructor arguments and init
// dictionaries. https://webidl.spec.whatwg.org/#es-type-mapping
//
// The integer types are JavaScript's own bitwise conversions: ToInt32/ToUint32 truncate, wrap and
// turn NaN and the infinities into 0, which is ConvertToInt without [Clamp] or [EnforceRange].

/** https://webidl.spec.whatwg.org/#es-DOMString */
export function toDOMString(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "symbol") throw new TypeError("Cannot convert a Symbol value to a string");
  return String(v);
}

/** https://webidl.spec.whatwg.org/#es-double — throws on non-finite values. */
export function toDouble(v: unknown, what: string): number {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new TypeError(`${what} is not a finite floating-point value.`);
  return n;
}

/** https://webidl.spec.whatwg.org/#es-float */
export function toFloat(v: unknown, what: string): number {
  const f = Math.fround(toDouble(v, what));
  if (!Number.isFinite(f)) throw new TypeError(`${what} is outside the range of a float.`);
  return f;
}

/** https://webidl.spec.whatwg.org/#es-long */
export function toLong(v: unknown): number {
  return Number(v) | 0;
}

/** https://webidl.spec.whatwg.org/#es-unsigned-long */
export function toUnsignedLong(v: unknown): number {
  return Number(v) >>> 0;
}

/** https://webidl.spec.whatwg.org/#es-short */
export function toShort(v: unknown): number {
  return (Number(v) << 16) >> 16;
}

/** https://webidl.spec.whatwg.org/#es-unsigned-short */
export function toUnsignedShort(v: unknown): number {
  return Number(v) & 0xffff;
}
