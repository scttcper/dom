// Proxy-free indexed property access for lazily computed collections.
// https://webidl.spec.whatwg.org/#dfn-support-indexed-properties
//
// Why: live collections whose contents depend on arbitrary subtree mutations
// (getElementsByTagName, classList, attributes, ...) cannot be kept up to date eagerly, and a
// `Proxy` costs ~100 ns per `list[i]` read. Instead each such class gets plain accessor
// properties `0..n-1` on its PROTOTYPE that call the class's item function; the bound grows
// on demand. Measured (Node 26, 50 items): Proxy ~97 ns/read, prototype getter ~45 ns/read,
// own data property ~1-9 ns/read. Collections that CAN be maintained eagerly (`childNodes`,
// `children`, static NodeLists) store own data properties instead and never hit these getters
// for in-range indices.
//
// Deviation: `i in list` is true for every installed index, not only i < length.

export interface IndexGetterTable {
  proto: object;
  count: number;
  item: (self: object, index: number) => unknown;
}

export function indexGetterTable(proto: object, item: (self: object, index: number) => unknown, initial = 32): IndexGetterTable {
  const table: IndexGetterTable = { proto, count: 0, item };
  ensureIndexGetters(table, initial);
  return table;
}

/** Make sure accessor properties exist for indices [0, n). Amortized: doubles the bound. */
export function ensureIndexGetters(table: IndexGetterTable, n: number): void {
  if (n <= table.count) return;
  const target = Math.max(n, table.count * 2);
  const item = table.item;
  for (let i = table.count; i < target; i++) {
    Object.defineProperty(table.proto, i, {
      get() {
        return item(this, i);
      },
      // No setter: like WebIDL legacy platform objects without indexed setters, writes are
      // rejected (TypeError in strict code). Never mix these getters with own index props.
      enumerable: false,
      configurable: true,
    });
  }
  table.count = target;
}
