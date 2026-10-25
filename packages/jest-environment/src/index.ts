// Jest environment for @rtd/dom: `testEnvironment: "rtd"` (resolves `jest-environment-rtd`), or
// `preset: "jest-environment-rtd"` to also get the module mapping below.
//
// The test file's global is an ordinary, non-contextified vm global
// (vm.constants.DONT_CONTEXTIFY), like jest-environment-jsdom 30's (jsdom creates its window that
// way): every global read in test and app code is a plain property load. jest-environment-node
// contextifies a Proxy instead, so each global lookup goes through V8's named-property
// interceptors and the Proxy; that alone cost ~10% of Sentry's suite CPU. The constructor
// creates one window and installs it on that global, plus the Node globals jest-environment-node
// provides. Jest keeps workers alive across test files, so @rtd/dom is imported once per worker,
// here, in the outer realm.
//
// One @rtd/dom per worker (the singleton strategy): Jest evaluates test-file modules in a
// fresh module registry inside the vm context, so a plain `require("@rtd/dom")` from a test
// (or from @rtd/react, @rtd/user-event, ...) would load a second copy whose NodeImpl, current
// window and caches are unrelated to the window installed here. Instead the environment puts
// the modules it loaded on the vm global under `Symbol.for("rtd.dom.modules")`. Published
// `@ctrl/dom` / `@ctrl/dom/internal` resolve to bridges that return those objects
// (scripts/release.ts, writeBridges); in this workspace the preset maps `@rtd/dom` /
// `@rtd/dom/internal` to tiny CommonJS shims (src/shims/*.cjs) that do the same. Every module in
// the test registry therefore sees the same instance as the environment.

import { constants as vmConstants, createContext, type Context } from "node:vm";
import type { EnvironmentContext, JestEnvironment, JestEnvironmentConfig } from "@jest/environment";
import { LegacyFakeTimers, ModernFakeTimers } from "@jest/fake-timers";
import type { Circus, Global } from "@jest/types";
import { ModuleMocker } from "jest-mock";
import { installCommonGlobals } from "jest-util";
import * as dom from "@rtd/dom";
import * as internal from "@rtd/dom/internal";
import type { CompatProfile, Window, WindowOptions } from "@rtd/dom";
import { failureSnapshotHandler } from "./failure-snapshot.ts";

/** The vm-global key the bridges and shims read. */
export const RTD_MODULES = Symbol.for("rtd.dom.modules");

export interface CtrlDomTestEnvironmentOptions extends Omit<WindowOptions, "shareStorageWith"> {
  customExportConditions?: string[];
  /**
   * Keep Node's `fetch`, `Request` and `Response` on the test global. Off by default:
   * jest-environment-jsdom has none of them, and fetch mocks (jest-fetch-mock) pick a different
   * implementation when they exist (docs/deviations.md).
   */
  nodeFetch?: boolean;
  /**
   * Skip idle time (default true): timers live on a virtual clock, and whenever the event loop
   * has nothing to do but wait for one (no pending immediates, no I/O), the clock jumps to it,
   * with Date and performance.now() advancing by the same amount. findBy/waitFor, user-event
   * delays, debounces and timeouts stop costing wall time; ordering and app-visible time are
   * unchanged. `false` keeps real-time timers (waitFor polls in real time). The CTRL_DOM_TIME_SKIP
   * environment variable ("0"/"1"; also RTD_TIME_SKIP) overrides it. See
   * packages/dom/src/window/clock.ts.
   */
  timeSkip?: boolean;
  /**
   * APIs beyond jsdom's (@rtd/dom window/compat.ts): "jsdom-26" (default: jest-environment-jsdom
   * 30 ships jsdom 26, so no PointerEvent), "jsdom-30" (for suites written for an environment built
   * on jsdom >= 27, which has PointerEvent) or "modern" (everything, including matchMedia,
   * ResizeObserver and the `inert` IDL attribute).
   */
  compat?: CompatProfile;
}

/**
 * The subset of jsdom's `JSDOM` object jest-environment-jsdom exposes as `environment.dom`
 * that suites actually use: custom environments and @sentry/jest-environment (which copies it to
 * `global.jsdom`) call `reconfigure({ url })` to change the URL without navigating.
 */
export interface RtdDom {
  readonly window: Window;
  /** https://github.com/jsdom/jsdom#reconfiguring-the-jsdom-with-reconfiguresettings */
  reconfigure(settings: { url?: string; windowTop?: unknown }): void;
}

