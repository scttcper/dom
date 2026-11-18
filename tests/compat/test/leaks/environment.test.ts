/**
 * Environment setup/teardown cycles in one process: windows, documents and rendered nodes are
 * collectable after teardown, globals are restored, and heap-after-GC returns to baseline.
 *
 * Specs: ECMAScript WeakRef liveness (https://tc39.es/ecma262/#sec-weak-ref-objects).
 * Vitest Environment interface (vitest/runtime `Environment`: setup → { teardown }); Jest
 * environments (constructor → setup → teardown, https://jestjs.io/docs/configuration#testenvironment-string).
 * HTML window.close() (https://html.spec.whatwg.org/#dom-window-close).
 */
import { describe, expect, test, vi } from "vitest";
import { AsyncLocalStorage } from "node:async_hooks";
import { installClock, VirtualClock } from "@ctrl/dom/internal";
import { createRequire } from "node:module";
import { runInContext } from "node:vm";
import environment from "@ctrl/dom/vitest-environment";
import { createWindow, currentWindowOrNull, installGlobals } from "@ctrl/dom";
import { collectGarbage, Tracker, heapSlope } from "./gc.ts";

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

describe("virtual timer handles", () => {
  test.each(["clear", "clearAll", "dispose"] as const)(
    "a handle releases its callback, arguments, context and clock after %s",
    async (method) => {
      const tracker = new Tracker();
      const store = new AsyncLocalStorage<object>();
      const handle = (() => {
        const clock = tracker.track("clock", new VirtualClock());
        const callback = tracker.track("callback", () => {});
        const argument = tracker.track("argument", {});
        const context = tracker.track("async context", {});
        const timer = store.run(context, () => clock.schedule(callback, 60_000, [argument], false));
        if (method === "clear") clock.clear(Number(timer));
        else clock[method]();
        return timer;
      })();
      expect(await tracker.alive()).toEqual({});
      expect(handle._destroyed).toBe(true);
      expect(handle.refresh().unref().hasRef()).toBe(false);
      expect(handle.ref().hasRef()).toBe(true);
      store.disable();
    },
  );
  test.each(["clearAll", "dispose"] as const)(
    "a completed timer releases its callback and context at %s",
    async (method) => {
      const tracker = new Tracker();
      const store = new AsyncLocalStorage<object>();
      const handle = await (async () => {
        const clock = tracker.track("clock", new VirtualClock());
        const context = tracker.track("async context", {});
        const { promise, resolve } = Promise.withResolvers<void>();
        const callback = tracker.track("callback", () => resolve());
        const timer = store.run(context, () => clock.schedule(callback, 1, [], false));
        await promise;
        clock[method]();
        return timer;
      })();
      expect(await tracker.alive()).toEqual({});
      expect(handle.refresh()._destroyed).toBe(true);
      store.disable();
    },
  );
});

describe("timers on an open window", () => {
  test("closing a window cancels a pending fake timer after the caller drops its handle and GC runs", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const w = createWindow();
    try {
      const callback = vi.fn();
      w.setTimeout(callback, 60_000);
      await collectGarbage();
      expect(vi.getTimerCount()).toBe(1);
      w.close();
      expect(vi.getTimerCount()).toBe(0);
      vi.advanceTimersByTime(60_000);
      expect(callback).not.toHaveBeenCalled();
    } finally {
      w.close();
      vi.useRealTimers();
    }
  });

  test.each(["native", "virtual", "fake"] as const)(
    "discarded %s timers release their handles, callbacks and arguments",
    async (kind) => {
      const w = createWindow();
      const host: AnyGlobal = { setTimeout, clearTimeout, setInterval, clearInterval };
      const uninstall = kind === "virtual" ? installGlobals(w, host) : undefined;
      const installed = kind === "virtual" ? installClock(new VirtualClock(), host) : undefined;
      if (kind === "fake") vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
      try {
        const tracker = new Tracker();
        const timers = w as unknown as AnyGlobal;
        const { promise, resolve } = Promise.withResolvers<void>();
        (() => {
          const argument = tracker.track("fired argument", {});
          const fired = tracker.track("fired callback", (value: object) => {
            expect(value).toBe(argument);
            resolve();
          });
          tracker.track("fired handle", timers.setTimeout(fired, 1, argument));
          const canceled = tracker.track("cleared callback", () => {});
          const handle = tracker.track(
            "cleared handle",
            timers.setInterval(canceled, 60_000, tracker.track("cleared argument", {})),
          );
          timers.clearInterval(handle);
        })();
        if (kind === "fake") vi.advanceTimersByTime(1);
        await promise;
        expect(await tracker.alive()).toEqual({});
      } finally {
        w.close();
        installed?.uninstall();
        uninstall?.();
        if (kind === "fake") vi.useRealTimers();
      }
    },
  );
});

describe("@ctrl/dom/vitest-environment setup/teardown ×N", () => {
  test("every window, document and node is collectable after teardown; no current window remains", async () => {
    const tracker = new Tracker();
    // Each cycle in its own async function: a suspended async frame keeps its locals.
    const cycle = async () => {
      const global: AnyGlobal = { setTimeout, clearTimeout };
      const env = await environment.setup(global, { "ctrl-dom": { compat: "modern" } });
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
        const env = await environment.setup(global, { "ctrl-dom": { compat: "modern" } });
        useDocument(global, null);
        await env.teardown(global);
      },
      { warmup: 600, samples: 6, every: 80 },
    );
    if (process.env.LEAK_DEBUG)
      console.log(points.map(([x, y]) => `${x}:${(y / 1024).toFixed(0)}K`).join(" "), bytesPerCycle);
    expect(bytesPerCycle).toBeLessThan(512);
  });
});

