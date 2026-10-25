import type { Plugin } from "vitest/config";
import type { CtrlDomEnvironmentOptions } from "./dist/vitest-environment/types/index.js";
import type { CtrlDomSentryOptions } from "./dist/sentry/types/index.js";

export type { CtrlDomEnvironmentOptions, CtrlDomSentryOptions };

export interface CtrlDomPluginOptions extends CtrlDomEnvironmentOptions {
  /**
   * Route stock `@testing-library/react`, `/dom`, `/user-event` and `/jest-dom` imports to
   * @ctrl/dom's implementations (default true). `false` swaps only the DOM.
   */
  testingLibrary?: boolean;
  /**
   * Agent-oriented debug output, the same as the `CTRL_DOM_DEBUG` env var (which wins when set):
   * `"aria"` prints accessibility snapshots instead of HTML in `screen.debug()`, `prettyDOM` and
   * failing query errors (with the closest matching elements); `"compact"` prints HTML without
   * class/style attributes and SVG internals. Default: upstream output.
   *
   * When on (here or through `CTRL_DOM_DEBUG`), the plugin also adds a setup file that appends a
   * snapshot of `document.body` to every failing test's error, taken before cleanup.
   */
  debug?: "aria" | "compact";
  /**
   * Report to Sentry (docs/sentry.md): each test file as a trace, with spans for tests, Testing
   * Library queries and waitFor, user-event actions and renders; each failing test as an issue
   * with the page's accessibility snapshot attached; each test that passed only on a retry as a
   * flaky-test issue. `true` reads SENTRY_DSN / SENTRY_SPOTLIGHT; with neither, nothing is added.
   */
  sentry?: boolean | CtrlDomSentryOptions;
}

/** @ctrl/dom's Vitest environment plus (by default) the Testing Library aliases. */
export declare function ctrlDom(options?: CtrlDomPluginOptions): Plugin;

/**
 * @internal The Node flags `ctrlDom()` adds to a project's worker `execArgv`: the compile cache
 * from process start (with `compileCache`), in every pool.
 */
export declare function workerExecArgv(project: { pool?: unknown; execArgv?: readonly string[]; compileCache?: boolean }): string[];

export default ctrlDom;