// Node globals jest-environment-jsdom does not have and whose mere presence changes what
// libraries do (feature detection). See docs/deviations.md for the full audit.
const JSDOM_ABSENT_GLOBALS = new Set(["fetch", "Request", "Response"]);

// The Node globals jest-environment-node copies onto the test global (same deny list; Buffer,
// ArrayBuffer and Uint8Array are set explicitly below). localStorage/sessionStorage are the
// window's. Computed once per worker.
const NODE_GLOBAL_DENY = new Set(["GLOBAL", "root", "global", "globalThis", "Buffer", "ArrayBuffer", "Uint8Array", "jest-symbol-do-not-touch", "localStorage", "sessionStorage"]);

// Node 26 defines these as lazy data properties: reading their value or descriptor loads undici
// (~10-60 ms). Their shape is fixed (writable, configurable; only fetch enumerable), so they are
// installed as lazy getters without ever reading them until a test does.
const LAZY_NODE_GLOBALS = new Map([
  ["fetch", true],
  ["Request", false],
  ["Response", false],
  ["Headers", false],
  ["FormData", false],
  ["WebSocket", false],
  ["EventSource", false],
  ["MessageEvent", false],
  ["CloseEvent", false],
]);

let nodeGlobals: [string, PropertyDescriptor | null][] | null = null;

/** [name, descriptor] for Node's globals (descriptor null: lazy, see LAZY_NODE_GLOBALS). */
function nodeGlobalDescriptors(): [string, PropertyDescriptor | null][] {
  return (nodeGlobals ??= Object.getOwnPropertyNames(globalThis)
    .filter((name) => !NODE_GLOBAL_DENY.has(name))
    .map((name) => [name, LAZY_NODE_GLOBALS.has(name) ? null : Object.getOwnPropertyDescriptor(globalThis, name)!]));
}

/**
 * Copy Node's globals onto the test global the way jest-environment-node does: configurable ones
 * as getters that read the outer value on first use and replace themselves with a data property;
 * names the new realm already defines (Object, Array, ...) keep the realm's own.
 */
function installNodeGlobals(global: Record<string, unknown>, skip: Set<string>): void {
  const realmOwn = new Set(Object.getOwnPropertyNames(global));
  const host = globalThis as unknown as Record<string, unknown>;
  for (const [name, descriptor] of nodeGlobalDescriptors()) {
    if (realmOwn.has(name) || skip.has(name)) continue;
    const enumerable = descriptor === null ? LAZY_NODE_GLOBALS.get(name)! : descriptor.enumerable;
    if (descriptor === null || descriptor.configurable) {
      const settle = (value: unknown) => Object.defineProperty(global, name, { value, writable: true, enumerable, configurable: true });
      Object.defineProperty(global, name, {
        get() {
          const value = host[name];
          settle(value);
          return value;
        },
        set: settle,
        enumerable,
        configurable: true,
      });
    } else {
      Object.defineProperty(global, name, descriptor);
    }
  }
  global.global = global;
  global.Buffer = Buffer;
  // TextEncoder/Buffer return the outer realm's typed arrays: the test realm sees the same
  // constructors (jest-environment-node does the same).
  global.ArrayBuffer = ArrayBuffer;
  global.Uint8Array = Uint8Array;
}

/** Same default URL as jest-environment-jsdom. */
const DEFAULT_URL = "http://localhost/";

/**
 * Exceptions nobody handled (listener exceptions, reportError(), React's uncaught errors) are
 * re-emitted on the worker process, which jest-circus turns into a test failure — what
 * jest-environment-jsdom does with its window "error" listener.
 * https://html.spec.whatwg.org/#report-an-exception
 */
function reportToHost(error: unknown): void {
  process.emit("uncaughtException", error as Error, "uncaughtException");
}

/**
 * jsdom's "Not implemented" diagnostics (navigation, window.alert, form submission, ...; only
 * under the jsdom profiles, @rtd/dom window/not-implemented.ts), forwarded to the test file's
 * console as jest-environment-jsdom does: with jsdom 26 (`sendTo` omitting jsdom errors, then
 * its "jsdomError" listener) once, as the Error; with jsdom 27+ (`forwardTo`, then the same
 * listener) as `error.stack`, then as the Error.
 * https://github.com/jestjs/jest/blob/v30.4.1/packages/jest-environment-jsdom-abstract/src/index.ts
 */
function forwardNotImplemented(global: Record<PropertyKey, unknown>): (error: Error & { detail?: unknown }, compat: string) => void {
  return (error, compat) => {
    const console = global.console as Console;
    if (compat !== "jsdom-26") console.error(error.stack, error.detail);
    console.error(error);
  };
}

