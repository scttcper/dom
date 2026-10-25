#!/usr/bin/env node
// React Aria downstream suite: run the unmodified upstream adobe/react-spectrum Jest suite for
// `react-aria` and `react-aria-components` on
//   jsdom     upstream baseline (jest-environment-jsdom, upstream's config unchanged)
//   ctrl-dom   testEnvironment swapped to @ctrl/dom-jest-environment (stock Testing Library from upstream's lockfile)
//   ctrl-dom-full  @ctrl/dom-jest-environment + our built bundles for @testing-library/{react,dom,user-event,jest-dom}
//
//   node downstream/react-aria/run.ts [--install] [--latest] [--preset smoke|interactions|all]
//        [--files a,b] [--modes jsdom,ctrl-dom,ctrl-dom-full] [--workers N] [--no-report]
//
// Template: downstream/base-ui/run.ts (Vitest); upstream know-how from the author's earlier Jest
// runner (~/gh/vibedom/downstream/react-aria). Pinned commit (manifest.json), unmodified upstream
// tests (refuses tracked local changes), upstream's frozen yarn.lock + exact Yarn, fresh reports,
// every ctrl-dom mode compared with the jsdom baseline. See README.md.

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, stripVTControlCharacters } from "node:util";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");
const manifest = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8")) as {
  repository: string;
  branch: string;
  commit: string;
  workspaces: string[];
  presets: Record<string, string[]>;
};

const MODES = ["jsdom", "ctrl-dom", "ctrl-dom-full"] as const;
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
    triage: { type: "string" },
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
    "node downstream/react-aria/run.ts [--install] [--latest] [--preset smoke|interactions|all | --files a,b] " +
      "[--modes jsdom,ctrl-dom,ctrl-dom-full] [--workers N] [--checkout PATH] [--no-build] [--no-report] [--triage all|fake-raf,keep-globals,no-pointer-event,isolate] [--shims react,dom,user-event,jest-dom] [--grep TEST_NAME_PATTERN]",
  );
  process.exit(0);
}

const checkout = resolve(values.checkout!);
const preset = values.files === undefined ? values.preset! : "custom";
const presets: Record<string, string[]> = { ...manifest.presets };
if (values.files !== undefined)
  presets.custom = values.files
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);
const filters = presets[preset];
if (filters === undefined)
  throw new Error(`Unknown preset ${preset}; use ${Object.keys(manifest.presets).join(", ")} or --files.`);
const modes = values.modes!.split(",").map((m) => m.trim()) as Mode[];
for (const mode of modes) if (!MODES.includes(mode)) throw new Error(`Unknown mode ${mode}; use ${MODES.join(", ")}`);
const workers = Number(values.workers);
if (!Number.isSafeInteger(workers) || workers < 1) throw new Error("--workers must be a positive integer");
// --triage [all|fake-raf,keep-globals,no-pointer-event,isolate]: apply jest-environment.mjs's triage shims (see there).
// `isolate` is runner-level: workerIdleMemoryLimit: 1 makes Jest recycle the worker after every
// test file, so no file sees interface prototypes another file patched (one @ctrl/dom per worker).
const TRIAGE_SHIMS = ["fake-raf", "keep-globals", "no-pointer-event", "isolate"];
const triageShims =
  values.triage === undefined
    ? null
    : values.triage === "" || values.triage === "all"
      ? TRIAGE_SHIMS
      : values.triage.split(",");
for (const t of triageShims ?? []) if (!TRIAGE_SHIMS.includes(t)) throw new Error(`Unknown triage shim ${t}`);
const shimSet = new Set(
  values
    .shims!.split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);
for (const s of shimSet) if (!(SHIM_PACKAGES as readonly string[]).includes(s)) throw new Error(`Unknown shim ${s}`);

// ---------------------------------------------------------------------------------------------
// Process helpers

interface CommandResult {
  code: number | null;
  signal: NodeJS.Signals | null;
}

