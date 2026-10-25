// Shared by the benchmark files: how each benchmark is run and where its result is written.
//
// Every contender is a Vitest project running the same files (vitest.config.ts); `measure()`
// registers a per-project benchmark, so Vitest prints one cross-project table per benchmark, and
// writes the result with its label to results/raw/<contender>/<slug>.json for report.ts.

import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inject, type TestContext } from "vitest";

declare module "vitest" {
  interface ProvidedContext {
    /** The contender this project runs (contenders/index.ts). */
    contender: string;
    /** Set when its DOM is another contender's (DOM-only benchmarks are skipped). */
    sameDomAs: string | null;
  }
}

/**
 * Wall-clock time from the process's high-resolution clock: ctrl-dom's environment moves
 * `performance.now()` onto a virtual clock that skips idle time, which must not leak into a
 * measurement of real time.
 */
const now = () => Number(process.hrtime.bigint()) / 1e6;

const TIME = Number(process.env.COMPARE_TIME ?? 1000);
const RUN = { time: TIME, warmupTime: Math.min(250, TIME / 4), now };

/** True when this project shares another contender's DOM (DOM-only benchmarks run once). */
export const sharesDom = inject("sameDomAs") !== null;

// (Not `new URL(template, import.meta.url)`: Vite rewrites that pattern as an asset import.)
const rawDir = join(dirname(fileURLToPath(import.meta.url)), "..", "results", "raw", inject("contender"));
/** Row order in reports: file, then registration order within it. */
let sequence = 0;

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

type Hook = () => void | Promise<void>;
type Hooks = { beforeEach?: Hook; afterEach?: Hook; beforeAll?: Hook; afterAll?: Hook };

/** Run one benchmark in this project and record it under `name` (the row label in reports). */
export async function measure(context: TestContext, name: string, fn: () => unknown, hooks: Hooks = {}): Promise<void> {
  const result = await context.bench(name, { ...hooks, perProject: true }, fn).run(RUN);
  const file = basename(context.task.file.filepath);
  mkdirSync(rawDir, { recursive: true });
  writeFileSync(
    join(rawDir, `${slug(name)}.json`),
    `${JSON.stringify({ name, file, group: context.task.suite?.name ?? "", order: `${file}:${String(sequence++).padStart(3, "0")}`, latency: result.latency, throughput: result.throughput }, null, 2)}\n`,
  );
}
