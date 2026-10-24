// (d3) @ctrl/dom subpaths required directly (their CJS builds); the test file picks the
// environment with a `@jest-environment @ctrl/dom-jest-environment` docblock.
"use strict";
module.exports = {
  testMatch: ["<rootDir>/ctrl.jest.test.cjs"],
  setupFilesAfterEnv: ["@ctrl/dom/jest-dom"],
  transform: { "\\.[cm]?js$": "<rootDir>/record-transform.cjs" },
  transformIgnorePatterns: [],
};
