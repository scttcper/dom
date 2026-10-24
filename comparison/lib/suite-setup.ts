// Setup file of the suite benchmark: jest-dom's matchers (a contender may alias them), and the
// worker's memory after each file's tests, appended to COMPARE_MEMORY_FILE.
import "@testing-library/jest-dom/vitest";
import { appendFileSync } from "node:fs";
import { afterAll } from "vitest";

afterAll(() => {
  const out = process.env.COMPARE_MEMORY_FILE;
  if (!out) return;
  const memory = process.memoryUsage();
  appendFileSync(out, `${JSON.stringify({ rssMB: memory.rss / 2 ** 20, heapMB: memory.heapUsed / 2 ** 20 })}\n`);
});
