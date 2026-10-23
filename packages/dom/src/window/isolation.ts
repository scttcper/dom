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

/** Record the pristine interface state (first call wins; later calls are no-ops). */
export function captureInterfaceBaseline(): void {
  if (baseline !== null) return;
  baseline = new Map();
  for (const t of targets()) baseline.set(t, snapshot(t));
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
  return restored;
}
