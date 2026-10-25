// `pnpm bench:suite`: Vitest end-to-end suite benchmark. Runs the generated fixture project
// (bench/suite/.generated, ~100 small React test files) with `vitest run` per environment, each
// run a fresh process, environments interleaved. Reports wall time (what users feel) next to
// Vitest's own per-file diagnostics and worker memory.
//
//   pnpm bench:suite                              jsdom, happy-dom, ctrl-dom, ctrl-dom-full; 3 samples
//   pnpm bench:suite --envs jsdom,ctrl-dom --samples 5 --files 100 --workers 4
//
// Writes bench/results/<date>-suite-<name>.md/.json.

import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { cpus, platform, release, totalmem } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { generate, generatedDir } from "./generate.ts";
import { summarize, fmt, median, type Summary } from "../lib/stats.ts";

const suiteDir = fileURLToPath(new URL(".", import.meta.url));
const benchDir = join(suiteDir, "..");
const scratch = join(benchDir, "results", ".suite-tmp");

const { values: flags } = parseArgs({
  options: {
    envs: { type: "string", default: "jsdom,happy-dom,ctrl-dom,ctrl-dom-full,ctrl-dom-dist,ctrl-dom-full-dist" },
    samples: { type: "string", default: "3" },
    files: { type: "string", default: "100" },
    workers: { type: "string" },
    pool: { type: "string" },
    name: { type: "string", default: "run" },
    timeout: { type: "string", default: "600" },
    "no-save": { type: "boolean", default: false },
  },
});

const envs = flags.envs.split(",").filter(Boolean);
const samples = Number(flags.samples);
const files = Number(flags.files);

const existing = existsSync(generatedDir) ? readdirSync(generatedDir).filter((f) => f.endsWith(".test.tsx")).length : 0;
if (existing !== files) generate(files);

interface FileDiag {
  file: string;
  state: string;
  environmentSetupMs: number;
  prepareMs: number;
  collectMs: number;
  setupMs: number;
  durationMs: number;
}

interface SuiteSample {
  env: string;
  ok: boolean;
  wallMs: number;
  passedFiles: number;
  failedFiles: number;
  envSetupTotalMs: number;
  envSetupPerFileMs: number;
  setupFilesTotalMs: number;
  collectTotalMs: number;
  testsTotalMs: number;
  workerRssMB: number;
  workerHeapMB: number;
  error?: string;
}

/** The most useful lines of a failed run: root causes first, then the first error block. */
function failureSummary(out: string): string {
  const causes = [...new Set(out.match(/Caused by: [^\n]*/g) ?? [])].slice(0, 3);
  const first = out.match(/(?:Error|FAIL|×)[^\n]*\n(?:[^\n]*\n){0,6}/)?.[0] ?? out.split("\n").slice(-12).join("\n");
  return [...causes, first.trim()].join("\n");
}

const vitestBin = join(benchDir, "node_modules", "vitest", "vitest.mjs");

