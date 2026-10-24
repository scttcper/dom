#!/usr/bin/env node
// Radix Primitives downstream suite: run the unmodified upstream `radix-ui/primitives` Vitest
// `unit` project on
//   jsdom     upstream baseline, unchanged (Vitest 4 + jsdom 29)
//   rtd-dom   only the DOM environment swapped to our stock `vitest-environment-rtd`
//             (stock Testing Library from upstream's lockfile)
//   rtd-full  @rtd/dom + our Testing Library packages aliased over
//             @testing-library/{react,dom,user-event,jest-dom}
//
//   node downstream/radix/run.ts [--install] [--latest] [--preset smoke|interactions|all]
//        [--files a,b] [--modes jsdom,rtd-dom,rtd-full] [--workers N] [--no-report]
//
// Structure copied from downstream/base-ui/run.ts (kept independent so the Base UI runner can stay
// stable): pinned commit (manifest.json), unmodified upstream tests (refuses tracked local
// changes), upstream's own frozen lockfile + exact pnpm, fresh reports (old ones are deleted
// first), versions/commit recorded, every rtd mode compared against the jsdom baseline.
// Differences from Base UI are documented in README.md (no environment adapter, default
// userAgent, retry forced to 0).

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");
const manifest = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8")) as {
  repository: string;
  branch: string;
  commit: string;
  project: string;
};

const MODES = ["jsdom", "rtd-dom", "rtd-full"] as const;
type Mode = (typeof MODES)[number];

const PRESETS: Record<string, string[]> = {
  smoke: ["checkbox", "dialog", "tabs", "select", "form", "dropdown-menu"].map((dir) => `packages/react/${dir}/`),
  interactions: [
    "accordion",
    "alert-dialog",
    "checkbox",
    "context-menu",
    "dialog",
    "dismissable-layer",
    "dropdown-menu",
    "focus-scope",
    "form",
    "hover-card",
    "menubar",
    "navigation-menu",
    "one-time-password-field",
    "password-toggle-field",
    "popover",
    "radio-group",
    "select",
    "slider",
    "switch",
    "tabs",
    "toast",
    "toggle-group",
    "toolbar",
    "tooltip",
  ].map((dir) => `packages/react/${dir}/`),
  all: [],
};

