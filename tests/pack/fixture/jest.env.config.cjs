// (d1) environment only, stock Testing Library.
"use strict";
module.exports = {
  testEnvironment: "jest-environment-rtd",
  testMatch: ["<rootDir>/stock.jest.test.cjs"],
  setupFilesAfterEnv: ["@testing-library/jest-dom"],
  transform: { "\\.[cm]?js$": "<rootDir>/record-transform.cjs" },
  transformIgnorePatterns: [],
};
