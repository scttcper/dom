// Runtime helpers for WebIDL object shapes.
//
// WebIDL defines attributes and regular operations as ENUMERABLE properties of the interface
// prototype object (https://webidl.spec.whatwg.org/#es-attributes,
// https://webidl.spec.whatwg.org/#es-operations), so `for (key in validityState)` yields the
// attribute names. JS class syntax defines members non-enumerable, and our implementation keeps
// state in `_`-prefixed own fields that `for...in`, spreads and pretty-format would otherwise see.
//
// Use these on interfaces whose instances code commonly enumerates or copies (ValidityState,
// DOMRect & co.). Hot, high-volume objects (nodes) keep plain fields; see docs/deviations.md.

type Ctor = { prototype: object };

/** Make the public members of each interface prototype enumerable (one-time, at module load). */
export function exposeMembers(...ctors: Ctor[]): void {
  for (const C of ctors) {
    const proto = C.prototype;
    for (const key of Object.getOwnPropertyNames(proto)) {
      if (key === "constructor" || key.charCodeAt(0) === 95 /* _ */) continue;
      const d = Object.getOwnPropertyDescriptor(proto, key)!;
      if (!d.enumerable && d.configurable) Object.defineProperty(proto, key, { enumerable: true });
    }
  }
}

/**
 * Make an instance's internal own fields (`_`-prefixed or symbol-keyed, see keys.ts)
 * non-enumerable, so spreads and Jest's symbol-aware equality skip them too. Call at the end of
 * a constructor.
 */
export function hideInternals(obj: object): void {
  for (const key of Reflect.ownKeys(obj)) {
    if (typeof key === "symbol" || key.charCodeAt(0) === 95 /* _ */) Object.defineProperty(obj, key, { enumerable: false });
  }
}
