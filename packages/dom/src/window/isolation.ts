// Interface objects are shared, module-level classes (docs/deviations.md), so a patch a test file
// makes to them (`HTMLElement.prototype.scrollIntoView = jest.fn()`, spies on prototype getters,
// `Element.prototype.setPointerCapture ??= ...` in setup files) would outlive the file in a
// reused worker (Jest always; Vitest with `isolate: false`). jsdom avoids this by creating new
// interfaces per window; we snapshot instead.
//
// `captureInterfaceBaseline()` records, once per process, the own property descriptors of every
// interface object, its `prototype`, and every prototype up the chain to Object.prototype that
// belongs to an interface. `restoreInterfaces()` diffs the current state against it and puts
// back changed, added and removed properties. Environments call capture at setup (before any
// test code) and restore at teardown.

import { constants as vmConstants, createContext, runInContext } from "node:vm";
import { windowInterfaces, Window } from "./Window.ts";

type Snapshot = Map<object, Map<PropertyKey, PropertyDescriptor>>;

let baseline: Snapshot | null = null;

function targets(): object[] {
  const out = new Set<object>();
  const interfaces = windowInterfaces();
  for (const name in interfaces) {
    const value = interfaces[name];
    if (value === null || (typeof value !== "object" && typeof value !== "function")) continue;
    out.add(value as object);
    const proto = (value as { prototype?: unknown }).prototype;
    if (typeof value === "function" && proto !== null && typeof proto === "object") out.add(proto);
  }
  out.add(Window.prototype);
  return [...out];
}

function snapshot(target: object): Map<PropertyKey, PropertyDescriptor> {
  const map = new Map<PropertyKey, PropertyDescriptor>();
  for (const key of Reflect.ownKeys(target)) map.set(key, Object.getOwnPropertyDescriptor(target, key)!);
  return map;
}

/** The objects in the baseline (interface objects and their prototypes). */
let guarded: WeakSet<object> | null = null;

/** Record the pristine interface state (first call wins; later calls are no-ops). */
export function captureInterfaceBaseline(): void {
  if (baseline !== null) return;
  baseline = new Map();
  guarded = new WeakSet();
  for (const t of targets()) {
    baseline.set(t, snapshot(t));
    guarded.add(t);
  }
  ownObjectCreateMaps();
}

/** A realm that lives as long as the process (see ownObjectCreateMaps). */
let mapOwner: ((prototypes: object[]) => unknown[]) | null = null;
/** Objects it made: they keep the maps it owns alive (V8 holds the cache weakly). */
// oxlint-disable-next-line no-unused-vars -- held, never read
let ownedObjects: unknown[] = [];

/**
 * V8 caches the map `Object.create(proto)` builds on `proto`, with the calling realm's `Object`
 * as its constructor, and reuses it from every realm. For prototypes every test file shares — the
 * interface prototypes, and the outer realm's Object.prototype, which every `module.exports` Jest
 * makes inherits from and bundlers' CommonJS interop (`__toESM`) hands to Object.create — the
 * first test file to call it would own the map, and the objects each later file makes with it
 * would keep that file's realm (window, document, module graph) alive for the rest of the worker.
 * So a small permanent realm makes them first. Again after each restore: changing a prototype can
 * replace its map, and the cache with it.
 */
function ownObjectCreateMaps(): void {
  if (baseline === null) return;
  const owner = (mapOwner ??= runInContext(
    "(prototypes) => prototypes.map((p) => Object.create(p))",
    createContext(vmConstants.DONT_CONTEXTIFY),
  ) as (prototypes: object[]) => unknown[]);
  const prototypes: object[] = [Object.prototype];
  for (const target of baseline.keys()) if (typeof target !== "function") prototypes.push(target);
  ownedObjects = owner(prototypes);
}

type Descriptors = Record<PropertyKey, PropertyDescriptor>;
type RealmGlobal = { Object: ObjectConstructor; Reflect: typeof Reflect };

/** `desc` with `configurable: true` when it would define a non-configurable property. */
function configurableDescriptor(desc: PropertyDescriptor): PropertyDescriptor {
  return desc !== null && typeof desc === "object" && desc.configurable !== true
    ? { ...desc, configurable: true }
    : desc;
}

