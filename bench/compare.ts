// `pnpm bench:compare`: regression check between two checkouts of this repository (CI runs it
// on every pull request: .github/workflows/bench.yml). Both must be clean checkouts with
// dependencies installed (and `pnpm build` run, for the startup rows): the main working tree
// times ~10% differently from a fresh checkout of the same commit, so never compare against it.
//
//   node bench/compare.ts --base ../base --head .   [--samples 7] [--workloads react/,dom/]
//        [--threshold 0.10] [--markdown summary.md] [--json results.json]
//
// Every sample is a fresh process (bench/worker.ts of that checkout). For each sample index, each
// workload runs base then head, or head then base on odd samples, so drift hits both sides
// equally, and the verdict uses the pairs: a metric regresses when the median of the per-sample
// head/base ratios exceeds 1 + threshold and the medians differ by more than a noise floor
// (sub-millisecond rows and tiny allocations are dominated by per-call overhead). Median time and
// allocation per iteration (bench/worker.ts gcCosts) are checked; heap after GC and peak RSS are
// reported next to them. Exits 1 on any regression or failed sample.

import { spawn } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import type { SampleResult } from "./worker.ts";
import { median } from "./lib/stats.ts";

const { values: flags } = parseArgs({
  options: {
    base: { type: "string" },
    head: { type: "string", default: "." },
    samples: { type: "string", default: "7" },
    workloads: { type: "string" },
    threshold: { type: "string", default: "0.10" },
    "min-ms": { type: "string", default: "0.5" },
    "min-alloc-mb": { type: "string", default: "0.25" },
    markdown: { type: "string" },
    json: { type: "string" },
    timeout: { type: "string", default: "300" },
  },
});

if (flags.base === undefined) {
  console.error("usage: node bench/compare.ts --base <checkout> [--head <checkout>] [--samples N] [--workloads ids]");
  process.exit(2);
}

const sides = { base: resolve(flags.base), head: resolve(flags.head) } as const;
type Side = keyof typeof sides;
for (const [side, dir] of Object.entries(sides)) {
  if (!existsSync(join(dir, "bench/worker.ts"))) throw new Error(`--${side} ${dir} is not a checkout of this repository`);
}

/**
 * Each checkout's configuration names (bench/lib/configs.ts CONFIGS). A checkout from before a
 * rename lists the same configurations in the same order, so the plan's names (the head's) map to
 * the base's by position.
 */
const configNames: Record<Side, string[]> = { base: configsOf(sides.base), head: configsOf(sides.head) };
function configsOf(dir: string): string[] {
  const list = /export const CONFIGS = \[([^\]]*)\]/.exec(readFileSync(join(dir, "bench/lib/configs.ts"), "utf8"))?.[1];
  if (list === undefined) throw new Error(`${dir}: no CONFIGS in bench/lib/configs.ts`);
  return [...list.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}
if (configNames.base.length !== configNames.head.length) throw new Error(`base and head list different configurations: ${configNames.base} vs ${configNames.head}`);
const configOf = (side: Side, config: string): string => configNames[side][configNames.head.indexOf(config)];

/** Workload → configuration measured: our full stack for React rows, the DOM alone otherwise; startup from the bundles users load. */
const PLAN: Array<[workload: string, config: string]> = [
  ["startup/import", "ctrl-dom-dist"],
  ["startup/env", "ctrl-dom-dist"],
  ["startup/first-render", "ctrl-dom-full-dist"],
  ...[
    "react/form-10-getByRole",
    "react/fill-10-submit",
    "react/form-20-rerender",
    "react/form-100-rerender",
    "react/keyed-list-1000",
    "react/text-queries",
    "react/findby-waitfor",
    "react/mount-unmount-churn",
    "react/styled-form-rerender",
  ].map((w): [string, string] => [w, "ctrl-dom-full"]),
  // The stock Testing Library path (getComputedStyle per element and ancestor) under author styles.
  ["react/styled-form-rerender", "ctrl-dom"],
  ...[
    "dom/create-4k",
    "dom/build-1000-rows",
    "dom/attr-revisions",
    "dom/deep-clone",
    "dom/innerhtml-250",
    "dom/selector-warm",
    "dom/mutation-query",
    "dom/role-selector-query",
    "dom/event-propagation-30",
    "dom/mutation-observer-50",
    "dom/window-churn",
  ].map((w): [string, string] => [w, "ctrl-dom"]),
];

const patterns = flags.workloads?.split(",").filter(Boolean);
const plan = PLAN.filter(([w]) => !patterns || patterns.some((p) => w === p || w.startsWith(p)));
const samples = Number(flags.samples);
const threshold = Number(flags.threshold);
const minMs = Number(flags["min-ms"]);
const minAllocMB = Number(flags["min-alloc-mb"]);
const timeoutMs = Number(flags.timeout) * 1000;