const { values } = parseArgs({
  options: {
    checkout: { type: "string", default: join(here, "checkout") },
    preset: { type: "string", default: "smoke" },
    files: { type: "string" },
    modes: { type: "string", default: MODES.join(",") },
    // Fixed default (not core-count based) so every mode, and every suite on a shared machine,
    // runs with the same worker count.
    workers: { type: "string", default: String(Math.min(4, availableParallelism())) },
    rounds: { type: "string", default: "1" },
    latest: { type: "boolean", default: false },
    install: { type: "boolean", default: false },
    "no-report": { type: "boolean", default: false },
    "upstream-retry": { type: "boolean", default: false },
    shims: { type: "string", default: "react,dom,user-event,jest-dom" },
    grep: { type: "string" },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (values.help) {
  console.log(
    "node downstream/radix/run.ts [--install] [--latest] [--preset smoke|interactions|all | --files a,b] " +
      "[--modes jsdom,rtd-dom,rtd-full] [--workers N] [--rounds N] [--checkout PATH] [--no-report] [--upstream-retry] " +
      "[--shims react,dom,user-event,jest-dom] [--grep TEST_NAME_PATTERN]",
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
const rounds = Number(values.rounds);
if (!Number.isSafeInteger(rounds) || rounds < 1) throw new Error("--rounds must be a positive integer");
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
// 1. Mirror upstream at the pinned commit (or upstream main with --latest)

const ref = values.latest ? `refs/heads/${manifest.branch}` : manifest.commit;
if (!existsSync(join(checkout, ".git"))) {
  mkdirSync(dirname(checkout), { recursive: true });
  await checked("git", ["clone", "--no-checkout", "--depth", "1", manifest.repository, checkout], dirname(checkout));
  await checked("git", ["fetch", "--depth", "1", manifest.repository, ref], checkout);
  await checked("git", ["checkout", "--detach", "FETCH_HEAD"], checkout);
} else {
  if (git(["status", "--porcelain", "--untracked-files=no"])) {
    throw new Error(`Refusing to run: ${checkout} has local modifications of upstream tracked files.`);
  }
  if (values.latest || git(["rev-parse", "HEAD"]) !== manifest.commit) {
    // Detached checkout of the fetched commit; branches/untracked files are left alone, no reset/clean.
    await checked("git", ["fetch", "--depth", "1", manifest.repository, ref], checkout);
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
  if (!existsSync(path)) throw new Error(`Test path not found in upstream checkout: ${file}`);
}

// ---------------------------------------------------------------------------------------------
// 2. Install upstream's own frozen dependencies with upstream's exact pnpm

const upstreamPackage = JSON.parse(readFileSync(join(checkout, "package.json"), "utf8"));
if (values.install) {
  // The checkout is its own pnpm workspace: run inside it. Lifecycle scripts are off (the
  // packages' `main` points at `src/index.ts`, so tests need no build). apps/* (Storybook, a
  // Next.js SSR app) are not needed by the unit project and are skipped.
  await checked(
    "npx",
    [
      "--yes",
      upstreamPackage.packageManager,
      "install",
      "--frozen-lockfile",
      "--ignore-scripts",
      "--filter",
      "primitives",
      "--filter",
      "./packages/**",
      "--filter",
      "./internal/**",
    ],
    checkout,
  );
}
const vitestBin = join(checkout, "node_modules/vitest/vitest.mjs");
if (!existsSync(vitestBin)) throw new Error("Upstream dependencies are missing. Rerun with --install.");

function installedVersion(name: string): string | null {
  const pkg = join(checkout, "node_modules", name, "package.json");
  return existsSync(pkg) ? JSON.parse(readFileSync(pkg, "utf8")).version : null;
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
    "vitest-axe",
    "axe-core",
  ].map((name) => [name, installedVersion(name) ?? pnpmStoreVersion(name)]),
);

// ---------------------------------------------------------------------------------------------
// 3. Generate the per-mode wrapper config (no upstream file is edited)

const output = join(here, "output");
const results = join(here, "results");
// Generated files live in an untracked directory inside the checkout so Vitest's config loader
// resolves upstream's own `vitest` and `vite` (a config outside the checkout would pick up our
// workspace's Vitest 5). It is removed after the run.
const harness = join(checkout, ".rtd-harness");
rmSync(harness, { recursive: true, force: true });
mkdirSync(harness, { recursive: true });

const P = (...parts: string[]): string => join(repo, "packages", ...parts);
// Upstream runs Vitest 4.1; our `vitest-environment-rtd` targets Vitest 5 but the Environment
// contract it uses (`name`, `viteEnvironment`, `setup(global, options) -> { teardown }`) is the
// same in Vitest 4, so the stock environment is used as is (no adapter).
const RTD_ENVIRONMENT = P("vitest-environment/src/index.ts");
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
  const probe = join(harness, `${mode}-probe.ts`);
  // Entry points with import-time side effects are not probed: dont-cleanup-after-each sets a
  // flag, and the jest-dom root calls a global `expect.extend` (Radix has no `globals: true`).
  const shimChecks = ACTIVE_SHIMS.filter(([, file]) => !file.includes("dont-cleanup") && !file.endsWith("jest-dom/src/index.ts")).map(
    ([re, file]) => [re.source.replace(/\\\//g, "/").replace(/^\^|\(\\\.js\)\?\$$|\$$/g, ""), file] as const,
  );
  writeFileSync(
    probe,
    `// Generated by downstream/radix/run.ts: proves which DOM / testing library this worker uses.
import { appendFileSync } from 'node:fs';
const mode = ${JSON.stringify(mode)};
const g = globalThis as any;
const receipt: Record<string, unknown> = { mode, userAgent: navigator.userAgent, documentConstructor: document.constructor.name, testPath: g.expect?.getState?.().testPath ?? null };
if (mode === 'jsdom') {
  if (!navigator.userAgent.includes('jsdom')) throw new Error('Wrong DOM environment for jsdom mode');
} else {
  // The environment (vitest-environment-rtd, loaded natively) and this test realm must share
  // one @rtd/dom module instance: the globals must be instances of the classes we import here.
  const dom = await import(${JSON.stringify(P("dom/src/index.ts"))});
  receipt.singleDomInstance = document instanceof dom.Document && g.Node === dom.Node && g.window === g;
  if (!receipt.singleDomInstance) throw new Error('rtd mode is not running on a single @rtd/dom instance (environment vs test realm)');
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
    `// Generated by downstream/radix/run.ts for mode ${mode}. Wraps upstream's config unmodified.
import { appendFileSync } from 'node:fs';
import { mergeConfig } from 'vitest/config';
import upstream from '../vitest.config.mts';

const repo = ${JSON.stringify(repo)};
const seen = new Set<string>();
// Records how react / react-dom / vitest / Testing Library imports resolve, so the report can
// prove there is exactly one React and where every @testing-library/* import went.
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

const unit = (upstream as any).test.projects.find((p: any) => p?.test?.name === ${JSON.stringify(manifest.project)});
if (!unit) throw new Error('upstream vitest.config.mts has no ${manifest.project} project');

const project = mergeConfig(unit, {
  root: ${JSON.stringify(checkout)},
  plugins: [receipts],
  resolve: {
    ${full ? `alias: [${ACTIVE_SHIMS.map(([re, file]) => `{ find: ${re.toString()}, replacement: ${JSON.stringify(file)} }`).join(", ")}],` : ""}
    // Exactly one React (and one Vitest): our packages must resolve upstream's copies.
    dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom/client', 'react-dom/test-utils', 'vitest'],
  },
  server: { fs: { allow: [${JSON.stringify(checkout)}, repo] } },
  test: {
    ${rtd ? `environment: ${JSON.stringify(RTD_ENVIRONMENT)},` : ""}
    ${
      rtd
        ? `server: { deps: {
      // One @rtd/dom module instance: the environment (loaded by Vitest's environment loader) and
      // the test realm must share it, so it is loaded natively by Node (which runs our .ts) in both.
      external: [/${escape(join(repo, "packages") + "/")}(dom|vitest-environment)\\/src\\//],
      ${full && shimSet.size < 4 ? `// With a --shims subset, the stock packages left in place are inlined so their imports of\n      // the substituted @testing-library/* go through the aliases above.\n      inline: [/@testing-library\\/(react|user-event|jest-dom|dom)/],` : ""}
    } },`
        : ""
    }
  },
});
${values["upstream-retry"] ? "" : "// Upstream sets retry: 1, which would hide intermittent failures on either engine.\nproject.test.retry = 0;"}
project.test.setupFiles = [${JSON.stringify(probe)}, ...(project.test.setupFiles ?? [])];

export default {
  ...upstream,
  root: ${JSON.stringify(checkout)},
  test: { ...(upstream as any).test, projects: [project] },
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
  userAgents?: string[];
  reactIds?: string[];
  stockTestingLibrary?: string[];
  sourceStable?: boolean;
  wallSamples?: number[];
  rssSamples?: number[];
  /** Tests whose status differed between rounds (intermittent on this engine). */
  unstable?: string[];
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
  for (const pkg of ["dom", "aria", "testing-library", "react", "user-event", "jest-dom", "vitest-environment"]) {
    if (existsSync(P(pkg, "src"))) walk(P(pkg, "src"));
  }
  hash.update(readFileSync(join(here, "run.ts")));
  return hash.digest("hex").slice(0, 16);
}

function componentOf(file: string): string {
  const m = /packages\/(?:react|core)\/([^/]+)\//.exec(file);
  return m ? m[1] : "(other)";
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

// --rounds N interleaves the modes (jsdom, rtd-dom, rtd-full, jsdom, …) so load from other
// processes on a shared machine hits every mode alike; wall/RSS are reported as medians and the
// counts/failures come from the last round (tests that flip between rounds are listed).
try {
  for (let round = 1; round <= rounds; round++)
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
      manifest.project,
      ...filters,
      ...(values.grep ? ["--testNamePattern", values.grep] : []),
      "--maxWorkers",
      String(workers),
      "--reporter",
      "default",
      "--reporter",
      "json",
      "--outputFile",
      jsonPath,
    ];
    console.log(`\n=== Radix ${preset}: ${mode}, round ${round}/${rounds} (unmodified upstream tests, ${workers} workers) ===`);
    const before = mode === "jsdom" ? null : sourceFingerprint();
    const start = performance.now();
    // /usr/bin/time -l (macOS) reports the peak RSS of vitest and the workers it reaps.
    // process.execPath (not the checkout's .nvmrc Node 24): @rtd/* runs on Node 26.
    const timed = existsSync("/usr/bin/time") && process.platform === "darwin";
    const result = await run(
      timed ? "/usr/bin/time" : process.execPath,
      timed ? ["-l", process.execPath, ...vitestArgs] : vitestArgs,
      checkout,
      logPath,
      { TZ: "UTC", FORCE_COLOR: "0" },
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
      r.userAgents = [...new Set(receipts.map((x) => x.userAgent as string))];
    } else r.receipts = 0;
    const resPath = join(modeOut, "resolutions.jsonl");
    if (existsSync(resPath)) {
      const res = readFileSync(resPath, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
      r.reactIds = [...new Set(res.filter((x) => x.source === "react" && x.id).map((x) => x.id as string))];
      // In rtd-full every @testing-library/* import must land in our packages/.
      r.stockTestingLibrary = [
        ...new Set(
          res
            .filter((x) => /^@testing-library\//.test(x.source) && x.id && !x.id.startsWith(join(repo, "packages") + "/"))
            .map((x) => `${x.source} <- ${x.importer}`),
        ),
      ];
    }
    const previous = runs.find((x) => x.mode === mode);
    r.wallSamples = [...(previous?.wallSamples ?? []), wallMs];
    r.rssSamples = [...(previous?.rssSamples ?? []), ...(r.peakRssBytes ? [r.peakRssBytes] : [])];
    r.unstable = [...(previous?.unstable ?? [])];
    if (previous?.assertions && r.assertions) {
      for (const [key, a] of r.assertions) {
        const before = previous.assertions.get(key)?.status;
        if (before !== undefined && before !== a.status && !r.unstable.includes(key)) r.unstable.push(key);
      }
    }
    if (previous) runs.splice(runs.indexOf(previous), 1, r);
    else runs.push(r);
    writeFileSync(
      join(modeOut, "summary.json"),
      JSON.stringify({ ...r, assertions: undefined, round, rounds, commit, preset, filters, versions }, null, 2) + "\n",
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
function signature(message: string): string {
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

const guardFailures: string[] = [];
for (const r of runs) {
  if ((r.reactIds?.length ?? 0) > 1) guardFailures.push(`${r.mode}: ${r.reactIds!.length} React module ids`);
  if (r.mode === "rtd-full" && shimSet.size === 4 && r.stockTestingLibrary?.length) {
    guardFailures.push(`rtd-full: stock Testing Library imported: ${r.stockTestingLibrary.join(", ")}`);
  }
  if ((r.files ?? 0) > 0 && r.receipts === 0) guardFailures.push(`${r.mode}: no environment receipts (probe never ran)`);
}

const date = new Date().toLocaleDateString("sv-SE");
const reportPath = join(results, `${date}-${preset}.md`);
if (!values["no-report"]) {
  mkdirSync(results, { recursive: true });
  rmSync(reportPath, { force: true });
  const baseline = runs.find((r) => r.mode === "jsdom")?.assertions;
  const mib = (b: number | null): string => (b ? `${(b / 2 ** 20).toFixed(0)} MiB` : "n/a");
  const median = (xs: number[]): number | null => {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b);
    return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  };
  const wall = (r: ModeRun): string => {
    const xs = r.wallSamples ?? [r.wallMs];
    const sec = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;
    return xs.length > 1 ? `${sec(median(xs)!)} (${sec(Math.min(...xs))}–${sec(Math.max(...xs))})` : sec(xs[0]);
  };
  const md: string[] = [];
  md.push(`# Radix Primitives downstream: \`${preset}\` (${date})`, "");
  md.push(
    `- upstream: ${manifest.repository.replace(/\.git$/, "")} @ \`${commit}\` (${commitInfo[0]}) — ${commitInfo[1]}`,
    `- pinned: \`${manifest.commit}\`${commit === manifest.commit ? "" : " (**--latest: differs from pin**)"}`,
    `- project: \`${manifest.project}\`; filters: ${filters.length ? filters.map((f) => `\`${f}\``).join(", ") : "(entire project)"}`,
    `- node ${process.version}, workers ${workers}, upstream versions: ${Object.entries(versions)
      .map(([k, v]) => `${k}@${v}`)
      .join(", ")}`,
    `- rtd environment: stock \`vitest-environment-rtd\` (default options, default userAgent); rtd-full substitutes: ${[...shimSet].map((x) => `@testing-library/${x}`).join(", ")}`,
    `- measurement: ${rounds} round(s), modes interleaved; wall/peak RSS are ${rounds > 1 ? "medians (wall range in parentheses)" : "single samples"}; ${workers} workers in every mode`,
    `- retry: ${values["upstream-retry"] ? "upstream (1)" : "0 (upstream's retry: 1 overridden in every mode)"}`,
    `- guards: ${guardFailures.length ? "**FAILED** — " + guardFailures.join("; ") : "one React id per mode, single @rtd/dom instance (probe), rtd-full imports only our @testing-library/* — all OK"}`,
    "",
  );
  md.push("## Per-mode results", "");
  md.push("| mode | passed | failed | skipped | total | files | suite errors | exit | wall | peak RSS | env receipts | notes |");
  md.push("| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --- |");
  for (const r of runs) {
    const notes: string[] = [];
    if (!r.reportFound) notes.push("**no JSON report**");
    if (r.reactIds?.length) notes.push(r.reactIds.length === 1 ? "1 React" : `**${r.reactIds.length} React ids**`);
    if (r.mode === "rtd-full") notes.push(`stock TL imports: ${r.stockTestingLibrary?.length ?? "?"}`);
    if (r.sourceStable === false) notes.push("our sources changed during the run");
    if (r.unstable?.length) notes.push(`**${r.unstable.length} tests changed status between rounds**`);
    md.push(
      `| ${r.mode} | ${r.passed ?? "?"} | ${r.failed ?? "?"} | ${r.skipped ?? "?"} | ${r.total ?? "?"} | ${r.files ?? "?"} | ${r.suiteErrors?.length ?? "?"} | ${r.code ?? r.signal} | ${wall(r)} | ${mib(median(r.rssSamples ?? []))} | ${r.receipts ?? 0} | ${notes.join("; ")} |`,
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
      if (r.unstable?.length) {
        md.push("### Changed status between rounds", "");
        for (const k of r.unstable) md.push(`- \`${k}\``);
        md.push("");
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
  md.push("Raw Vitest JSON and logs: `downstream/radix/output/<mode>/` (gitignored).", "");
  writeFileSync(reportPath, md.join("\n"));
  console.log(`\nReport: ${relative(repo, reportPath)}`);
}
if (guardFailures.length) console.error(`\nGuard failures:\n- ${guardFailures.join("\n- ")}`);

// Exit non-zero when a run produced no report, a guard failed, the jsdom baseline failed, or the
// discovered test set differs from jsdom (assertion failures alone are expected for rtd modes).
const baselineRun = runs.find((r) => r.mode === "jsdom");
process.exitCode = runs.some(
  (r) =>
    !r.reportFound ||
    (r.mode === "jsdom" && r.code !== 0) ||
    (baselineRun?.assertions && r.assertions && r.assertions.size !== baselineRun.assertions.size),
) || guardFailures.length
  ? 1
  : 0;
