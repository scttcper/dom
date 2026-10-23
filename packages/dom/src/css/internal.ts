// Fast internal CSS API for @rtd/aria, @rtd/testing-library, @rtd/jest-dom, @rtd/user-event
// and src/html. Works on NodeImpl, allocates nothing on cache hits (per-element StyleRecord in
// NodeCache, stamped with Document._version / Document._styleVersion), and with no author
// style sheets reduces to inline-style + UA-default checks without rule matching.
//
// Hooks for src/html (<style>/<link>) are registered by src/css/index.ts through
// `styleSheetHooks`; they are also exported here for direct use.

export {
  hasAuthorStyles,
  isDisplayNone,
  isDisplayNoneInclusive,
  computedDisplay,
  computedVisibility,
  isVisibilityHidden,
  pointerEvents,
  pointerEventsNone,
  computedValue,
  pseudoContent,
  uaDisplay,
  currentStyleVersion,
  setComputedColorMode,
} from "./cascade.ts";
export {
  createOwnerSheet as styleElementSheet,
  removeOwnerSheet,
  createLinkSheet,
  registerOwnerSheet,
  unregisterOwnerSheet,
  styleSheetsOf,
  adoptedStyleSheetsOf,
  setAdoptedStyleSheets,
} from "./stylesheets.ts";
export { matchMediaText, parseMediaQueryList, evaluateMediaQueryList, type MediaEnvironment } from "./media.ts";
export { getComputedStyle } from "./computed.ts";
export { DeclBlock, parseDeclBlock } from "./declarations.ts";

import type { NodeImpl } from "../nodes/NodeImpl.ts";
import { createOwnerSheet, removeOwnerSheet } from "./stylesheets.ts";
import type { CSSStyleSheet } from "./cssom.ts";

/** A <style> element's text/connection changed: (re)create its sheet. Returns the sheet. */
export function styleElementUpdated(el: NodeImpl, text: string, media = ""): CSSStyleSheet {
  return createOwnerSheet(el, text, media);
}

/** A <style>/<link> element's sheet is going away. */
export function styleElementRemoved(el: NodeImpl, sheet: CSSStyleSheet): void {
  removeOwnerSheet(el, sheet);
}
