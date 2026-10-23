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
import { $closed, $url } from "../keys.ts";

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

const handler: ProxyHandler<Storage> = {
  get(target, key, receiver) {
    if (typeof key === "string" && !(key in target)) {
      return state(target).map.get(key);
    }
    return Reflect.get(target, key, receiver);
  },
  set(target, key, value) {
    if (typeof key === "string" && !(key in target)) {
      target.setItem(key, value);
      return true;
    }
    return Reflect.set(target, key, value);
  },
  has(target, key) {
    if (typeof key === "string" && state(target).map.has(key)) return true;
    return Reflect.has(target, key);
  },
  deleteProperty(target, key) {
    if (typeof key === "string" && !Object.hasOwn(target, key) && state(target).map.has(key)) {
      target.removeItem(key);
      return true;
    }
    return Reflect.deleteProperty(target, key);
  },
  ownKeys(target) {
    return [...state(target).map.keys(), ...Reflect.ownKeys(target)];
  },
  getOwnPropertyDescriptor(target, key) {
    if (typeof key === "string" && !(key in target)) {
      const value = state(target).map.get(key);
      if (value !== undefined) return { value, writable: true, enumerable: true, configurable: true };
    }
    return Reflect.getOwnPropertyDescriptor(target, key);
  },
  defineProperty(target, key, descriptor) {
    // Named setter (https://webidl.spec.whatwg.org/#legacy-platform-object-defineownproperty),
    // except that functions and accessors become real own properties so `vi.spyOn(localStorage,
    // "getItem")` works like it does on happy-dom.
    if (typeof key === "string" && !(key in target) && "value" in descriptor && typeof descriptor.value !== "function") {
      target.setItem(key, descriptor.value);
      return true;
    }
    return Reflect.defineProperty(target, key, descriptor);
  },
};

export class Storage {
  constructor(token?: symbol, window?: Window, type?: "local" | "session", map?: Map<string, string>) {
    if (token !== kConstruct) throw new TypeError("Illegal constructor");
    let size = 0;
    for (const [k, v] of map!) size += k.length + v.length;
    const s: StorageState = { map: map!, window: window!, type: type!, size };
    Object.defineProperty(this, kState, { value: s, writable: false, enumerable: false, configurable: false });
    return new Proxy(this, handler);
  }

  /** https://html.spec.whatwg.org/#dom-storage-length */
  get length(): number {
    return state(this).map.size;
  }

  /** https://html.spec.whatwg.org/#dom-storage-key */
  key(index: number): string | null {
    const i = Number(index) >>> 0;
    const map = state(this).map;
    if (i >= map.size) return null;
    let n = 0;
    for (const k of map.keys()) if (n++ === i) return k;
    return null;
  }

  /** https://html.spec.whatwg.org/#dom-storage-getitem */
  getItem(key: string): string | null {
    return state(this).map.get(String(key)) ?? null;
  }

  /** https://html.spec.whatwg.org/#dom-storage-setitem */
  setItem(key: string, value: string): void {
    const s = state(this);
    const k = String(key);
    const v = String(value);
    const old = s.map.get(k);
    // Step 2: if the value is unchanged, return (no event).
    if (old === v) return;
    const newSize = s.size - (old === undefined ? 0 : k.length + old.length) + k.length + v.length;
    // Step 3: QuotaExceededError when the bottle's quota would be exceeded.
    if (newSize > QUOTA) {
      throw new DOMException(`Failed to execute 'setItem' on 'Storage': Setting the value of '${k}' exceeded the quota.`, "QuotaExceededError");
    }
    s.map.set(k, v);
    s.size = newSize;
    broadcast(s, k, old ?? null, v);
  }

  /** https://html.spec.whatwg.org/#dom-storage-removeitem */
  removeItem(key: string): void {
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

/** https://html.spec.whatwg.org/#concept-storage-broadcast */
function broadcast(s: StorageState, key: string | null, oldValue: string | null, newValue: string | null): void {
  if (s.type !== "local") return; // session storage has no other documents to notify here
  const source = s.window;
  const origin = source[$url].origin;
  const url = source[$url].href;
  for (const other of source._storageShed.windows) {
    if (other === source || other[$closed] || other[$url].origin !== origin) continue;
    other._task(() => {
      const StorageEvent = eventInterface("StorageEvent");
      other.dispatchEvent(new StorageEvent("storage", { key, oldValue, newValue, url, storageArea: other.localStorage }) as never);
    }, 0);
  }
}

/** @internal Create a window's localStorage (area shared per origin within the shed). */
export function createLocalStorage(window: Window): Storage {
  const shed = window._storageShed;
  const origin = window[$url].origin;
  let area = shed.areas.get(origin);
  if (area === undefined) shed.areas.set(origin, (area = new Map()));
  return new Storage(kConstruct, window, "local", area);
}

/** @internal Create a window's sessionStorage. */
export function createSessionStorage(window: Window): Storage {
  return new Storage(kConstruct, window, "session", new Map());
}
