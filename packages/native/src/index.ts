// @rtd/native: optional native implementations of the pure modules, behind the same signatures
// as their JS versions (src/lib/rtd.ts, which wraps packages/dom's tokenizers/parsers).
//
// Native is opt-in: set RTD_NATIVE=1 and build the addon first (`pnpm --filter @rtd/native build`).
// When the variable is unset, or the addon is missing/unloadable, everything resolves to JS.
// See RESULTS.md for which modules (if any) are worth switching.

import { createRequire } from "node:module";
import * as js from "./lib/rtd.ts";

export type RtdLib = Pick<
  typeof js,
  "htmlChecksum" | "htmlTokens" | "cssChecksum" | "selectorChecksum" | "selectorBatchChecksum" | "decodeEntities" | "noop"
>;

export interface NativeLib extends RtdLib {
  /** Run the scriptc runtime's collector (invalidates nothing JS holds: results are copied). */
  collect(): void;
}

let native: NativeLib | null = null;
let loadError: Error | null = null;

/** Load dist/rtd-native.node regardless of RTD_NATIVE. Returns null (see `nativeLoadError`) on failure. */
export function loadNative(): NativeLib | null {
  if (native !== null || loadError !== null) return native;
  try {
    const require = createRequire(import.meta.url);
    native = require("../dist/rtd-native.node") as NativeLib;
  } catch (error) {
    loadError = error as Error;
  }
  return native;
}

export function nativeLoadError(): Error | null {
  return loadError;
}

const wantNative = process.env.RTD_NATIVE === "1";

/** The active implementation: native when RTD_NATIVE=1 and the addon loads, otherwise JS. */
export const lib: RtdLib = (wantNative && loadNative()) || js;
export const usingNative: boolean = lib !== js;
export { js as jsLib };
