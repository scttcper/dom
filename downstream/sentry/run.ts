#!/usr/bin/env node
// Sentry downstream corpus: run getsentry/sentry's real frontend Jest suite (unmodified specs,
// upstream setup, upstream Jest/SWC/resolver) on
//   jsdom        upstream exactly as configured (@sentry/jest-environment/jsdom + its hacks)
//   rtd-dom      testEnvironment -> jest-environment-rtd; stock Testing Library
//   rtd-full     + @testing-library/{react,dom,user-event,jest-dom} -> our built bundles
//   rtd-nohacks  EXPERIMENT: rtd-full + undo upstream's jsdom-only speed hacks (harness/nohacks.ts)
//   rtd-direct   EXPERIMENT: rtd-dom with a DONT_CONTEXTIFY vm context (opt-in via --modes)
//
//   node downstream/sentry/run.ts [--install] [--latest] [--preset smoke|components|views|all]
//        [--files a,b] [--modes jsdom,rtd-dom,rtd-full,rtd-nohacks] [--workers 6] [--repeat N]
//        [--gc] [--shard i/n] [--grep PATTERN] [--shims react,dom,user-event,jest-dom] [--no-report]
//
// See README.md. Methodology follows downstream/base-ui/run.ts (pinned commit, refuses tracked
// local changes, upstream's frozen lockfile + exact pnpm, stale output deleted first, every rtd
// mode compared with the jsdom baseline).

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");
const manifest = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8")) as {
  repository: string;
  branch: string;
  commit: string;
  packageManager: string;
};

const MODES = ["jsdom", "rtd-dom", "rtd-full", "rtd-nohacks", "rtd-direct"] as const;
type Mode = (typeof MODES)[number];

const PRESETS: Record<string, string[]> = {
  // Component-heavy files: menus, selects, forms, modal, tabs, overlays, tables, search, dates.
  smoke: [
    "static/app/components/core/dropdownMenu/dropdownMenu.spec.tsx",
    "static/app/components/core/compactSelect/compactSelect.spec.tsx",
    "static/app/components/core/compactSelect/composite.spec.tsx",
    "static/app/components/core/tabs/tabs.spec.tsx",
    "static/app/components/core/modal/index.spec.tsx",
    "static/app/components/core/overlayTrigger.spec.tsx",
    "static/app/components/core/input/numberInput.spec.tsx",
    "static/app/components/core/form/autoSaveForm.spec.tsx",
    "static/app/components/forms/formField/index.spec.tsx",
    "static/app/components/forms/controls/radioGroup.spec.tsx",
    "static/app/components/forms/fields/sentryProjectSelectorField.spec.tsx",
    "static/app/components/tables/dataGrid/index.spec.tsx",
    "static/app/components/tables/simpleTable/index.spec.tsx",
    "static/app/components/searchQueryBuilder/index.spec.tsx",
    "static/app/components/timeRangeSelector/index.spec.tsx",
  ],
  components: ["static/app/components/"],
  views: [
    "static/app/views/issueDetails/",
    "static/app/views/issueList/",
    "static/app/views/discover/",
    "static/app/views/automations/",
    "static/app/views/alerts/",
    "static/app/views/projectDetail/",
    "static/app/views/organizationStats/",
    "static/app/views/navigation/",
    "static/app/views/authV2/",
  ],
  all: [],
};

