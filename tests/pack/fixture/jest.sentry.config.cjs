// (s2) docs/sentry.md's Jest setup: the preset plus @ctrl/dom/sentry's reporter, SENTRY_DSN set by
// sentry.check.mjs.
"use strict";
module.exports = {
  preset: "@ctrl/dom",
  testMatch: ["<rootDir>/sentry.jest.test.cjs"],
  setupFilesAfterEnv: ["@ctrl/dom/jest-dom"],
  reporters: ["default", "@ctrl/dom/sentry/jest"],
};