describe("installGlobals / uninstall ×N on the real global", () => {
  test("restores every global descriptor and retains no window", async () => {
    const g = globalThis as AnyGlobal;
    // Node defines undici's dispatcher symbols when undici first loads (installGlobals reads the
    // lazy FormData/MessageEvent descriptors): host state, not ours.
    const ownKeys = () =>
      Reflect.ownKeys(globalThis).filter((k) => typeof k === "string" || !String(k.description).startsWith("undici."));
    const keys = ownKeys();
    const before = new Map(keys.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
    const tracker = new Tracker();
    const cycle = () => {
      const w = createWindow({ compat: "modern" });
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
      expect({
        key: String(k),
        same: Object.is(now?.value, d?.value) && now?.get === d?.get && now?.set === d?.set,
      }).toEqual({ key: String(k), same: true });
    }
    expect(await tracker.alive()).toEqual({});
  });
});

describe("@ctrl/dom-jest-environment constructor/setup/teardown ×N", () => {
  test("windows and documents are collectable after teardown", async () => {
    const require = createRequire(new URL("../../../../packages/jest-environment/package.json", import.meta.url));
    let CtrlDomEnvironment: any;
    try {
      CtrlDomEnvironment = (await import("../../../../packages/jest-environment/src/index.ts")).default;
      require.resolve("jest-environment-node");
    } catch {
      return; // @ctrl/dom-jest-environment's dependencies are not installed
    }
    const tracker = new Tracker();
    const cycle = async () => {
      const env = new CtrlDomEnvironment(
        {
          globalConfig: {},
          projectConfig: {
            testEnvironmentOptions: { compat: "modern" },
            globals: {},
            fakeTimers: {},
            testPath: "x.test.js",
          },
        },
        { console, docblockPragmas: {}, testPath: "x.test.js" },
      );
      await env.setup();
      tracker.track("window", env.ctrlDomWindow);
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
    let CtrlDomEnvironment: any;
    try {
      CtrlDomEnvironment = (await import("../../../../packages/jest-environment/src/index.ts")).default;
    } catch {
      return; // @ctrl/dom-jest-environment's dependencies are not installed
    }
    const tracker = new Tracker();
    const cycle = async () => {
      const env = new CtrlDomEnvironment(
        {
          globalConfig: {},
          projectConfig: {
            testEnvironmentOptions: { compat: "modern" },
            globals: {},
            fakeTimers: {},
            testPath: "x.test.js",
          },
        },
        { console, docblockPragmas: {}, testPath: "x.test.js" },
      );
      await env.setup();
      const global = env.global;
      tracker.track("window", env.ctrlDomWindow);
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

  // Each of these kept a finished test file's realm (its global, window, document and module
  // graph) alive in the worker: the CSS cascade's ancestor filter remembered the last element it
  // was built for, the getComputedStyle override memo held the replaced function (Sentry's setup
  // installs one) and its bound copy, and V8's cached Object.create map for the prototype of
  // Jest's module objects (the outer realm's Object.prototype, which bundlers' CommonJS interop
  // passes to Object.create) belonged to the first file that made one, so every later file's
  // objects kept that first realm alive.
  test("module state and V8's shared Object.create maps do not keep a finished file's realm alive", async () => {
    let CtrlDomEnvironment: any;
    try {
      CtrlDomEnvironment = (await import("../../../../packages/jest-environment/src/index.ts")).default;
    } catch {
      return; // @ctrl/dom-jest-environment's dependencies are not installed
    }
    const { getComputedStyleOverride, $impl } = await import("@ctrl/dom/internal");
    const tracker = new Tracker();
    // Like the next file's interop namespaces: alive after every realm is torn down.
    let live: unknown = null;
    const cycle = async () => {
      const env = new CtrlDomEnvironment(
        {
          globalConfig: {},
          projectConfig: {
            testEnvironmentOptions: { compat: "modern" },
            globals: {},
            fakeTimers: {},
            testPath: "x.test.js",
          },
        },
        { console, docblockPragmas: {}, testPath: "x.test.js" },
      );
      await env.setup();
      const global = env.global;
      tracker.track("global", global);
      tracker.track("window", env.ctrlDomWindow);
      global.outerPrototype = Object.prototype;
      live = runInContext(
        `const style = document.createElement("style");
        style.textContent = "div .a { color: red } div .b { color: blue } div .c { color: green }";
        document.head.append(style);
        const div = document.createElement("div");
        div.innerHTML = '<p class="a b c">x</p>';
        document.body.append(div);
        getComputedStyle(div.firstChild).color;
        window.getComputedStyle = (element) => element.style;
        Object.create(outerPrototype);`,
        env.getVmContext(),
      );
      getComputedStyleOverride(global.document.body[$impl]);
      await env.teardown();
    };
    for (let i = 0; i < 4; i++) await cycle();
    expect(await tracker.alive()).toEqual({});
    expect(live).not.toBeNull();
  });
});

describe("@ctrl/dom/vitest-environment setupVM/teardown ×N (VM pools)", () => {
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
