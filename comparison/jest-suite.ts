// `jest` over N small React test files (lib/jest-files.ts), once per contender per sample: a fresh
// Jest process each, contenders interleaved, after one untimed run per contender (Jest's haste
// map and caches warm, as they are on a developer's machine). Writes results/suite-jest.json in
// suite.ts's shape: wall time, Jest's per-file environment load (perfStats
// loadTestEnvironmentEnd − loadTestEnvironmentStart: the environment module plus its constructor,
// where jest-environment-jsdom and ours build the window) and worker RSS after each file. Every
// run must pass. Contenders without a `jest` setup are skipped.
//
//   node comparison/jest-suite.ts [--contenders jsdom,ctrl-dom] [--samples 3] [--files 100] [--workers 4]

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { selectContenders, type Contender } from "./contenders/index.ts";
import { generateJest, jestGeneratedDir } from "./lib/jest-files.ts";
import { interleave, median, run, spread } from "./lib/spawn.ts";
import type { SuiteResult } from "./suite.ts";

const here = fileURLToPath(new URL(".", import.meta.url));
const jestBin = createRequire(import.meta.url).resolve("jest/bin/jest");

interface JestReport {
  success: boolean;
  numTotalTestSuites: number;
  numFailedTests: number;
  testResults: Array<{ name: string; status: string; message: string }>;
}

const lines = (path: string) =>
  readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));

function writeConfig(c: Contender, tmp: string): string {
  const jest = c.jest!;
  const config = {
    rootDir: jestGeneratedDir,
    testMatch: ["<rootDir>/*.test.cjs"],
    // Plain CommonJS test files: nobody pays for a transformer.
    transform: {},
    testEnvironment: jest.testEnvironment,
    testEnvironmentOptions: jest.testEnvironmentOptions ?? {},
    moduleNameMapper: jest.moduleNameMapper ?? {},
    setupFilesAfterEnv: [`${here}lib/jest-setup.cjs`],
    reporters: ["default", `${here}lib/jest-reporter.cjs`],
    cacheDirectory: `${tmp}cache-${c.id}`,
    watchman: false,
  };
  const path = `${tmp}${c.id}.config.json`;
  writeFileSync(path, JSON.stringify(config, null, 2));
  return path;
}

async function runJest(c: Contender, config: string, out: string, memory: string, diagnostics: string, workers: number) {
  const imports = (c.preload ?? []).map((p) => `--import ${p}`);
  const exit = await run(process.execPath, [jestBin, "--config", config, "--ci", "--json", "--outputFile", out, "--maxWorkers", String(workers)], {
    cwd: here,
    env: { ...process.env, ...c.env, NODE_OPTIONS: [process.env.NODE_OPTIONS, ...imports].filter(Boolean).join(" "), COMPARE_MEMORY_FILE: memory, COMPARE_DIAGNOSTICS_FILE: diagnostics },
    timeoutMs: 600_000,
  });
  return exit;
}

export async function jestSuite(contenders: Contender[], options: { samples: number; files: number; workers: number }): Promise<void> {
  const cs = contenders.filter((c) => c.jest !== undefined);
  if (cs.length === 0) return;
  generateJest(options.files);
  const tmp = `${here}results/.jest-tmp/`;
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const configs = new Map(cs.map((c) => [c.id, writeConfig(c, tmp)]));
  const raw = new Map(cs.map((c) => [c.id, { wall: [] as number[], setup: [] as number[], rss: [] as number[] }]));
  for (const c of cs) await runJest(c, configs.get(c.id)!, `${tmp}${c.id}-warmup.json`, `${tmp}${c.id}-warmup-memory.jsonl`, `${tmp}${c.id}-warmup-diagnostics.jsonl`, options.workers);
  for (let s = 0; s < options.samples; s++) {
    for (const c of interleave(cs, s)) {
      const out = `${tmp}${c.id}-${s}.json`;
      const memory = `${tmp}${c.id}-${s}-memory.jsonl`;
      const diagnostics = `${tmp}${c.id}-${s}-diagnostics.jsonl`;
      writeFileSync(memory, "");
      writeFileSync(diagnostics, "");
      const exit = await runJest(c, configs.get(c.id)!, out, memory, diagnostics, options.workers);
      let report: JestReport | null = null;
      try {
        report = JSON.parse(readFileSync(out, "utf8")) as JestReport;
      } catch {
        // no report: reported below
      }
      if (exit.code !== 0 || report === null || !report.success || report.numTotalTestSuites !== options.files || report.numFailedTests > 0) {
        const failed = report?.testResults.find((r) => r.status !== "passed");
        throw new Error(`jest ${c.id}: exit ${exit.code}, ${report?.numTotalTestSuites ?? 0}/${options.files} files\n${failed?.message ?? (exit.stdout + exit.stderr).trim().split("\n").slice(-20).join("\n")}`);
      }
      const r = raw.get(c.id)!;
      r.wall.push(exit.wallMs);
      const setups = lines(diagnostics).map((d) => d.environmentMs as number);
      r.setup.push(setups.reduce((a, b) => a + b, 0) / setups.length);
      r.rss.push(median(lines(memory).map((m) => m.rssMB)));
      process.stderr.write(`jest: ${c.id} sample ${s + 1}/${options.samples}: ${(exit.wallMs / 1000).toFixed(2)} s\n`);
    }
  }
  rmSync(tmp, { recursive: true, force: true });
  const results: Record<string, SuiteResult> = Object.fromEntries(
    [...raw].map(([id, r]) => [id, { wallMs: spread(r.wall), environmentSetupMs: spread(r.setup), workerRssMB: spread(r.rss) }]),
  );
  const labels = Object.fromEntries(cs.map((c) => [c.id, c.jest!.label()]));
  writeFileSync(`${here}results/suite-jest.json`, `${JSON.stringify({ ...options, labels, results }, null, 2)}\n`);
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      contenders: { type: "string" },
      samples: { type: "string", default: "3" },
      files: { type: "string", default: "100" },
      workers: { type: "string", default: "4" },
    },
  });
  const contenders = selectContenders(values.contenders);
  for (const c of contenders) c.check?.();
  await jestSuite(contenders, { samples: Number(values.samples), files: Number(values.files), workers: Number(values.workers) });
}
