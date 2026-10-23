import type { Plugin } from "vitest/config";
import type { CtrlDomEnvironmentOptions } from "./dist/vitest-environment/types/index.js";

export type { CtrlDomEnvironmentOptions };

export interface CtrlDomPluginOptions extends CtrlDomEnvironmentOptions {
  /**
   * Route stock `@testing-library/react`, `/dom`, `/user-event` and `/jest-dom` imports to
   * @ctrl/dom's implementations (default true). `false` swaps only the DOM.
   */
  testingLibrary?: boolean;
}

/** @ctrl/dom's Vitest environment plus (by default) the Testing Library aliases. */
export declare function ctrlDom(options?: CtrlDomPluginOptions): Plugin;

export default ctrlDom;
