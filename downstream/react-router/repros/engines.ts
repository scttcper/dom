// Copied from downstream/radix/repros/engines.ts (kept independent of the other runners).
// Differential harness for downstream repros: the same scenario on a jsdom window (oracle) and
// on an @ctrl/dom window. jsdom comes from packages/react's devDependencies.
import { createRequire } from "node:module";
import { describe } from "vitest";
import { createWindow, installGlobals } from "../../../packages/dom/src/index.ts";

const require = createRequire(new URL("../../../packages/react/package.json", import.meta.url));
const { JSDOM } = require("jsdom") as { JSDOM: new (html: string, options?: object) => { window: any } };

export type AnyWindow = any;

export const engines: Record<"jsdom" | "ctrl-dom", () => AnyWindow> = {
  jsdom: () =>
    new JSDOM("<!doctype html><html><head></head><body></body></html>", {
      url: "http://localhost/",
      pretendToBeVisual: true,
    }).window,
  "ctrl-dom": () => createWindow({ url: "http://localhost/" }),
};

/** describe.each over both engines; `fn` receives a fresh window per call to make(). */
export function differential(title: string, fn: (make: () => AnyWindow, engine: "jsdom" | "ctrl-dom") => void): void {
  describe.each(["jsdom", "ctrl-dom"] as const)(`${title} [%s]`, (engine) => fn(engines[engine], engine));
}

/** Install a window as globals for scenarios that need global `window`/`document` (React). */
export function withGlobals<T>(window: AnyWindow, engine: "jsdom" | "ctrl-dom", body: () => T): T {
  if (engine === "ctrl-dom") {
    const uninstall = installGlobals(window, globalThis as never);
    try {
      return body();
    } finally {
      uninstall();
    }
  }
  const keys = ["window", "document", "navigator", "HTMLElement", "Node", "Event", "HTMLIFrameElement"];
  const saved = keys.map((k) => Object.getOwnPropertyDescriptor(globalThis, k));
  for (const k of keys)
    Object.defineProperty(globalThis, k, {
      value: k === "window" ? window : window[k],
      configurable: true,
      writable: true,
    });
  try {
    return body();
  } finally {
    keys.forEach((k, i) =>
      saved[i] ? Object.defineProperty(globalThis, k, saved[i]!) : delete (globalThis as any)[k],
    );
  }
}

export const requireFromReact = require;
