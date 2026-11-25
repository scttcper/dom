// values() / [Symbol.iterator]() for NodeList and HTMLCollection.
// https://webidl.spec.whatwg.org/#es-iterable — WebIDL makes both %Array.prototype.values% for
// indexed iterables (and @@iterator for legacy indexed collections), but V8 runs that builtin
// generically on non-array objects: a `length` and an index property lookup per step, ~30 ns an
// element. Testing Library spreads or Array.from()s every query result
// (`Array.from(container.querySelectorAll("*"))` for each getByText), so this iterator does the
// same walk in a few ns per element, with %ArrayIteratorPrototype%'s semantics: the index and the
// length are read again on each step (a live list's changes show), and once done it stays done.
// Not the same function object as Array.prototype.values (docs/deviations.md). `forEach` below is
// the same trade for %Array.prototype.forEach% (~21 ns an element generically, ~2 ns here).

/** Collections whose items are read from a version-stamped snapshot (lazy NodeLists, HTMLCollection). */
interface Snapshotting {
  _snapshot(): ArrayLike<unknown>;
}

/** https://tc39.es/ecma262/#sec-%arrayiteratorprototype%.next, kind "value", over a collection. */
export class CollectionIterator extends Iterator<unknown, undefined> {
  /** The collection, or null once exhausted ([[IteratedArrayLike]] set to undefined). */
  #list: ArrayLike<unknown> | null;
  #index: number;
  /** Read items through `_snapshot()` instead of the collection's index accessors. */
  #snapshot: boolean;

  constructor(list: ArrayLike<unknown>, snapshot: boolean) {
    super();
    this.#list = list;
    this.#index = 0;
    this.#snapshot = snapshot;
  }

  override next(): IteratorResult<unknown, undefined> {
    const list = this.#list;
    if (list !== null) {
      const i = this.#index;
      const items = this.#snapshot ? (list as unknown as Snapshotting)._snapshot() : list;
      if (i < items.length) {
        this.#index = i + 1;
        return { value: items[i], done: false };
      }
      this.#list = null;
    }
    return { value: undefined, done: true };
  }
}

Object.defineProperty(CollectionIterator.prototype, Symbol.toStringTag, {
  value: "Array Iterator",
  configurable: true,
});

/** Array.prototype.values's ToObject step: collections only ever pass themselves, but `.call(x)` works on any array-like. */
export function iterableTarget(self: unknown): ArrayLike<unknown> {
  if (self === null || self === undefined) throw new TypeError("values method called on null or undefined");
  return Object(self) as ArrayLike<unknown>;
}

const arrayForEach = Array.prototype.forEach;

/**
 * https://tc39.es/ecma262/#sec-array.prototype.foreach as a plain loop, for NodeList and
 * DOMTokenList (WebIDL makes theirs %Array.prototype.forEach%, which V8 runs generically on
 * non-arrays). Same steps: ToObject, the length read once, the callable check after it, `k in O`
 * before each read, `callback.call(thisArg, value, k, O)`. A non-callable callback is handed to
 * the builtin so the TypeError is V8's own.
 */
export const collectionForEach = {
  forEach(this: unknown, callback: (value: unknown, key: number, list: unknown) => void, thisArg?: unknown): void {
    // ToObject's TypeError, worded by V8.
    if (this === null || this === undefined) return arrayForEach.call(this, callback, thisArg);
    const o = Object(this) as ArrayLike<unknown>;
    // LengthOfArrayLike: ToLength(Get(O, "length")).
    const len = Math.min(Math.max(Math.trunc(Number(o.length)) || 0, 0), Number.MAX_SAFE_INTEGER);
    if (typeof callback !== "function") {
      arrayForEach.call(o, callback, thisArg);
      return;
    }
    for (let k = 0; k < len; k++) if (k in o) callback.call(thisArg, o[k], k, o);
  },
}.forEach;

/** A WebIDL operation's property: writable, enumerable, configurable (https://webidl.spec.whatwg.org/#es-operations). */
function operation(value: unknown): PropertyDescriptor {
  return { value, writable: true, enumerable: true, configurable: true };
}

/**
 * A collection interface's @@iterator (`values`, https://webidl.spec.whatwg.org/#es-iterator)
 * and @@toStringTag (its class name). With `iterable`, also the forEach/entries/keys/values
 * members of an indexed iterable (https://webidl.spec.whatwg.org/#es-iterable).
 */
export function defineCollectionIterator(
  ctor: { prototype: object; name: string },
  values: unknown,
  iterable: boolean,
): void {
  const descriptors: PropertyDescriptorMap = iterable
    ? {
        forEach: operation(collectionForEach),
        entries: operation(Array.prototype.entries),
        keys: operation(Array.prototype.keys),
        values: operation(values),
      }
    : {};
  descriptors[Symbol.iterator] = { value: values, writable: true, configurable: true };
  descriptors[Symbol.toStringTag] = { value: ctor.name, configurable: true };
  Object.defineProperties(ctor.prototype, descriptors);
}
