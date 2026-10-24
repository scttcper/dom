// (d3) `testEnvironment: "ctrl-dom"`, @ctrl/dom subpaths required directly (their CJS builds).
"use strict";
module.exports = {
  testEnvironment: "ctrl-dom",
  testMatch: ["<rootDir>/ctrl.jest.test.cjs"],
  setupFilesAfterEnv: ["@ctrl/dom/jest-dom"],
  transform: { "\\.[cm]?js$": "<rootDir>/record-transform.cjs" },
  transformIgnorePatterns: [],
};
