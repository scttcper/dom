// `preset: "jest-environment-rtd"`: the environment plus the mapping that makes every module
// in a test file share the environment's @rtd/dom instance (see src/index.ts).
"use strict";
const path = require("node:path");

module.exports = {
  testEnvironment: path.join(__dirname, "src/index.ts"),
  moduleNameMapper: {
    "^@rtd/dom$": path.join(__dirname, "src/shims/dom.cjs"),
    "^@rtd/dom/internal$": path.join(__dirname, "src/shims/dom-internal.cjs"),
  },
};
