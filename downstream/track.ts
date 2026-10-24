#!/usr/bin/env node
// Tracked pass counts for the downstream suites: compare each suite's latest run (the per-mode
// report.json its runner writes under downstream/<suite>/output/) with downstream/baseline.json,
// so a change in what passes shows up as a diff (.github/workflows/downstream.yml runs every suite
// on demand and calls this).
//
//   node downstream/track.ts [--suites base-ui,radix,react-aria,sentry] [--markdown out.md]
//   node downstream/track.ts --update [--suites ...]    rewrite the baseline from the latest runs
//
// Exits 1 when a test that passed in the baseline no longer passes (in any mode: a jsdom
// regression means the upstream run itself is broken), when a mode the baseline tracks has no
// report, or when a run used a different preset or upstream commit than the baseline. Tests that
// now pass are reported as fixed; update the baseline to keep them.

import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const here = dirname(fileURLToPath(import.meta.url));
const BASELINE = join(here, "baseline.json");

/** Each suite's tracked preset and where its runner writes a mode's report. */
const SUITES: Record<string, { preset: string; output: (mode: string) => string }> = {
  "base-ui": { preset: "all", output: (mode) => join(here, "base-ui/output", mode) },
  radix: { preset: "all", output: (mode) => join(here, "radix/output", mode) },
  "react-aria": { preset: "all", output: (mode) => join(here, "react-aria/output", mode) },
  sentry: { preset: "components", output: (mode) => join(here, "sentry/output/components", mode) },
};
const MODES = ["jsdom", "rtd-dom", "rtd-full"];

const { values: flags } = parseArgs({
  options: {
    suites: { type: "string", default: Object.keys(SUITES).join(",") },
    update: { type: "boolean", default: false },
    markdown: { type: "string" },
  },
});

interface ModeCounts {
  passed: number;
  failed: number;
  skipped: number;
  /** "file::full test name" of every failing test (or "file::(suite failed to load)"), sorted. */
  failing: string[];
  /** Tests known to be intermittent in this mode: ignored when diffing. */
  flaky?: string[];
}
interface SuiteBaseline {
  preset: string;
  commit: string;
  modes: Record<string, ModeCounts>;
}
type Baseline = Record<string, SuiteBaseline>;

interface Run {
  preset: string;
  commit: string;
  counts: ModeCounts;
}

/** A mode's latest run, from its runner's report.json (Vitest and Jest JSON share this shape) and summary.json. */
function readRun(suite: string, mode: string): Run | null {
  const dir = SUITES[suite].output(mode);
  const reportPath = join(dir, "report.json");
  if (!existsSync(reportPath)) return null;
  const summary = existsSync(join(dir, "summary.json")) ? JSON.parse(readFileSync(join(dir, "summary.json"), "utf8")) : {};
  const report = JSON.parse(readFileSync(reportPath, "utf8")) as {
    testResults: Array<{ name: string; status?: string; message?: string; assertionResults: Array<{ fullName: string; status: string }> }>;
  };
  const counts: ModeCounts = { passed: 0, failed: 0, skipped: 0, failing: [] };
  for (const file of report.testResults) {
    const path = file.name.includes("/checkout/") ? file.name.slice(file.name.indexOf("/checkout/") + "/checkout/".length) : file.name;
    if (file.assertionResults.length === 0 && file.status === "failed") counts.failing.push(`${path}::(suite failed to load)`);
    for (const a of file.assertionResults) {
      if (a.status === "passed") counts.passed++;
      else if (a.status === "failed") {
        counts.failed++;
        counts.failing.push(`${path}::${a.fullName}`);
      } else counts.skipped++;
    }
  }
  counts.failing.sort();
  return { preset: summary.preset ?? "?", commit: summary.commit ?? "?", counts };
}

const baseline: Baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : {};
const suites = flags.suites.split(",").filter(Boolean);
for (const suite of suites) if (!(suite in SUITES)) throw new Error(`unknown suite ${suite} (have: ${Object.keys(SUITES).join(", ")})`);