function runOnce(env: string, s: number): Promise<SuiteSample> {
  mkdirSync(scratch, { recursive: true });
  const diagFile = join(scratch, `${env}-${s}-diag.jsonl`);
  const memFile = join(scratch, `${env}-${s}-mem.jsonl`);
  rmSync(diagFile, { force: true });
  rmSync(memFile, { force: true });
  return new Promise((resolve) => {
    const t0 = performance.now();
    const child = spawn(process.execPath, [vitestBin, "run", "--config", join(suiteDir, "vitest.config.ts")], {
      cwd: suiteDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        BENCH_ENV: env,
        BENCH_DIAGNOSTICS_FILE: diagFile,
        BENCH_MEMORY_FILE: memFile,
        ...(flags.workers ? { BENCH_WORKERS: flags.workers } : {}),
        ...(flags.pool ? { BENCH_POOL: flags.pool } : {}),
        NO_COLOR: "1",
      },
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    const timer = setTimeout(() => child.kill("SIGKILL"), Number(flags.timeout) * 1000);
    child.on("close", (code) => {
      clearTimeout(timer);
      const wallMs = performance.now() - t0;
      const read = <T,>(f: string): T[] =>
        existsSync(f)
          ? readFileSync(f, "utf8")
              .split("\n")
              .filter(Boolean)
              .map((l) => JSON.parse(l) as T)
          : [];
      const diags = read<FileDiag>(diagFile);
      const mem = read<{ rssMB: number; heapMB: number }>(memFile);
      const passed = diags.filter((d) => d.state === "passed").length;
      const sum = (k: keyof FileDiag) => diags.reduce((a, d) => a + (d[k] as number), 0);
      const ok = code === 0 && passed === files;
      resolve({
        env,
        ok,
        wallMs,
        passedFiles: passed,
        failedFiles: diags.length - passed,
        envSetupTotalMs: sum("environmentSetupMs"),
        envSetupPerFileMs: diags.length ? sum("environmentSetupMs") / diags.length : NaN,
        setupFilesTotalMs: sum("setupMs"),
        collectTotalMs: sum("collectMs"),
        testsTotalMs: sum("durationMs"),
        workerRssMB: median(mem.map((m) => m.rssMB)),
        workerHeapMB: median(mem.map((m) => m.heapMB)),
        error: ok ? undefined : failureSummary(out),
      });
    });
  });
}

const results: SuiteSample[] = [];
const broken = new Set<string>();
for (let s = 0; s < samples; s++) {
  const rot = s % envs.length;
  let order = [...envs.slice(rot), ...envs.slice(0, rot)];
  if (s % 2) order = order.reverse();
  for (const env of order) {
    if (broken.has(env)) continue;
    const r = await runOnce(env, s);
    results.push(r);
    process.stderr.write(
      `s${s + 1} ${env}: ${r.ok ? "" : "FAILED "}wall ${(r.wallMs / 1000).toFixed(2)} s, env setup Σ ${(r.envSetupTotalMs / 1000).toFixed(2)} s, ${r.passedFiles}/${files} files passed\n`,
    );
    // An environment where nothing passes (e.g. not implemented yet) is not re-run.
    if (r.passedFiles === 0) broken.add(env);
  }
}
rmSync(scratch, { recursive: true, force: true });

interface Row {
  env: string;
  runs: number;
  failedRuns: number;
  wall?: Summary;
  envSetupTotal?: Summary;
  envSetupPerFile?: Summary;
  setupFiles?: Summary;
  collect?: Summary;
  tests?: Summary;
  rss?: Summary;
  heap?: Summary;
  error?: string;
}

const rows: Row[] = envs.map((env) => {
  const all = results.filter((r) => r.env === env);
  // Timing only from runs where every file passed: a failing environment can't "win".
  const ok = all.filter((r) => r.ok);
  const row: Row = { env, runs: all.length, failedRuns: all.length - ok.length, error: all.find((r) => !r.ok)?.error };
  if (ok.length) {
    row.wall = summarize(ok.map((r) => r.wallMs / 1000));
    row.envSetupTotal = summarize(ok.map((r) => r.envSetupTotalMs / 1000));
    row.envSetupPerFile = summarize(ok.map((r) => r.envSetupPerFileMs));
    row.setupFiles = summarize(ok.map((r) => r.setupFilesTotalMs / 1000));
    row.collect = summarize(ok.map((r) => r.collectTotalMs / 1000));
    row.tests = summarize(ok.map((r) => r.testsTotalMs / 1000));
    row.rss = summarize(ok.map((r) => r.workerRssMB));
    row.heap = summarize(ok.map((r) => r.workerHeapMB));
  }
  return row;
});

const header = ["env", "wall s", "min–max", "env setup Σ s", "env/file ms", "setup Σ s", "import Σ s", "tests Σ s", "worker RSS MB", "worker heap MB", "runs"];
const table = rows.map((r) =>
  r.wall
    ? [
        r.env,
        fmt(r.wall.median),
        `${fmt(r.wall.min)}–${fmt(r.wall.max)}`,
        fmt(r.envSetupTotal!.median),
        fmt(r.envSetupPerFile!.median),
        fmt(r.setupFiles!.median),
        fmt(r.collect!.median),
        fmt(r.tests!.median),
        fmt(r.rss!.median),
        fmt(r.heap!.median),
        `${r.runs - r.failedRuns}/${r.runs}`,
      ]
    : [r.env, "failed", "", "", "", "", "", "", "", "", `0/${r.runs}`],
);

const widths = header.map((h, i) => Math.max(h.length, ...table.map((r) => r[i].length)));
console.log(`\n${[header, ...table].map((r) => r.map((v, i) => (i ? v.padStart(widths[i]) : v.padEnd(widths[i]))).join("  ")).join("\n")}\n`);
for (const r of rows) if (r.error) console.log(`${r.env} failure:\n${r.error}\n`);

if (!flags["no-save"]) {
  const date = new Date().toISOString().slice(0, 10);
  const name = `${date}-suite-${flags.name}`;
  const dir = join(benchDir, "results");
  mkdirSync(dir, { recursive: true });
  const md = [
    `# Vitest suite benchmark: ${name}`,
    "",
    `- **date**: ${new Date().toISOString()}`,
    `- **machine**: ${cpus()[0]?.model ?? "?"} × ${cpus().length}, ${(totalmem() / 2 ** 30).toFixed(0)} GB, ${platform()} ${release()}`,
    `- **node**: ${process.version}`,
    `- **suite**: ${files} generated React test files, \`vitest run\`, ${flags.pool ? `pool ${flags.pool}` : "default pool"}${flags.workers ? `, ${flags.workers} workers` : ""}; ${samples} fresh runs per environment, interleaved`,
    "",
    "Wall: whole `vitest run` process. Σ columns: Vitest's per-file diagnostics summed over files",
    "(CPU time across workers, not wall). Worker memory: per-file RSS / heap at the end of each file",
    "(median over files). Only runs where every file passed are timed.",
    "",
    `| ${header.join(" | ")} |`,
    `| ${header.map((_, i) => (i ? "---:" : "---")).join(" | ")} |`,
    ...table.map((r) => `| ${r.join(" | ")} |`),
    "",
    ...rows.filter((r) => r.error).flatMap((r) => [`**${r.env} failure**`, "", "```", r.error!, "```", ""]),
  ].join("\n");
  writeFileSync(join(dir, `${name}.md`), md);
  writeFileSync(join(dir, `${name}.json`), `${JSON.stringify({ rows, results }, null, 2)}\n`);
  console.log(`wrote ${join(dir, name)}.md and .json`);
}
