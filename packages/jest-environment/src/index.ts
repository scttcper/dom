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
import { ModernFakeTimers } from "@jest/fake-timers";
import { protectProperties } from "jest-util";
import * as dom from "@rtd/dom";
import * as internal from "@rtd/dom/internal";
import type { Window, WindowOptions } from "@rtd/dom";

/** The vm-global key the shims read. */
export const RTD_MODULES = Symbol.for("rtd.dom.modules");

export interface RtdTestEnvironmentOptions extends Omit<WindowOptions, "shareStorageWith"> {
  customExportConditions?: string[];
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

export default class RtdEnvironment extends NodeEnvironment {
  rtdWindow: Window | null;

  constructor(config: JestEnvironmentConfig, context: EnvironmentContext) {
    super(config, context);
    const { customExportConditions, ...windowOptions } = (config.projectConfig.testEnvironmentOptions ?? {}) as RtdTestEnvironmentOptions;
    // Resolve packages' "browser" builds, like jest-environment-jsdom.
    this.customExportConditions = customExportConditions ?? ["browser"];
    const window = dom.createWindow({ ...windowOptions, url: windowOptions.url ?? DEFAULT_URL });
    this.rtdWindow = window;
    const global = this.global as unknown as Record<PropertyKey, unknown>;
    // The interface objects and the document are shared module objects (one @rtd/dom per worker):
    // keep Jest's globals cleanup (testEnvironmentOptions.globalsCleanup, "soft" by default) from
    // stripping their properties when it cleans the file's global at teardown.
    const interfaces = internal.windowInterfaces();
    for (const name in interfaces) protectProperties(interfaces[name], [], 0);
    protectProperties(window.document, [], 0);
    dom.installGlobals(window, global);
    Object.defineProperty(global, RTD_MODULES, { value: { dom, internal }, configurable: true, enumerable: false, writable: false });
    bridgeErrorRealms(global as Record<string, unknown>);
    // jest-environment-node built its fake timers before the window existed, and
    // @sinonjs/fake-timers snapshots which timer functions the global has: rebuild them so
    // jest.useFakeTimers() fakes requestAnimationFrame/requestIdleCallback like jsdom's env does.
    this.fakeTimersModern = new ModernFakeTimers({ config: config.projectConfig, global: this.global });
    // Baseline for undoing interface prototype patches at teardown (they are shared per worker).
    internal.captureInterfaceBaseline();
    internal.setUncaughtExceptionHandler(reportToHost);
  }

  override exportConditions(): string[] {
    return this.customExportConditions;
  }

  /**
   * Closes the window (cancelling its frames, idle callbacks and tasks) and undoes the file's
   * patches to the shared interface prototypes. The globals stay installed, like under
   * jest-environment-jsdom where the global *is* the window: work a test file left behind (React's
   * scheduler runs on Node's setImmediate) can still read `window`/`document` instead of
   * crashing the worker with a ReferenceError. The vm context is discarded with the file.
   */
  override async teardown(): Promise<void> {
    internal.setUncaughtExceptionHandler(null);
    this.rtdWindow?.close();
    this.rtdWindow = null;
    internal.restoreInterfaces();
    await super.teardown();
  }
}

export const TestEnvironment = RtdEnvironment;
