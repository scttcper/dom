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

export default class RtdEnvironment extends NodeEnvironment {
  rtdWindow: Window | null;
  _uninstall: (() => void) | null;

  constructor(config: JestEnvironmentConfig, context: EnvironmentContext) {
    super(config, context);
    const { customExportConditions, ...windowOptions } = (config.projectConfig.testEnvironmentOptions ?? {}) as RtdTestEnvironmentOptions;
    // Resolve packages' "browser" builds, like jest-environment-jsdom.
    this.customExportConditions = customExportConditions ?? ["browser"];
    const window = dom.createWindow({ ...windowOptions, url: windowOptions.url ?? DEFAULT_URL });
    this.rtdWindow = window;
    this._uninstall = dom.installGlobals(window, this.global as unknown as Record<PropertyKey, unknown>);
    Object.defineProperty(this.global, RTD_MODULES, { value: { dom, internal }, configurable: true, enumerable: false, writable: false });
    internal.setUncaughtExceptionHandler(reportToHost);
  }

  override exportConditions(): string[] {
    return this.customExportConditions;
  }

  override async teardown(): Promise<void> {
    internal.setUncaughtExceptionHandler(null);
    this.rtdWindow?.close();
    this._uninstall?.();
    this.rtdWindow = null;
    this._uninstall = null;
    await super.teardown();
  }
}

export const TestEnvironment = RtdEnvironment;
