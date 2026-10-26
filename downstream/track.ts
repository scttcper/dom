#!/usr/bin/env node
// Tracked pass counts for the downstream suites: compare each suite's latest run (the per-mode
// report.json its runner writes under downstream/<suite>/output/) with downstream/baseline.json,
// so a change in what passes shows up as a diff (.github/workflows/downstream.yml runs every suite
// on demand and calls this).
//
//   node downstream/track.ts [--suites base-ui,radix,...] [--markdown out.md]
//   node downstream/track.ts --update [--suites ...] [--modes ...]
//                                                       rewrite the baseline from the latest runs; modes
//                                                       left out of --modes keep their recorded entry
//                                                       (e.g. refresh ctrl-dom numbers without rerunning jsdom)
//   node downstream/track.ts --readme                   regenerate the pass-count tables in README.md and
//                                                       docs/compatibility.md, and each suite README's
//                                                       results, from the baseline
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

/** Each suite's tracked preset, where its runner writes a mode's report, and its README row label. */
const SUITES: Record<string, { preset: string; output: (mode: string) => string; title: string; scope: string }> = {
  "base-ui": {
    preset: "all",
    output: (mode) => join(here, "base-ui/output", mode),
    title: "Base UI",
    scope: "`@base-ui/react`, Vitest",
  },
  radix: {
    preset: "all",
    output: (mode) => join(here, "radix/output", mode),
    title: "Radix Primitives",
    scope: "`unit` project, Vitest",
  },
  "react-aria": {
    preset: "all",
    output: (mode) => join(here, "react-aria/output", mode),
    title: "React Aria",
    scope: "`react-aria` + `react-aria-components`, Jest",
  },
  sentry: {
    preset: "components",
    output: (mode) => join(here, "sentry/output/components", mode),
    title: "Sentry",
    scope: "`static/app/components`, Jest",
  },
  "tanstack-query": {
    preset: "all",
    output: (mode) => join(here, "tanstack-query/output", mode),
    title: "TanStack Query",
    scope: "React adapter packages, Vitest",
  },
  "react-hook-form": {
    preset: "all",
    output: (mode) => join(here, "react-hook-form/output", mode),
    title: "React Hook Form",
    scope: "`Web` project, Jest",
  },
  "react-router": {
    preset: "all",
    output: (mode) => join(here, "react-router/output", mode),
    title: "React Router",
    scope: "`packages/react-router`, Jest in ESM mode",
  },
};
const MODES = ["jsdom", "ctrl-dom", "ctrl-dom-full"];

