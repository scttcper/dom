// (d2) the preset (environment + @rtd/dom mapping), whole @rtd stack.
"use strict";
module.exports = {
  preset: "jest-environment-rtd",
  testMatch: ["<rootDir>/rtd.jest.test.cjs"],
  setupFilesAfterEnv: ["@rtd/jest-dom"],
  transform: { "\\.[cm]?js$": "<rootDir>/record-transform.cjs" },
  transformIgnorePatterns: [],
};
