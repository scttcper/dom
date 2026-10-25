// runners.test.ts runs Jest on this directory, on Jest's own node environment: README's Jest
// setup, from the package's sources (Node strips their types; nothing is transformed).
"use strict";
module.exports = {
  rootDir: __dirname,
  testMatch: ["<rootDir>/cart.jest.cjs"],
  testEnvironment: "node",
  transform: {},
  reporters: ["<rootDir>/../../src/jest.ts"],
  testRunner: "<rootDir>/../../src/jest-runner.ts",
};
