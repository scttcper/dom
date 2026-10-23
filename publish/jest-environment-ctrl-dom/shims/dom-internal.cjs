// moduleNameMapper target for `@ctrl/dom/internal` under jest-environment-ctrl-dom (see dom.cjs).
"use strict";
const modules = globalThis[Symbol.for("rtd.dom.modules")];
if (modules === undefined) {
  throw new Error('@ctrl/dom/internal is mapped to the instance jest-environment-ctrl-dom loads, but this test is not running under testEnvironment "ctrl-dom".');
}
module.exports = modules.internal;
