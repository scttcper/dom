// moduleNameMapper target for `@rtd/dom/internal` under jest-environment-rtd (see dom.cjs).
"use strict";
const modules = globalThis[Symbol.for("rtd.dom.modules")];
if (modules === undefined) {
  throw new Error("@rtd/dom/internal is mapped to jest-environment-rtd's shim, but the test is not running under testEnvironment \"rtd\".");
}
module.exports = modules.internal;