const { values: flags } = parseArgs({
  options: {
    suites: { type: "string", default: Object.keys(SUITES).join(",") },
    modes: { type: "string", default: MODES.join(",") },
    update: { type: "boolean", default: false },
    readme: { type: "boolean", default: false },
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
  /** Wall time and peak RSS (largest process: the runner or a worker) of the recorded run. */
  wallMs?: number;
  peakRssBytes?: number;
  /** Day this mode's recorded run started (YYYY-MM-DD); modes can be refreshed separately. */
  date?: string;
}
interface SuiteBaseline {
  preset: string;
  commit: string;
  /** Day the recorded runs started (YYYY-MM-DD). */
  date?: string;
  modes: Record<string, ModeCounts>;
}
type Baseline = Record<string, SuiteBaseline>;

interface Run {
  preset: string;
  commit: string;
  counts: ModeCounts;
  /** When the run started (the JSON reporter's startTime, ms). */
  startTime: number;
}

/** A mode's latest run, from its runner's report.json (Vitest and Jest JSON share this shape) and summary.json. */
function readRun(suite: string, mode: string): Run | null {
  const dir = SUITES[suite].output(mode);
  const reportPath = join(dir, "report.json");
  if (!existsSync(reportPath)) return null;
  const summary = existsSync(join(dir, "summary.json"))
    ? JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"))
    : {};
  const report = JSON.parse(readFileSync(reportPath, "utf8")) as {
    startTime: number;
    testResults: Array<{
      name: string;
      status?: string;
      message?: string;
      assertionResults: Array<{ fullName: string; status: string }>;
    }>;
  };
  const counts: ModeCounts = { passed: 0, failed: 0, skipped: 0, failing: [] };
  for (const file of report.testResults) {
    const path = file.name.includes("/checkout/")
      ? file.name.slice(file.name.indexOf("/checkout/") + "/checkout/".length)
      : file.name;
    if (file.assertionResults.length === 0 && file.status === "failed")
      counts.failing.push(`${path}::(suite failed to load)`);
    for (const a of file.assertionResults) {
      if (a.status === "passed") counts.passed++;
      else if (a.status === "failed") {
        counts.failed++;
        counts.failing.push(`${path}::${a.fullName}`);
      } else counts.skipped++;
    }
  }
  counts.failing.sort();
  if (typeof summary.wallMs === "number") counts.wallMs = summary.wallMs;
  if (typeof summary.peakRssBytes === "number") counts.peakRssBytes = summary.peakRssBytes;
  return { preset: summary.preset ?? "?", commit: summary.commit ?? "?", counts, startTime: report.startTime };
}

const baseline: Baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : {};
const suites = flags.suites.split(",").filter(Boolean);
for (const suite of suites)
  if (!(suite in SUITES)) throw new Error(`unknown suite ${suite} (have: ${Object.keys(SUITES).join(", ")})`);

if (flags.readme) {
  // The pass-count tables, generated from the baseline alone so they always show what the
  // tracked runs recorded: a short one in README.md and the detailed one (what each suite covers,
  // its runner and pinned upstream commit) in docs/compatibility.md, each between the
  // downstream:start/end markers.
  const n = (x: number) => x.toLocaleString("en-US");
  const short = [
    "| Project | Tests | jsdom | ctrl-dom | ctrl-dom + its Testing Library |",
    "| --- | ---: | ---: | ---: | ---: |",
  ];
  const detailed = [
    "| Suite | Upstream | Tests | jsdom | ctrl-dom environment | ctrl-dom + its Testing Library |",
    "| --- | --- | ---: | ---: | ---: | ---: |",
  ];
  let anyIntermittent = false;
  for (const [suite, meta] of Object.entries(SUITES)) {
    const tracked = baseline[suite];
    if (tracked === undefined) throw new Error(`${suite}: not in downstream/baseline.json (run with --update)`);
    const manifest = JSON.parse(readFileSync(join(here, suite, "manifest.json"), "utf8")) as { repository: string };
    const repoUrl = manifest.repository.replace(/\.git$/, "");
    const slug = repoUrl.replace(/^https:\/\/github\.com\//, "");
    const jsdom = tracked.modes.jsdom;
    const cell = (mode: string, long: boolean): string => {
      const c = tracked.modes[mode];
      if (c === undefined) return "—";
      const flaky = new Set(c.flaky ?? []);
      const intermittent = c.failing.filter((k) => flaky.has(k)).length;
      if (intermittent === 0) return n(c.passed);
      anyIntermittent = true;
      return n(c.passed) + (long ? ` (${intermittent} intermittent)` : "\\*");
    };
    const total = n(jsdom.passed + jsdom.failed);
    short.push(
      `| [${meta.title}](downstream/${suite}/README.md) | ${total} | ${cell("jsdom", false)} | ${cell("ctrl-dom", false)} | ${cell("ctrl-dom-full", false)} |`,
    );
    detailed.push(
      `| [${meta.title}](../downstream/${suite}/README.md) (${meta.scope}) | [${slug}@${tracked.commit.slice(0, 7)}](${repoUrl}/tree/${tracked.commit}) | ${total} | ${cell("jsdom", true)} | ${cell("ctrl-dom", true)} | ${cell("ctrl-dom-full", true)} |`,
    );
    writeSection(join(here, suite, "README.md"), suiteResults(tracked, repoUrl, slug));
  }
  writeSection(
    join(here, "../README.md"),
    [...short, ...(anyIntermittent ? ["", "<sub>\\* includes tests that fail intermittently.</sub>"] : []), ""].join(
      "\n",
    ),
  );
  writeSection(
    join(here, "../docs/compatibility.md"),
    [
      "Each suite is the project's own unmodified tests at a pinned commit, run three ways: on **jsdom** (the project's own setup), on the **ctrl-dom environment** (only the test environment swapped; stock Testing Library), and on **ctrl-dom + its Testing Library** (`@testing-library/*` replaced by ours too). Columns count passing tests; skipped tests are left out. Each suite's README (linked from its name) says how to run it and has its full results; its TRIAGE.md says what still differs and why.",
      "",
      ...detailed,
      "",
    ].join("\n"),
  );
  process.exit(0);
}

/**
 * A suite README's results: per mode the tracked preset's counts, wall time and peak RSS (with the
 * change against jsdom), then the failing tests.
 */
function suiteResults(tracked: SuiteBaseline, repoUrl: string, slug: string): string {
  const n = (x: number) => x.toLocaleString("en-US");
  const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
  const memory = (bytes: number) =>
    bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GiB` : `${Math.round(bytes / 1024 ** 2)} MiB`;
  const jsdom = tracked.modes.jsdom;
  const measure = (value: number | undefined, base: number | undefined, format: (v: number) => string) => {
    if (value === undefined) return "—";
    if (base === undefined || value === base) return format(value);
    const percent = Math.round(((value - base) / base) * 100);
    return percent === 0 ? format(value) : `${format(value)} (${percent > 0 ? "+" : "−"}${Math.abs(percent)}%)`;
  };
  // Modes refreshed on different days (track.ts --update --modes) name their own day.
  const otherDays = MODES.filter((m) => tracked.modes[m]?.date !== undefined && tracked.modes[m].date !== tracked.date)
    .map((m) => `${m} ${tracked.modes[m].date}`)
    .join(", ");
  const ran = tracked.date === undefined ? "" : `, run ${tracked.date}${otherDays === "" ? "" : ` (${otherDays})`}`;
  const lines = [
    `\`${tracked.preset}\` preset at [${slug}@${tracked.commit.slice(0, 7)}](${repoUrl}/tree/${tracked.commit})${ran}:`,
    "",
    "| mode | passed | failed | skipped | wall time | peak RSS |",
    "| --- | --: | --: | --: | --: | --: |",
  ];
  const failing: string[] = [];
  for (const mode of MODES) {
    const c = tracked.modes[mode];
    if (c === undefined) continue;
    const base = mode === "jsdom" ? undefined : jsdom;
    lines.push(
      `| ${mode} | ${n(c.passed)} | ${n(c.failed)} | ${n(c.skipped)} | ${measure(c.wallMs, base?.wallMs, seconds)} | ${measure(c.peakRssBytes, base?.peakRssBytes, memory)} |`,
    );
    const flaky = new Set(c.flaky ?? []);
    for (const key of c.failing) {
      const at = key.indexOf("::");
      failing.push(
        `- ${mode}: \`${key.slice(0, at)}\` › ${escapeMarkdown(key.slice(at + 2))}${flaky.has(key) ? " (intermittent)" : ""}`,
      );
    }
  }
  lines.push(
    "",
    "**jsdom**: the project's own setup. **ctrl-dom**: `@ctrl/dom` as the test environment, the project's Testing Library packages unchanged. **ctrl-dom-full**: `@ctrl/dom` with its own Testing Library, user-event and jest-dom.",
  );
  if (failing.length !== 0)
    lines.push("", `<details><summary>Failing tests (${failing.length})</summary>`, "", ...failing, "", "</details>");
  return [...lines, ""].join("\n");
}

/** Test names as Markdown text: `<Popover.Root />` would otherwise be taken for an HTML tag. */
function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_<>[\]|]/g, (c) => (c === "<" ? "&lt;" : c === ">" ? "&gt;" : `\\${c}`));
}