function runSample(side: Side, workload: string, config: string): Promise<SampleResult> {
  const dir = sides[side];
  return new Promise((done) => {
    const child = spawn(process.execPath, ["--expose-gc", "--no-warnings", join(dir, "bench/worker.ts"), workload, configOf(side, config)], {
      cwd: join(dir, "bench"),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const line = out.split("\n").findLast((l) => l.startsWith("@@RESULT "));
      if (line) return done(JSON.parse(line.slice("@@RESULT ".length)));
      done({ ok: false, workload, config, error: `${side}: worker exited ${code ?? signal}\n${err.trim().split("\n").slice(-4).join("\n")}` } as SampleResult);
    });
  });
}

interface Row {
  workload: string;
  config: string;
  base: SampleResult[];
  head: SampleResult[];
}
const rows: Row[] = plan.map(([workload, config]) => ({ workload, config, base: [], head: [] }));

const started = performance.now();
for (let s = 0; s < samples; s++) {
  for (const row of rows) {
    if (row.base.some((r) => !r.ok) || row.head.some((r) => !r.ok)) continue;
    const order: Side[] = s % 2 === 0 ? ["base", "head"] : ["head", "base"];
    for (const side of order) row[side].push(await runSample(side, row.workload, row.config));
  }
  const elapsed = (performance.now() - started) / 1000;
  console.error(`sample ${s + 1}/${samples} done (${elapsed.toFixed(0)} s)`);
}

interface Metric {
  base: number;
  head: number;
  /** Median of per-sample head/base ratios. */
  ratio: number;
  regressed: boolean;
}

function metric(row: Row, read: (r: SampleResult) => number | undefined, floor: number | null): Metric | null {
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < Math.min(row.base.length, row.head.length); i++) {
    const b = read(row.base[i]);
    const h = read(row.head[i]);
    if (b !== undefined && h !== undefined && Number.isFinite(b) && Number.isFinite(h)) pairs.push([b, h]);
  }
  if (pairs.length === 0) return null;
  const base = median(pairs.map(([b]) => b));
  const head = median(pairs.map(([, h]) => h));
  const ratio = median(pairs.map(([b, h]) => (b === 0 ? (h === 0 ? 1 : Infinity) : h / b)));
  const regressed = floor !== null && ratio > 1 + threshold && head - base > floor;
  return { base, head, ratio, regressed };
}

const fmt = (x: number, digits = 2) => (Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(digits));
const pct = (m: Metric) => `${m.ratio >= 1 ? "+" : ""}${((m.ratio - 1) * 100).toFixed(1)}%`;
const cell = (m: Metric | null, unit: string) => (m === null ? "–" : `${fmt(m.base)} → ${fmt(m.head)} ${unit} (${pct(m)})${m.regressed ? " **regressed**" : ""}`);

const lines = [
  `## Benchmark: head vs base`,
  "",
  `${samples} interleaved samples per side, fresh process each. Regression: median per-sample ratio > ${(1 + threshold).toFixed(2)} and a change above ${minMs} ms / ${minAllocMB} MB.`,
  "",
  "| workload | config | median time | allocated / iteration | heap after GC | peak RSS |",
  "| --- | --- | --- | --- | --- | --- |",
];
const failures: string[] = [];
const report: unknown[] = [];
for (const row of rows) {
  const failed = [...row.base, ...row.head].find((r) => !r.ok);
  if (failed) {
    // A workload the base checkout does not have yet is not a failure.
    if (row.base.some((r) => !r.ok && /unknown workload/.test(r.error ?? ""))) {
      lines.push(`| ${row.workload} | ${row.config} | new in head | | | |`);
      continue;
    }
    failures.push(`${row.workload} (${row.config}): ${failed.error}`);
    lines.push(`| ${row.workload} | ${row.config} | **failed** | | | |`);
    continue;
  }
  const time = metric(row, (r) => r.medianMs, minMs);
  const alloc = metric(row, (r) => r.extra?.allocMB, minAllocMB);
  const heap = metric(row, (r) => r.heapMB, null);
  const rss = metric(row, (r) => r.maxRssMB, null);
  for (const [name, m] of [["time", time], ["allocation", alloc]] as const) {
    if (m?.regressed) failures.push(`${row.workload} (${row.config}): ${name} ${pct(m)}`);
  }
  lines.push(`| ${row.workload} | ${row.config} | ${cell(time, "ms")} | ${cell(alloc, "MB")} | ${cell(heap, "MB")} | ${cell(rss, "MB")} |`);
  report.push({ workload: row.workload, config: row.config, time, alloc, heap, rss, base: row.base, head: row.head });
}
lines.push("", failures.length ? `**${failures.length} regression(s)**:\n\n${failures.map((f) => `- ${f}`).join("\n")}` : "No regressions.", "");

const markdown = lines.join("\n");
console.log(markdown);
if (flags.markdown) writeFileSync(flags.markdown, markdown);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
if (flags.json) writeFileSync(flags.json, JSON.stringify({ samples, threshold, rows: report }, null, 2));
process.exitCode = failures.length ? 1 : 0;