/**
 * Make properties a test file defines on interface objects and prototypes configurable, so
 * `restoreInterfaces()` can undo them. `Object.defineProperty`/`defineProperties` default to
 * non-configurable: shadow-dom-testing-library adds `ShadowRoot.prototype.outerHTML` that way,
 * the getter outlived its file, and the next file in the worker crashed reading
 * `ShadowRoot.prototype.outerHTML` (it calls the getter on the prototype). Patches `realm`'s own
 * `Object.defineProperty`, `Object.defineProperties` and `Reflect.defineProperty` (a test file's
 * vm global has its own intrinsics; @ctrl/dom's code in the outer realm is unaffected). Call after
 * `captureInterfaceBaseline()`. docs/deviations.md.
 */
export function guardInterfaceDefinitions(realm: RealmGlobal): void {
  const set = guarded;
  if (set === null) return;
  const O = realm.Object;
  const R = realm.Reflect;
  const defineProperty = O.defineProperty;
  const defineProperties = O.defineProperties;
  const reflectDefineProperty = R.defineProperty;
  const wrappers = {
    defineProperty<T>(o: T, key: PropertyKey, desc: PropertyDescriptor & ThisType<unknown>): T {
      return defineProperty(o, key, set.has(o as object) ? configurableDescriptor(desc) : desc);
    },
    defineProperties<T>(o: T, props: Descriptors & ThisType<unknown>): T {
      if (!set.has(o as object) || props === null || typeof props !== "object") return defineProperties(o, props);
      const coerced: Descriptors = {};
      for (const key of Reflect.ownKeys(props)) {
        if (Object.getOwnPropertyDescriptor(props, key)?.enumerable)
          coerced[key as string] = configurableDescriptor((props as Record<PropertyKey, PropertyDescriptor>)[key]);
      }
      return defineProperties(o, coerced);
    },
    reflectDefineProperty(o: object, key: PropertyKey, desc: PropertyDescriptor): boolean {
      return reflectDefineProperty(o, key, set.has(o) ? configurableDescriptor(desc) : desc);
    },
  };
  // Same names and lengths as the originals; data properties like the intrinsics'.
  Object.defineProperty(wrappers.reflectDefineProperty, "name", { value: "defineProperty" });
  Object.defineProperty(O, "defineProperty", {
    value: wrappers.defineProperty,
    writable: true,
    configurable: true,
    enumerable: false,
  });
  Object.defineProperty(O, "defineProperties", {
    value: wrappers.defineProperties,
    writable: true,
    configurable: true,
    enumerable: false,
  });
  Object.defineProperty(R, "defineProperty", {
    value: wrappers.reflectDefineProperty,
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

/** https://tc39.es/ecma262/#array-index (canonical numeric strings below 2^32 - 1). */
function isArrayIndex(key: PropertyKey): boolean {
  if (typeof key !== "string" || key === "" || key.length > 10) return false;
  const n = Number(key);
  return n >>> 0 === n && n !== 4294967295 && String(n) === key;
}

function sameDescriptor(a: PropertyDescriptor, b: PropertyDescriptor): boolean {
  return (
    a.value === b.value &&
    a.get === b.get &&
    a.set === b.set &&
    a.writable === b.writable &&
    a.enumerable === b.enumerable &&
    a.configurable === b.configurable
  );
}

/** Undo every change made to interface objects/prototypes since the baseline. Returns how many properties were restored. */
export function restoreInterfaces(): number {
  if (baseline === null) return 0;
  let restored = 0;
  for (const [target, original] of baseline) {
    const keys = Reflect.ownKeys(target);
    // Added properties. Array-index keys are ours: collections/indexed.ts grows index getters on
    // collection prototypes on demand and remembers the bound, so deleting them would leave
    // `list[i]` undefined for every later file in the worker. Tests don't patch index keys.
    for (const key of keys) {
      if (original.has(key) || isArrayIndex(key)) continue;
      if (Reflect.deleteProperty(target, key)) restored++;
    }
    for (const [key, desc] of original) {
      if (isArrayIndex(key)) continue;
      const current = Object.getOwnPropertyDescriptor(target, key);
      if (current !== undefined && sameDescriptor(current, desc)) continue;
      // Changed or removed.
      try {
        Object.defineProperty(target, key, desc);
        restored++;
      } catch {
        // Non-configurable now (frozen by the test): nothing we can do.
      }
    }
  }
  ownObjectCreateMaps();
  return restored;
}
