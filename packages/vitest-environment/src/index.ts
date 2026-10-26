// Vitest environment for @ctrl/dom, published as `@ctrl/dom/vitest-environment` and loaded by path
// by the `ctrlDom()` plugin (./plugin.ts, `@ctrl/dom/vitest`), which also answers for the name
// "ctrl-dom":
//
//   // vitest.config.ts
//   export default defineConfig({ plugins: [ctrlDom({ url: "http://localhost:3000/", width: 1280 })] });
//
// or per file: `// @vitest-environment ctrl-dom`. Vitest passes a docblock's
// `@vitest-environment-options` under the environment's name, hence the "ctrl-dom" key; `ctrlDom`
// is accepted too. A docblock with options but no `@vitest-environment` files them under the
// configured environment, which the plugin sets to this module's path.
//
// Setup creates one window and makes it the worker's global (installGlobals); teardown closes
// it (cancelling its pending animation frames, idle callbacks and tasks) and restores every
// global it replaced. React's IS_REACT_ACT_ENVIRONMENT is left to the testing library.

import { enableCompileCache } from "node:module";
import { fileURLToPath } from "node:url";
import { constants as vmConstants, createContext, type Context } from "node:vm";
import type { Environment } from "vitest/runtime";
import type { CompatProfile, WindowOptions } from "@ctrl/dom";

type Dom = typeof import("@ctrl/dom");
type Internal = typeof import("@ctrl/dom/internal");

let dom: Dom | null = null;
let internal: Internal | null = null;

/**
 * Imports the DOM on the worker's first setup. Every Vitest worker pays this import
 * (jsdom-startup README: isolated forks start a fresh worker per file), so with `compileCache`
 * Node's on-disk compile cache is enabled first: it keeps V8 code (and stripped TypeScript) for
 * the bundles across workers. Once on, it stays on for every module the worker loads after it,
 * which only pays off for large files: deserializing hundreds of tiny ones (aria-query's roles,
 * stock user-event) is slower than compiling them (comparison/: +6% wall time over 100 files with
 * stock Testing Library, -11% with @ctrl/dom's).
 */
async function load(options: Record<string, unknown>): Promise<void> {
  if (dom !== null) return;
  if (compileCache(options)) enableCompileCache?.();
  [dom, internal] = await Promise.all([import("@ctrl/dom"), import("@ctrl/dom/internal")]);
}

/**
 * The global key under which the environment publishes the DOM modules it loaded (the same one
 * @ctrl/dom-jest-environment uses). In VM pools Vitest evaluates a test file's modules inside the vm
 * context, so an import of @ctrl/dom from test code (or from our Testing Library bundles) would
 * otherwise evaluate a second DOM: its classes fail `instanceof` against the installed globals and
 * every file pays for the evaluation. Published `@ctrl/dom` and `@ctrl/dom/internal` resolve to
 * bridges that return these objects (scripts/release.ts, writeBridges).
 */
const DOM_MODULES = Symbol.for("ctrl-dom.dom.modules");

function publishModules(global: object): void {
  Object.defineProperty(global, DOM_MODULES, {
    value: { dom: dom!, internal: internal! },
    configurable: true,
    enumerable: false,
    writable: false,
  });
}

/**
 * Exceptions nobody handled (listener exceptions, reportError(), React's uncaught errors) go to
 * the worker as `uncaughtException`, which Vitest reports as an unhandled error that fails the
 * run — what Vitest's jsdom environment does with its window "error" listener.
 * https://html.spec.whatwg.org/#report-an-exception
 */
function reportToHost(error: unknown): void {
  process.emit("uncaughtException", error as Error, "uncaughtException");
}

