// (d3) `preset: "jest-environment-ctrl-dom"` (environment + @ctrl/dom mapping), @ctrl/dom subpaths
// required directly.
"use strict";
module.exports = {
  preset: "jest-environment-ctrl-dom",
  testMatch: ["<rootDir>/ctrl.jest.test.cjs"],
  setupFilesAfterEnv: ["@ctrl/dom/jest-dom"],
  transform: { "\\.[cm]?js$": "<rootDir>/record-transform.cjs" },
  transformIgnorePatterns: [],
};