// Error constructors whose instances our DOM throws from the outer realm.
const ERROR_CONSTRUCTORS = ["Error", "TypeError", "RangeError", "SyntaxError", "ReferenceError", "EvalError", "URIError"] as const;

/**
 * Our DOM runs in the worker's realm while test code runs in the vm context, so a TypeError
 * thrown by @rtd/dom is not `instanceof` the test realm's TypeError (`expect(fn).toThrow(TypeError)`
 * would fail). Give the context's error constructors a Symbol.hasInstance that also accepts the
 * outer realm's instances; errors created in the context keep working as before.
 */
function bridgeErrorRealms(global: Record<string, unknown>): void {
  for (const name of ERROR_CONSTRUCTORS) {
    const inner = global[name] as (new () => unknown) | undefined;
    const outer = globalThis[name] as unknown as new () => unknown;
    if (typeof inner !== "function" || inner === outer) continue;
    Object.defineProperty(inner, Symbol.hasInstance, {
      value: (value: unknown) => Function.prototype[Symbol.hasInstance].call(inner, value) || value instanceof outer,
      configurable: true,
    });
  }
}

function createDom(window: Window): RtdDom {
  return {
    window,
    reconfigure(settings) {
      // jsdom: "windowTop" overrides window.top; "url" replaces the document URL (no
      // navigation, no history entry, no events). Only the URL is supported here.
      if (settings.windowTop !== undefined) throw new TypeError("jest-environment-rtd: dom.reconfigure() does not support windowTop");
      if (settings.url === undefined) return;
      const url = URL.parse(String(settings.url));
      if (url === null) throw new TypeError(`Could not parse "${settings.url}" as a URL`);
      window._setURL(url);
    },
  };
}

export default class CtrlDomEnvironment implements JestEnvironment<number> {
  context: Context | null;
  global: Global.Global;
  fakeTimers: LegacyFakeTimers<number> | null;
  fakeTimersModern: ModernFakeTimers | null;
  moduleMocker: ModuleMocker | null;
  customExportConditions: string[];
  rtdWindow: Window | null;
  /** jest-environment-jsdom's `dom`, reduced to what suites use (see RtdDom). */
  dom: RtdDom | null;
  /** The file's timers (see CtrlDomTestEnvironmentOptions.timeSkip). */
  clock: InstanceType<typeof internal.VirtualClock> | null;
  /** Only with CTRL_DOM_DEBUG set: failure snapshots (./failure-snapshot.ts); with the Sentry reporter: its collector. */
  declare handleTestEvent?: (event: Circus.Event) => Promise<void> | void;
  /** The test file, for the Sentry collector's data. */
  #testPath: string;
  /** With @ctrl/dom/sentry's Jest reporter (CTRL_DOM_SENTRY_DIR set): spans and failure snapshots per test. */
  #sentry: import("@rtd/sentry/jest-collector").JestCollector | null = null;