function run(
  executable: string,
  argv: string[],
  cwd: string,
  log?: string,
  env: Record<string, string | undefined> = {},
): Promise<CommandResult> {
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

async function checked(
  executable: string,
  argv: string[],
  cwd: string,
  env: Record<string, string | undefined> = {},
): Promise<void> {
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
if (!values.latest && commit !== manifest.commit)
  throw new Error(`Checkout is ${commit}; expected pinned ${manifest.commit}.`);
for (const file of filters) {
  if (!existsSync(resolve(checkout, file))) throw new Error(`Test path not found in upstream checkout: ${file}`);
}

// ---------------------------------------------------------------------------------------------
// 2. Install upstream's own frozen dependencies with upstream's exact Yarn

const upstreamPackage = JSON.parse(readFileSync(join(checkout, "package.json"), "utf8"));
const yarnVersion = /^yarn@(\d+\.\d+\.\d+)/.exec(upstreamPackage.packageManager ?? "")?.[1];
if (values.install) {
  if (!yarnVersion) throw new Error(`Upstream packageManager is not an exact Yarn: ${upstreamPackage.packageManager}`);
  const yarn = join(checkout, ".yarn/releases", `yarn-${yarnVersion}.cjs`);
  // Third-party lifecycle scripts off, lockfile immutable; `workspaces focus` installs only what
  // the React Aria tests (and the Spectrum Provider some of them render) need.
  const env = { YARN_ENABLE_SCRIPTS: "false", YARN_ENABLE_IMMUTABLE_INSTALLS: "true" };
  await checked(process.execPath, [yarn, "workspaces", "focus", ...manifest.workspaces], checkout, env);
  // Upstream's own root postinstall: patch-package (incl. its user-event patch, applied by Yarn's
  // patch: protocol either way) and the generated @spectrum-icons sources some tests import.
  await checked(process.execPath, [yarn, "postinstall"], checkout, env);
}
const jestBin = join(checkout, "node_modules/jest/bin/jest.js");
if (!existsSync(jestBin)) throw new Error("Upstream dependencies are missing. Rerun with --install.");

function installedVersion(name: string): string | null {
  const pkg = join(checkout, "node_modules", name, "package.json");
  return existsSync(pkg) ? JSON.parse(readFileSync(pkg, "utf8")).version : null;
}
const versions = Object.fromEntries(
  [
    "jest",
    "jest-environment-jsdom",
    "jsdom",
    "@swc/jest",
    "react",
    "react-dom",
    "@testing-library/react",
    "@testing-library/dom",
    "@testing-library/user-event",
    "@testing-library/jest-dom",
  ].map((name) => [name, installedVersion(name)]),
);

// ctrl-dom-full uses our built bundles (packages/*/dist), so Jest needs no TS transform of our sources.
// Jest's module registry is CommonJS: prefer the `.cjs` bundle (what a published package's
// `require` condition resolves), else the ESM bundle, which jest-transform.cjs compiles to CJS.
const DIST = (pkg: string, file: string): string => {
  const esm = join(repo, "packages", pkg, "dist", file);
  const cjs = esm.replace(/\.js$/, ".cjs");
  return existsSync(cjs) ? cjs : esm;
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
    return (
      !existsSync(dist) ||
      statSync(dist).mtimeMs < newestMtime(join(repo, "packages", pkg, "src"), /\.(ts|tsx|js|json)$/)
    );
  });
if (modes.includes("ctrl-dom-full")) {
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
// Generated configs live in an untracked directory inside the checkout (next to upstream's
// jest.config.js, which they require); removed after the run.
const harness = join(checkout, ".ctrl-dom-harness");
rmSync(harness, { recursive: true, force: true });
mkdirSync(harness, { recursive: true });

const JEST_ENV = join(repo, "packages/jest-environment");
const SHIM_MAP: Record<(typeof SHIM_PACKAGES)[number], Record<string, string>> = {
  react: {
    "^@testing-library/react/pure(\\.js)?$": DIST("react", "pure.js"),
    "^@testing-library/react/dont-cleanup-after-each(\\.js)?$": DIST("react", "dont-cleanup-after-each.js"),
    "^@testing-library/react$": DIST("react", "index.js"),
  },
  dom: { "^@testing-library/dom$": DIST("testing-library", "index.js") },
  "user-event": { "^@testing-library/user-event$": DIST("user-event", "index.js") },
  "jest-dom": {
    "^@testing-library/jest-dom/matchers(\\.js)?$": DIST("jest-dom", "matchers.js"),
    "^@testing-library/jest-dom/jest-globals(\\.js)?$": DIST("jest-dom", "jest-globals.js"),
    "^@testing-library/jest-dom$": DIST("jest-dom", "index.js"),
  },
};
// What our bundles import by bare specifier. @ctrl/dom(/internal) go to @ctrl/dom-jest-environment's
// shims (the environment's single instance); React goes to upstream's copy (one React).
const CTRL_DOM_INTERNAL_MAP: Record<string, string> = {
  "^@ctrl/dom$": join(JEST_ENV, "src/shims/dom.cjs"),
  "^@ctrl/dom/internal$": join(JEST_ENV, "src/shims/dom-internal.cjs"),
  "^@ctrl/dom/aria$": DIST("aria", "index.js"),
  "^@ctrl/dom/aria/internal$": DIST("aria", "internal.js"),
  "^@ctrl/dom/testing-library$": DIST("testing-library", "index.js"),
  "^@ctrl/dom/react$": DIST("react", "index.js"),
  "^@ctrl/dom/react/pure$": DIST("react", "pure.js"),
  "^@ctrl/dom/user-event$": DIST("user-event", "index.js"),
};
const REACT_MAP: Record<string, string> = {
  "^react$": join(checkout, "node_modules/react"),
  "^react/(.*)$": join(checkout, "node_modules/react/$1"),
  "^react-dom$": join(checkout, "node_modules/react-dom"),
  "^react-dom/(.*)$": join(checkout, "node_modules/react-dom/$1"),
};

// The probe is copied next to the configs so its bare imports resolve like an upstream test's.
copyFileSync(join(here, "probe.cjs"), join(harness, "probe.cjs"));

function writeHarness(mode: Mode, modeOut: string): string {
  const config = join(harness, `${mode}.config.cjs`);
  const ctrlDom = mode !== "jsdom";
  const full = mode === "ctrl-dom-full";
  const mapper = {
    ...(ctrlDom
      ? {
          "^@ctrl/dom$": CTRL_DOM_INTERNAL_MAP["^@ctrl/dom$"],
          "^@ctrl/dom/internal$": CTRL_DOM_INTERNAL_MAP["^@ctrl/dom/internal$"],
        }
      : {}),
    ...(full
      ? {
          ...Object.assign({}, ...[...shimSet].map((s) => SHIM_MAP[s as keyof typeof SHIM_MAP])),
          ...CTRL_DOM_INTERNAL_MAP,
          ...REACT_MAP,
        }
      : {}),
  };
  writeFileSync(
    config,
    `// Generated by downstream/react-aria/run.ts for mode ${mode}. Wraps upstream's jest.config.js unmodified.
'use strict';
const upstream = require('../jest.config.js');
// \`projects: ['<rootDir>']\` would make Jest reload upstream's own (jsdom) config and ignore this
// wrapper; junit output would be written into the checkout. Everything else is upstream's.
const { projects, reporters, ...base } = upstream;
const swc = base.transform['^.+\\\\.(t|j)sx?$'];
if (!Array.isArray(swc) || swc[0] !== '@swc/jest') throw new Error('Upstream transform changed; update downstream/react-aria/run.ts');
module.exports = {
  ...base,
  rootDir: ${JSON.stringify(checkout)},
  reporters: ['default'],${ctrlDom && triageShims?.includes("isolate") ? "\n  // --triage isolate: recycle the worker after every test file\n  workerIdleMemoryLimit: 1," : ""}
  cacheDirectory: ${JSON.stringify(join(checkout, "node_modules/.cache/jest-ctrl-dom", mode))},
  ${ctrlDom ? `testEnvironment: ${JSON.stringify(join(here, "jest-environment.mjs"))},` : ""}
  setupFilesAfterEnv: [${JSON.stringify(join(harness, "probe.cjs"))}, ...base.setupFilesAfterEnv],
  moduleNameMapper: { ...base.moduleNameMapper, ...${JSON.stringify(mapper, null, 4)} },
  ${full ? `transform: { '^.+\\\\.(t|j)sx?$': [${JSON.stringify(join(here, "jest-transform.cjs"))}, { swc: swc[1], checkout: ${JSON.stringify(checkout)}, repo: ${JSON.stringify(repo)} }] },` : ""}
};
`,
  );
  void modeOut;
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
  receiptFiles?: Set<string>;
  receiptErrors?: string[];
  reactIds?: string[];
  tlaRewrites?: string[];
  sourceStable?: boolean;
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
    for (const sub of ["src", "dist"])
      if (existsSync(join(repo, "packages", pkg, sub))) walk(join(repo, "packages", pkg, sub));
  }
  for (const file of ["run.ts", "jest-environment.mjs", "probe.cjs", "jest-transform.cjs", "json-reporter.cjs"])
    hash.update(readFileSync(join(here, file)));
  return hash.digest("hex").slice(0, 16);
}

function componentOf(file: string): string {
  let m = /packages\/react-aria-components\/test\/([^/.]+)/.exec(file);
  if (m) return `RAC/${m[1]}`;
  m = /packages\/react-aria\/test\/([^/]+)\//.exec(file);
  if (m) return `react-aria/${m[1]}`;
  return "(other)";
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
      const status =
        t.status === "pending" || t.status === "todo" || t.status === "skipped" || t.status === "disabled"
          ? "skipped"
          : t.status;
      out.set(key, {
        key,
        file: rel,
        component: componentOf(rel),
        name: t.fullName,
        status,
        messages: t.failureMessages ?? [],
      });
    }
  }
  return out;
}