/** `YYYY-MM-DD` of `ms` in the local time zone. */
function localDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Replace what is between a file's downstream:start and downstream:end markers. */
function writeSection(path: string, body: string): void {
  const START = /<!-- downstream:start[^>]*-->\n/;
  const END = "<!-- downstream:end -->";
  const text = readFileSync(path, "utf8");
  const start = START.exec(text);
  const end = text.indexOf(END);
  if (start === null || end < start.index)
    throw new Error(
      `${relative(process.cwd(), path)} has no <!-- downstream:start --> … <!-- downstream:end --> markers`,
    );
  writeFileSync(path, text.slice(0, start.index + start[0].length) + body + text.slice(end));
  console.log(`wrote ${relative(process.cwd(), path)}`);
}

if (flags.update) {
  const refresh = new Set(flags.modes.split(",").filter(Boolean));
  for (const mode of refresh)
    if (!MODES.includes(mode)) throw new Error(`unknown mode ${mode} (have: ${MODES.join(", ")})`);
  for (const suite of suites) {
    const previous = baseline[suite];
    const next: SuiteBaseline = { preset: SUITES[suite].preset, commit: "", modes: {} };
    let started = Infinity;
    for (const mode of MODES) {
      if (!refresh.has(mode)) {
        // Not refreshed: keep the recorded entry. The new runs must then be on its upstream commit.
        const kept = previous?.modes[mode];
        if (kept !== undefined) {
          next.modes[mode] = { ...kept, date: kept.date ?? previous!.date };
          next.commit = previous!.commit;
        }
        continue;
      }
      const run = readRun(suite, mode);
      if (run === null) continue;
      if (run.preset !== next.preset)
        throw new Error(`${suite}/${mode}: latest run used preset ${run.preset}, tracked preset is ${next.preset}`);
      if (next.commit !== "" && run.commit !== next.commit)
        throw new Error(`${suite}: modes ran on different upstream commits (${next.commit} vs ${run.commit})`);
      next.commit = run.commit;
      next.modes[mode] = { ...run.counts, flaky: previous?.modes[mode]?.flaky ?? [], date: localDate(run.startTime) };
      started = Math.min(started, run.startTime);
    }
    if (Number.isFinite(started)) next.date = localDate(started);
    if (Object.keys(next.modes).length === 0)
      throw new Error(`${suite}: no reports under ${relative(process.cwd(), SUITES[suite].output("<mode>"))}`);
    baseline[suite] = next;
    console.log(
      `${suite}: ${Object.entries(next.modes)
        .map(([m, c]) => `${m} ${c.passed}/${c.failed}/${c.skipped}`)
        .join(", ")}`,
    );
  }
  writeFileSync(BASELINE, `${JSON.stringify(baseline, null, 2)}\n`);
  console.log(`wrote ${relative(process.cwd(), BASELINE)}`);
  process.exit(0);
}

