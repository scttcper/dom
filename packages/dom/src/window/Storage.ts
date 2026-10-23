// https://html.spec.whatwg.org/#storage
//
// Storage objects support named properties (`localStorage.foo = "1"`), which needs a Proxy.
// Storage is not a hot path and the objects are created lazily on first access.
//
// Storage areas belong to a "storage shed" (https://storage.spec.whatwg.org/#storage-shed).
// Each window gets its own shed unless created with `shareStorageWith`, so tests stay
// isolated; windows sharing a shed see each other's localStorage and receive `storage` events.

import { eventInterface } from "./interfaces.ts";
import type { Window } from "./Window.ts";
import { windowOrigin } from "./origin.ts";
import { $closed, $parentWindow, $url } from "../keys.ts";

/** https://storage.spec.whatwg.org/#storage-shed */
export interface StorageShed {
  /** origin → local storage area (a "storage bottle map") */
  areas: Map<string, Map<string, string>>;
  windows: Set<Window>;
}

export function createStorageShed(): StorageShed {
  return { areas: new Map(), windows: new Set() };
}

// jsdom and browsers use a 5 MiB-ish per-origin quota measured in code units.
const QUOTA = 5_000_000;

const kState = Symbol("storage");
const kConstruct = Symbol("construct");

interface StorageState {
  map: Map<string, string>;
  window: Window;
  type: "local" | "session";
  size: number;
}

function state(storage: Storage): StorageState {
  return (storage as unknown as Record<symbol, StorageState>)[kState];
}

// The proxy implements the legacy platform object internal methods for an interface with named
// property getter/setter/deleter and no [LegacyOverrideBuiltIns]
// (https://webidl.spec.whatwg.org/#es-legacy-platform-objects). A stored key is "visible" as a
// property only when neither the object nor its prototype chain has a property of that name
// (https://webidl.spec.whatwg.org/#legacy-platform-object-property-visibility).
function visible(target: Storage, key: string): boolean {
  return !(key in target) && state(target).map.has(key);
}

const handler: ProxyHandler<Storage> = {
  get(target, key, receiver) {
    if (typeof key === "string" && !(key in target)) {
      return state(target).map.get(key);
    }
    return Reflect.get(target, key, receiver);
  },
  // https://webidl.spec.whatwg.org/#legacy-platform-object-set
  set(target, key, value, receiver) {
    // Step 1.2: on the object itself, a String P always goes to the named setter, even when a
    // property of that name exists (`localStorage.key = "x"` stores an item; `key()` stays).
    // Deviation (docs/deviations.md): assigning a function to a name the object or its
    // prototype already has (a Storage method) defines an own property instead, so
    // `localStorage.getItem = vi.fn()` mocks like it does on happy-dom.
    if (typeof key === "string" && receiver === proxies.get(target)) {
      if (typeof value === "function" && key in target) {
        return Reflect.defineProperty(target, key, { value, writable: true, enumerable: true, configurable: true });
      }
      target.setItem(key, value);
      return true;
    }
    return Reflect.set(target, key, value, receiver);
  },
  has(target, key) {
    if (typeof key === "string" && state(target).map.has(key)) return true;
    return Reflect.has(target, key);
  },
  // https://webidl.spec.whatwg.org/#legacy-platform-object-delete
  deleteProperty(target, key) {
    if (typeof key === "string" && visible(target, key)) {
      target.removeItem(key);
      return true;
    }
    return Reflect.deleteProperty(target, key);
  },
  // https://webidl.spec.whatwg.org/#legacy-platform-object-ownpropertykeys
  ownKeys(target) {
    const keys: (string | symbol)[] = [];
    for (const k of state(target).map.keys()) if (!(k in target)) keys.push(k);
    for (const k of Reflect.ownKeys(target)) keys.push(k);
    return keys;
  },
  // https://webidl.spec.whatwg.org/#LegacyPlatformObjectGetOwnProperty
  getOwnPropertyDescriptor(target, key) {
    if (typeof key === "string" && !(key in target)) {
      const value = state(target).map.get(key);
      if (value !== undefined) return { value, writable: true, enumerable: true, configurable: true };
    }
    return Reflect.getOwnPropertyDescriptor(target, key);
  },
  // https://webidl.spec.whatwg.org/#legacy-platform-object-defineownproperty
  defineProperty(target, key, descriptor) {
    // Step 2.2: unless the object has an own property P, a String P goes to the named setter
    // (accessor descriptors are rejected). Deviation: function values and accessors become real
    // own properties so `vi.spyOn(localStorage, "getItem")` works like it does on happy-dom.
    if (typeof key === "string" && !Object.hasOwn(target, key) && "value" in descriptor && typeof descriptor.value !== "function") {
      target.setItem(key, descriptor.value);
      return true;
    }
    return Reflect.defineProperty(target, key, descriptor);
  },
};

/** target → its proxy (the Storage object scripts see), for the [[Set]] receiver check. */
const proxies = new WeakMap<Storage, Storage>();

/** https://webidl.spec.whatwg.org/#dfn-overload-resolution-algorithm step 4: too few arguments. */
function requireArgs(count: number, required: number, method: string): void {
  if (count < required) {
    throw new TypeError(`Failed to execute '${method}' on 'Storage': ${required} argument${required === 1 ? "" : "s"} required, but only ${count} present.`);
  }
}

