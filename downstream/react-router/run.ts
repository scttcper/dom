#!/usr/bin/env node
// React Router downstream suite: run the unmodified upstream remix-run/react-router Jest project
// of `packages/react-router` (routing, data routers, <Link>/<Form> navigation through
// window.history, fetchers, scroll restoration, ~2k tests) on
//   jsdom     upstream baseline (jest-environment-jsdom 30, upstream's config unchanged)
//   rtd-dom   testEnvironment swapped to jest-environment-rtd (stock Testing Library from upstream's lockfile)
//   rtd-full  jest-environment-rtd + our built bundles for @testing-library/{react,dom,user-event,jest-dom}
//
//   node downstream/react-router/run.ts [--install] [--latest] [--preset smoke|all]
//        [--files a,b] [--modes jsdom,rtd-dom,rtd-full] [--workers N] [--rounds N] [--no-report]
//
// Copied from downstream/react-hook-form/run.ts (itself from downstream/react-aria; kept
// independent so the other runners stay stable). Upstream runs Jest in native ESM mode
// (`node --experimental-vm-modules`, ESM config, ESM test files, top-level await in a setup
// file), which the other Jest suites do not exercise. See README.md.

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
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
  package: string;
  presets: Record<string, string[]>;
  exclude: string[];
};

const MODES = ["jsdom", "rtd-dom", "rtd-full"] as const;
type Mode = (typeof MODES)[number];
const SHIM_PACKAGES = ["react", "dom", "user-event", "jest-dom"] as const;

const { values } = parseArgs({
  options: {
    checkout: { type: "string", default: join(here, "checkout") },
    preset: { type: "string", default: "smoke" },
    files: { type: "string" },
    modes: { type: "string", default: MODES.join(",") },
    // Same explicit worker count for every mode (shared machine: keep timings comparable).
    workers: { type: "string", default: String(Math.min(4, Math.max(2, Math.floor(availableParallelism() / 2)))) },
    rounds: { type: "string", default: "1" },
    latest: { type: "boolean", default: false },
    install: { type: "boolean", default: false },
    build: { type: "boolean", default: true },
    report: { type: "boolean", default: true },
    shims: { type: "string", default: SHIM_PACKAGES.join(",") },
    grep: { type: "string" },
    help: { type: "boolean", short: "h", default: false },
  },
  allowNegative: true,
});

if (values.help) {
  console.log(
    "node downstream/react-router/run.ts [--install] [--latest] [--preset smoke|all | --files a,b] " +
      "[--modes jsdom,rtd-dom,rtd-full] [--workers N] [--rounds N] [--checkout PATH] [--no-build] [--no-report] " +
      "[--shims react,dom,user-event,jest-dom] [--grep TEST_NAME_PATTERN]",
  );
  process.exit(0);
}

const checkout = resolve(values.checkout!);
const preset = values.files === undefined ? values.preset! : "custom";
const presets: Record<string, string[]> = { ...manifest.presets };
if (values.files !== undefined) presets.custom = values.files.split(",").map((f) => f.trim()).filter(Boolean);
const filters = presets[preset];
if (filters === undefined) throw new Error(`Unknown preset ${preset}; use ${Object.keys(manifest.presets).join(", ")} or --files.`);
const modes = values.modes!.split(",").map((m) => m.trim()) as Mode[];
for (const mode of modes) if (!MODES.includes(mode)) throw new Error(`Unknown mode ${mode}; use ${MODES.join(", ")}`);
const workers = Number(values.workers);
const rounds = Number(values.rounds);
if (!Number.isSafeInteger(workers) || workers < 1) throw new Error("--workers must be a positive integer");
if (!Number.isSafeInteger(rounds) || rounds < 1) throw new Error("--rounds must be a positive integer");
const shimSet = new Set(values.shims!.split(",").map((s) => s.trim()).filter(Boolean));
for (const s of shimSet) if (!(SHIM_PACKAGES as readonly string[]).includes(s)) throw new Error(`Unknown shim ${s}`);

// ---------------------------------------------------------------------------------------------
// Process helpers

interface CommandResult {
  code: number | null;
  signal: NodeJS.Signals | null;
}