  constructor(config: JestEnvironmentConfig, environmentContext: EnvironmentContext) {
    this.#testPath = environmentContext.testPath;
    const { projectConfig } = config;
    const { customExportConditions, nodeFetch, timeSkip, ...windowOptions } = (projectConfig.testEnvironmentOptions ?? {}) as CtrlDomTestEnvironmentOptions;
    // Resolve packages' "browser" builds, like jest-environment-jsdom.
    this.customExportConditions = customExportConditions ?? ["browser"];

    // https://nodejs.org/api/vm.html#vmconstantsdont_contextify: the returned object is the new
    // realm's own global object, usable wherever a contextified object is (Script#runInContext).
    const context = createContext(vmConstants.DONT_CONTEXTIFY);
    this.context = context;
    const global = context as unknown as Record<PropertyKey, unknown>;
    this.global = global as unknown as Global.Global;
    installNodeGlobals(global as Record<string, unknown>, nodeFetch === true ? new Set() : JSDOM_ABSENT_GLOBALS);
    installCommonGlobals(this.global as unknown as typeof globalThis, projectConfig.globals);
    const realmSymbol = global.Symbol as SymbolConstructor & { asyncDispose?: symbol; dispose?: symbol };
    if (!("asyncDispose" in realmSymbol)) {
      Object.defineProperty(realmSymbol, "asyncDispose", { value: Symbol.for("nodejs.asyncDispose") });
      Object.defineProperty(realmSymbol, "dispose", { value: Symbol.for("nodejs.dispose") });
    }
    // Node's error-message stack size is limited at 10; more is useful when a test fails.
    (global.Error as ErrorConstructor).stackTraceLimit = 100;

    const window = dom.createWindow({ ...windowOptions, compat: windowOptions.compat ?? "jsdom-26", url: windowOptions.url ?? DEFAULT_URL });
    this.rtdWindow = window;
    this.dom = createDom(window);
    // Baseline for undoing interface prototype patches at teardown (they are shared per worker),
    // taken before the compat profile adjusts prototype members so teardown also undoes that.
    internal.captureInterfaceBaseline();
    dom.installGlobals(window, global);
    Object.defineProperty(global, RTD_MODULES, { value: { dom, internal }, configurable: true, enumerable: false, writable: false });
    bridgeErrorRealms(global as Record<string, unknown>);
    // The file's timers live on a virtual clock (idle time skipping unless timeSkip is false):
    // window.setTimeout & co. delegate to these globals, and teardown disposes the clock, so a
    // long app timer (TanStack Query GC, polling) cannot keep this vm context alive.
    const envSkip = process.env.CTRL_DOM_TIME_SKIP ?? process.env.RTD_TIME_SKIP;
    const skip = envSkip === "1" ? true : envSkip === "0" ? false : timeSkip !== false;
    this.clock = internal.installClock(new internal.VirtualClock({ skip }), global).clock;

    // Fake timers are built after the window is installed: @sinonjs/fake-timers snapshots which
    // timer functions the global has (so jest.useFakeTimers() fakes requestAnimationFrame /
    // requestIdleCallback like jsdom's env does), and legacy timers capture the tracked real ones
    // to restore on useRealTimers().
    this.moduleMocker = new ModuleMocker(this.global as unknown as typeof globalThis);
    this.fakeTimers = new LegacyFakeTimers({
      config: projectConfig,
      global: this.global as unknown as typeof globalThis,
      moduleMocker: this.moduleMocker,
      timerConfig: { idToRef: (id: number) => id, refToId: (ref: number) => ref },
    });
    this.fakeTimersModern = new ModernFakeTimers({ config: projectConfig, global: this.global as unknown as typeof globalThis });
    // Definitions on interface objects stay configurable, so teardown can undo them.
    internal.guardInterfaceDefinitions(global as never);
    internal.setUncaughtExceptionHandler(reportToHost);
    internal.setNotImplementedHandler(forwardNotImplemented(global));
    const onTestEvent = failureSnapshotHandler(() => this.rtdWindow?.document);
    if (onTestEvent !== undefined) this.handleTestEvent = onTestEvent;
  }

  async setup(): Promise<void> {
    // @ctrl/dom/sentry's Jest reporter sets this before Jest starts its workers. jest-circus reads
    // handleTestEvent after setup(), so the collector can be added here.
    const sentryDir = process.env.CTRL_DOM_SENTRY_DIR;
    if (sentryDir) {
      const { createJestCollector } = await import("@rtd/sentry/jest-collector");
      const sentry = createJestCollector({ dir: sentryDir, testPath: this.#testPath, getDocument: () => this.rtdWindow?.document });
      this.#sentry = sentry;
      const previous = this.handleTestEvent;
      this.handleTestEvent = async (event) => {
        await previous?.(event);
        sentry.handleTestEvent(event);
      };
    }
  }

  exportConditions(): string[] {
    return this.customExportConditions;
  }

  getVmContext(): Context | null {
    return this.context;
  }

  /**
   * Closes the window (cancelling its timers, frames, idle callbacks and tasks) and undoes the file's
   * patches to the shared interface prototypes. The globals stay installed, like under
   * jest-environment-jsdom where the global *is* the window: work a test file left behind (React's
   * scheduler runs on Node's setImmediate) can still read `window`/`document` instead of
   * crashing the worker with a ReferenceError. The vm context is discarded with the file.
   */
  async teardown(): Promise<void> {
    this.#sentry?.finish();
    this.#sentry = null;
    internal.setUncaughtExceptionHandler(null);
    internal.setNotImplementedHandler(null);
    this.fakeTimers?.dispose();
    this.fakeTimersModern?.dispose();
    this.rtdWindow?.close();
    this.rtdWindow = null;
    this.clock?.dispose();
    this.clock = null;
    this.dom = null;
    internal.restoreInterfaces();
    this.context = null;
    this.fakeTimers = null;
    this.fakeTimersModern = null;
  }
}

export const TestEnvironment = CtrlDomEnvironment;