const { values } = parseArgs({
  options: {
    checkout: { type: "string", default: join(here, "checkout") },
    preset: { type: "string", default: "smoke" },
    files: { type: "string" },
    modes: { type: "string", default: "jsdom,rtd-dom,rtd-full,rtd-nohacks" },
    workers: { type: "string", default: "6" },
    repeat: { type: "string", default: "1" },
    gc: { type: "boolean", default: false },
    shard: { type: "string" },
    latest: { type: "boolean", default: false },
    install: { type: "boolean", default: false },
    "no-report": { type: "boolean", default: false },
    shims: { type: "string", default: "react,dom,user-event,jest-dom" },
    grep: { type: "string" },
    label: { type: "string" },
    scratch: { type: "string" },
    triage: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (values.help) {
  console.log(
    "node downstream/sentry/run.ts [--install] [--latest] [--preset smoke|components|views|all | --files a,b] " +
      "[--modes jsdom,rtd-dom,rtd-full,rtd-nohacks] [--workers 6] [--repeat N] [--gc] [--shard i/n] [--grep PATTERN] " +
      "[--shims react,dom,user-event,jest-dom] [--label NAME] [--no-report]",
  );
  process.exit(0);
}

const checkout = resolve(values.checkout!);
let preset = values.files === undefined ? values.preset! : "custom";
if (values.files !== undefined) PRESETS.custom = values.files.split(",").map((f) => f.trim()).filter(Boolean);
const filters = values.scratch ? [] : PRESETS[preset];
if (filters === undefined) throw new Error(`Unknown preset ${preset}; use ${Object.keys(PRESETS).join(", ")} or --files.`);
const modes = values.modes!.split(",").map((m) => m.trim()) as Mode[];
for (const mode of modes) if (!MODES.includes(mode)) throw new Error(`Unknown mode ${mode}; use ${MODES.join(", ")}`);
const workers = Number(values.workers);
if (!Number.isSafeInteger(workers) || workers < 1) throw new Error("--workers must be a positive integer");
const repeat = Number(values.repeat);
if (!Number.isSafeInteger(repeat) || repeat < 1) throw new Error("--repeat must be a positive integer");
if (values.shard && !/^\d+\/\d+$/.test(values.shard)) throw new Error("--shard must look like 1/4");
const label = values.label ?? `${preset}${values.shard ? `-shard${values.shard.replace("/", "of")}` : ""}${values.gc ? "-gc" : ""}${values.triage ? "-triage" : ""}`;

// ---------------------------------------------------------------------------------------------
// Process helpers

interface CommandResult {
  code: number | null;
  signal: NodeJS.Signals | null;
}

function run(executable: string, argv: string[], cwd: string, log?: string, env: Record<string, string> = {}, onSpawn?: (pid: number) => void): Promise<CommandResult> {
  return new Promise((resolveResult, reject) => {
    const out = log ? createWriteStream(log) : null;
    const child = spawn(executable, argv, { cwd, env: { ...process.env, ...env }, stdio: out ? ["ignore", "pipe", "pipe"] : "inherit" });
    if (child.pid) onSpawn?.(child.pid);
    if (out) {
      for (const stream of [child.stdout!, child.stderr!]) {
        stream.on("data", (chunk: Buffer) => {
          out.write(chunk);
          if (process.env.RTD_SENTRY_QUIET !== "1") process.stdout.write(chunk);
        });
      }
    }
    child.once("error", (error) => {
      out?.end();
      reject(error);
    });
    child.once("close", (code, signal) => {
      if (out) out.end(() => resolveResult({ code, signal }));
      else resolveResult({ code, signal });
    });
  });
}

async function checked(executable: string, argv: string[], cwd: string): Promise<void> {
  const result = await run(executable, argv, cwd);
  if (result.code !== 0) throw new Error(`${executable} ${argv.join(" ")} exited ${result.code ?? result.signal}`);
}

function git(argv: string[]): string {
  const result = spawnSync("git", argv, { cwd: checkout, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || `git ${argv.join(" ")} failed`);
  return result.stdout.trim();
}

/** Sum of RSS over a process tree, sampled with ps (peak total memory of Jest + its workers). */
function treeRssSampler(rootPid: number): { stop: () => { peakTreeRssBytes: number; peakWorkers: number } } {
  let peak = 0;
  let peakWorkers = 0;
  const sample = (): void => {
    const ps = spawnSync("ps", ["-A", "-o", "pid=,ppid=,rss="], { encoding: "utf8" });
    if (ps.status !== 0) return;
    const children = new Map<number, number[]>();
    const rss = new Map<number, number>();
    for (const line of ps.stdout.split("\n")) {
      const [pid, ppid, kb] = line.trim().split(/\s+/).map(Number);
      if (!pid) continue;
      rss.set(pid, kb * 1024);
      (children.get(ppid) ?? children.set(ppid, []).get(ppid)!).push(pid);
    }
    let total = 0;
    let count = 0;
    const stack = [rootPid];
    while (stack.length) {
      const pid = stack.pop()!;
      total += rss.get(pid) ?? 0;
      count++;
      stack.push(...(children.get(pid) ?? []));
    }
    if (total > peak) peak = total;
    if (count > peakWorkers) peakWorkers = count;
  };
  const timer = setInterval(sample, 500);
  return {
    stop() {
      clearInterval(timer);
      return { peakTreeRssBytes: peak, peakWorkers };
    },
  };
}

// ---------------------------------------------------------------------------------------------
// 1. Mirror upstream at the pinned commit (or master with --latest)

if (!existsSync(join(checkout, ".git"))) {
  mkdirSync(dirname(checkout), { recursive: true });
  await checked("git", ["clone", "--no-checkout", "--depth", "1", "--branch", manifest.branch, manifest.repository, checkout], dirname(checkout));
  await checked("git", ["fetch", "--depth", "1", manifest.repository, values.latest ? `refs/heads/${manifest.branch}` : manifest.commit], checkout);
  await checked("git", ["checkout", "--detach", "FETCH_HEAD"], checkout);
} else {
  if (git(["status", "--porcelain", "--untracked-files=no"])) {
    throw new Error(`Refusing to run: ${checkout} has local modifications of upstream tracked files.`);
  }
  const head = git(["rev-parse", "HEAD"]);
  if (values.latest || head !== manifest.commit) {
    await checked("git", ["fetch", "--depth", "1", manifest.repository, values.latest ? `refs/heads/${manifest.branch}` : manifest.commit], checkout);
    await checked("git", ["checkout", "--detach", "FETCH_HEAD"], checkout);
  }
}
const commit = git(["rev-parse", "HEAD"]);
const commitInfo = git(["show", "-s", "--format=%cI%n%s", "HEAD"]).split("\n");
if (!values.latest && commit !== manifest.commit) throw new Error(`Checkout is ${commit}; expected pinned ${manifest.commit}.`);
for (const file of PRESETS.custom ?? []) {
  if (!existsSync(resolve(checkout, file))) throw new Error(`Test path not found in upstream checkout: ${file}`);
}

// ---------------------------------------------------------------------------------------------
// 2. Install upstream's frozen dependencies with upstream's exact pnpm (no lifecycle scripts)

if (values.install) {
  await checked("npx", ["--yes", manifest.packageManager, "install", "--frozen-lockfile", "--ignore-scripts"], checkout);
}
const testBin = join(checkout, "tests/js/bin/test.mjs");
if (!existsSync(join(checkout, "node_modules/jest"))) throw new Error("Upstream dependencies are missing. Rerun with --install.");

function installedVersion(name: string, from = join(checkout, "tests/js")): string | null {
  for (let dir = from; ; dir = dirname(dir)) {
    const pkg = join(dir, "node_modules", name, "package.json");
    if (existsSync(pkg)) return JSON.parse(readFileSync(pkg, "utf8")).version;
    if (dir === checkout || dir === dirname(dir)) return null;
  }
}
const versions = Object.fromEntries(
  ["jest", "jsdom", "react", "react-dom", "@swc/jest", "@testing-library/react", "@testing-library/dom", "@testing-library/user-event", "@testing-library/jest-dom", "@sentry/jest-environment", "@floating-ui/react-dom"].map((n) => [n, installedVersion(n)]),
);

// Our side: rtd-full uses the built bundles (pnpm build); record how fresh they are.
const DIST = ["react/dist/index.cjs", "testing-library/dist/index.cjs", "user-event/dist/index.cjs", "jest-dom/dist/index.cjs", "aria/dist/index.cjs"];
if (modes.some((m) => m === "rtd-full" || m === "rtd-nohacks")) {
  for (const f of DIST) if (!existsSync(join(repo, "packages", f))) throw new Error(`packages/${f} is missing: run pnpm build`);
}
function newestMtime(dir: string): number {
  let newest = 0;
  for (const e of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (e.isFile() && /\.(ts|tsx|js|cjs|mjs)$/.test(e.name)) newest = Math.max(newest, statSync(join(e.parentPath, e.name)).mtimeMs);
  }
  return newest;
}
const staleDist = ["react", "testing-library", "user-event", "jest-dom", "aria"].filter((p) => {
  const dist = join(repo, "packages", p, "dist");
  return existsSync(dist) && newestMtime(join(repo, "packages", p, "src")) > newestMtime(dist);
});

function sourceFingerprint(): string {
  const hash = createHash("sha256");
  for (const pkg of ["dom", "aria", "testing-library", "react", "user-event", "jest-dom", "jest-environment"]) {
    for (const sub of ["src", "dist"]) {
      const dir = join(repo, "packages", pkg, sub);
      if (!existsSync(dir)) continue;
      for (const e of readdirSync(dir, { withFileTypes: true, recursive: true }).sort((a, b) => join(a.parentPath, a.name).localeCompare(join(b.parentPath, b.name)))) {
        if (e.isFile() && /\.(ts|js|cjs|mjs)$/.test(e.name)) hash.update(join(e.parentPath, e.name)).update(readFileSync(join(e.parentPath, e.name)));
      }
    }
  }
  return hash.digest("hex").slice(0, 16);
}

// ---------------------------------------------------------------------------------------------
// 3. Run each mode (interleaved when --repeat > 1)

interface Assertion {
  key: string;
  file: string;
  area: string;
  name: string;
  status: string;
  messages: string[];
}

interface WorkerSample {
  pid: number;
  worker: string | null;
  index: number;
  file: string;
  envSetupMs: number;
  runMs: number | null;
  teardownMs: number;
  rss: number;
  heapUsed: number;
}

interface ModeRun {
  mode: Mode;
  iteration: number;
  code: number | null;
  signal: string | null;
  wallMs: number;
  cpuMs: number | null;
  peakRssBytes: number | null;
  peakTreeRssBytes: number;
  reportFound: boolean;
  passed?: number;
  failed?: number;
  skipped?: number;
  total?: number;
  files?: number;
  suiteErrors?: Array<{ file: string; message: string }>;
  assertions?: Map<string, Assertion>;
  receipts?: number;
  receiptFiles?: number;
  reactIds?: string[];
  rtlIds?: string[];
  samples?: WorkerSample[];
  sourceStable?: boolean;
}

function areaOf(file: string): string {
  const m = /^static\/(app|gsApp|gsAdmin)\/(components|views|utils|stores|actionCreators|[^/]+)\/([^/]+)/.exec(file);
  if (m) return m[2] === "components" || m[2] === "views" ? `${m[1]}/${m[2]}/${m[3]}` : `${m[1]}/${m[2]}`;
  return file.split("/").slice(0, 2).join("/");
}

function collect(report: any): Map<string, Assertion> {
  const out = new Map<string, Assertion>();
  for (const file of report.testResults ?? []) {
    const rel = relative(checkout, file.name);
    const seen = new Map<string, number>();
    for (const t of file.assertionResults ?? []) {
      const n = (seen.get(t.fullName) ?? 0) + 1;
      seen.set(t.fullName, n);
      const key = `${rel} :: ${t.fullName}${n > 1 ? ` [${n}]` : ""}`;
      const status = t.status === "pending" || t.status === "todo" || t.status === "disabled" ? "skipped" : t.status;
      out.set(key, { key, file: rel, area: areaOf(rel), name: t.fullName, status, messages: t.failureMessages ?? [] });
    }
  }
  return out;
}

const output = join(here, "output", label);
const results = join(here, "results");
mkdirSync(output, { recursive: true });
const runs: ModeRun[] = [];
const config = join(here, "harness/jest.config.mjs");

for (let iteration = 1; iteration <= repeat; iteration++) {
  for (const mode of modes) {
    const modeOut = join(output, repeat > 1 ? `${mode}-${iteration}` : mode);
    rmSync(modeOut, { recursive: true, force: true }); // stale reports must never masquerade as passes
    mkdirSync(modeOut, { recursive: true });
    const jsonPath = join(modeOut, "report.json");
    const logPath = join(modeOut, "jest.log");
    const argv = [
      ...(values.gc ? ["--expose-gc"] : []),
      testBin,
      "--config",
      config,
      "--ci",
      "--maxWorkers",
      String(workers),
      "--json",
      "--outputFile",
      jsonPath,
      ...(values.shard ? ["--shard", values.shard] : []),
      ...(values.grep ? ["--testNamePattern", values.grep] : []),
      ...filters,
    ];
    console.log(`\n=== Sentry ${label}: ${mode}${repeat > 1 ? ` (run ${iteration}/${repeat})` : ""} — ${workers} workers ===`);
    const before = sourceFingerprint();
    const start = performance.now();
    let sampler: ReturnType<typeof treeRssSampler> | null = null;
    const result = await run(
      "/usr/bin/time",
      ["-l", process.execPath, ...argv],
      checkout,
      logPath,
      {
        RTD_SENTRY_CHECKOUT: checkout,
        RTD_SENTRY_MODE: mode,
        RTD_SENTRY_OUT: modeOut,
        RTD_SENTRY_SHIMS: values.shims!,
        RTD_SENTRY_GC: values.gc ? "1" : "0",
        ...(values.scratch ? { RTD_SENTRY_SCRATCH: resolve(values.scratch) } : {}),
        RTD_SENTRY_TRIAGE: values.triage ? "1" : "0",
        // Workers inherit execArgv from the parent, so --expose-gc reaches them.
        CI: "true",
        FORCE_COLOR: "0",
      },
      (pid) => (sampler = treeRssSampler(pid)),
    );
    const wallMs = Math.round(performance.now() - start);
    const tree = (sampler as ReturnType<typeof treeRssSampler> | null)?.stop() ?? { peakTreeRssBytes: 0, peakWorkers: 0 };
    const log = readFileSync(logPath, "utf8");
    const rss = /(\d+)\s+maximum resident set size/.exec(log);
    const user = /([\d.]+)\s+real\s+([\d.]+)\s+user\s+([\d.]+)\s+sys/.exec(log);
    const r: ModeRun = {
      mode,
      iteration,
      code: result.code,
      signal: result.signal,
      wallMs,
      cpuMs: user ? Math.round((Number(user[2]) + Number(user[3])) * 1000) : null,
      peakRssBytes: rss ? Number(rss[1]) : null,
      peakTreeRssBytes: tree.peakTreeRssBytes,
      reportFound: existsSync(jsonPath),
      sourceStable: before === sourceFingerprint(),
    };
    if (r.reportFound) {
      const report = JSON.parse(readFileSync(jsonPath, "utf8"));
      r.assertions = collect(report);
      const statuses = [...r.assertions.values()].map((a) => a.status);
      r.passed = statuses.filter((s) => s === "passed").length;
      r.failed = statuses.filter((s) => s === "failed").length;
      r.skipped = statuses.filter((s) => s === "skipped").length;
      r.total = statuses.length;
      r.files = report.testResults.length;
      r.suiteErrors = report.testResults
        .filter((f: any) => f.status === "failed" && (f.assertionResults?.length ?? 0) === 0)
        .map((f: any) => ({ file: relative(checkout, f.name), message: String(f.message ?? "").replace(/\u001b\[[0-9;]*m/g, "").split("\n").slice(0, 12).join("\n") }));
    }
    const receiptsPath = join(modeOut, "environments.jsonl");
    if (existsSync(receiptsPath)) {
      const receipts = readFileSync(receiptsPath, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
      r.receipts = receipts.length;
      r.receiptFiles = new Set(receipts.map((x) => x.testPath)).size;
    } else r.receipts = 0;
    const resPath = join(modeOut, "resolutions.jsonl");
    if (existsSync(resPath)) {
      const res = readFileSync(resPath, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
      r.reactIds = [...new Set(res.filter((x) => x.request === "react").map((x) => x.id as string))];
      r.rtlIds = [...new Set(res.filter((x) => x.request === "@testing-library/react").map((x) => x.id as string))];
    }
    const workersDir = join(modeOut, "workers");
    if (existsSync(workersDir)) {
      r.samples = readdirSync(workersDir).flatMap((f) =>
        readFileSync(join(workersDir, f), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as WorkerSample),
      );
    }
    runs.push(r);
    writeFileSync(join(modeOut, "summary.json"), JSON.stringify({ ...r, assertions: undefined, samples: undefined, commit, preset, filters, versions }, null, 2) + "\n");
    console.log(
      `${mode}: ${r.passed ?? "?"} passed, ${r.failed ?? "?"} failed, ${r.skipped ?? "?"} skipped, ${r.suiteErrors?.length ?? "?"} suite errors in ${(wallMs / 1000).toFixed(1)}s` +
        `, CPU ${((r.cpuMs ?? 0) / 1000).toFixed(1)}s, peak tree RSS ${(r.peakTreeRssBytes / 2 ** 20).toFixed(0)} MiB`,
    );
  }
}

// ---------------------------------------------------------------------------------------------
// 4. Report

/** Normalized first line of a failure: the error signature used for clustering. */
function signature(message: string): string {
  const lines = message
    .replace(/\u001b\[[0-9;]*m/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  let line = lines[0] ?? "(no message)";
  // jest-fail-on-console: the interesting part is the logged message.
  if (/^Error: Expected test not to call console/.test(line) && lines[2]) line = `console.* : ${lines[2]}`;
  if (/^expect\(/.test(line) && lines[1]) line = `${line} ${lines.slice(1, 3).join(" ")}`;
  return line
    .slice(0, 180)
    .replace(/\b\d+(\.\d+)?(px|ms)?\b/g, "N")
    .replace(/"[^"]{40,}"/g, '"…"')
    .replace(/'[^']{40,}'/g, "'…'");
}

const median = (xs: number[]): number => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const pct = (xs: number[], p: number): number => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
const mib = (b: number | null | undefined): string => (b ? `${(b / 2 ** 20).toFixed(0)} MiB` : "n/a");
const sec = (ms: number | null | undefined): string => (ms == null ? "n/a" : `${(ms / 1000).toFixed(1)}s`);

/** Per-worker memory growth: least-squares slope of heap/RSS over the file index, and first→last. */
function memoryGrowth(samples: WorkerSample[]): { workers: number; filesPerWorker: number; heapSlope: number; rssSlope: number; heapFirst: number; heapLast: number; rssLast: number; maxRss: number } {
  const byPid = new Map<number, WorkerSample[]>();
  for (const s of samples) (byPid.get(s.pid) ?? byPid.set(s.pid, []).get(s.pid)!).push(s);
  const slopes: number[] = [];
  const rssSlopes: number[] = [];
  const firsts: number[] = [];
  const lasts: number[] = [];
  const rssLasts: number[] = [];
  let maxRss = 0;
  const counts: number[] = [];
  const slope = (ys: number[]): number => {
    const n = ys.length;
    if (n < 3) return NaN;
    const mx = (n - 1) / 2;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      num += (i - mx) * (ys[i] - my);
      den += (i - mx) ** 2;
    }
    return num / den;
  };
  for (const list of byPid.values()) {
    list.sort((a, b) => a.index - b.index);
    counts.push(list.length);
    // Skip the first file (module graph warm-up) when there is enough data.
    const steady = list.length > 4 ? list.slice(1) : list;
    slopes.push(slope(steady.map((s) => s.heapUsed)));
    rssSlopes.push(slope(steady.map((s) => s.rss)));
    firsts.push(list[0].heapUsed);
    lasts.push(list.at(-1)!.heapUsed);
    rssLasts.push(list.at(-1)!.rss);
    for (const s of list) maxRss = Math.max(maxRss, s.rss);
  }
  return {
    workers: byPid.size,
    filesPerWorker: median(counts),
    heapSlope: median(slopes.filter((x) => !Number.isNaN(x))),
    rssSlope: median(rssSlopes.filter((x) => !Number.isNaN(x))),
    heapFirst: median(firsts),
    heapLast: median(lasts),
    rssLast: median(rssLasts),
    maxRss,
  };
}

const date = new Date().toLocaleDateString("sv-SE");
const reportPath = join(results, `${date}-${label}.md`);
if (!values["no-report"]) {
  mkdirSync(results, { recursive: true });
  rmSync(reportPath, { force: true });
  // A run where every file failed to load (our sources mid-edit by another agent) is not a
  // measurement: keep it in "individual runs" but use the valid runs for counts and timings.
  const valid = (r: ModeRun): boolean => r.reportFound && (r.files ?? 0) > 0 && (r.suiteErrors?.length ?? 0) < (r.files ?? 0);
  const last = new Map<Mode, ModeRun>();
  for (const r of runs) if (valid(r) || !last.has(r.mode)) last.set(r.mode, r);
  const baseline = last.get("jsdom")?.assertions;
  const md: string[] = [];
  md.push(`# Sentry downstream: \`${label}\` (${date})`, "");
  if (values.triage) md.push("> **TRIAGE MODE (`--triage`)**: rtd modes ran with workarounds for blockers already filed in TRIAGE.md (navigator.platform \"\", writable navigator.clipboard, index-getter tables pre-warmed before the isolation baseline, pending host timers cleared at teardown) to look past them. These are not compatibility results.", "");
  md.push(
    `- upstream: ${manifest.repository.replace(/\.git$/, "")} @ \`${commit}\` (${commitInfo[0]}) — ${commitInfo[1]}`,
    `- pinned: \`${manifest.commit}\`${commit === manifest.commit ? "" : " (**--latest: differs from pin**)"}`,
    `- selection: ${filters.length ? filters.map((f) => `\`${f}\``).join(", ") : "(every spec of upstream's root Jest config)"}${values.shard ? `, shard ${values.shard}` : ""}${values.grep ? `, -t \`${values.grep}\`` : ""}`,
    `- node ${process.version}, Jest workers ${workers} (same for every mode), runs per mode ${repeat}${repeat > 1 ? " (interleaved; timings are medians, counts from the last run)" : ""}, CI=true (upstream's CI code paths), ${values.gc ? "**heap sampled after a forced GC per file (--gc; timings include the GCs)**" : "no forced GC"}`,
    `- upstream versions: ${Object.entries(versions).map(([k, v]) => `${k}@${v}`).join(", ")}`,
    `- rtd-full substitutes: ${values.shims!.split(",").map((x) => `@testing-library/${x}`).join(", ")} (packages/*/dist/*.cjs)${staleDist.length ? `; **dist older than src for: ${staleDist.join(", ")}**` : ""}`,
    `- rtd-nohacks is an **experiment**: rtd-full plus harness/nohacks.ts undoing upstream's getComputedStyle / Floating UI / matchMedia / IntersectionObserver hacks.`,
    "",
  );
  md.push("## Per-mode results", "");
  md.push("| mode | passed | failed | skipped | total | files | suite errors | exit | wall | CPU | peak tree RSS | peak process RSS | env setup / file (median, p95) | receipts | notes |");
  md.push("| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --- |");
  for (const mode of modes) {
    const all = runs.filter((r) => r.mode === mode && valid(r)).length ? runs.filter((r) => r.mode === mode && valid(r)) : runs.filter((r) => r.mode === mode);
    const r = last.get(mode)!;
    const env = (r.samples ?? []).map((s) => s.envSetupMs);
    const notes: string[] = [];
    if (!r.reportFound) notes.push("**no JSON report**");
    if (mode !== "jsdom") notes.push(r.reactIds?.length === 1 ? "1 React" : `**${r.reactIds?.length ?? 0} React ids**`);
    if (r.rtlIds?.length) notes.push(`RTL: ${r.rtlIds.map((x) => (x.startsWith("<rtd>") ? "ours" : "stock")).join(",")}`);
    if (r.sourceStable === false) notes.push("our packages changed during the run");
    md.push(
      `| ${mode} | ${r.passed ?? "?"} | ${r.failed ?? "?"} | ${r.skipped ?? "?"} | ${r.total ?? "?"} | ${r.files ?? "?"} | ${r.suiteErrors?.length ?? "?"} | ${r.code ?? r.signal} | ${sec(median(all.map((x) => x.wallMs)))} | ${sec(median(all.map((x) => x.cpuMs ?? 0)))} | ${mib(median(all.map((x) => x.peakTreeRssBytes)))} | ${mib(median(all.map((x) => x.peakRssBytes ?? 0)))} | ${median(env).toFixed(0)} ms, ${pct(env, 0.95).toFixed(0)} ms | ${r.receiptFiles ?? 0}/${r.files ?? "?"} | ${notes.join("; ")} |`,
    );
  }
  md.push("");
  if (repeat > 1) {
    md.push("<details><summary>individual runs</summary>", "", "| mode | run | wall | CPU | peak tree RSS |", "| --- | --: | --: | --: | --: |");
    for (const r of runs) md.push(`| ${r.mode} | ${r.iteration}${valid(r) ? "" : " (invalid: every file failed to load)"} | ${sec(r.wallMs)} | ${sec(r.cpuMs)} | ${mib(r.peakTreeRssBytes)} |`);
    md.push("", "</details>", "");
  }

  md.push("## Jest worker memory across files", "");
  md.push(
    `Sampled after each test file's environment teardown in every worker (${values.gc ? "after a forced full GC" : "no forced GC, so heap numbers include garbage"}). Slope = least-squares growth per file over each worker's files (first file excluded), median across workers. Upstream sets no \`workerIdleMemoryLimit\`.`,
    "",
  );
  md.push("| mode | workers | files/worker | heap after 1st file | heap after last file | heap growth/file | RSS growth/file | RSS after last file | max worker RSS |");
  md.push("| --- | --: | --: | --: | --: | --: | --: | --: | --: |");
  for (const mode of modes) {
    const r = last.get(mode)!;
    if (!r.samples?.length) continue;
    const g = memoryGrowth(r.samples);
    md.push(
      `| ${mode} | ${g.workers} | ${g.filesPerWorker} | ${mib(g.heapFirst)} | ${mib(g.heapLast)} | ${(g.heapSlope / 2 ** 20).toFixed(2)} MiB | ${(g.rssSlope / 2 ** 20).toFixed(2)} MiB | ${mib(g.rssLast)} | ${mib(g.maxRss)} |`,
    );
  }
  md.push("");

  for (const mode of modes) {
    const r = last.get(mode)!;
    if (!r.assertions) continue;
    const failures = [...r.assertions.values()].filter((a) => a.status === "failed");
    md.push(`## ${mode}`, "");
    if (r.suiteErrors?.length) {
      md.push("### Suite errors (file failed outside a test)", "");
      for (const e of r.suiteErrors) md.push(`- \`${e.file}\`: ${signature(e.message.replace(/^.*●.*$/m, ""))}`);
      md.push("");
    }
    if (baseline && mode !== "jsdom") {
      const regress = failures.filter((a) => baseline.get(a.key)?.status === "passed");
      const missing = [...baseline.keys()].filter((k) => !r.assertions!.has(k));
      const added = [...r.assertions.keys()].filter((k) => !baseline.has(k));
      const fixed = [...r.assertions.values()].filter((a) => a.status === "passed" && baseline.get(a.key)?.status === "failed");
      md.push(
        `Compared with jsdom: **${regress.length} pass on jsdom but fail here**, ${missing.length} missing (e.g. suite errors), ${added.length} added, ${fixed.length} fail on jsdom but pass here.`,
        "",
      );
      if (regress.length) {
        md.push(`<details><summary>pass on jsdom, fail here (${regress.length})</summary>`, "");
        for (const a of regress) md.push(`- \`${a.key}\` — ${signature(a.messages[0] ?? "")}`);
        md.push("", "</details>", "");
      }
      if (missing.length) {
        md.push(`<details><summary>missing vs jsdom (${missing.length})</summary>`, "");
        for (const k of missing.slice(0, 300)) md.push(`- \`${k}\``);
        md.push("", "</details>", "");
      }
    }
    if (failures.length) {
      const byArea = new Map<string, number>();
      const bySig = new Map<string, { count: number; areas: Set<string>; example: string }>();
      for (const f of failures) {
        byArea.set(f.area, (byArea.get(f.area) ?? 0) + 1);
        const sig = signature(f.messages[0] ?? "");
        const e = bySig.get(sig) ?? { count: 0, areas: new Set(), example: f.key };
        e.count++;
        e.areas.add(f.area);
        bySig.set(sig, e);
      }
      md.push("### Failures by area", "", "| area | failed |", "| --- | --: |");
      for (const [a, n] of [...byArea].sort((x, y) => y[1] - x[1]).slice(0, 60)) md.push(`| ${a} | ${n} |`);
      md.push("", "### Failures by error signature", "", "| count | signature | areas | example |", "| --: | --- | --- | --- |");
      for (const [sig, e] of [...bySig].sort((x, y) => y[1].count - x[1].count).slice(0, 150)) {
        md.push(`| ${e.count} | ${sig.replace(/\|/g, "\\|").replace(/`/g, "'")} | ${[...e.areas].slice(0, 6).join(", ")}${e.areas.size > 6 ? ", …" : ""} | \`${e.example.replace(/\|/g, "\\|")}\` |`);
      }
      md.push("");
    } else md.push("No failing tests.", "");
  }
  md.push(`Raw Jest JSON, logs, worker samples and receipts: \`downstream/sentry/output/${label}/<mode>/\` (gitignored).`, "");
  writeFileSync(reportPath, md.join("\n"));
  console.log(`\nReport: ${relative(repo, reportPath)}`);
}

// Non-zero when a run produced no report, identities were not proven, or the discovered test set
// differs from jsdom (assertion failures alone are expected for rtd modes).
const lastByMode = new Map(runs.map((r) => [r.mode, r]));
const jsdomRun = lastByMode.get("jsdom");
process.exitCode = [...lastByMode.values()].some(
  (r) =>
    !r.reportFound ||
    ((r.files ?? 0) > 0 && (r.receiptFiles ?? 0) === 0) ||
    (r.mode !== "jsdom" && (r.reactIds?.length ?? 0) > 1) ||
    (jsdomRun?.assertions && r.assertions && r.assertions.size !== jsdomRun.assertions.size),
)
  ? 1
  : 0;
