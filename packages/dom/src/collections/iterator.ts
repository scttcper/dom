// values() / [Symbol.iterator]() for NodeList and HTMLCollection.
// https://webidl.spec.whatwg.org/#es-iterable — WebIDL makes both %Array.prototype.values% for
// indexed iterables (and @@iterator for legacy indexed collections), but V8 runs that builtin
// generically on non-array objects: a `length` and an index property lookup per step, ~30 ns an
// element. Testing Library spreads or Array.from()s every query result
// (`Array.from(container.querySelectorAll("*"))` for each getByText), so this iterator does the
// same walk in a few ns per element, with %ArrayIteratorPrototype%'s semantics: the index and the
// length are read again on each step (a live list's changes show), and once done it stays done.
// Not the same function object as Array.prototype.values (docs/deviations.md).

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
