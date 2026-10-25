// (s2) @ctrl/sentry-tests' Jest setup (its README) with the @ctrl/dom preset: the reporter sends,
// the test runner records each file's spans. SENTRY_DSN set by sentry.check.mjs.
"use strict";
module.exports = {
  preset: "@ctrl/dom",
  testMatch: ["<rootDir>/sentry.jest.test.cjs", "<rootDir>/sentry-broken.jest.test.cjs"],
  setupFilesAfterEnv: ["@ctrl/dom/jest-dom"],
  reporters: ["default", "@ctrl/sentry-tests/jest"],
  testRunner: "@ctrl/sentry-tests/jest-runner",
};
