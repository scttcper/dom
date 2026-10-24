// Reporter of the Jest suite (jest-suite.ts): each file's environment load time
// (perfStats.loadTestEnvironmentEnd − loadTestEnvironmentStart), appended to
// COMPARE_DIAGNOSTICS_FILE. Jest's --json output does not carry perfStats.
"use strict";
const { appendFileSync } = require("node:fs");

module.exports = class EnvironmentTimingReporter {
  onTestResult(_test, result) {
    const out = process.env.COMPARE_DIAGNOSTICS_FILE;
    if (!out) return;
    const { loadTestEnvironmentStart, loadTestEnvironmentEnd } = result.perfStats;
    appendFileSync(out, `${JSON.stringify({ file: result.testFilePath, environmentMs: loadTestEnvironmentEnd - loadTestEnvironmentStart })}\n`);
  }
};
