// (f2) `ctrl-dom debug` with the README's Jest setup.
"use strict";
module.exports = {
  preset: "@ctrl/dom",
  testMatch: ["<rootDir>/debug.jest.fixture.cjs"],
  setupFilesAfterEnv: ["@ctrl/dom/jest-dom"],
  transform: { "\\.[cm]?js$": "<rootDir>/record-transform.cjs" },
  transformIgnorePatterns: [],
};
