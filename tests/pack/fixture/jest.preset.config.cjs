// (d2) the README's whole-stack setup: `preset: "@ctrl/dom"` routes the stock @testing-library/*
// imports of an unchanged test file to @ctrl/dom's CommonJS builds.
"use strict";
module.exports = {
  preset: "@ctrl/dom",
  testMatch: ["<rootDir>/stock.jest.test.cjs"],
  setupFilesAfterEnv: ["@ctrl/dom/jest-dom"],
  transform: { "\\.[cm]?js$": "<rootDir>/record-transform.cjs" },
  transformIgnorePatterns: [],
};
