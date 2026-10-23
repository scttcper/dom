// Install a Window as the host global (what test environments do), and undo it.
//
// Model (same as Vitest's jsdom/happy-dom environments): the host global *becomes* the window
// — `window`, `self`, `top`, `parent` and `frames` are the host global itself — and every
// window member is defined on it:
//
//   - interface objects (Node, HTMLElement, Event, ...) as plain data properties, replacing
//     Node's own DOM-ish ones (Event, EventTarget, CustomEvent, MessageEvent, navigator,
//     FormData, ...) while installed. Node's DOMException, timers, URL, fetch, Blob,
//     TextEncoder, streams, crypto, performance, structuredClone ... are kept;
//   - window methods (addEventListener, requestAnimationFrame, matchMedia, ...) as data
//     properties holding functions bound to the window — plain data properties, so
//     @sinonjs/fake-timers (Vitest/Jest fake timers) can replace and restore them;
//   - window attributes (location, innerWidth, localStorage, onresize, ...) as accessors that
//     forward to the window, so `window.innerWidth = 500` reaches matchMedia. Read-only ones
//     are [Replaceable]-style: assigning shadows them with a data property.
//
// `document` is a data property (fast global reads). `document.defaultView` is redirected to
// the host global while installed so `el.ownerDocument.defaultView === window` holds.
//
// Everything defined is recorded with the previous descriptor (never invoking Node's lazy
// getters such as `localStorage`/`navigator`) and restored by `uninstall()`.

import { recordHostOriginal } from "./host-originals.ts";
import { Window, windowInterfaces, HOST_DELEGATES } from "./Window.ts";
import { currentWindowOrNull, setCurrentWindow } from "./current.ts";

const SELF_REFERENCES = ["window", "self", "frames", "parent", "top"];

// Methods installed bound to the window.
const METHODS = [
  "addEventListener",
  "removeEventListener",
  "dispatchEvent",
  "getComputedStyle",
  "matchMedia",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "requestIdleCallback",
  "cancelIdleCallback",
  "getSelection",
  "scroll",
  "scrollTo",
  "scrollBy",
  "resizeTo",
  "resizeBy",
  "moveTo",
  "moveBy",
  "alert",
  "confirm",
  "prompt",
  "print",
  "open",
  "close",
  "stop",
  "focus",
  "blur",
  "postMessage",
  "reportError",
  "captureEvents",
  "releaseEvents",
];

const HOST = new Set<string>(HOST_DELEGATES);

let attributeKeys: string[] | null = null;

/** Window attributes (accessors on Window.prototype that are not methods or interface objects). */
function windowAttributes(): string[] {
  if (attributeKeys !== null) return attributeKeys;
  const interfaces = windowInterfaces();
  const skip = new Set<string>([...SELF_REFERENCES, ...METHODS, "document", "constructor"]);
  const keys: string[] = [];
  for (let proto: object | null = Window.prototype; proto !== null && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
    for (const key of Object.getOwnPropertyNames(proto)) {
      if (skip.has(key) || HOST.has(key) || key in interfaces || key.startsWith("_")) continue;
      const desc = Object.getOwnPropertyDescriptor(proto, key)!;
      if (desc.get === undefined) continue;
      skip.add(key);
      keys.push(key);
    }
  }
  // Plain per-window fields that are part of the Window interface.
  keys.push("name", "status", "opener");
  return (attributeKeys = keys);
}

function hasSetter(window: Window, key: string): boolean {
  for (let o: object | null = window; o !== null; o = Object.getPrototypeOf(o)) {
    const d = Object.getOwnPropertyDescriptor(o, key);
    if (d !== undefined) return d.set !== undefined || d.writable === true;
  }
  return false;
}

/**
 * Make `window` the host global. Returns `uninstall()`, which restores every property it
 * replaced (and the previously current window).
 */
export function installGlobals(window: Window, target: Record<PropertyKey, unknown> = globalThis as never): () => void {
  const saved = new Map<string, PropertyDescriptor | undefined>();
  const previousWindow = currentWindowOrNull();

  const define = (key: string, descriptor: PropertyDescriptor): void => {
    const existing = Object.getOwnPropertyDescriptor(target, key);
    if (existing !== undefined && !existing.configurable) return;
    if (!saved.has(key)) saved.set(key, existing);
    if (existing !== undefined && "value" in existing && target === (globalThis as never)) recordHostOriginal(key, existing.value);
    Object.defineProperty(target, key, descriptor);
  };

  for (const key of SELF_REFERENCES) define(key, { value: target, writable: true, enumerable: true, configurable: true });

  define("document", { value: window.document, writable: true, enumerable: true, configurable: true });

  const interfaces = windowInterfaces();
  for (const name in interfaces) {
    define(name, { value: interfaces[name], writable: true, enumerable: false, configurable: true });
  }

  const w = window as unknown as Record<string, (...args: unknown[]) => unknown>;
  for (const key of METHODS) {
    define(key, { value: w[key].bind(window), writable: true, enumerable: true, configurable: true });
  }

  const attributes = windowAttributes();
  // Opt-in own accessors (createWindow({ visualViewport: true })).
  const keys = Object.hasOwn(window, "visualViewport") ? [...attributes, "visualViewport"] : attributes;
  for (const key of keys) {
    const forwardSet = hasSetter(window, key);
    define(key, {
      get() {
        return (window as unknown as Record<string, unknown>)[key];
      },
      set: forwardSet
        ? (value: unknown) => {
            (window as unknown as Record<string, unknown>)[key] = value;
          }
        : (value: unknown) => {
            Object.defineProperty(target, key, { value, writable: true, enumerable: true, configurable: true });
          },
      enumerable: true,
      configurable: true,
    });
  }

  // https://html.spec.whatwg.org/#dom-document-defaultview — the WindowProxy is the host global.
  const doc = window.document;
  Object.defineProperty(doc, "defaultView", { get: () => target, enumerable: true, configurable: true });

  setCurrentWindow(window);
  const previousHost = window._host;
  window._host = target as unknown as typeof globalThis;
  const previousGlobal = window._globalObject;
  window._globalObject = target as unknown as Window;

  let installed = true;
  return function uninstall(): void {
    if (!installed) return;
    installed = false;
    delete (doc as unknown as Record<string, unknown>).defaultView;
    for (const [key, descriptor] of saved) {
      if (descriptor === undefined) delete target[key];
      else Object.defineProperty(target, key, descriptor);
    }
    saved.clear();
    window._host = previousHost;
    window._globalObject = previousGlobal;
    if (currentWindowOrNull() === window) setCurrentWindow(previousWindow);
  };
}