export class Storage {
  constructor(token?: symbol, window?: Window, type?: "local" | "session", map?: Map<string, string>) {
    if (token !== kConstruct) throw new TypeError("Illegal constructor");
    let size = 0;
    for (const [k, v] of map!) size += k.length + v.length;
    const s: StorageState = { map: map!, window: window!, type: type!, size };
    Object.defineProperty(this, kState, { value: s, writable: false, enumerable: false, configurable: false });
    const proxy = new Proxy(this, handler);
    proxies.set(this, proxy);
    return proxy;
  }

  /** https://html.spec.whatwg.org/#dom-storage-length */
  get length(): number {
    return state(this).map.size;
  }

  /** https://html.spec.whatwg.org/#dom-storage-key */
  key(index: number): string | null {
    requireArgs(arguments.length, 1, "key");
    // WebIDL `unsigned long` conversion (https://webidl.spec.whatwg.org/#es-unsigned-long).
    const i = Number(index) >>> 0;
    const map = state(this).map;
    if (i >= map.size) return null;
    let n = 0;
    for (const k of map.keys()) if (n++ === i) return k;
    return null;
  }

  /** https://html.spec.whatwg.org/#dom-storage-getitem */
  getItem(key: string): string | null {
    requireArgs(arguments.length, 1, "getItem");
    return state(this).map.get(String(key)) ?? null;
  }

  /** https://html.spec.whatwg.org/#dom-storage-setitem */
  setItem(key: string, value: string): void {
    requireArgs(arguments.length, 2, "setItem");
    const s = state(this);
    const k = String(key);
    const v = String(value);
    const old = s.map.get(k);
    // Step 2: if the value is unchanged, return (no event).
    if (old === v) return;
    const newSize = s.size - (old === undefined ? 0 : k.length + old.length) + k.length + v.length;
    // Step 3: throw a QuotaExceededError when the bottle's quota would be exceeded
    // (https://webidl.spec.whatwg.org/#quotaexceedederror; quota and requested stay null).
    if (newSize > QUOTA) {
      const message = `Failed to execute 'setItem' on 'Storage': Setting the value of '${k}' exceeded the quota.`;
      const Quota = (globalThis as { QuotaExceededError?: new (message: string) => Error }).QuotaExceededError;
      throw Quota === undefined ? new DOMException(message, "QuotaExceededError") : new Quota(message);
    }
    s.map.set(k, v);
    s.size = newSize;
    broadcast(s, k, old ?? null, v);
  }

  /** https://html.spec.whatwg.org/#dom-storage-removeitem */
  removeItem(key: string): void {
    requireArgs(arguments.length, 1, "removeItem");
    const s = state(this);
    const k = String(key);
    const old = s.map.get(k);
    if (old === undefined) return;
    s.map.delete(k);
    s.size -= k.length + old.length;
    broadcast(s, k, old, null);
  }

  /** https://html.spec.whatwg.org/#dom-storage-clear */
  clear(): void {
    const s = state(this);
    if (s.map.size === 0) return;
    s.map.clear();
    s.size = 0;
    broadcast(s, null, null, null);
  }

  get [Symbol.toStringTag](): string {
    return "Storage";
  }
}

/** https://html.spec.whatwg.org/#navigable-top-level-traversable (of a window's browsing context) */
function topWindow(window: Window): Window {
  let w = window;
  while (w[$parentWindow] !== null) w = w[$parentWindow];
  return w;
}

/**
 * https://html.spec.whatwg.org/#concept-storage-broadcast
 *
 * Step 3: every other Window whose storage for `type` is the same storage map, i.e. the same
 * storage key (origin) in the same shed and, for session storage, the same top-level
 * traversable (https://html.spec.whatwg.org/#session-storage-holder). The event is queued as a
 * task on each of those windows (step 4, "queue a global task on the DOM manipulation task
 * source").
 */
function broadcast(s: StorageState, key: string | null, oldValue: string | null, newValue: string | null): void {
  const source = s.window;
  const shed = source._storageShed;
  if (shed.windows.size < 2) return;
  const origin = windowOrigin(source);
  const url = source[$url].href;
  const top = s.type === "session" ? topWindow(source) : null;
  for (const other of shed.windows) {
    if (other === source || other[$closed] || windowOrigin(other) !== origin) continue;
    if (top !== null && topWindow(other) !== top) continue;
    const local = s.type === "local";
    other._task(() => {
      const StorageEvent = eventInterface("StorageEvent");
      const storageArea = local ? other.localStorage : other.sessionStorage;
      other.dispatchEvent(new StorageEvent("storage", { key, oldValue, newValue, url, storageArea }) as never);
    }, 0);
  }
}

/** @internal Create a window's localStorage (area shared per origin within the shed). */
export function createLocalStorage(window: Window): Storage {
  const shed = window._storageShed;
  const origin = windowOrigin(window);
  let area = shed.areas.get(origin);
  if (area === undefined) shed.areas.set(origin, (area = new Map()));
  return new Storage(kConstruct, window, "local", area);
}

/** top-level window → origin → session storage area (https://html.spec.whatwg.org/#session-storage-holder) */
const sessionAreas = new WeakMap<Window, Map<string, Map<string, string>>>();

/** @internal Create a window's sessionStorage: shared with same-origin frames of its top-level window. */
export function createSessionStorage(window: Window): Storage {
  const top = topWindow(window);
  let byOrigin = sessionAreas.get(top);
  if (byOrigin === undefined) sessionAreas.set(top, (byOrigin = new Map()));
  const origin = windowOrigin(window);
  let area = byOrigin.get(origin);
  if (area === undefined) byOrigin.set(origin, (area = new Map()));
  return new Storage(kConstruct, window, "session", area);
}
