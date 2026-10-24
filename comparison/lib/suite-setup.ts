// Setup file of the suite benchmark: jest-dom's matchers (a contender may alias them), and the
// worker's memory after each file's tests, appended to COMPARE_MEMORY_FILE, with the worker
// process's age and CPU time at that point (under the default pool a worker runs one file, so
// these are the per-file cost from process start, spawn excluded; less sensitive to how busy
// the machine is than the run's wall time).
import "@testing-library/jest-dom/vitest";
import { appendFileSync } from "node:fs";
import { afterAll } from "vitest";

afterAll(() => {
  const out = process.env.COMPARE_MEMORY_FILE;
  if (!out) return;
  const memory = process.memoryUsage();
  const cpu = process.cpuUsage();
  // process.uptime(): performance.now() may be on the environment's virtual clock.
  appendFileSync(
    out,
    `${JSON.stringify({ rssMB: memory.rss / 2 ** 20, heapMB: memory.heapUsed / 2 ** 20, ageMs: process.uptime() * 1000, cpuMs: (cpu.user + cpu.system) / 1000 })}\n`,
  );
});