function run(executable: string, argv: string[], cwd: string, log?: string, env: Record<string, string | undefined> = {}): Promise<CommandResult> {
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

async function checked(executable: string, argv: string[], cwd: string, env: Record<string, string | undefined> = {}): Promise<void> {
  const result = await run(executable, argv, cwd, undefined, env);
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

const fetchRef = values.latest ? `refs/heads/${manifest.branch}` : manifest.commit;
if (!existsSync(join(checkout, ".git"))) {
  mkdirSync(dirname(checkout), { recursive: true });
  await checked("git", ["clone", "--no-checkout", "--depth", "1", manifest.repository, checkout], dirname(checkout));
  await checked("git", ["fetch", "--depth", "1", manifest.repository, fetchRef], checkout);
  await checked("git", ["checkout", "--detach", "FETCH_HEAD"], checkout);
} else {
  if (git(["status", "--porcelain", "--untracked-files=no"])) {
    throw new Error(`Refusing to run: ${checkout} has local modifications of upstream tracked files.`);
  }
  if (values.latest || git(["rev-parse", "HEAD"]) !== manifest.commit) {
    // Detached checkout of the fetched commit; branches/untracked files are left alone, no reset/clean.
    await checked("git", ["fetch", "--depth", "1", manifest.repository, fetchRef], checkout);
    await checked("git", ["checkout", "--detach", "FETCH_HEAD"], checkout);
  }
}
const commit = git(["rev-parse", "HEAD"]);
const commitInfo = git(["show", "-s", "--format=%cI%n%s", "HEAD"]).split("\n");
if (!values.latest && commit !== manifest.commit) throw new Error(`Checkout is ${commit}; expected pinned ${manifest.commit}.`);
if (git(["status", "--porcelain", "--untracked-files=no"])) {
  throw new Error(`Refusing to run: ${checkout} has local modifications of upstream tracked files.`);
}
for (const file of filters) {
  if (!existsSync(resolve(checkout, file))) throw new Error(`Test path not found in upstream checkout: ${file}`);
}

// ---------------------------------------------------------------------------------------------
// 2. Install upstream's own frozen dependencies

const upstreamPackage = JSON.parse(readFileSync(join(checkout, "package.json"), "utf8"));
if (values.install) {
  // Upstream's exact pnpm, frozen lockfile, lifecycle scripts off; only the root (Jest, Babel)
  // and packages/react-router with its workspace dependencies.
  await checked(
    "npx",
    ["--yes", upstreamPackage.packageManager, "install", "--frozen-lockfile", "--ignore-scripts", "--filter", upstreamPackage.name, "--filter", `{./${manifest.package}}...`],
    checkout,
  );
}
const jestBin = join(checkout, "node_modules/jest/bin/jest.js");
if (!existsSync(jestBin)) throw new Error("Upstream dependencies are missing. Rerun with --install.");

const pkgDir = join(checkout, manifest.package);
function installedVersion(name: string): string | null {
  // The jsdom that matters is jest-environment-jsdom's (26), not the root's own jsdom devDependency.
  if (name === "jsdom") {
    const env = realpathSync(join(checkout, "node_modules/jest-environment-jsdom"));
    return JSON.parse(readFileSync(join(env, "../jsdom/package.json"), "utf8")).version;
  }
  for (const base of [pkgDir, checkout]) {
    const pkg = join(base, "node_modules", name, "package.json");
    if (existsSync(pkg)) return JSON.parse(readFileSync(pkg, "utf8")).version;
  }
  const prefix = name.replace("/", "+") + "@";
  const hit = readdirSync(join(checkout, "node_modules/.pnpm")).find((d) => d.startsWith(prefix));
  return hit ? hit.slice(prefix.length).split("_")[0] : null;
}
const versions = Object.fromEntries(
  [
    "jest",
    "jest-environment-jsdom",
    "jsdom",
    "babel-jest",
    "react",
    "react-dom",
    "@testing-library/react",
    "@testing-library/dom",
    "@testing-library/user-event",
    "@testing-library/jest-dom",
  ].map((name) => [name, installedVersion(name)]),
);

// rtd-full uses our built bundles (packages/*/dist), so Jest needs no TS transform of our sources.
// Upstream runs Jest in ESM mode, where test files `import` Testing Library and CommonJS files
// (the probe, CJS dependencies) `require` it. A moduleNameMapper target serves both, so a `.cjs`
// target breaks `import userEvent from ...` (default = module.exports, not its .default) and an
// ESM target breaks `require`. resolver.cjs picks what a published package's exports map would:
// the ESM bundle (`default`) for imports, the `.cjs` one (`require`) for requires.
type Target = { import: string; require: string };
const DIST = (pkg: string, file: string): Target => {
  const esm = join(repo, "packages", pkg, "dist", file);
  const cjs = esm.replace(/\.js$/, ".cjs");
  for (const f of [esm, cjs]) if (!existsSync(f)) throw new Error(`Missing ${relative(repo, f)}: run pnpm build`);
  return { import: esm, require: cjs };
};
// Rebuilt (`pnpm build`) when missing or older than any source file, unless --no-build.
const BUNDLED = ["dom", "aria", "testing-library", "react", "user-event", "jest-dom"];
function newestMtime(dir: string, filter: RegExp): number {
  let max = 0;
  if (!existsSync(dir)) return max;
  for (const e of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (e.isFile() && filter.test(e.name)) max = Math.max(max, statSync(join(e.parentPath, e.name)).mtimeMs);
  }
  return max;
}
const distStale = (): string[] =>
  BUNDLED.filter((pkg) => {
    const dist = join(repo, "packages", pkg, "dist", "index.js");
    return !existsSync(dist) || statSync(dist).mtimeMs < newestMtime(join(repo, "packages", pkg, "src"), /\.(ts|tsx|js|json)$/);
  });
if (modes.includes("rtd-full")) {
  const stale = distStale();
  if (stale.length && values.build) {
    console.log(`\n=== pnpm build (packages/*/dist stale for ${stale.join(", ")}) ===`);
    await checked("pnpm", ["run", "build"], repo);
  } else if (stale.length) console.warn(`warning: --no-build with stale dist for ${stale.join(", ")}`);
}

// ---------------------------------------------------------------------------------------------
// 3. Generate the per-mode wrapper Jest config (no upstream file is edited)

const output = join(here, "output");
const results = join(here, "results");
// Generated configs live in an untracked directory inside the tested package (so the probe resolves
// Testing Library and React from the package's node_modules, like a test file); removed after the run.
const harness = join(pkgDir, ".rtd-harness");
rmSync(harness, { recursive: true, force: true });
mkdirSync(harness, { recursive: true });

const SHIM_MAP: Record<(typeof SHIM_PACKAGES)[number], Record<string, Target>> = {
  react: {
    "@testing-library/react/pure": DIST("react", "pure.js"),
    "@testing-library/react/dont-cleanup-after-each": DIST("react", "dont-cleanup-after-each.js"),
    "@testing-library/react": DIST("react", "index.js"),
  },
  dom: { "@testing-library/dom": DIST("testing-library", "index.js") },
  "user-event": { "@testing-library/user-event": DIST("user-event", "index.js") },
  "jest-dom": {
    "@testing-library/jest-dom/matchers": DIST("jest-dom", "matchers.js"),
    "@testing-library/jest-dom/jest-globals": DIST("jest-dom", "jest-globals.js"),
    "@testing-library/jest-dom": DIST("jest-dom", "index.js"),
  },
};
// What our bundles import by bare specifier. @rtd/dom(/internal) go to the published package's
// bridges (release/ctrl-dom/dist/bridge, built by `pnpm build`): the environment's single
// instance when the file runs under jest-environment-rtd (what jest-environment-rtd's workspace
// shims return), else a fresh load of the DOM. React Router's `@jest-environment node` files
// (server runtime, SSR) still load jest-dom from setupFilesAfterEnv; the workspace shims throw
// without the environment, where stock jest-dom (and published @ctrl/dom) load fine.
const BRIDGE = (entry: string): Target => {
  const esm = join(repo, "release/ctrl-dom/dist/bridge", `${entry}.js`);
  const cjs = esm.replace(/\.js$/, ".cjs");
  for (const f of [esm, cjs]) if (!existsSync(f)) throw new Error(`Missing ${relative(repo, f)}: run pnpm build`);
  return { import: esm, require: cjs };
};
const RTD_DOM_TARGETS: Record<string, Target> = { "@rtd/dom": BRIDGE("index"), "@rtd/dom/internal": BRIDGE("internal") };
const RTD_INTERNAL_TARGETS: Record<string, Target> = {
  "@rtd/aria": DIST("aria", "index.js"),
  "@rtd/aria/internal": DIST("aria", "internal.js"),
  "@rtd/testing-library": DIST("testing-library", "index.js"),
  "@rtd/react": DIST("react", "index.js"),
  "@rtd/react/pure": DIST("react", "pure.js"),
  "@rtd/user-event": DIST("user-event", "index.js"),
};
/** Exact specifier -> bundles, for resolver.cjs (passed as $RTD_RR_RESOLVE). */
function resolveTargets(mode: Mode): Record<string, Target> {
  if (mode === "jsdom") return {};
  if (mode === "rtd-dom") return { ...RTD_DOM_TARGETS };
  return { ...Object.assign({}, ...[...shimSet].map((s) => SHIM_MAP[s as keyof typeof SHIM_MAP])), ...RTD_DOM_TARGETS, ...RTD_INTERNAL_TARGETS };
}
// React goes to upstream's copy (one React); pnpm keeps react/react-dom in the package's
// node_modules, not the root's.
const REACT = realpathSync(join(pkgDir, "node_modules/react"));
const REACT_DOM = realpathSync(join(pkgDir, "node_modules/react-dom"));
const REACT_MAP: Record<string, string> = {
  "^react$": REACT,
  "^react/(.*)$": join(REACT, "$1"),
  "^react-dom$": REACT_DOM,
  "^react-dom/(.*)$": join(REACT_DOM, "$1"),
};

// The probe is copied next to the configs so its bare imports resolve like an upstream test's.
copyFileSync(join(here, "probe.cjs"), join(harness, "probe.cjs"));

const EXCLUDE_PATTERNS = manifest.exclude.map((f) => `/${f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);

function writeHarness(mode: Mode): string {
  const config = join(harness, `${mode}.config.mjs`);
  const rtd = mode !== "jsdom";
  const full = mode === "rtd-full";
  const mapper = full ? REACT_MAP : {};
  writeFileSync(
    config,
    `// Generated by downstream/react-router/run.ts for mode ${mode}. Wraps upstream's jest config unmodified.
import upstream from '../jest.config.js';
if (upstream.testEnvironment !== 'jest-environment-jsdom') throw new Error('Upstream testEnvironment changed (' + upstream.testEnvironment + '); update downstream/react-router/run.ts');
if (upstream.resolver) throw new Error('Upstream now has a custom resolver; update downstream/react-router/run.ts');
export default {
  ...upstream,
  rootDir: ${JSON.stringify(pkgDir)},
  reporters: ['default'],
  cacheDirectory: ${JSON.stringify(join(checkout, "node_modules/.cache/jest-rtd", mode))},
  ${rtd ? `testEnvironment: ${JSON.stringify(join(here, "jest-environment.mjs"))},` : ""}
  ${rtd ? `resolver: ${JSON.stringify(join(here, "resolver.cjs"))},` : ""}
  setupFilesAfterEnv: [${JSON.stringify(join(harness, "probe.cjs"))}, ...(upstream.setupFilesAfterEnv ?? [])],
  moduleNameMapper: { ...upstream.moduleNameMapper, ...${JSON.stringify(mapper, null, 2)} },
  // manifest.json \`exclude\` (every mode): files that need the package's build output.
  testPathIgnorePatterns: [...(upstream.testPathIgnorePatterns ?? ['/node_modules/']), ...${JSON.stringify(EXCLUDE_PATTERNS)}],
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
  receiptErrors?: string[];
  reactIds?: string[];
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
      else if (/\.(ts|tsx|js|mjs|cjs|json)$/.test(entry.name)) hash.update(path).update(readFileSync(path));
    }
  };
  for (const pkg of ["dom", "aria", "testing-library", "react", "user-event", "jest-dom", "jest-environment"]) {
    for (const sub of ["src", "dist"]) if (existsSync(join(repo, "packages", pkg, sub))) walk(join(repo, "packages", pkg, sub));
  }
  for (const file of ["run.ts", "jest-environment.mjs", "probe.cjs", "json-reporter.cjs", "resolver.cjs"]) hash.update(readFileSync(join(here, file)));
  return hash.digest("hex").slice(0, 16);
}

/** `useNavigate`, `dom/data-browser-router`, `router/fetchers`, … */
function componentOf(file: string): string {
  const m = /__tests__\/(.+?)-test\.[jt]sx?$/.exec(file);
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
      const status = t.status === "pending" || t.status === "todo" || t.status === "skipped" || t.status === "disabled" ? "skipped" : t.status;
      out.set(key, { key, file: rel, component: componentOf(rel), name: t.fullName, status, messages: t.failureMessages ?? [] });
    }
  }
  return out;
}

