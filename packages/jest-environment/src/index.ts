// Jest environment for @rtd/dom: `testEnvironment: "rtd"` (resolves `jest-environment-rtd`), or
// `preset: "jest-environment-rtd"` to also get the module mapping below.
//
// Built on jest-environment-node (vm context, Node globals, legacy + modern fake timers); the
// constructor creates one window and installs it on the test file's vm global. Jest keeps
// workers alive across test files, so @rtd/dom is imported once per worker, here, in the
// outer realm.
//
// One @rtd/dom per worker (the singleton strategy): Jest evaluates test-file modules in a
// fresh module registry inside the vm context, so a plain `require("@rtd/dom")` from a test
// (or from @rtd/react, @rtd/user-event, ...) would load a second copy whose NodeImpl, current
// window and caches are unrelated to the window installed here. Instead the environment puts
// the modules it loaded on the vm global under `Symbol.for("rtd.dom.modules")`, and the preset
// maps `@rtd/dom` / `@rtd/dom/internal` to tiny CommonJS shims (src/shims/*.cjs) that return
// those objects. Every module in the test registry therefore sees the same instance as the
// environment.

import type { EnvironmentContext, JestEnvironmentConfig } from "@jest/environment";
import { TestEnvironment as NodeEnvironment } from "jest-environment-node";
import { LegacyFakeTimers, ModernFakeTimers } from "@jest/fake-timers";
import { protectProperties } from "jest-util";
import * as dom from "@rtd/dom";
import * as internal from "@rtd/dom/internal";
import type { Window, WindowOptions } from "@rtd/dom";

/** The vm-global key the shims read. */
export const RTD_MODULES = Symbol.for("rtd.dom.modules");

export interface RtdTestEnvironmentOptions extends Omit<WindowOptions, "shareStorageWith"> {
  customExportConditions?: string[];
  /**
   * Keep Node's `fetch`, `Request` and `Response` on the test global. Off by default:
   * jest-environment-jsdom has none of them, and fetch mocks (jest-fetch-mock) pick a different
   * implementation when they exist (docs/deviations.md).
   */
  nodeFetch?: boolean;
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
const JSDOM_ABSENT_GLOBALS = ["fetch", "Request", "Response"] as const;

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

export default class RtdEnvironment extends NodeEnvironment {
  rtdWindow: Window | null;
  /** jest-environment-jsdom's `dom`, reduced to what suites use (see RtdDom). */
  dom: RtdDom | null;

  constructor(config: JestEnvironmentConfig, context: EnvironmentContext) {
    super(config, context);
    const { customExportConditions, nodeFetch, ...windowOptions } = (config.projectConfig.testEnvironmentOptions ?? {}) as RtdTestEnvironmentOptions;
    // Resolve packages' "browser" builds, like jest-environment-jsdom.
    this.customExportConditions = customExportConditions ?? ["browser"];
    const window = dom.createWindow({ ...windowOptions, url: windowOptions.url ?? DEFAULT_URL });
    this.rtdWindow = window;
    this.dom = createDom(window);
    const global = this.global as unknown as Record<PropertyKey, unknown>;
    // `delete` only: reading or redefining Node 26's lazy fetch globals would load undici.
    if (nodeFetch !== true) for (const name of JSDOM_ABSENT_GLOBALS) delete global[name];
    // The interface objects and the document are shared module objects (one @rtd/dom per worker):
    // keep Jest's globals cleanup (testEnvironmentOptions.globalsCleanup, "soft" by default) from
    // stripping their properties when it cleans the file's global at teardown.
    const interfaces = internal.windowInterfaces();
    for (const name in interfaces) protectProperties(interfaces[name], [], 0);
    protectProperties(window.document, [], 0);
    dom.installGlobals(window, global);
    Object.defineProperty(global, RTD_MODULES, { value: { dom, internal }, configurable: true, enumerable: false, writable: false });
    bridgeErrorRealms(global as Record<string, unknown>);
    // The file's setTimeout/setInterval belong to the window, as under jsdom: teardown's
    // window.close() clears what is still pending, so a long app timer (TanStack Query GC,
    // polling) cannot keep this vm context and its module graph alive after the file ends.
    internal.trackGlobalTimers(window, global);
    // jest-environment-node built its fake timers before the window existed: @sinonjs/fake-timers
    // snapshots which timer functions the global has and legacy timers capture the real ones to
    // restore. Rebuild both so jest.useFakeTimers() fakes requestAnimationFrame /
    // requestIdleCallback like jsdom's env does and useRealTimers() restores the tracked timers.
    this.fakeTimers?.dispose();
    this.fakeTimers = new LegacyFakeTimers({
      config: config.projectConfig,
      global: this.global,
      moduleMocker: this.moduleMocker!,
      timerConfig: { idToRef: (id: number) => ({ id, ref() { return this; }, unref() { return this; } }), refToId: (timer: { id?: number } | undefined) => timer?.id },
    });
    this.fakeTimersModern?.dispose();
    this.fakeTimersModern = new ModernFakeTimers({ config: config.projectConfig, global: this.global });
    // Baseline for undoing interface prototype patches at teardown (they are shared per worker).
    internal.captureInterfaceBaseline();
    internal.setUncaughtExceptionHandler(reportToHost);
  }

  override exportConditions(): string[] {
    return this.customExportConditions;
  }

  /**
   * Closes the window (cancelling its timers, frames, idle callbacks and tasks) and undoes the file's
   * patches to the shared interface prototypes. The globals stay installed, like under
   * jest-environment-jsdom where the global *is* the window: work a test file left behind (React's
   * scheduler runs on Node's setImmediate) can still read `window`/`document` instead of
   * crashing the worker with a ReferenceError. The vm context is discarded with the file.
   */
  override async teardown(): Promise<void> {
    internal.setUncaughtExceptionHandler(null);
    this.rtdWindow?.close();
    this.rtdWindow = null;
    this.dom = null;
    internal.restoreInterfaces();
    await super.teardown();
  }
}

export const TestEnvironment = RtdEnvironment;
