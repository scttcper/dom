// (d1) environment only, stock Testing Library.
"use strict";
module.exports = {
  testEnvironment: "@ctrl/dom-jest-environment",
  testMatch: ["<rootDir>/stock.jest.test.cjs"],
  setupFilesAfterEnv: ["@testing-library/jest-dom"],
  transform: { "\\.[cm]?js$": "<rootDir>/record-transform.cjs" },
  transformIgnorePatterns: [],
};