/**
 * jsdom's "Not implemented" diagnostics (navigation, window.alert, form submission, ...; only
 * under the jsdom profiles, @ctrl/dom window/not-implemented.ts), forwarded as under Vitest's
 * jsdom environment. Its JSDOM gets jsdom's default virtual console, bound to the console of the
 * moment the environment is set up: Vitest swaps in its per-test console afterwards, so these
 * reach the worker's stderr, never a test's console spies (vitest-fail-on-console). jsdom 27+
 * prints the message, jsdom 26 the stack and detail.
 * https://github.com/jsdom/jsdom/blob/30.1.3/lib/jsdom/virtual-console.js (forwardTo)
 */
function forwardNotImplemented(console: Console): (error: Error & { detail?: unknown }, compat: string) => void {
  return (error, compat) => {
    if (compat === "jsdom-26") console.error(error.stack, error.detail);
    else console.error(error.message);
  };
}

export interface CtrlDomEnvironmentOptions extends Omit<WindowOptions, "shareStorageWith"> {
  /**
   * Skip idle time (default true): timers live on a virtual clock that jumps to the next timer
   * whenever the event loop has nothing else to do (no pending immediates, no I/O), with Date and
   * performance.now() advancing by the same amount. `false` keeps real-time timers. The
   * CTRL_DOM_TIME_SKIP environment variable ("0"/"1") overrides it. See
   * @ctrl/dom window/clock.ts.
   */
  timeSkip?: boolean;
  /**
   * APIs beyond jsdom's (@ctrl/dom window/compat.ts): "jsdom-30" (default, what Vitest's jsdom
   * environment exposes), "jsdom-26" (jest-environment-jsdom 30's) or "modern" (everything,
   * including matchMedia, ResizeObserver and the `inert` IDL attribute).
   */
  compat?: CompatProfile;
  /**
   * Enable Node's on-disk compile cache before importing the DOM (default false; the @ctrl/dom
   * Vitest plugin turns it on when it routes Testing Library to @ctrl/dom's bundles). It applies to
   * every module the worker loads afterwards: a win for a few large bundles, a loss for many small
   * CommonJS files such as stock Testing Library's. The CTRL_DOM_COMPILE_CACHE environment
   * variable ("0"/"1"; also CTRL_DOM_COMPILE_CACHE) overrides it; NODE_COMPILE_CACHE enables it for the
   * whole process regardless.
   */
  compileCache?: boolean;
}

/** Same default URL as Vitest's jsdom and happy-dom environments. */
const DEFAULT_URL = "http://localhost:3000/";

/** The environment by path, as the ctrlDom() plugin configures it. */
const SELF = fileURLToPath(import.meta.url);

/** This environment's options out of Vitest's `environmentOptions` (see the header). */
function ownOptions(options: Record<string, unknown> | undefined): CtrlDomEnvironmentOptions {
  return (options?.["ctrl-dom"] ?? options?.ctrlDom ?? options?.[SELF] ?? {}) as CtrlDomEnvironmentOptions;
}

function windowOptions(options: Record<string, unknown>): WindowOptions {
  const { timeSkip: _timeSkip, compileCache: _compileCache, ...rest } = ownOptions(options);
  return { ...rest, compat: rest.compat ?? "jsdom-30", url: rest.url ?? DEFAULT_URL };
}

function timeSkip(options: Record<string, unknown>): boolean {
  const env = process.env.CTRL_DOM_TIME_SKIP;
  if (env === "1") return true;
  if (env === "0") return false;
  return ownOptions(options).timeSkip !== false;
}

