#!/usr/bin/env node
// Base UI downstream suite: run the unmodified upstream `@base-ui/react` Vitest suite on
//   jsdom     upstream baseline, unchanged
//   rtd-dom   only the DOM environment swapped to @rtd/dom (stock Testing Library from upstream's lockfile)
//   rtd-full  @rtd/dom + our Testing Library shims (@testing-library/{react,dom,user-event,jest-dom})
//
//   node downstream/base-ui/run.ts [--install] [--latest] [--preset smoke|interactions|all]
//        [--files a,b] [--modes jsdom,rtd-dom,rtd-full] [--workers N] [--no-report]
//
// Methodology (from ~/gh/vibedom/downstream/base-ui): pinned commit (manifest.json), unmodified
// upstream tests (refuses tracked local changes), upstream's own frozen lockfile + exact pnpm,
// fresh reports (old ones are deleted first), versions/commit recorded, every rtd mode compared
// against the jsdom baseline. See README.md.

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");
// RTD_SENTRY_REPORTER=1 (opt in, so a SENTRY_DSN in the shell never reports harness runs by
// accident): @ctrl/sentry-tests' runner and reporter, sending to SENTRY_DSN / SENTRY_SPOTLIGHT.
const SENTRY_REPORTER = process.env.RTD_SENTRY_REPORTER === "1";
const manifest = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8")) as {
  repository: string;
  branch: string;
  commit: string;
};

const MODES = ["jsdom", "rtd-dom", "rtd-full"] as const;
type Mode = (typeof MODES)[number];

const PRESETS: Record<string, string[]> = {
  smoke: [
    "packages/react/src/button/Button.test.tsx",
    "packages/react/src/checkbox/root/CheckboxRoot.test.tsx",
    "packages/react/src/tabs/root/TabsRoot.test.tsx",
    "packages/react/src/select/root/SelectRoot.test.tsx",
    "packages/react/src/field/root/FieldRoot.test.tsx",
    "packages/react/src/form/Form.test.tsx",
  ],
  interactions: [
    "button",
    "checkbox",
    "radio",
    "switch",
    "tabs",
    "select",
    "menu",
    "dialog",
    "combobox",
    "field",
    "form",
    "number-field",
    "slider",
  ].map((dir) => `packages/react/src/${dir}/`),
  all: [],
};

