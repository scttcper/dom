// runners.test.ts runs Jest on this directory, on Jest's own node environment: README's Jest
// setup, from the package's sources (Node strips their types; nothing is transformed).
"use strict";
module.exports = {
  rootDir: __dirname,
  testMatch: ["<rootDir>/cart.jest.cjs"],
  testEnvironment: "node",
  transform: {},
  // A handful of files: crawling them beats a watchman query (~0.4 s per run where watchman runs).
  watchman: false,
  reporters: ["<rootDir>/../../src/jest.ts"],
  testRunner: "<rootDir>/../../src/jest-runner.ts",
};
