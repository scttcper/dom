// The number users feel: `vitest run` over N small React test files, once per contender per
// sample (fresh `vitest` process each, contenders interleaved). Writes results/suite.json with
// wall time, Vitest's per-file environment setup and worker memory (and the run's date, machine
// and versions). Every run must pass.
// With `--pool vmForks` the same files run in Vitest's VM pool (long-lived workers, a fresh vm
// context and environment per file; vmForks rather than vmThreads so contenders' `--import`
// preloads apply) and the results go to results/suite-vm.json.
//
//   node comparison/suite.ts [--contenders jsdom,ctrl-dom] [--samples 3] [--files 100] [--workers 4] [--pool vmForks]

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { selectContenders, type Contender } from "./contenders/index.ts";
import { generate } from "./lib/suite-files.ts";
import { runInfo } from "./lib/run-info.ts";
import { interleave, median, run, spread, type Spread } from "./lib/spawn.ts";

const here = fileURLToPath(new URL(".", import.meta.url));
const vitestBin = join(dirname(createRequire(import.meta.url).resolve("vitest/package.json")), "vitest.mjs");

export interface SuiteResult {
  wallMs: Spread;
  /** Median over runs of the mean per-file environment setup (Vitest's diagnostic). */
  environmentSetupMs: Spread;
  /** Median over runs of the median worker RSS at the end of a file. */
  workerRssMB: Spread;
}

const lines = (path: string) =>
  readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));

export async function suite(contenders: Contender[], options: { samples: number; files: number; workers: number; pool?: "vmForks" }): Promise<void> {
  generate(options.files);
  const tmp = `${here}results/.suite-tmp/`;
  mkdirSync(tmp, { recursive: true });
  const raw = new Map<string, { wall: number[]; setup: number[]; rss: number[] }>(contenders.map((c) => [c.id, { wall: [], setup: [], rss: [] }]));
  for (let s = 0; s < options.samples; s++) {
    for (const c of interleave(contenders, s)) {
      const diagnostics = `${tmp}${c.id}-${s}-diagnostics.jsonl`;
      const memory = `${tmp}${c.id}-${s}-memory.jsonl`;
      writeFileSync(diagnostics, "");
      writeFileSync(memory, "");
      const pool = options.pool === undefined ? [] : ["--pool", options.pool];
      const exit = await run(process.execPath, [vitestBin, "run", "--config", `${here}suite.config.ts`, "--project", c.id, ...pool], {
        cwd: here,
        env: { ...process.env, COMPARE_DIAGNOSTICS_FILE: diagnostics, COMPARE_MEMORY_FILE: memory, COMPARE_WORKERS: String(options.workers), CI: "1" },
        timeoutMs: 600_000,
      });
      const files = lines(diagnostics);
      const failed = files.filter((f) => f.state !== "passed");
      if (exit.code !== 0 || files.length !== options.files || failed.length > 0) {
        throw new Error(`suite ${c.id}: exit ${exit.code}, ${files.length}/${options.files} files, ${failed.length} failed\n${(exit.stdout + exit.stderr).trim().split("\n").slice(-20).join("\n")}`);
      }
      const r = raw.get(c.id)!;
      r.wall.push(exit.wallMs);
      r.setup.push(files.reduce((sum, f) => sum + f.environmentSetupMs, 0) / files.length);
      r.rss.push(median(lines(memory).map((m) => m.rssMB)));
      process.stderr.write(`suite${options.pool ? ` (${options.pool})` : ""}: ${c.id} sample ${s + 1}/${options.samples}: ${(exit.wallMs / 1000).toFixed(2)} s\n`);
    }
  }
  rmSync(tmp, { recursive: true, force: true });
  const results: Record<string, SuiteResult> = Object.fromEntries(
    [...raw].map(([id, r]) => [id, { wallMs: spread(r.wall), environmentSetupMs: spread(r.setup), workerRssMB: spread(r.rss) }]),
  );
  writeFileSync(`${here}results/${options.pool ? "suite-vm" : "suite"}.json`, `${JSON.stringify({ ...options, run: runInfo(contenders), results }, null, 2)}\n`);
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      contenders: { type: "string" },
      samples: { type: "string", default: "3" },
      files: { type: "string", default: "100" },
      workers: { type: "string", default: "4" },
      pool: { type: "string" },
    },
  });
  if (values.pool !== undefined && values.pool !== "vmForks") throw new Error("--pool: only vmForks is supported");
  const contenders = selectContenders(values.contenders);
  for (const c of contenders) c.check?.();
  await suite(contenders, { samples: Number(values.samples), files: Number(values.files), workers: Number(values.workers), pool: values.pool as "vmForks" | undefined });
}
