// Suite setup file: jest-dom matchers (aliased to @rtd/jest-dom under BENCH_ENV=rtd-full),
// auto-cleanup comes from @testing-library/react itself, plus a per-file memory record taken in
// the worker after the file's tests finish.

import "@testing-library/jest-dom/vitest";
import { appendFileSync } from "node:fs";
import { afterAll } from "vitest";

afterAll(() => {
  const out = process.env.BENCH_MEMORY_FILE;
  if (!out) return;
  const mu = process.memoryUsage();
  appendFileSync(
    out,
    `${JSON.stringify({ pid: process.pid, rssMB: mu.rss / 2 ** 20, heapMB: mu.heapUsed / 2 ** 20 })}\n`,
  );
});
