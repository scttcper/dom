// Interface objects exposed on every Window.
// https://webidl.spec.whatwg.org/#es-interfaces ("interface objects" live on the global)
//
// Every area appends its public classes to `src/index.ts`; this module turns that namespace
// into the window's interface objects, so nothing has to be registered twice. Interface
// objects are shared, module-level classes (docs/deviations.md): they are installed once on
// `Window.prototype` the first time a window is created, never per window.
//
// This module must stay a leaf (no value imports): window, html and events modules import it
// while the node modules are still initializing. `src/index.ts` registers its own namespace
// here at the end of its evaluation (`registerDomNamespace`); it is only read lazily.

let dom: Record<string, unknown> = Object.create(null);

/** Called once by src/index.ts with its module namespace. */
export function registerDomNamespace(namespace: object): void {
  dom = namespace as Record<string, unknown>;
}

/** name → interface object (or namespace object such as CSS). */
export type InterfaceMap = Record<string, unknown>;

let interfaces: InterfaceMap | null = null;

function isInterfaceName(name: string): boolean {
  const c = name.charCodeAt(0);
  return c >= 65 && c <= 90;
}

/**
 * Collect the interface objects (once per process) and install them on `proto`
 * (Window.prototype). `fallbacks` fill in interfaces no area exports (yet). Returns the map
 * that `installGlobals` exposes on the host global.
 */
/**
 * Exported from @ctrl/dom but not on Window.prototype: installGlobals defines them on the global
 * only for compat profiles that expose them (window/compat.ts: ResizeObserver is "modern" only).
 */
const NOT_ON_WINDOW = new Set(["ResizeObserver"]);

/** The NOT_ON_WINDOW interface objects, for installGlobals. */
export function optInInterfaces(): InterfaceMap {
  const map: InterfaceMap = Object.create(null);
  for (const name of NOT_ON_WINDOW) if (dom[name] !== undefined) map[name] = dom[name];
  return map;
}

export function ensureInterfaces(proto: object, fallbacks: InterfaceMap = {}): InterfaceMap {
  if (interfaces !== null) return interfaces;
  const map: InterfaceMap = Object.create(null);
  const ns = dom;
  for (const name of Object.keys(ns)) {
    if (!isInterfaceName(name) || NOT_ON_WINDOW.has(name)) continue;
    const value = ns[name];
    // Interface objects (classes), namespace objects (CSS) and legacy callback interface
    // objects (NodeFilter, https://webidl.spec.whatwg.org/#legacy-callback-interface-object).
    if (typeof value === "function" || (typeof value === "object" && value !== null)) map[name] = value;
  }
  for (const name of Object.keys(fallbacks)) {
    if (!(name in map)) map[name] = fallbacks[name];
  }
  const descriptors: PropertyDescriptorMap = {};
  for (const name of Object.keys(map)) {
    if (Object.hasOwn(proto, name)) continue;
    descriptors[name] = { value: map[name], writable: true, configurable: true, enumerable: false };
  }
  // Startup: defining ~300 properties on a prototype already in use costs ~1 ms (every addition
  // to a prototype map invalidates prototype-chain validity cells); on a fresh object spliced
  // into the chain right below `proto` it costs ~0.2 ms. Lookups through `window.X` see the
  // same values; own members of `proto` still shadow them.
  const holder = Object.create(Object.getPrototypeOf(proto));
  Object.defineProperties(holder, descriptors);
  Object.setPrototypeOf(proto, holder);
  interfaces = map;
  return map;
}

type EventConstructor = new (type: string, init?: Record<string, unknown>) => import("../events/Event.ts").Event;

/** An Event subclass exported by `@ctrl/dom` (events area), looked up lazily. */
export function eventInterface(name: string): EventConstructor {
  return dom[name] as EventConstructor;
}

/** Look up an optional public export of `@ctrl/dom` by name (lazy: areas land in parallel). */
export function domExport<T = unknown>(name: string): T | undefined {
  return dom[name] as T | undefined;
}
