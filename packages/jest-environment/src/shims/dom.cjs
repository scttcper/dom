// moduleNameMapper target for `@rtd/dom` under jest-environment-rtd: returns the instance the
// environment loaded (see src/index.ts, "singleton strategy") instead of a per-test-file copy.
"use strict";
const modules = globalThis[Symbol.for("rtd.dom.modules")];
if (modules === undefined) {
  throw new Error("@rtd/dom is mapped to jest-environment-rtd's shim, but the test is not running under testEnvironment \"rtd\".");
}
module.exports = modules.dom;
