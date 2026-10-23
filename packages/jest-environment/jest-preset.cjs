// `preset: "jest-environment-rtd"`: the environment plus the mapping that makes every module
// in a test file share the environment's @rtd/dom instance (see src/index.ts).
"use strict";
const fs = require("node:fs");
const path = require("node:path");

// In the monorepo the environment runs from its TypeScript source; the published package
// ships only the bundle (dist/index.js).
const source = path.join(__dirname, "src/index.ts");

module.exports = {
  testEnvironment: fs.existsSync(source) ? source : path.join(__dirname, "dist/index.js"),
  moduleNameMapper: {
    "^@rtd/dom$": path.join(__dirname, "src/shims/dom.cjs"),
    "^@rtd/dom/internal$": path.join(__dirname, "src/shims/dom-internal.cjs"),
  },
};
