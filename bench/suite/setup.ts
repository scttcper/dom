// Suite setup file: jest-dom matchers (aliased to @ctrl/dom/jest-dom under BENCH_ENV=ctrl-dom-full),
// auto-cleanup comes from @testing-library/react itself, plus a per-file memory record taken in
// the worker after the file's tests finish.

import "@testing-library/jest-dom/vitest";
import { appendFileSync } from "node:fs";
import { afterAll } from "vitest";

// *-dist environments must really load the bundles (bench/lib/dist-preload.js), not sources.
if ((process.env.BENCH_ENV ?? "").endsWith("-dist") && !((process as { __ctrlDomDistResolutions?: number }).__ctrlDomDistResolutions! > 0)) {
  throw new Error(`BENCH_ENV=${process.env.BENCH_ENV}: no @ctrl/dom import was resolved to dist/ (is the preload active?)`);
}

afterAll(() => {
  const out = process.env.BENCH_MEMORY_FILE;
  if (!out) return;
  const mu = process.memoryUsage();
  appendFileSync(
    out,
    `${JSON.stringify({ pid: process.pid, rssMB: mu.rss / 2 ** 20, heapMB: mu.heapUsed / 2 ** 20 })}\n`,
  );
});

// BENCH_GC_HEAP=<file>: heap after a forced GC at the end of each file (retention per file in
// long-lived workers, e.g. --pool vmForks).
afterAll(async () => {
  const out = process.env.BENCH_GC_HEAP;
  if (!out) return;
  const v8 = await import("node:v8");
  const vm = await import("node:vm");
  v8.setFlagsFromString("--expose-gc");
  const gc = vm.runInNewContext("gc") as () => void;
  gc();
  gc();
  appendFileSync(out, `${process.pid} ${process.memoryUsage().heapUsed}\n`);
});
