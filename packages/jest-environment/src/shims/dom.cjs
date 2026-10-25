// moduleNameMapper target for `@ctrl/dom` under @ctrl/dom-jest-environment: returns the instance the
// environment loaded (see src/index.ts, "singleton strategy") instead of a per-test-file copy.
"use strict";
const modules = globalThis[Symbol.for("ctrl-dom.dom.modules")];
if (modules === undefined) {
  throw new Error("@ctrl/dom is mapped to @ctrl/dom-jest-environment's shim, but the test is not running under testEnvironment \"ctrl-dom\".");
}
module.exports = modules.dom;
