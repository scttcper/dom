// setupFilesAfterEnv of the Jest suite (jest-suite.ts): jest-dom's matchers (a contender may map
// them to its own), and the worker's memory after each file's tests, appended to
// COMPARE_MEMORY_FILE (as lib/suite-setup.ts does under Vitest).
"use strict";
require("@testing-library/jest-dom");
const { appendFileSync } = require("node:fs");

afterAll(() => {
  const out = process.env.COMPARE_MEMORY_FILE;
  if (!out) return;
  const memory = process.memoryUsage();
  appendFileSync(out, `${JSON.stringify({ rssMB: memory.rss / 2 ** 20, heapMB: memory.heapUsed / 2 ** 20 })}\n`);
});
