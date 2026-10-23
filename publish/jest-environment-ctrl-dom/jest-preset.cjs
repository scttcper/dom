// `preset: "jest-environment-ctrl-dom"`: the environment, plus the mapping that makes every module
// in a test file share the environment's @ctrl/dom instance. Stock @testing-library/* keep
// working; `preset: "@ctrl/dom"` also routes them to @ctrl/dom's implementations.
"use strict";
const path = require("node:path");

module.exports = {
  testEnvironment: path.join(__dirname, "dist/index.js"),
  moduleNameMapper: {
    "^@ctrl/dom$": path.join(__dirname, "shims/dom.cjs"),
    "^@ctrl/dom/internal$": path.join(__dirname, "shims/dom-internal.cjs"),
  },
};