const readJsonl = (path: string): any[] =>
  existsSync(path) ? readFileSync(path, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];

const runs: ModeRun[] = [];
mkdirSync(output, { recursive: true });

// --rounds N interleaves the modes so load from other processes hits every mode alike; wall/RSS
// are medians, counts/failures come from the last round (tests that flip between rounds are listed).
try {
  for (let round = 1; round <= rounds; round++)
    for (const mode of modes) {
      const modeOut = join(output, mode);
      // Stale reports must never masquerade as passes.
      rmSync(modeOut, { recursive: true, force: true });
      mkdirSync(modeOut, { recursive: true });
      const config = writeHarness(mode);
      const jsonPath = join(modeOut, "report.json");
      const logPath = join(modeOut, "jest.log");
      const jestArgs = [
        // Upstream's `pnpm test`: Jest's native ESM support.
        "--experimental-vm-modules",
        "--no-warnings=ExperimentalWarning",
        jestBin,
        "--config",
        config,
        "--ci",
        // Cycle-safe replacement for `--json --outputFile` (see json-reporter.cjs).
        "--reporters",
        "default",
        "--reporters",
        join(here, "json-reporter.cjs"),
        "--maxWorkers",
        String(workers),
        ...(values.grep ? ["--testNamePattern", values.grep] : []),
        ...filters,
      ];
      console.log(`\n=== React Router ${preset}: ${mode}, round ${round}/${rounds} (unmodified upstream tests, ${workers} workers) ===`);
      const before = mode === "jsdom" ? null : sourceFingerprint();
      const start = performance.now();
      // /usr/bin/time -l (macOS) reports the peak RSS of jest and the workers it reaps.
      const timed = existsSync("/usr/bin/time") && process.platform === "darwin";
      // process.execPath, not `node` from PATH: every mode runs on this Node (26+, needed by
      // jest-environment-rtd).
      const env = {
        FORCE_COLOR: "0",
        TZ: "UTC",
        RTD_RR_JSON: jsonPath,
        RTD_RR_MODE: mode,
        RTD_RR_REPO: repo,
        RTD_RR_SHIMS: mode === "rtd-full" ? [...shimSet].join(",") : "",
        RTD_RR_RECEIPTS: join(modeOut, "environments.jsonl"),
        RTD_RR_RESOLVE: JSON.stringify(resolveTargets(mode)),
      };
      const result = await run(
        timed ? "/usr/bin/time" : process.execPath,
        timed ? ["-l", process.execPath, ...jestArgs] : jestArgs,
        checkout,
        logPath,
        env,
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
          .map((f: any) => ({ file: relative(checkout, f.name), message: String(f.message ?? "").replace(/\u001b\[[0-9;]*m/g, "").trim().split("\n").slice(0, 8).join("\n") }));
      }
      const receipts = readJsonl(join(modeOut, "environments.jsonl"));
      r.receipts = receipts.length;
      r.receiptErrors = [...new Set(receipts.filter((x) => x.error).map((x) => x.error as string))];
      r.reactIds = [...new Set(receipts.filter((x) => x.react !== undefined).map((x) => x.react as string))];
      const previous = runs.find((x) => x.mode === mode);
      r.wallSamples = [...(previous?.wallSamples ?? []), wallMs];
      r.rssSamples = [...(previous?.rssSamples ?? []), ...(r.peakRssBytes ? [r.peakRssBytes] : [])];
      r.unstable = [...(previous?.unstable ?? [])];
      if (previous?.assertions && r.assertions) {
        for (const [key, a] of r.assertions) {
          const was = previous.assertions.get(key)?.status;
          if (was !== undefined && was !== a.status && !r.unstable.includes(key)) r.unstable.push(key);
        }
      }
      if (previous) runs.splice(runs.indexOf(previous), 1, r);
      else runs.push(r);
      writeFileSync(
        join(modeOut, "summary.json"),
        JSON.stringify({ ...r, assertions: undefined, round, rounds, commit, preset, filters, versions, node: process.version }, null, 2) + "\n",
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
  // Jest's matcher failures start with `expect(x).toY()`; the next lines carry the substance.
  if (/^expect\(/.test(line) && lines[1]) line = `${line} ${lines.slice(1, 3).join(" ")}`;
  if (line.length > 180) line = line.slice(0, 180);
  return line
    .replace(/\b\d+(\.\d+)?(px|ms)?\b/g, "N")
    .replace(/"[^"]{40,}"/g, '"…"')
    .replace(/'[^']{40,}'/g, "'…'");
}

const date = new Date().toLocaleDateString("sv-SE");
const reportPath = join(results, `${date}-${preset}.md`);
if (values.report) {
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
  md.push(`# React Router downstream: \`${preset}\` (${date})`, "");
  md.push(
    `- upstream: ${manifest.repository.replace(/\.git$/, "")} @ \`${commit}\` (${commitInfo[0]}) — ${commitInfo[1]}`,
    `- pinned: \`${manifest.commit}\`${commit === manifest.commit ? "" : " (**--latest: differs from pin**)"}`,
    `- Jest project: \`${manifest.package}\` (native ESM, --experimental-vm-modules); filters: ${filters.length ? filters.map((f) => `\`${f}\``).join(", ") : "(all files)"}`,
    `- node ${process.version}, Jest workers ${workers}, upstream versions: ${Object.entries(versions)
      .map(([k, v]) => `${k}@${v}`)
      .join(", ")}`,
    `- rtd environment: jest-environment-rtd (default options); rtd-full substitutes: ${[...shimSet].map((x) => `@testing-library/${x}`).join(", ")} (built bundles, packages/*/dist)`,
    `- measurement: ${rounds} round(s), modes interleaved; wall/peak RSS are ${rounds > 1 ? "medians (wall range in parentheses)" : "single samples"}`,
    "",
  );
  md.push("## Per-mode results", "");
  md.push("| mode | passed | failed | skipped | total | files | suite errors | exit | wall | peak RSS | env receipts | notes |");
  md.push("| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --- |");
  for (const r of runs) {
    const notes: string[] = [];
    if (!r.reportFound) notes.push("**no JSON report**");
    if (r.reactIds?.length) notes.push(r.reactIds.length === 1 ? "1 React" : `**${r.reactIds.length} React paths**`);
    if (r.receiptErrors?.length) notes.push(`**probe errors: ${r.receiptErrors.join("; ")}**`);
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
      for (const e of r.suiteErrors) md.push(`- \`${e.file}\`: ${signature(e.message.replace(/^●.*$/m, ""))}`);
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
      md.push("### Failures by test file", "", "| file | failed |", "| --- | --: |");
      for (const [c, n] of [...byComponent].sort((a, b) => b[1] - a[1])) md.push(`| ${c} | ${n} |`);
      md.push("", "### Failures by error signature", "", "| count | signature | files | example |", "| --: | --- | --- | --- |");
      for (const [sig, e] of [...bySignature].sort((a, b) => b[1].count - a[1].count)) {
        md.push(
          `| ${e.count} | ${sig.replace(/\|/g, "\\|").replace(/`/g, "'")} | ${[...e.components].slice(0, 8).join(", ")}${e.components.size > 8 ? ", …" : ""} | \`${e.example.replace(/\|/g, "\\|")}\` |`,
        );
      }
      md.push("");
    } else md.push("No failing tests.", "");
  }
  md.push("Raw Jest JSON, logs and probe receipts: `downstream/react-router/output/<mode>/` (gitignored).", "");
  writeFileSync(reportPath, md.join("\n"));
  console.log(`\nReport: ${relative(repo, reportPath)}`);
}

// Exit non-zero when a run produced no report, a test file ran without a passing identity probe,
// the jsdom baseline fails, or the discovered test set differs from jsdom (assertion failures
// alone are expected for rtd modes).
const baselineRun = runs.find((r) => r.mode === "jsdom");
process.exitCode = runs.some(
  (r) =>
    !r.reportFound ||
    (r.receiptErrors?.length ?? 0) > 0 ||
    (r.reactIds?.length ?? 0) > 1 ||
    ((r.files ?? 0) > (r.suiteErrors?.length ?? 0) && r.receipts === 0) ||
    (r.mode === "jsdom" && r.code !== 0) ||
    (baselineRun?.assertions && r.assertions && r.assertions.size !== baselineRun.assertions.size),
)
  ? 1
  : 0;
