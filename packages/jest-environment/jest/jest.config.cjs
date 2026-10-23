// Jest project for the integration tests (run by test/jest.test.ts, or directly with
// `pnpm exec jest --config jest/jest.config.cjs` from this package).
"use strict";
const path = require("node:path");

module.exports = {
  rootDir: __dirname,
  preset: path.join(__dirname, "../jest-preset.cjs"),
  testMatch: ["<rootDir>/**/*.test.cjs"],
  transform: {},
  testEnvironmentOptions: { url: "http://localhost:3000/start", width: 1280 },
};
