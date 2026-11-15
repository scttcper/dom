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
 * Give an interface object what class syntax gets wrong (one-time, at module load):
 *   - @@toStringTag on the prototype, so `Object.prototype.toString` gives `[object Name]`
 *     (https://webidl.spec.whatwg.org/#dfn-class-string);
 *   - each operation's and the constructor's `length`: the number of required arguments
 *     (https://webidl.spec.whatwg.org/#es-operations, https://webidl.spec.whatwg.org/#es-interface-call),
 *     where TypeScript `x?: T` parameters would count. `required` maps operation names (and
 *     "constructor") to their required-argument count; every other operation gets 0.
 */
export function defineInterfaceShape(
  ctor: Ctor & { name: string },
  required: Readonly<Record<string, number>> = {},
): void {
  Object.defineProperty(ctor.prototype, Symbol.toStringTag, { value: ctor.name, configurable: true });
  setLength(
    ctor as unknown as Function,
    Object.hasOwn(required, "constructor") ? required["constructor" as string] : 0,
  );
  for (const target of [ctor.prototype, ctor]) {
    for (const key of Object.getOwnPropertyNames(target)) {
      if (key === "constructor" || key === "prototype" || key === "length" || key === "name") continue;
      const d = Object.getOwnPropertyDescriptor(target, key)!;
      if (typeof d.value === "function")
        setLength(d.value as Function, Object.hasOwn(required, key) ? required[key] : 0);
    }
  }
}

/**
 * Define WebIDL constants on the interface object and its prototype
 * (https://webidl.spec.whatwg.org/#es-constants): `{ writable: false, enumerable: true,
 * configurable: false }` on both. Class `static readonly` fields are writable and configurable, and
 * class syntax puts nothing on the prototype, so `video.HAVE_ENOUGH_DATA` would be undefined.
 */
export function defineConstants(ctor: Ctor, constants: Readonly<Record<string, number>>): void {
  for (const name of Object.keys(constants)) {
    const d = { value: constants[name], writable: false, enumerable: true, configurable: false };
    Object.defineProperty(ctor, name, d);
    Object.defineProperty(ctor.prototype, name, d);
  }
}

function setLength(fn: Function, length: number): void {
  if (fn.length !== length) Object.defineProperty(fn, "length", { value: length, configurable: true });
}

/**
 * Make an instance's internal own fields (`_`-prefixed or symbol-keyed, see keys.ts)
 * non-enumerable, so spreads and Jest's symbol-aware equality skip them too. Call at the end of
 * a constructor.
 */
export function hideInternals(obj: object): void {
  for (const key of Reflect.ownKeys(obj)) {
    // Skip keys already hidden: redefining a property is the expensive part.
    if ((typeof key === "symbol" || key.charCodeAt(0) === 95) /* _ */ && propertyIsEnumerable.call(obj, key))
      Object.defineProperty(obj, key, { enumerable: false });
  }
}

const propertyIsEnumerable = Object.prototype.propertyIsEnumerable;

/**
 * Create an internal own field already hidden: what `hideInternals` would leave (writable,
 * configurable, not enumerable), without reconfiguring the property afterwards, which costs
 * several times more. Use with `declare`d class fields (a plain field declaration would create an
 * enumerable `undefined` property first).
 */
export function defineHidden(obj: object, key: symbol | string, value: unknown): void {
  Object.defineProperty(obj, key, { value, writable: true, configurable: true, enumerable: false });
}

/**
 * Throw the TypeError WebIDL requires when an operation is called with fewer than its required
 * arguments (https://webidl.spec.whatwg.org/#dfn-overload-resolution-algorithm step 4), worded
 * like jsdom/Chromium.
 */
export function argumentsRequired(method: string, iface: string, required: number, given: number): never {
  throw new TypeError(
    `Failed to execute '${method}' on '${iface}': ${required} argument${required === 1 ? "" : "s"} required, but only ${given} present.`,
  );
}