function compileCache(options: Record<string, unknown>): boolean {
  const env = process.env.CTRL_DOM_COMPILE_CACHE;
  if (env === "1") return true;
  if (env === "0") return false;
  return ownOptions(options).compileCache === true;
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
  name: "ctrl-dom",
  viteEnvironment: "client",
  // Setup takes well under a millisecond; prewarming would only compete with the worker.
  prewarmModules: false,

  async setup(global, options) {
    await load(options);
    const { createWindow, installGlobals } = dom!;
    const { setUncaughtExceptionHandler, setNotImplementedHandler, installClock, VirtualClock, subscribeTestFailures } =
      internal!;
    const window = createWindow(windowOptions(options));
    const uninstall = installGlobals(window, global);
    publishModules(global);
    // The worker's timers, Date and performance move onto the virtual clock until teardown
    // (Vitest's own runner keeps the timers it captured at startup).
    const clock = installClock(new VirtualClock({ skip: timeSkip(options) }), global);
    // No interface snapshot here: Vitest runs setup/teardown once per worker (on "start"/"stop"),
    // so a restore at teardown could never sit between two files — every file the worker runs
    // shares this window, as with jsdom's environment.
    setUncaughtExceptionHandler(reportToHost);
    setNotImplementedHandler(forwardNotImplemented((global as { console: Console }).console));
    // @ctrl/sentry-tests' failure reports get the accessibility snapshot and the clock.
    const unsubscribeFailures = subscribeTestFailures(() => window.document);
    return {
      teardown() {
        unsubscribeFailures();
        setUncaughtExceptionHandler(null);
        setNotImplementedHandler(null);
        clock.uninstall();
        window.close();
        uninstall();
        delete (global as Record<PropertyKey, unknown>)[DOM_MODULES];
      },
    };
  },

  async setupVM(options) {
    await load(options);
    const { createWindow, installGlobals } = dom!;
    const {
      setUncaughtExceptionHandler,
      setNotImplementedHandler,
      captureInterfaceBaseline,
      guardInterfaceDefinitions,
      restoreInterfaces,
      installClock,
      VirtualClock,
      subscribeTestFailures,
    } = internal!;
    const window = createWindow(windowOptions(options));
    // https://nodejs.org/api/vm.html#vmconstantsdont_contextify: the new realm's own global object
    // (usable wherever a contextified object is), so global lookups in test and app code are
    // ordinary property loads instead of going through the contextified sandbox's interceptors.
    const context: Context = createContext(vmConstants.DONT_CONTEXTIFY);
    const host = globalThis as unknown as Record<string, unknown>;
    for (const name of VM_HOST_GLOBALS) {
      // Forwarded on first read: in Node 26 most of these (fetch, Request, FormData, the streams,
      // crypto, MessageChannel...) are lazy, and reading one builds it (undici alone is ~130
      // modules). Most files never touch them, and the window replaces several right below.
      if (!Object.hasOwn(host, name)) continue;
      const settle = (value: unknown) =>
        Object.defineProperty(context, name, { value, writable: true, enumerable: false, configurable: true });
      Object.defineProperty(context, name, {
        get() {
          const value = host[name];
          settle(value);
          return value;
        },
        set: settle,
        enumerable: false,
        configurable: true,
      });
    }
    // VM pools call setupVM per file in a long-lived worker, and the interface objects are shared
    // module classes: snapshot once (before the compat profile adjusts prototype members) and
    // undo each file's prototype patches at teardown.
    captureInterfaceBaseline();
    const uninstall = installGlobals(window, context as Record<PropertyKey, unknown>);
    publishModules(context);
    // The file's timers live on its own virtual clock: disposing it at teardown drops pending
    // ones, so they cannot keep the discarded context alive in the long-lived worker.
    const clock = installClock(new VirtualClock({ skip: timeSkip(options) }), context as Record<PropertyKey, unknown>);
    // Definitions on interface objects stay configurable, so teardown can undo them.
    guardInterfaceDefinitions(context as never);
    setUncaughtExceptionHandler(reportToHost);
    // Vitest's jsdom setupVM builds its JSDOM in the worker's realm: the host console.
    setNotImplementedHandler(forwardNotImplemented(console));
    const unsubscribeFailures = subscribeTestFailures(() => window.document);
    return {
      getVmContext() {
        return context;
      },
      teardown() {
        unsubscribeFailures();
        setUncaughtExceptionHandler(null);
        setNotImplementedHandler(null);
        clock.clock.dispose();
        window.close();
        uninstall();
        restoreInterfaces();
      },
    };
  },
};

export default environment;
