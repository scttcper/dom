// Global registration of an @rtd/dom window for test runners that have no DOM environment of
// their own (node:test, bun test), published as `@ctrl/dom/register/pure`. `@ctrl/dom/register`
// (src/index.ts) calls `register()` on import; this entry only exports the API. In the spirit of
// happy-dom's `@happy-dom/global-registrator`:
//
//   import { register, unregister } from "@ctrl/dom/register/pure";
//   const { window } = register({ url: "http://localhost:5173/" });
//   ...
//   unregister();
//
// Same defaults as vitest-environment-rtd (packages/vitest-environment/src/index.ts): the
// "jsdom-30" compat profile, http://localhost:3000/, timers/Date/performance on a skipping virtual
// clock, unhandled listener exceptions re-emitted as the process's "uncaughtException" (which
// node:test attributes to the running test), jsdom's "Not implemented" diagnostics on
// console.error, and the DOM modules published on the global for @ctrl/dom's bridges.

import { createRequire } from "node:module";
import * as dom from "@rtd/dom";
import * as internal from "@rtd/dom/internal";
import type { CompatProfile, Window, WindowOptions } from "@rtd/dom";

export interface RegisterOptions extends Omit<WindowOptions, "shareStorageWith"> {
  /**
   * APIs beyond jsdom's (@rtd/dom window/compat.ts): "jsdom-30" (default, as under the Vitest
   * environment), "jsdom-26" or "modern" (everything, including matchMedia and ResizeObserver).
   */
  compat?: CompatProfile;
  /**
   * Skip idle time (default true): timers live on a virtual clock that jumps to the next timer
   * whenever the event loop has nothing else to do. `false` keeps real-time timers. The
   * CTRL_DOM_TIME_SKIP environment variable ("0"/"1") overrides it.
   */
  timeSkip?: boolean;
  /**
   * Wire the running test runner up (default false here, true for `@ctrl/dom/register`):
   * - node:test: expose its hooks as the globals `beforeAll`, `afterAll`, `beforeEach` and
   *   `afterEach` (only those not already defined), the way Jest, Vitest's `globals` and bun test
   *   do, so Testing Library's React `render` registers its automatic `cleanup()` and act
   *   environment; and close the window (dropping pending timers) after the last test.
   * - bun test (its hooks are already global): close the window after the last test.
   * Elsewhere it does nothing.
   */
  testHooks?: boolean;
}

export interface Registration {
  /** The installed window (also `globalThis.window`). */
  readonly window: Window;
  /** Same as the module's `unregister()` while this registration is the current one. */
  unregister(): void;
}

/** Same default URL as Vitest's jsdom, happy-dom and ctrl-dom environments. */
const DEFAULT_URL = "http://localhost:3000/";

/** The key @ctrl/dom's bridges read (shared with both environments). */
const DOM_MODULES = Symbol.for("rtd.dom.modules");

const host = globalThis as unknown as Record<PropertyKey, unknown>;

let current: { registration: Registration; close: () => void; teardown: () => void } | null = null;

function timeSkip(option: boolean | undefined): boolean {
  const env = process.env.CTRL_DOM_TIME_SKIP ?? process.env.RTD_TIME_SKIP;
  if (env === "1") return true;
  if (env === "0") return false;
  return option !== false;
}

/**
 * https://html.spec.whatwg.org/#report-an-exception: exceptions nobody handled (listener
 * exceptions, reportError(), React's uncaught errors) go to the process as "uncaughtException",
 * as under the Vitest environment. node:test fails the running test with it; bun test reports it.
 */
function reportToHost(error: unknown): void {
  if (process.versions.bun !== undefined) {
    // Bun's process.emit only calls listeners; bun test watches real uncaught exceptions.
    queueMicrotask(() => {
      throw error;
    });
    return;
  }
  process.emit("uncaughtException", error as Error, "uncaughtException");
}

