/**
 * Environment setup/teardown cycles in one process: windows, documents and rendered nodes are
 * collectable after teardown, globals are restored, and heap-after-GC returns to baseline.
 *
 * Specs: ECMAScript WeakRef liveness (https://tc39.es/ecma262/#sec-weak-ref-objects).
 * Vitest Environment interface (vitest/runtime `Environment`: setup → { teardown }); Jest
 * environments (constructor → setup → teardown, https://jestjs.io/docs/configuration#testenvironment-string).
 * HTML window.close() (https://html.spec.whatwg.org/#dom-window-close).
 */
import { describe, expect, test } from "vitest";
import { createRequire } from "node:module";
import environment from "vitest-environment-rtd";
import { createWindow, currentWindowOrNull, installGlobals } from "@rtd/dom";
import { Tracker, heapSlope } from "./gc.ts";

type AnyGlobal = Record<string, any>;

function useDocument(global: AnyGlobal, tracker: Tracker | null): void {
  const d = global.document;
  tracker?.track("document", d);
  const div = d.createElement("div");
  div.innerHTML = "<button>b</button><input>";
  d.body.append(div);
  tracker?.track("element", div);
  div.querySelector("input").focus();
  global.addEventListener("resize", () => {});
  global.requestAnimationFrame(() => {});
  global.matchMedia("(min-width: 1px)").addEventListener("change", () => {});
}

describe("vitest-environment-rtd setup/teardown ×N", () => {
  test("every window, document and node is collectable after teardown; no current window remains", async () => {
    const tracker = new Tracker();
    // Each cycle in its own async function: a suspended async frame keeps its locals.
    const cycle = async () => {
      const global: AnyGlobal = { setTimeout, clearTimeout };
      const env = await environment.setup(global, { rtd: { matchMedia: true } });
      useDocument(global, tracker);
      await env.teardown(global);
      expect(global.document).toBeUndefined();
    };
    for (let i = 0; i < 6; i++) await cycle();
    expect(currentWindowOrNull()).toBeNull();
    expect(await tracker.alive()).toEqual({});
  });

  test("heap-after-GC is flat across setup/teardown cycles", async () => {
    const { bytesPerCycle, points } = await heapSlope(
      async () => {
        const global: AnyGlobal = { setTimeout, clearTimeout };
        const env = await environment.setup(global, { rtd: { matchMedia: true } });
        useDocument(global, null);
        await env.teardown(global);
      },
      { warmup: 600, samples: 6, every: 80 },
    );
    if (process.env.LEAK_DEBUG) console.log(points.map(([x, y]) => `${x}:${(y / 1024).toFixed(0)}K`).join(" "), bytesPerCycle);
    expect(bytesPerCycle).toBeLessThan(512);
  });
});

describe("installGlobals / uninstall ×N on the real global", () => {
  test("restores every global descriptor and retains no window", async () => {
    const g = globalThis as AnyGlobal;
    // Node defines undici's dispatcher symbols when undici first loads (installGlobals reads the
    // lazy FormData/MessageEvent descriptors): host state, not ours.
    const ownKeys = () => Reflect.ownKeys(globalThis).filter((k) => typeof k === "string" || !String(k.description).startsWith("undici."));
    const keys = ownKeys();
    const before = new Map(keys.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
    const tracker = new Tracker();
    const cycle = () => {
      const w = createWindow();
      tracker.track("window", w);
      const uninstall = installGlobals(w);
      useDocument(g, tracker);
      w.close();
      uninstall();
    };
    for (let i = 0; i < 6; i++) cycle();
    expect(ownKeys()).toEqual(keys);
    for (const [k, d] of before) {
      const now = Object.getOwnPropertyDescriptor(globalThis, k);
      expect({ key: String(k), same: Object.is(now?.value, d?.value) && now?.get === d?.get && now?.set === d?.set }).toEqual({ key: String(k), same: true });
    }
    expect(await tracker.alive()).toEqual({});
  });
});

describe("jest-environment-rtd constructor/setup/teardown ×N", () => {
  test("windows and documents are collectable after teardown", async () => {
    const require = createRequire(new URL("../../../../packages/jest-environment/package.json", import.meta.url));
    let RtdEnvironment: any;
    try {
      RtdEnvironment = (await import("../../../../packages/jest-environment/src/index.ts")).default;
      require.resolve("jest-environment-node");
    } catch {
      return; // jest-environment-rtd's dependencies are not installed
    }
    const tracker = new Tracker();
    const cycle = async () => {
      const env = new RtdEnvironment(
        { globalConfig: {}, projectConfig: { testEnvironmentOptions: { matchMedia: true }, globals: {}, fakeTimers: {}, testPath: "x.test.js" } },
        { console, docblockPragmas: {}, testPath: "x.test.js" },
      );
      await env.setup();
      tracker.track("window", env.rtdWindow);
      useDocument(env.global, tracker);
      await env.teardown();
    };
    for (let i = 0; i < 4; i++) await cycle();
    expect(await tracker.alive()).toEqual({});
  });

  // jsdom's window.close() (called by jest-environment-jsdom's teardown) clears the window's
  // timers (https://html.spec.whatwg.org/#close-a-browsing-context). Long app timers left
  // behind (TanStack Query's 5 min cache GC, polling intervals) must not keep a finished test
  // file's global, window and module graph alive (Sentry: 7.2 MiB retained per file before).
  test("timers a test file left pending do not retain its global, window or closures", async () => {
    let RtdEnvironment: any;
    try {
      RtdEnvironment = (await import("../../../../packages/jest-environment/src/index.ts")).default;
    } catch {
      return; // jest-environment-rtd's dependencies are not installed
    }
    const tracker = new Tracker();
    const cycle = async () => {
      const env = new RtdEnvironment(
        { globalConfig: {}, projectConfig: { testEnvironmentOptions: { matchMedia: true }, globals: {}, fakeTimers: {}, testPath: "x.test.js" } },
        { console, docblockPragmas: {}, testPath: "x.test.js" },
      );
      await env.setup();
      const global = env.global;
      tracker.track("window", env.rtdWindow);
      tracker.track("global", global);
      const moduleState = tracker.track("closure", { cache: new Array(1000).fill(global) });
      global.setTimeout(() => moduleState, 300_000);
      global.setInterval(() => moduleState, 60_000);
      global.window.setTimeout(() => moduleState, 300_000);
      global.requestAnimationFrame(() => moduleState);
      await env.teardown();
    };
    for (let i = 0; i < 4; i++) await cycle();
    expect(await tracker.alive()).toEqual({});
  });
});

describe("vitest-environment-rtd setupVM/teardown ×N (VM pools)", () => {
  test("timers a test file left pending do not retain its vm context or closures", async () => {
    const tracker = new Tracker();
    const cycle = async () => {
      const env = await environment.setupVM!({});
      const context = env.getVmContext() as AnyGlobal;
      tracker.track("context", context);
      const moduleState = tracker.track("closure", { context });
      context.setTimeout(() => moduleState, 300_000);
      context.setInterval(() => moduleState, 60_000);
      await env.teardown();
    };
    for (let i = 0; i < 4; i++) await cycle();
    expect(await tracker.alive()).toEqual({});
  });
});