const readJsonl = (path: string): any[] =>
  existsSync(path)
    ? readFileSync(path, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : [];

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
    const logPath = join(modeOut, "jest.log");
    const jestArgs = [
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
    console.log(`\n=== React Aria ${preset}: ${mode} (unmodified upstream tests, ${workers} workers) ===`);
    const before = mode === "jsdom" ? null : sourceFingerprint();
    const start = performance.now();
    // /usr/bin/time -l (macOS) reports the peak RSS of jest and the workers it reaps.
    const timed = existsSync("/usr/bin/time") && process.platform === "darwin";
    // process.execPath, not `node` from PATH: upstream's .nvmrc would select another Node via
    // version managers. Every mode runs on this Node (26+, needed by @ctrl/dom-jest-environment).
    const env = {
      // upstream's `yarn test` script
      STRICT_MODE: "1",
      VIRT_ON: "1",
      FORCE_COLOR: "0",
      // Inherited CI sharding variables must never silently shrink the selection.
      CI_NODE_TOTAL: undefined,
      CI_NODE_INDEX: undefined,
      CTRL_DOM_RA_JSON: jsonPath,
      CTRL_DOM_RA_TRIAGE: mode === "jsdom" ? "" : (triageShims ?? []).join(","),
      CTRL_DOM_RA_MODE: mode,
      CTRL_DOM_RA_REPO: repo,
      CTRL_DOM_RA_SHIMS: mode === "ctrl-dom-full" ? [...shimSet].join(",") : "",
      CTRL_DOM_RA_RECEIPTS: join(modeOut, "environments.jsonl"),
      CTRL_DOM_RA_TRANSFORMS: join(modeOut, "transforms.jsonl"),
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
        .map((f: any) => ({
          file: relative(checkout, f.name),
          message: stripVTControlCharacters(String(f.message ?? ""))
            .trim()
            .split("\n")
            .slice(0, 8)
            .join("\n"),
        }));
    }
    const receipts = readJsonl(join(modeOut, "environments.jsonl"));
    r.receipts = receipts.length;
    r.receiptFiles = new Set(receipts.filter((x) => !x.error).map((x) => relative(checkout, x.testPath)));
    r.receiptErrors = [...new Set(receipts.filter((x) => x.error).map((x) => x.error as string))];
    r.reactIds = [...new Set(receipts.map((x) => x.react as string))];
    r.tlaRewrites = [...new Set(readJsonl(join(modeOut, "transforms.jsonl")).map((x) => `${x.file} (${x.rewrites})`))];
    runs.push(r);
    writeFileSync(
      join(modeOut, "summary.json"),
      JSON.stringify(
        {
          ...r,
          assertions: undefined,
          receiptFiles: r.receiptFiles.size,
          commit,
          preset,
          filters,
          versions,
          node: process.version,
        },
        null,
        2,
      ) + "\n",
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
  const lines = stripVTControlCharacters(message)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  let line = lines[0] ?? "(no message)";
  // Jest's matcher failures start with `expect(x).toY()`; the next lines carry the substance.
  if (line.startsWith("expect(") && lines[1]) line = `${line} ${lines.slice(1, 3).join(" ")}`;
  if (line.length > 180) line = line.slice(0, 180);
  return line
    .replace(/\b\d+(\.\d+)?(px|ms)?\b/g, "N")
    .replace(/"[^"]{40,}"/g, '"…"')
    .replace(/'[^']{40,}'/g, "'…'");
}

const date = new Date().toLocaleDateString("sv-SE");
const reportPath = join(results, `${date}-${preset}${triageShims ? "-triage" : ""}.md`);
if (values.report) {
  mkdirSync(results, { recursive: true });
  rmSync(reportPath, { force: true });
  const baseline = runs.find((r) => r.mode === "jsdom")?.assertions;
  const mib = (b: number | null): string => (b ? `${(b / 2 ** 20).toFixed(0)} MiB` : "n/a");
  const md: string[] = [];
  md.push(`# React Aria downstream: \`${preset}\` (${date})`, "");
  if (triageShims) {
    md.push(
      `> **TRIAGE MODE (\`--triage ${triageShims.join(",")}\`)**: ctrl-dom modes ran with jest-environment.mjs's triage shims (workarounds for jest-environment blockers already filed in TRIAGE.md). These are not compatibility results.`,
      "",
    );
  }
  md.push(
    `- upstream: ${manifest.repository.replace(/\.git$/, "")} @ \`${commit}\` (${commitInfo[0]}) — ${commitInfo[1]}`,
    `- pinned: \`${manifest.commit}\`${commit === manifest.commit ? "" : " (**--latest: differs from pin**)"}`,
    `- filters: ${filters.map((f) => `\`${f}\``).join(", ")}`,
    `- node ${process.version}, Jest workers ${workers}, STRICT_MODE=1 VIRT_ON=1, upstream versions: ${Object.entries(
      versions,
    )
      .map(([k, v]) => `${k}@${v}`)
      .join(", ")}`,
    `- ctrl-dom-full substitutes: ${[...shimSet].map((x) => `@testing-library/${x}`).join(", ")} (built bundles, packages/*/dist)`,
    "",
  );
  md.push("## Per-mode results", "");
  md.push(
    "| mode | passed | failed | skipped | total | files | suite errors | exit | wall | peak RSS | env receipts | notes |",
  );
  md.push("| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --- |");
  for (const r of runs) {
    const notes: string[] = [];
    if (!r.reportFound) notes.push("**no JSON report**");
    if (r.reactIds?.length) notes.push(r.reactIds.length === 1 ? "1 React" : `**${r.reactIds.length} React paths**`);
    if (r.receiptErrors?.length) notes.push(`**probe errors: ${r.receiptErrors.join("; ")}**`);
    if (r.tlaRewrites?.length) notes.push(`TLA rewrites: ${r.tlaRewrites.join(", ")}`);
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
      for (const e of r.suiteErrors) md.push(`- \`${e.file}\`: ${signature(e.message.replace(/^●.*$/m, ""))}`);
      md.push("");
    }
    if (baseline && r.mode !== "jsdom") {
      const regress = [...r.assertions.values()].filter(
        (a) => a.status === "failed" && baseline.get(a.key)?.status === "passed",
      );
      const missing = [...baseline.keys()].filter((k) => !r.assertions!.has(k));
      const added = [...r.assertions.keys()].filter((k) => !baseline.has(k));
      const newSkips = [...r.assertions.values()].filter(
        (a) => a.status === "skipped" && baseline.get(a.key)?.status === "passed",
      );
      const fixed = [...r.assertions.values()].filter(
        (a) => a.status === "passed" && baseline.get(a.key)?.status === "failed",
      );
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
      md.push(
        "",
        "### Failures by error signature",
        "",
        "| count | signature | components | example |",
        "| --: | --- | --- | --- |",
      );
      for (const [sig, e] of [...bySignature].sort((a, b) => b[1].count - a[1].count)) {
        md.push(
          `| ${e.count} | ${sig.replace(/\|/g, "\\|").replace(/`/g, "'")} | ${[...e.components].slice(0, 8).join(", ")}${e.components.size > 8 ? ", …" : ""} | \`${e.example.replace(/\|/g, "\\|")}\` |`,
        );
      }
      md.push("");
    } else md.push("No failing tests.", "");
  }
  md.push("Raw Jest JSON, logs and probe receipts: `downstream/react-aria/output/<mode>/` (gitignored).", "");
  writeFileSync(reportPath, md.join("\n"));
  console.log(`\nReport: ${relative(repo, reportPath)}`);
}

// Exit non-zero when a run produced no report, a test file ran without a passing identity probe,
// the jsdom baseline fails, or the discovered test set differs from jsdom (assertion failures
// alone are expected for ctrl-dom modes).
const baselineRun = runs.find((r) => r.mode === "jsdom");
process.exitCode = runs.some(
  (r) =>
    !r.reportFound ||
    (r.receiptErrors?.length ?? 0) > 0 ||
    ((r.files ?? 0) > (r.suiteErrors?.length ?? 0) && r.receipts === 0) ||
    (r.mode === "jsdom" && r.code !== 0) ||
    (baselineRun?.assertions && r.assertions && r.assertions.size !== baselineRun.assertions.size),
)
  ? 1
  : 0;
