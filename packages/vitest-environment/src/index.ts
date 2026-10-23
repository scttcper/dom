// Vitest environment for @rtd/dom: `environment: "rtd"` (resolves `vitest-environment-rtd`).
//
//   // vitest.config.ts
//   export default defineConfig({
//     test: {
//       environment: "rtd",
//       environmentOptions: { rtd: { url: "http://localhost:3000/", width: 1280 } },
//     },
//   });
//
// or per file: `// @vitest-environment rtd`.
//
// Setup creates one window and makes it the worker's global (installGlobals); teardown closes
// it (cancelling its pending animation frames, idle callbacks and tasks) and restores every
// global it replaced. React's IS_REACT_ACT_ENVIRONMENT is left to the testing library.

import { enableCompileCache } from "node:module";
import { constants as vmConstants, createContext, type Context } from "node:vm";
import type { Environment } from "vitest/runtime";
import type { WindowOptions } from "@rtd/dom";

// Every Vitest worker pays the DOM import (jsdom-startup README: isolated forks start a fresh
// worker per file). Node's on-disk compile cache keeps V8 code (and stripped TypeScript)
// across workers: importing @rtd/dom drops from ~120 ms to ~50 ms after the first worker.
// Set RTD_COMPILE_CACHE=0 to opt out. Must run before @rtd/dom is imported, hence the
// dynamic import below.
if (process.env.RTD_COMPILE_CACHE !== "0") enableCompileCache?.();
const { createWindow, installGlobals } = await import("@rtd/dom");
const { setUncaughtExceptionHandler, captureInterfaceBaseline, guardInterfaceDefinitions, restoreInterfaces, installClock, VirtualClock } = await import("@rtd/dom/internal");

/**
 * Exceptions nobody handled (listener exceptions, reportError(), React's uncaught errors) go to
 * the worker as `uncaughtException`, which Vitest reports as an unhandled error that fails the
 * run — what Vitest's jsdom environment does with its window "error" listener.
 * https://html.spec.whatwg.org/#report-an-exception
 */
function reportToHost(error: unknown): void {
  process.emit("uncaughtException", error as Error, "uncaughtException");
}

export interface RtdEnvironmentOptions extends Omit<WindowOptions, "shareStorageWith"> {
  /**
   * Skip idle time (default true): timers live on a virtual clock that jumps to the next timer
   * whenever the event loop has nothing else to do (no pending immediates, no I/O), with Date and
   * performance.now() advancing by the same amount. `false` keeps real-time timers. The
   * RTD_TIME_SKIP environment variable ("0"/"1") overrides it. See @rtd/dom window/clock.ts.
   */
  timeSkip?: boolean;
  /**
   * Expose `window.matchMedia` (default false). No jsdom version has it, and suites written for
   * jsdom install their own: helpers such as mock-match-media only polyfill it when it is
   * missing, and components feature-detect it. Set it to drive responsive components through
   * @rtd/dom's matchMedia (createWindow({ mediaFeatures }), innerWidth assignment) without a mock.
   */
  matchMedia?: boolean;
}

/** Same default URL as Vitest's jsdom and happy-dom environments. */
const DEFAULT_URL = "http://localhost:3000/";

function windowOptions(options: Record<string, unknown>): WindowOptions {
  const { timeSkip: _timeSkip, matchMedia: _matchMedia, ...rtd } = (options?.rtd ?? {}) as RtdEnvironmentOptions;
  return { ...rtd, url: rtd.url ?? DEFAULT_URL };
}

/** Remove matchMedia from the installed global unless `rtd.matchMedia` (jsdom parity). */
function hideMatchMedia(global: Record<PropertyKey, unknown>, options: Record<string, unknown>): void {
  if (((options?.rtd ?? {}) as RtdEnvironmentOptions).matchMedia !== true) delete global.matchMedia;
}

function timeSkip(options: Record<string, unknown>): boolean {
  const env = process.env.RTD_TIME_SKIP;
  if (env === "1") return true;
  if (env === "0") return false;
  return ((options?.rtd ?? {}) as RtdEnvironmentOptions).timeSkip !== false;
}

// Host globals a fresh vm context needs (the window itself supplies the DOM).
const VM_HOST_GLOBALS = [
  "setTimeout",
  "clearTimeout",
  "setInterval",
  "clearInterval",
  "queueMicrotask",
  "structuredClone",
  "atob",
  "btoa",
  "fetch",
  "crypto",
  "performance",
  "URL",
  "URLSearchParams",
  "AbortController",
  "AbortSignal",
  "Blob",
  "File",
  "TextEncoder",
  "TextDecoder",
  "ReadableStream",
  "WritableStream",
  "TransformStream",
  "Headers",
  "Request",
  "Response",
  "FormData",
  "BroadcastChannel",
  "MessageChannel",
  "MessagePort",
  "WebSocket",
  "DOMException",
  "Buffer",
];

const environment: Environment = {
  name: "rtd",
  viteEnvironment: "client",
  // Setup takes well under a millisecond; prewarming would only compete with the worker.
  prewarmModules: false,

  setup(global, options) {
    const window = createWindow(windowOptions(options));
    const uninstall = installGlobals(window, global);
    hideMatchMedia(global, options);
    // The worker's timers, Date and performance move onto the virtual clock until teardown
    // (Vitest's own runner keeps the timers it captured at startup).
    const clock = installClock(new VirtualClock({ skip: timeSkip(options) }), global);
    // No interface snapshot here: Vitest runs setup/teardown once per worker (on "start"/"stop"),
    // so a restore at teardown could never sit between two files — every file the worker runs
    // shares this window, as with jsdom's environment.
    setUncaughtExceptionHandler(reportToHost);
    return {
      teardown() {
        setUncaughtExceptionHandler(null);
        clock.uninstall();
        window.close();
        uninstall();
      },
    };
  },

  setupVM(options) {
    const window = createWindow(windowOptions(options));
    // https://nodejs.org/api/vm.html#vmconstantsdont_contextify: the new realm's own global object
    // (usable wherever a contextified object is), so global lookups in test and app code are
    // ordinary property loads instead of going through the contextified sandbox's interceptors.
    const context: Context = createContext(vmConstants.DONT_CONTEXTIFY);
    const host = globalThis as unknown as Record<string, unknown>;
    for (const name of VM_HOST_GLOBALS) {
      if (host[name] !== undefined) {
        Object.defineProperty(context, name, { value: host[name], writable: true, enumerable: false, configurable: true });
      }
    }
    const uninstall = installGlobals(window, context as Record<PropertyKey, unknown>);
    hideMatchMedia(context as Record<PropertyKey, unknown>, options);
    // The file's timers live on its own virtual clock: disposing it at teardown drops pending
    // ones, so they cannot keep the discarded context alive in the long-lived worker.
    const clock = installClock(new VirtualClock({ skip: timeSkip(options) }), context as Record<PropertyKey, unknown>);
    // VM pools call setupVM per file in a long-lived worker, and the interface objects are shared
    // module classes: snapshot once and undo each file's prototype patches at teardown.
    captureInterfaceBaseline();
    // Definitions on interface objects stay configurable, so teardown can undo them.
    guardInterfaceDefinitions(context as never);
    setUncaughtExceptionHandler(reportToHost);
    return {
      getVmContext() {
        return context;
      },
      teardown() {
        setUncaughtExceptionHandler(null);
        clock.clock.dispose();
        window.close();
        uninstall();
        restoreInterfaces();
      },
    };
  },
};

export default environment;
