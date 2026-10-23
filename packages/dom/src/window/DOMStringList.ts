// https://html.spec.whatwg.org/#the-domstringlist-interface
//
// A fixed list of strings with indexed access. Only `location.ancestorOrigins` creates one here;
// lists are immutable after construction, so the supported indices are plain frozen own
// properties (no Proxy).

const kConstruct = Symbol("construct");

export class DOMStringList {
  readonly #strings: readonly string[];

  constructor(token?: symbol, strings: readonly string[] = []) {
    if (token !== kConstruct) throw new TypeError("Illegal constructor");
    this.#strings = strings;
    for (let i = 0; i < strings.length; i++) {
      Object.defineProperty(this, i, { value: strings[i], writable: false, enumerable: true, configurable: true });
    }
    Object.preventExtensions(this);
  }

  /** https://html.spec.whatwg.org/#dom-domstringlist-length */
  get length(): number {
    return this.#strings.length;
  }

  /** https://html.spec.whatwg.org/#dom-domstringlist-item */
  item(index: number): string | null {
    return this.#strings[Number(index) >>> 0] ?? null;
  }

  /** https://html.spec.whatwg.org/#dom-domstringlist-contains */
  contains(string: string): boolean {
    return this.#strings.includes(String(string));
  }

  *[Symbol.iterator](): IterableIterator<string> {
    yield* this.#strings;
  }

  get [Symbol.toStringTag](): string {
    return "DOMStringList";
  }
}

/** @internal */
export function createDOMStringList(strings: readonly string[]): DOMStringList {
  return new DOMStringList(kConstruct, strings);
}
