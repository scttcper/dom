import type { Plugin } from "vitest/config";
import type { CtrlDomEnvironmentOptions } from "./dist/vitest-environment/types/index.js";

export type { CtrlDomEnvironmentOptions };

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
   */
  debug?: "aria" | "compact";
}

/** @ctrl/dom's Vitest environment plus (by default) the Testing Library aliases. */
export declare function ctrlDom(options?: CtrlDomPluginOptions): Plugin;

export default ctrlDom;