const delta = (now: number, then: number) =>
  now === then ? `${now}` : `${now} (${now > then ? "+" : ""}${now - then})`;
const problems: string[] = [];
const md: string[] = [];
for (const suite of suites) {
  const tracked = baseline[suite];
  if (tracked === undefined) {
    problems.push(`${suite}: not in downstream/baseline.json (run with --update)`);
    continue;
  }
  md.push(
    `## ${suite} (${tracked.preset} @ ${tracked.commit.slice(0, 10)})`,
    "",
    "| mode | passed | failed | skipped | vs baseline |",
    "| --- | --: | --: | --: | --- |",
  );
  const details: string[] = [];
  for (const [mode, then] of Object.entries(tracked.modes)) {
    const run = readRun(suite, mode);
    if (run === null) {
      problems.push(`${suite}/${mode}: no report`);
      md.push(`| ${mode} | | | | **no report** |`);
      continue;
    }
    if (run.preset !== tracked.preset)
      problems.push(`${suite}/${mode}: ran preset ${run.preset}, baseline tracks ${tracked.preset}`);
    if (run.commit !== tracked.commit)
      problems.push(
        `${suite}/${mode}: ran upstream ${run.commit.slice(0, 10)}, baseline is ${tracked.commit.slice(0, 10)} (update the baseline with the manifest)`,
      );
    const flaky = new Set(then.flaky ?? []);
    const before = new Set(then.failing);
    const now = new Set(run.counts.failing);
    const newlyFailing = run.counts.failing.filter((k) => !before.has(k) && !flaky.has(k));
    const fixed = then.failing.filter((k) => !now.has(k) && !flaky.has(k));
    const verdict =
      [
        newlyFailing.length ? `**${newlyFailing.length} newly failing**` : "",
        fixed.length ? `${fixed.length} fixed` : "",
      ]
        .filter(Boolean)
        .join(", ") || "unchanged";
    md.push(
      `| ${mode} | ${delta(run.counts.passed, then.passed)} | ${delta(run.counts.failed, then.failed)} | ${delta(run.counts.skipped, then.skipped)} | ${verdict} |`,
    );
    if (newlyFailing.length) {
      problems.push(`${suite}/${mode}: ${newlyFailing.length} newly failing`);
      details.push(
        `<details><summary>${mode}: newly failing (${newlyFailing.length})</summary>`,
        "",
        ...newlyFailing.map((k) => `- \`${k}\``),
        "",
        "</details>",
      );
    }
    if (fixed.length)
      details.push(
        `<details><summary>${mode}: fixed (${fixed.length}) — update the baseline</summary>`,
        "",
        ...fixed.map((k) => `- \`${k}\``),
        "",
        "</details>",
      );
  }
  md.push("", ...details, "");
}
md.push(
  problems.length
    ? `**${problems.length} problem(s)**:\n\n${problems.map((p) => `- ${p}`).join("\n")}\n`
    : "No regressions against downstream/baseline.json.\n",
);

const markdown = md.join("\n");
console.log(markdown);
if (flags.markdown) writeFileSync(flags.markdown, markdown);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
process.exitCode = problems.length ? 1 : 0;
