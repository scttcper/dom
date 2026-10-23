// Differential harness for the Sentry downstream repros: the same scenario on a jsdom window
// (the oracle Sentry's suite was written against) and on an @rtd/dom window. jsdom comes from
// packages/react's devDependencies. Same shape as downstream/base-ui/repros/engines.ts.
import { createRequire } from "node:module";
import { describe } from "vitest";
import { createWindow, installGlobals } from "../../../packages/dom/src/index.ts";

const require = createRequire(new URL("../../../packages/react/package.json", import.meta.url));
const { JSDOM } = require("jsdom") as { JSDOM: new (html: string, options?: object) => { window: any } };

export type AnyWindow = any;
export type Engine = "jsdom" | "rtd";

export const engines: Record<Engine, () => AnyWindow> = {
  // Sentry's environment (@jest/environment-jsdom-abstract) uses pretendToBeVisual.
  jsdom: () => new JSDOM("<!doctype html><html><head></head><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true }).window,
  rtd: () => createWindow({ url: "http://localhost/" }),
};

/** describe.each over both engines; `fn` receives a fresh-window factory. */
export function differential(title: string, fn: (make: () => AnyWindow, engine: Engine) => void): void {
  describe.each(["jsdom", "rtd"] as const)(`${title} [%s]`, (engine) => fn(engines[engine], engine));
}

/** Install a window as globals for scenarios that need global `window`/`document`. */
export async function withGlobals<T>(window: AnyWindow, engine: Engine, body: () => T | Promise<T>): Promise<T> {
  if (engine === "rtd") {
    const uninstall = installGlobals(window, globalThis as never);
    try {
      return await body();
    } finally {
      uninstall();
    }
  }
  const keys = ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Event", "getComputedStyle"];
  const saved = keys.map((k) => Object.getOwnPropertyDescriptor(globalThis, k));
  for (const k of keys) Object.defineProperty(globalThis, k, { value: k === "window" ? window : window[k], configurable: true, writable: true });
  try {
    return await body();
  } finally {
    keys.forEach((k, i) => (saved[i] ? Object.defineProperty(globalThis, k, saved[i]!) : delete (globalThis as any)[k]));
  }
}

export const requireFromReact = require;
