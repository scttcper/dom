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
//
// Reading the descriptors of Node's lazy undici globals we replace (FormData, MessageEvent,
// CloseEvent, ErrorEvent) loads undici (~10 ms) and is deliberate, not just needed to restore
// them: undici's classes are evaluated against the *current* global `Event`/`EventTarget`
// (`class MessageEvent extends Event` in Node's bundle). Deferred until after our Event is
// installed, the first fetch()/Response/WebSocket use in a test would make Node's MessageEvent,
// CloseEvent, ErrorEvent, WebSocket and EventSource extend @ctrl/dom's classes for the rest of the
// process. (FormData/MessageEvent/CloseEvent could be re-fetched synchronously at uninstall via
// node:http and Response#formData; ErrorEvent has no synchronous public path.)

import { installedWindowMethods, recordHostOriginal } from "./host-originals.ts";
import { Window, windowInterfaces, HOST_DELEGATES, installedWindows } from "./Window.ts";
import { currentWindowOrNull, setCurrentWindow } from "./current.ts";
import { $globalObject, $host, $options } from "../keys.ts";
import { hiddenGlobals, installCompatMembers } from "./compat.ts";
import { optInInterfaces } from "./interfaces.ts";

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
  for (
    let proto: object | null = Window.prototype;
    proto !== null && proto !== Object.prototype;
    proto = Object.getPrototypeOf(proto)
  ) {
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
 * Make `window` the host global, exposing what its compat profile allows (window/compat.ts).
 * Returns `uninstall()`, which restores every property it replaced, the shared prototypes'
 * profile-gated members and the previously current window.
 */
export function installGlobals(window: Window, target: Record<PropertyKey, unknown> = globalThis as never): () => void {
  const saved = new Map<string, PropertyDescriptor | undefined>();
  const previousWindow = currentWindowOrNull();

  const define = (key: string, descriptor: PropertyDescriptor): void => {
    const existing = Object.getOwnPropertyDescriptor(target, key);
    if (existing !== undefined && !existing.configurable) return;
    if (!saved.has(key)) saved.set(key, existing);
    if (existing !== undefined && "value" in existing && target === (globalThis as never))
      recordHostOriginal(key, existing.value);
    Object.defineProperty(target, key, descriptor);
  };

  for (const key of SELF_REFERENCES)
    define(key, { value: target, writable: true, enumerable: true, configurable: true });

  define("document", { value: window.document, writable: true, enumerable: true, configurable: true });

  const profile = window[$options].compat;
  const hidden = hiddenGlobals(profile);
  const interfaces = windowInterfaces();
  for (const name in interfaces) {
    if (hidden.has(name)) continue;
    define(name, { value: interfaces[name], writable: true, enumerable: false, configurable: true });
  }
  const optIn = optInInterfaces();
  for (const name in optIn) {
    if (hidden.has(name)) continue;
    define(name, { value: optIn[name], writable: true, enumerable: false, configurable: true });
  }
  const restoreMembers = installCompatMembers(profile, interfaces);

  const w = window as unknown as Record<string, (...args: unknown[]) => unknown>;
  for (const key of METHODS) {
    if (hidden.has(key)) continue;
    const bound = w[key].bind(window);
    installedWindowMethods.add(bound);
    define(key, { value: bound, writable: true, enumerable: true, configurable: true });
  }

  const attributes = windowAttributes();
  // Opt-in own accessors (createWindow({ visualViewport: true })).
  const keys = Object.hasOwn(window, "visualViewport") ? [...attributes, "visualViewport"] : attributes;
  for (const key of keys) {
    // An own accessor (createWindow({ visualViewport: true })) was asked for explicitly.
    if (hidden.has(key) && !Object.hasOwn(window, key)) continue;
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
  const previousHost = window[$host];
  window[$host] = target as unknown as typeof globalThis;
  const previousGlobal = window[$globalObject];
  window[$globalObject] = target as unknown as Window;
  // Window.prototype operations called with the host global as `this` act on this window.
  const previousInstalled = installedWindows.get(target);
  installedWindows.set(target, window);

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
    restoreMembers();
    window[$host] = previousHost;
    window[$globalObject] = previousGlobal;
    if (installedWindows.get(target) === window) {
      if (previousInstalled === undefined) installedWindows.delete(target);
      else installedWindows.set(target, previousInstalled);
    }
    if (currentWindowOrNull() === window) setCurrentWindow(previousWindow);
  };
}