if (flags.update) {
  for (const suite of suites) {
    const previous = baseline[suite];
    const next: SuiteBaseline = { preset: SUITES[suite].preset, commit: "", modes: {} };
    for (const mode of MODES) {
      const run = readRun(suite, mode);
      if (run === null) continue;
      if (run.preset !== next.preset) throw new Error(`${suite}/${mode}: latest run used preset ${run.preset}, tracked preset is ${next.preset}`);
      if (next.commit !== "" && run.commit !== next.commit) throw new Error(`${suite}: modes ran on different upstream commits (${next.commit} vs ${run.commit})`);
      next.commit = run.commit;
      next.modes[mode] = { ...run.counts, flaky: previous?.modes[mode]?.flaky ?? [] };
    }
    if (Object.keys(next.modes).length === 0) throw new Error(`${suite}: no reports under ${relative(process.cwd(), SUITES[suite].output("<mode>"))}`);
    baseline[suite] = next;
    console.log(`${suite}: ${Object.entries(next.modes).map(([m, c]) => `${m} ${c.passed}/${c.failed}/${c.skipped}`).join(", ")}`);
  }
  writeFileSync(BASELINE, `${JSON.stringify(baseline, null, 2)}\n`);
  console.log(`wrote ${relative(process.cwd(), BASELINE)}`);
  process.exit(0);
}

const delta = (now: number, then: number) => (now === then ? `${now}` : `${now} (${now > then ? "+" : ""}${now - then})`);
const problems: string[] = [];
const md: string[] = [];
for (const suite of suites) {
  const tracked = baseline[suite];
  if (tracked === undefined) {
    problems.push(`${suite}: not in downstream/baseline.json (run with --update)`);
    continue;
  }
  md.push(`## ${suite} (${tracked.preset} @ ${tracked.commit.slice(0, 10)})`, "", "| mode | passed | failed | skipped | vs baseline |", "| --- | --: | --: | --: | --- |");
  const details: string[] = [];
  for (const [mode, then] of Object.entries(tracked.modes)) {
    const run = readRun(suite, mode);
    if (run === null) {
      problems.push(`${suite}/${mode}: no report`);
      md.push(`| ${mode} | | | | **no report** |`);
      continue;
    }
    if (run.preset !== tracked.preset) problems.push(`${suite}/${mode}: ran preset ${run.preset}, baseline tracks ${tracked.preset}`);
    if (run.commit !== tracked.commit) problems.push(`${suite}/${mode}: ran upstream ${run.commit.slice(0, 10)}, baseline is ${tracked.commit.slice(0, 10)} (update the baseline with the manifest)`);
    const flaky = new Set(then.flaky ?? []);
    const before = new Set(then.failing);
    const now = new Set(run.counts.failing);
    const newlyFailing = run.counts.failing.filter((k) => !before.has(k) && !flaky.has(k));
    const fixed = then.failing.filter((k) => !now.has(k) && !flaky.has(k));
    const verdict = [newlyFailing.length ? `**${newlyFailing.length} newly failing**` : "", fixed.length ? `${fixed.length} fixed` : ""].filter(Boolean).join(", ") || "unchanged";
    md.push(`| ${mode} | ${delta(run.counts.passed, then.passed)} | ${delta(run.counts.failed, then.failed)} | ${delta(run.counts.skipped, then.skipped)} | ${verdict} |`);
    if (newlyFailing.length) {
      problems.push(`${suite}/${mode}: ${newlyFailing.length} newly failing`);
      details.push(`<details><summary>${mode}: newly failing (${newlyFailing.length})</summary>`, "", ...newlyFailing.map((k) => `- \`${k}\``), "", "</details>");
    }
    if (fixed.length) details.push(`<details><summary>${mode}: fixed (${fixed.length}) — update the baseline</summary>`, "", ...fixed.map((k) => `- \`${k}\``), "", "</details>");
  }
  md.push("", ...details, "");
}
md.push(problems.length ? `**${problems.length} problem(s)**:\n\n${problems.map((p) => `- ${p}`).join("\n")}\n` : "No regressions against downstream/baseline.json.\n");

const markdown = md.join("\n");
console.log(markdown);
if (flags.markdown) writeFileSync(flags.markdown, markdown);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
process.exitCode = problems.length ? 1 : 0;
