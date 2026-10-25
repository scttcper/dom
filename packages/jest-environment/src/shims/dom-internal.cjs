// moduleNameMapper target for `@ctrl/dom/internal` under @ctrl/dom-jest-environment (see dom.cjs).
"use strict";
const modules = globalThis[Symbol.for("ctrl-dom.dom.modules")];
if (modules === undefined) {
  throw new Error("@ctrl/dom/internal is mapped to @ctrl/dom-jest-environment's shim, but the test is not running under testEnvironment \"ctrl-dom\".");
}
module.exports = modules.internal;
