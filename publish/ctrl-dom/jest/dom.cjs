// moduleNameMapper target for `@ctrl/dom` under jest-environment-ctrl-dom: the instance the
// environment loaded, so every module in a test file shares one DOM (a per-test-file copy from
// Jest's module registry would fail `instanceof` against the globals).
"use strict";
const modules = globalThis[Symbol.for("rtd.dom.modules")];
if (modules === undefined) {
  throw new Error('@ctrl/dom is mapped to the instance jest-environment-ctrl-dom loads, but this test is not running under testEnvironment "ctrl-dom".');
}
module.exports = modules.dom;