const { values } = parseArgs({
  options: {
    checkout: { type: "string", default: join(here, "checkout") },
    preset: { type: "string", default: "smoke" },
    files: { type: "string" },
    modes: { type: "string", default: MODES.join(",") },
    workers: { type: "string", default: String(Math.max(2, Math.floor(availableParallelism() / 2))) },
    latest: { type: "boolean", default: false },
    install: { type: "boolean", default: false },
    "no-report": { type: "boolean", default: false },
    cold: { type: "boolean", default: false },
    triage: { type: "boolean", default: false },
    shims: { type: "string", default: "react,dom,user-event,jest-dom" },
    grep: { type: "string" },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (values.help) {
  console.log(
    "node downstream/base-ui/run.ts [--install] [--latest] [--preset smoke|interactions|all | --files a,b] " +
      "[--modes jsdom,rtd-dom,rtd-full] [--workers N] [--checkout PATH] [--cold] [--no-report] [--triage] [--shims react,dom,user-event,jest-dom] [--grep TEST_NAME_PATTERN]",
  );
  process.exit(0);
}

const checkout = resolve(values.checkout!);
const preset = values.files === undefined ? values.preset! : "custom";
if (values.files !== undefined) PRESETS.custom = values.files.split(",").map((f) => f.trim()).filter(Boolean);
const filters = PRESETS[preset];
if (filters === undefined) throw new Error(`Unknown preset ${preset}; use smoke, interactions, all or --files.`);
const modes = values.modes!.split(",").map((m) => m.trim()) as Mode[];
for (const mode of modes) if (!MODES.includes(mode)) throw new Error(`Unknown mode ${mode}; use ${MODES.join(", ")}`);
const workers = Number(values.workers);
if (!Number.isSafeInteger(workers) || workers < 1) throw new Error("--workers must be a positive integer");

// ---------------------------------------------------------------------------------------------
// Process helpers

interface CommandResult {
  code: number | null;
  signal: NodeJS.Signals | null;
}

function run(executable: string, argv: string[], cwd: string, log?: string, env: Record<string, string> = {}): Promise<CommandResult> {
  return new Promise((resolveResult, reject) => {
    const out = log ? createWriteStream(log) : null;
    const child = spawn(executable, argv, {
      cwd,
      env: { ...process.env, ...env },
      stdio: out ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    if (out) {
      for (const stream of [child.stdout!, child.stderr!]) {
        stream.on("data", (chunk: Buffer) => {
          out.write(chunk);
          process.stdout.write(chunk);
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

// ---------------------------------------------------------------------------------------------
// 1. Mirror upstream at the pinned commit (or upstream master with --latest)

if (!existsSync(join(checkout, ".git"))) {
  mkdirSync(dirname(checkout), { recursive: true });
  await checked("git", ["clone", "--no-checkout", "--depth", "1", manifest.repository, checkout], dirname(checkout));
  await checked(
    "git",
    ["fetch", "--depth", "1", manifest.repository, values.latest ? `refs/heads/${manifest.branch}` : manifest.commit],
    checkout,
  );
  await checked("git", ["checkout", "--detach", "FETCH_HEAD"], checkout);
} else {
  if (git(["status", "--porcelain", "--untracked-files=no"])) {
    throw new Error(`Refusing to run: ${checkout} has local modifications of upstream tracked files.`);
  }
  const head = git(["rev-parse", "HEAD"]);
  const target = values.latest ? null : manifest.commit;
  if (target === null || head !== target) {
    // Detached checkout of the fetched commit; branches/untracked files are left alone, no reset/clean.
    await checked(
      "git",
      ["fetch", "--depth", "1", manifest.repository, values.latest ? `refs/heads/${manifest.branch}` : manifest.commit],
      checkout,
    );
    await checked("git", ["checkout", "--detach", "FETCH_HEAD"], checkout);
  }
}
const commit = git(["rev-parse", "HEAD"]);
const commitInfo = git(["show", "-s", "--format=%cI%n%s", "HEAD"]).split("\n");
if (!values.latest && commit !== manifest.commit) throw new Error(`Checkout is ${commit}; expected pinned ${manifest.commit}.`);
if (git(["status", "--porcelain", "--untracked-files=no"])) {
  throw new Error(`Refusing to run: ${checkout} has local modifications of upstream tracked files.`);
}
for (const file of PRESETS.custom ?? []) {
  const path = resolve(checkout, file);
  if (!existsSync(path) || !statSync(path).isFile()) throw new Error(`Test file not found in upstream checkout: ${file}`);
}

// ---------------------------------------------------------------------------------------------
// 2. Install upstream's own frozen dependencies with upstream's exact pnpm

const upstreamPackage = JSON.parse(readFileSync(join(checkout, "package.json"), "utf8"));
if (values.install) {
  // The checkout is its own pnpm workspace: run inside it. Lifecycle scripts are off; the
  // source tests need no build step.
  await checked(
    "npx",
    [
      "--yes",
      upstreamPackage.packageManager,
      "install",
      "--frozen-lockfile",
      "--ignore-scripts",
      "--filter",
      "@base-ui/react...",
      "--filter",
      "@base-ui/utils...",
      "--filter",
      "@base-ui/monorepo",
      "--filter",
      "@base-ui/monorepo-tests",
    ],
    checkout,
  );
}
const vitestBin = join(checkout, "node_modules/vitest/vitest.mjs");
if (!existsSync(vitestBin)) throw new Error("Upstream dependencies are missing. Rerun with --install.");

function installedVersion(name: string, from = join(checkout, "packages/react")): string | null {
  for (let dir = from; ; dir = dirname(dir)) {
    const pkg = join(dir, "node_modules", name, "package.json");
    if (existsSync(pkg)) return JSON.parse(readFileSync(pkg, "utf8")).version;
    if (dir === dirname(dir) || dir === dirname(checkout)) return null;
  }
}
function pnpmStoreVersion(name: string): string | null {
  const prefix = name.replace("/", "+") + "@";
  const hit = readdirSync(join(checkout, "node_modules/.pnpm")).find((d) => d.startsWith(prefix));
  return hit ? hit.slice(prefix.length).split("_")[0] : null;
}
const versions = Object.fromEntries(
  [
    "vitest",
    "vite",
    "react",
    "react-dom",
    "jsdom",
    "@testing-library/react",
    "@testing-library/dom",
    "@testing-library/user-event",
    "@testing-library/jest-dom",
    "@mui/internal-test-utils",
  ].map((name) => [name, installedVersion(name) ?? installedVersion(name, checkout) ?? pnpmStoreVersion(name)]),
);

// ---------------------------------------------------------------------------------------------
// 3. Generate the per-mode wrapper config (no upstream file is edited)

const output = join(here, "output");
const results = join(here, "results");
// Generated files live in an untracked directory inside the checkout so Vitest's config loader
// resolves upstream's own `vitest`, `vite` and plugins (a config outside the checkout would pick
// up our workspace's Vitest). It is removed after the run.
const harness = join(checkout, ".rtd-harness");
rmSync(harness, { recursive: true, force: true });
mkdirSync(harness, { recursive: true });

const P = (...parts: string[]): string => join(repo, "packages", ...parts);
const SHIM_ALIASES: Array<[RegExp, string]> = [
  [/^@testing-library\/react\/pure(\.js)?$/, P("react/src/pure.ts")],
  [/^@testing-library\/react\/dont-cleanup-after-each(\.js)?$/, P("react/src/dont-cleanup-after-each.ts")],
  [/^@testing-library\/react$/, P("react/src/index.ts")],
  [/^@testing-library\/dom$/, P("testing-library/src/index.ts")],
  [/^@testing-library\/user-event$/, P("user-event/src/index.ts")],
  [/^@testing-library\/jest-dom\/vitest(\.js)?$/, P("jest-dom/src/vitest.ts")],
  [/^@testing-library\/jest-dom\/matchers(\.js)?$/, P("jest-dom/src/matchers.ts")],
  [/^@testing-library\/jest-dom$/, P("jest-dom/src/index.ts")],
];
// --shims selects which Testing Library packages rtd-full substitutes (bisecting a failure to one
// of our packages); the default is all four.
const shimSet = new Set(values.shims!.split(",").map((s) => s.trim()));
for (const s of shimSet) if (!["react", "dom", "user-event", "jest-dom"].includes(s)) throw new Error(`Unknown shim ${s}`);
const ACTIVE_SHIMS = SHIM_ALIASES.filter(([re]) => shimSet.has(/@testing-library\\\/([a-z-]+)/.exec(re.source)![1]));
const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

function writeHarness(mode: Mode, modeOut: string): string {
  const environment = mode === "jsdom" ? "jsdom" : join(here, "rtd-environment.ts");
  const probe = join(harness, `${mode}-probe.ts`);
  const shimChecks = ACTIVE_SHIMS.filter(([, file]) => !file.includes("dont-cleanup")).map(
    ([re, file]) => [re.source.replace(/\\\//g, "/").replace(/^\^|\(\\\.js\)\?\$$|\$$/g, ""), file] as const,
  );
  writeFileSync(
    probe,
    `// Generated by downstream/base-ui/run.ts: proves which DOM / testing library this worker uses.
import { appendFileSync } from 'node:fs';
const mode = ${JSON.stringify(mode)};
const g = globalThis as any;
const receipt: Record<string, unknown> = { mode, userAgent: navigator.userAgent, documentConstructor: document.constructor.name, testPath: g.expect?.getState?.().testPath ?? null };
if (mode === 'jsdom') {
  if (g.__rtdDownstream || !navigator.userAgent.includes('jsdom')) throw new Error('Wrong DOM environment for jsdom mode');
} else {
  const dom = await import(${JSON.stringify(P("dom/src/index.ts"))});
  receipt.installer = g.__rtdDownstream?.installer;
  receipt.triage = g.__rtdDownstream?.triageAdded ?? [];
  receipt.singleDomInstance = g.__rtdDownstream?.Document === dom.Document && document instanceof dom.Document && g.Node === dom.Node;
  if (!g.__rtdDownstream || g.__rtdDownstream.document !== document) throw new Error('rtd mode is not running on the @rtd/dom window created by rtd-environment.ts');
  if (!receipt.singleDomInstance) throw new Error('Two @rtd/dom module instances are loaded (environment vs test realm)');
}
if (mode === 'rtd-full') {
  const checks: Record<string, boolean> = {};
${(mode === "rtd-full" ? shimChecks : [])
  .map(
    ([spec, file]) =>
      `  checks[${JSON.stringify(spec)}] = (await import(${JSON.stringify(spec)})) === (await import(${JSON.stringify(file)}));`,
  )
  .join("\n")}
  receipt.shims = checks;
  if (Object.values(checks).some((ok) => !ok)) throw new Error('Testing Library shim aliases did not apply: ' + JSON.stringify(checks));
}
appendFileSync(${JSON.stringify(join(modeOut, "environments.jsonl"))}, JSON.stringify(receipt) + '\\n');
`,
  );

  const rtd = mode !== "jsdom";
  const full = mode === "rtd-full";
  const resolutions = join(modeOut, "resolutions.jsonl");
  const config = join(harness, `${mode}.config.mts`);
  writeFileSync(
    config,
    `// Generated by downstream/base-ui/run.ts for mode ${mode}. Wraps upstream's configs unmodified.
import { appendFileSync } from 'node:fs';
import { mergeConfig } from 'vitest/config';
import upstreamRoot from '../vitest.config.mts';
import upstreamProject from '../packages/react/vitest.config.mts';

const repo = ${JSON.stringify(repo)};
const seen = new Set<string>();
// Records how react / react-dom / vitest / Testing Library imports resolve, so the report can
// prove there is exactly one React and that the shim aliases reached @mui/internal-test-utils.
const receipts = {
  name: 'rtd-downstream-resolution-receipts',
  enforce: 'pre' as const,
  async resolveId(source: string, importer: string | undefined, options: any) {
    const bare = /^(react|react-dom|vitest|@testing-library\\/[a-z-]+)(\\/|$)/.test(source);
    const ours = source.startsWith(repo + '/packages/');
    if (!bare && !ours) return null;
    const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
    const line = JSON.stringify({ source, importer: importer?.replace(${JSON.stringify(checkout + "/")}, ''), id: resolved?.id?.split('?')[0] ?? null, external: resolved?.external ?? null });
    if (!seen.has(line)) { seen.add(line); appendFileSync(${JSON.stringify(resolutions)}, line + '\\n'); }
    return resolved;
  },
};

const project = mergeConfig(upstreamProject, {
  root: ${JSON.stringify(join(checkout, "packages/react"))},
  plugins: [receipts],
  resolve: {
    ${full ? `alias: [${ACTIVE_SHIMS.map(([re, file]) => `{ find: ${re.toString()}, replacement: ${JSON.stringify(file)} }`).join(", ")}],` : ""}
    // Exactly one React (and one Vitest): our packages must resolve upstream's copies.
    dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom/client', 'vitest'],
  },
  server: { fs: { allow: [${JSON.stringify(checkout)}, repo] } },
  test: {
    name: '@base-ui/react',
    environment: ${JSON.stringify(environment)},
    ${rtd ? `environmentOptions: { rtd: { url: 'http://localhost'${values.triage ? ", triage: true" : ""} } },` : ""}
    ${
      rtd
        ? `server: { deps: {
      // One @rtd/dom module instance: the environment (loaded by Vitest's environment loader) and
      // the test realm must share it, so it is loaded natively by Node (which runs our .ts) in both.
      external: [/${escape(join(repo, "packages") + "/")}(dom|vitest-environment)\\/src\\//],
      ${full ? `// Its imports of @testing-library/* must go through the aliases above (with a --shims
      // subset, the stock packages left in place are inlined too so they bind to the chosen
      // @testing-library/dom).\n      inline: [/@mui\\/internal-test-utils/${shimSet.size < 4 ? ", /@testing-library\\/(react|user-event|jest-dom)/" : ""}],` : ""}
    } },`
        : ""
    }
  },
});
project.test.setupFiles = [${JSON.stringify(probe)}, ...(project.test.setupFiles ?? [])];${SENTRY_REPORTER ? `\nproject.test.runner = ${JSON.stringify(join(repo, "packages/sentry-tests/src/vitest-runner.ts"))};` : ""}

export default {
  ...upstreamRoot,
  root: ${JSON.stringify(checkout)},
  test: { ...upstreamRoot.test, projects: [project] },
};
`,
  );
  return config;
}

// ---------------------------------------------------------------------------------------------
// 4. Run each mode

interface Assertion {
  key: string;
  file: string;
  component: string;
  name: string;
  status: string;
  messages: string[];
}

interface ModeRun {
  mode: Mode;
  code: number | null;
  signal: string | null;
  wallMs: number;
  peakRssBytes: number | null;
  reportFound: boolean;
  passed?: number;
  failed?: number;
  skipped?: number;
  total?: number;
  files?: number;
  suiteErrors?: Array<{ file: string; message: string }>;
  assertions?: Map<string, Assertion>;
  receipts?: number;
  installer?: string[];
  triage?: string[];
  reactIds?: string[];
  shimHits?: Record<string, number>;
  sourceStable?: boolean;
}

function sourceFingerprint(): string {
  const hash = createHash("sha256");
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.(ts|tsx|js|mjs|json)$/.test(entry.name)) hash.update(path).update(readFileSync(path));
    }
  };
  for (const pkg of ["dom", "aria", "testing-library", "react", "user-event", "jest-dom"]) {
    if (existsSync(P(pkg, "src"))) walk(P(pkg, "src"));
  }
  for (const file of ["run.ts", "rtd-environment.ts"]) hash.update(readFileSync(join(here, file)));
  return hash.digest("hex").slice(0, 16);
}

function componentOf(file: string): string {
  const m = /packages\/react\/src\/([^/]+)\//.exec(file);
  if (m) return m[1];
  return file.includes("packages/react/test/") ? "(test utils)" : "(other)";
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
      const status = t.status === "pending" || t.status === "todo" ? "skipped" : t.status;
      out.set(key, { key, file: rel, component: componentOf(rel), name: t.fullName, status, messages: t.failureMessages ?? [] });
    }
  }
  return out;
}

const runs: ModeRun[] = [];
mkdirSync(output, { recursive: true });

try {
  for (const mode of modes) {
    const modeOut = join(output, mode);
    // Stale reports must never masquerade as passes.
    rmSync(modeOut, { recursive: true, force: true });
    mkdirSync(modeOut, { recursive: true });
    const config = writeHarness(mode, modeOut);
    const jsonPath = join(modeOut, "report.json");
    const logPath = join(modeOut, "vitest.log");
    const vitestArgs = [
      vitestBin,
      "run",
      "--config",
      config,
      "--project",
      "@base-ui/react",
      ...filters,
      ...(values.grep ? ["--testNamePattern", values.grep] : []),
      "--maxWorkers",
      String(workers),
      // Vitest 5 caches transformed modules on disk. Transforms embed resolved import ids, and
      // the modes resolve @testing-library/* differently, so every mode gets its own cache
      // (--cold disables it: slower, but every resolveId receipt is recorded).
      ...(values.cold ? ["--no-fsModuleCache"] : ["--fsModuleCachePath", join(checkout, "node_modules/.vitest-cache-rtd", mode)]),
      "--reporter",
      "default",
      ...(SENTRY_REPORTER ? ["--reporter", join(repo, "packages/sentry-tests/src/vitest.ts")] : []),
      "--reporter",
      "json",
      "--outputFile",
      jsonPath,
    ];
    console.log(`\n=== Base UI ${preset}: ${mode} (unmodified upstream tests, ${workers} workers) ===`);
    const before = mode === "jsdom" ? null : sourceFingerprint();
    const start = performance.now();
    // /usr/bin/time -l (macOS) reports the peak RSS of vitest and the workers it reaps.
    const timed = existsSync("/usr/bin/time") && process.platform === "darwin";
    const result = await run(
      timed ? "/usr/bin/time" : process.execPath,
      timed ? ["-l", process.execPath, ...vitestArgs] : vitestArgs,
      checkout,
      logPath,
      { VITEST_ENV: "jsdom", TZ: "UTC", FORCE_COLOR: "0" },
    );
    const wallMs = Math.round(performance.now() - start);
    const log = readFileSync(logPath, "utf8");
    const rss = /(\d+)\s+maximum resident set size/.exec(log);
    const r: ModeRun = {
      mode,
      code: result.code,
      signal: result.signal,
      wallMs,
      peakRssBytes: rss ? Number(rss[1]) : null,
      reportFound: existsSync(jsonPath),
      sourceStable: before === null ? undefined : before === sourceFingerprint(),
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
        .map((f: any) => ({ file: relative(checkout, f.name), message: String(f.message ?? "").split("\n").slice(0, 6).join("\n") }));
    }
    const receiptsPath = join(modeOut, "environments.jsonl");
    if (existsSync(receiptsPath)) {
      const receipts = readFileSync(receiptsPath, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
      r.receipts = receipts.length;
      r.installer = [...new Set(receipts.map((x) => x.installer).filter(Boolean))];
      r.triage = [...new Set(receipts.flatMap((x) => x.triage ?? []))] as string[];
    } else r.receipts = 0;
    const resPath = join(modeOut, "resolutions.jsonl");
    if (existsSync(resPath)) {
      const res = readFileSync(resPath, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
      r.reactIds = [...new Set(res.filter((x) => x.source === "react" && x.id).map((x) => x.id as string))];
      const hits: Record<string, number> = {};
      for (const x of res) {
        if (x.id && x.id.startsWith(join(repo, "packages") + "/") && (x.importer ?? "").includes("internal-test-utils")) {
          const k = relative(repo, x.id);
          hits[k] = (hits[k] ?? 0) + 1;
        }
      }
      r.shimHits = hits;
    }
    runs.push(r);
    writeFileSync(
      join(modeOut, "summary.json"),
      JSON.stringify({ ...r, assertions: undefined, commit, preset, filters, versions }, null, 2) + "\n",
    );
    console.log(
      `${mode}: ${r.passed ?? "?"} passed, ${r.failed ?? "?"} failed, ${r.skipped ?? "?"} skipped in ${(wallMs / 1000).toFixed(1)}s` +
        (r.peakRssBytes ? `, peak RSS ${(r.peakRssBytes / 2 ** 20).toFixed(0)} MiB` : ""),
    );
  }
} finally {
  rmSync(harness, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------------------------
// 5. Summary report

/** Normalized first line of a failure: the error signature used for clustering. */
export function signature(message: string): string {
  const lines = message
    .replace(/\u001b\[[0-9;]*m/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  let line = lines[0] ?? "(no message)";
  if (/^(AssertionError|Error): expected/.test(line) || line.length > 160) line = line.slice(0, 160);
  return line
    .replace(/\b\d+(\.\d+)?(px|ms)?\b/g, "N")
    .replace(/"[^"]{40,}"/g, '"…"')
    .replace(/'[^']{40,}'/g, "'…'");
}

const date = new Date().toLocaleDateString("sv-SE");
const triage = values.triage;
const reportPath = join(results, `${date}-${preset}${triage ? "-triage" : ""}.md`);
if (!values["no-report"]) {
  mkdirSync(results, { recursive: true });
  rmSync(reportPath, { force: true });
  const baseline = runs.find((r) => r.mode === "jsdom")?.assertions;
  const mib = (b: number | null): string => (b ? `${(b / 2 ** 20).toFixed(0)} MiB` : "n/a");
  const md: string[] = [];
  md.push(`# Base UI downstream: \`${preset}\` (${date})`, "");
  if (triage) {
    md.push(
      "> **TRIAGE MODE (`--triage`)**: the rtd environment applied the triage shims in `rtd-environment.ts` (workarounds for blockers already filed in TRIAGE.md) to look past them. These are not compatibility results.",
      "",
    );
  }
  md.push(
    `- upstream: ${manifest.repository.replace(/\.git$/, "")} @ \`${commit}\` (${commitInfo[0]}) — ${commitInfo[1]}`,
    `- pinned: \`${manifest.commit}\`${commit === manifest.commit ? "" : " (**--latest: differs from pin**)"}`,
    `- filters: ${filters.length ? filters.map((f) => `\`${f}\``).join(", ") : "(entire @base-ui/react project)"}`,
    `- node ${process.version}, workers ${workers}, upstream versions: ${Object.entries(versions)
      .map(([k, v]) => `${k}@${v}`)
      .join(", ")}`,
    `- rtd-full substitutes: ${[...shimSet].map((x) => `@testing-library/${x}`).join(", ")}`,
    `- rtd modes run with userAgent containing "jsdom" (same headless branches as the baseline; see README).`,
    "",
  );
  md.push("## Per-mode results", "");
  md.push("| mode | passed | failed | skipped | total | files | suite errors | exit | wall | peak RSS | env receipts | notes |");
  md.push("| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --- |");
  for (const r of runs) {
    const notes: string[] = [];
    if (!r.reportFound) notes.push("**no JSON report**");
    if (r.installer?.length) notes.push(`installer: ${r.installer.join(",")}`);
    if (r.triage?.length) notes.push(`triage shims patched: ${r.triage.join(", ")}`);
    if (r.reactIds?.length) notes.push(r.reactIds.length === 1 ? "1 React" : `**${r.reactIds.length} React ids**`);
    if (r.mode === "rtd-full" && values.cold) notes.push(`shim files imported by internal-test-utils: ${Object.keys(r.shimHits ?? {}).length}`);
    if (r.sourceStable === false) notes.push("our sources changed during the run");
    md.push(
      `| ${r.mode} | ${r.passed ?? "?"} | ${r.failed ?? "?"} | ${r.skipped ?? "?"} | ${r.total ?? "?"} | ${r.files ?? "?"} | ${r.suiteErrors?.length ?? "?"} | ${r.code ?? r.signal} | ${(r.wallMs / 1000).toFixed(1)}s | ${mib(r.peakRssBytes)} | ${r.receipts ?? 0} | ${notes.join("; ")} |`,
    );
  }
  md.push("");

  for (const r of runs) {
    if (!r.assertions) continue;
    const failures = [...r.assertions.values()].filter((a) => a.status === "failed");
    md.push(`## ${r.mode}`, "");
    if (r.suiteErrors?.length) {
      md.push("### Suite errors (file failed to load)", "");
      for (const e of r.suiteErrors) md.push(`- \`${e.file}\`: ${signature(e.message)}`);
      md.push("");
    }
    if (baseline && r.mode !== "jsdom") {
      const regress = [...r.assertions.values()].filter((a) => a.status === "failed" && baseline.get(a.key)?.status === "passed");
      const missing = [...baseline.keys()].filter((k) => !r.assertions!.has(k));
      const added = [...r.assertions.keys()].filter((k) => !baseline.has(k));
      const newSkips = [...r.assertions.values()].filter((a) => a.status === "skipped" && baseline.get(a.key)?.status === "passed");
      const fixed = [...r.assertions.values()].filter((a) => a.status === "passed" && baseline.get(a.key)?.status === "failed");
      md.push(
        `Compared with jsdom: **${regress.length} pass on jsdom but fail here**, ${missing.length} missing, ${added.length} added, ${newSkips.length} newly skipped, ${fixed.length} fail on jsdom but pass here.`,
        "",
      );
      if (regress.length) {
        md.push("### Pass on jsdom, fail here", "");
        md.push("<details><summary>" + regress.length + " tests</summary>", "");
        for (const a of regress) md.push(`- \`${a.key}\` — ${signature(a.messages[0] ?? "")}`);
        md.push("", "</details>", "");
      }
      if (missing.length) {
        md.push("<details><summary>missing vs jsdom (" + missing.length + ")</summary>", "");
        for (const k of missing.slice(0, 300)) md.push(`- \`${k}\``);
        md.push("", "</details>", "");
      }
    }
    if (failures.length) {
      const byComponent = new Map<string, number>();
      const bySignature = new Map<string, { count: number; components: Set<string>; example: string }>();
      for (const f of failures) {
        byComponent.set(f.component, (byComponent.get(f.component) ?? 0) + 1);
        const sig = signature(f.messages[0] ?? "");
        const entry = bySignature.get(sig) ?? { count: 0, components: new Set(), example: f.key };
        entry.count++;
        entry.components.add(f.component);
        bySignature.set(sig, entry);
      }
      md.push("### Failures by component", "", "| component | failed |", "| --- | --: |");
      for (const [c, n] of [...byComponent].sort((a, b) => b[1] - a[1])) md.push(`| ${c} | ${n} |`);
      md.push("", "### Failures by error signature", "", "| count | signature | components | example |", "| --: | --- | --- | --- |");
      for (const [sig, e] of [...bySignature].sort((a, b) => b[1].count - a[1].count)) {
        md.push(
          `| ${e.count} | ${sig.replace(/\|/g, "\\|").replace(/`/g, "'")} | ${[...e.components].join(", ")} | \`${e.example.replace(/\|/g, "\\|")}\` |`,
        );
      }
      md.push("");
    } else md.push("No failing tests.", "");
  }
  md.push("Raw Vitest JSON and logs: `downstream/base-ui/output/<mode>/` (gitignored).", "");
  writeFileSync(reportPath, md.join("\n"));
  console.log(`\nReport: ${relative(repo, reportPath)}`);
}

// Exit non-zero when a run produced no report, the environment could not be verified, or the
// discovered test set differs from jsdom (assertion failures alone are expected for rtd modes).
const baselineRun = runs.find((r) => r.mode === "jsdom");
process.exitCode = runs.some(
  (r) =>
    !r.reportFound ||
    (r.files ?? 0) > 0 && r.receipts === 0 ||
    (r.mode === "jsdom" && r.code !== 0) ||
    (baselineRun?.assertions && r.assertions && r.assertions.size !== baselineRun.assertions.size),
)
  ? 1
  : 0;