/** Install `window` as the global. Replaces a previous registration. */
export function register(options: RegisterOptions = {}): Registration {
  unregister();
  const { timeSkip: skip, testHooks, ...rest } = options;
  const window = dom.createWindow({ ...rest, compat: rest.compat ?? "jsdom-30", url: rest.url ?? DEFAULT_URL });
  const uninstall = dom.installGlobals(window, host);
  Object.defineProperty(host, DOM_MODULES, { value: { dom, internal }, configurable: true, enumerable: false, writable: false });
  // The skipping clock treats I/O handles beyond the ones open at its creation as pending I/O.
  // Node opens stdout/stderr lazily, on first access, and a preload runs before anything has
  // written: open them now, or the first console.log (or node:test's reporter, which writes to
  // stdout) would stop skipping for the rest of the run.
  void process.stdout;
  void process.stderr;
  const clock = internal.installClock(new internal.VirtualClock({ skip: timeSkip(skip) }), host);
  internal.setUncaughtExceptionHandler(reportToHost);
  internal.setNotImplementedHandler((error: Error & { detail?: unknown }) => console.error(error.stack, error.detail));
  const removeHooks = testHooks ? installTestHooks() : null;
  const registration: Registration = {
    window,
    unregister() {
      if (current?.registration === registration) unregister();
    },
  };
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    clock.uninstall();
    window.close();
  };
  current = {
    registration,
    close,
    teardown() {
      internal.setUncaughtExceptionHandler(null);
      internal.setNotImplementedHandler(null);
      close();
      uninstall();
      delete host[DOM_MODULES];
      removeHooks?.();
    },
  };
  return registration;
}

/** Close the registered window and restore every global it replaced. No-op when none is registered. */
export function unregister(): void {
  const registered = current;
  if (registered === null) return;
  current = null;
  registered.teardown();
}

/** Whether a window is registered. */
export function isRegistered(): boolean {
  return current !== null;
}

// ── test runner hooks ────────────────────────────────────────────────────────────────────────

const require = createRequire(import.meta.url);

/** The end-of-run hook is registered once per process, whatever registers later. */
let teardownHooked = false;

/**
 * After the last test: close the window and drop its pending timers (the window's and the
 * virtual clock's), so a forgotten interval cannot keep the process alive, as the Vitest
 * environment's teardown does. The globals stay: work the tests left behind (a React root nobody
 * unmounted renders from a setImmediate) would otherwise throw `window is not defined` after the
 * run, which node:test reports as a failure of the file.
 */
function endOfRun(): void {
  current?.close();
}

/** Under `node --test` (child processes, or --test-isolation=none in the runner's process). */
function underNodeTest(): boolean {
  return process.env.NODE_TEST_CONTEXT !== undefined || process.execArgv.some((arg) => arg === "--test" || arg.startsWith("--test-"));
}

/** Returns a function removing the globals it defined. */
function installTestHooks(): (() => void) | null {
  if (process.versions.bun !== undefined) {
    if (!teardownHooked) {
      try {
        // A preload's afterAll runs once, after every file (https://bun.com/docs/test/lifecycle).
        // Outside `bun test` it throws: nothing to hook.
        (require("bun:test") as typeof import("node:test") & { afterAll(fn: () => void): void }).afterAll(endOfRun);
        teardownHooked = true;
      } catch {}
    }
    return null;
  }
  if (!underNodeTest()) return null;
  const nodeTest = require("node:test") as typeof import("node:test");
  // Hooks created outside any suite belong to the root test: they apply to every test of the
  // process (one file by default; all of them with --test-isolation=none).
  // https://nodejs.org/api/test.html#afterfn-options
  if (!teardownHooked) {
    nodeTest.after(endOfRun);
    teardownHooked = true;
  }
  const globals: Record<string, unknown> = {
    beforeAll: nodeTest.before,
    afterAll: nodeTest.after,
    beforeEach: nodeTest.beforeEach,
    afterEach: nodeTest.afterEach,
  };
  const defined: string[] = [];
  for (const name in globals) {
    if (host[name] !== undefined) continue;
    Object.defineProperty(host, name, { value: globals[name], writable: true, enumerable: false, configurable: true });
    defined.push(name);
  }
  return () => {
    for (const name of defined) if (host[name] === globals[name]) delete host[name];
  };
}
