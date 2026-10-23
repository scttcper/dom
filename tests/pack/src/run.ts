// `pnpm test:pack`: end-to-end check of what users would install.
//
// 1. `pnpm build`, then `pnpm pack` every published package into a temp directory (publishConfig
//    rewrites exports to dist/, workspace: ranges to versions).
// 2. A fresh project OUTSIDE the repository (os.tmpdir()) installs the tarballs (pnpm overrides
//    pin every @rtd/* dependency to its tarball) plus react, react-dom, vitest, jest, typescript
//    and the stock @testing-library/* packages from the registry, at the versions the repo uses.
// 3. Runs, from tests/pack/fixture:
//    (a)  Vitest, environment "rtd", stock @testing-library/react + user-event + jest-dom/vitest
//    (b)  Vitest, the same test importing @rtd/react, @rtd/user-event, @rtd/jest-dom/vitest
//    (c)  Vitest, the stock test file with resolve.alias @testing-library/* → @rtd/* (README)
//    (d1) Jest, testEnvironment "jest-environment-rtd", stock Testing Library
//    (d2) Jest, preset "jest-environment-rtd", @rtd/react + @rtd/user-event + @rtd/jest-dom (CJS)
//    (e)  tsc --noEmit over a TS test file and type-level checks using our declarations
//    Every run records the files it loads (Node loader hook, Vite transform hook, Jest
//    transformer) and must load our packages only from dist/ (no .ts source, nothing from the
//    repository) with a single @rtd/dom package instance.
//
// Flags: --no-build, --keep (leave the temp directory), --dir <path> (reuse a project dir).

import { spawnSync, type SpawnSyncOptions } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const { values: flags } = parseArgs({
  options: {
    "no-build": { type: "boolean", default: false },
    keep: { type: "boolean", default: false },
    dir: { type: "string" },
  },
});

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const fixtureDir = fileURLToPath(new URL("../fixture/", import.meta.url));

/** Published package directories (packages/<dir>), in dependency order. */
const PUBLISHED = ["dom", "aria", "testing-library", "react", "user-event", "jest-dom", "vitest-environment", "jest-environment"];

const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));

function run(cmd: string, args: string[], options: SpawnSyncOptions & { quiet?: boolean } = {}) {
  const result = spawnSync(cmd, args, { encoding: "utf8", stdio: options.quiet ? "pipe" : "inherit", ...options });
  if (result.status !== 0) {
    if (options.quiet) process.stderr.write(`${result.stdout ?? ""}${result.stderr ?? ""}`);
    throw new Error(`${cmd} ${args.join(" ")} exited with ${result.status}`);
  }
  return result;
}

// ── 1. build + pack ───────────────────────────────────────────────────────────────────────────
if (!flags["no-build"]) run("node", [join(repoRoot, "scripts/build.ts")]);

const root = flags.dir ?? mkdtempSync(join(tmpdir(), "rtd-pack-"));
const tarballs = join(root, "tarballs");
const project = join(root, "project");
rmSync(tarballs, { recursive: true, force: true });
mkdirSync(tarballs, { recursive: true });

const packed = new Map<string, string>(); // package name → tarball path
for (const dir of PUBLISHED) {
  const pkgDir = join(repoRoot, "packages", dir);
  const { name } = readJson(join(pkgDir, "package.json"));
  const out = run("pnpm", ["pack", "--json", "--pack-destination", tarballs], { cwd: pkgDir, quiet: true });
  const info = JSON.parse(out.stdout as string) as { filename: string; files: { path: string }[] };
  const tgz = info.filename.startsWith("/") ? info.filename : join(tarballs, info.filename);
  // The tarball carries bundles, declarations and plain CJS shims only — never TypeScript sources.
  const sources = info.files.map((f) => f.path).filter((p) => /\.[cm]?tsx?$/.test(p) && !/\.d\.[cm]?ts$/.test(p));
  if (sources.length > 0) throw new Error(`${name}: tarball contains TypeScript sources: ${sources.join(", ")}`);
  packed.set(name, tgz);
}

console.log("\ntarballs:");
for (const [name, tgz] of packed) {
  const files = (run("tar", ["-tzf", tgz], { quiet: true }).stdout as string).trim().split("\n").length;
  console.log(`  ${name.padEnd(24)} ${(statSync(tgz).size / 1024).toFixed(1).padStart(7)} KB packed  ${String(files).padStart(4)} files`);
}

// ── 2. fresh project ──────────────────────────────────────────────────────────────────────────
// Registry versions = what the repo itself pins.
const rootPkg = readJson(join(repoRoot, "package.json"));
const reactPkg = readJson(join(repoRoot, "packages/react/package.json"));
const userEventPkg = readJson(join(repoRoot, "packages/user-event/package.json"));
const jestEnvPkg = readJson(join(repoRoot, "packages/jest-environment/package.json"));
const fileRef = (name: string) => `file:${packed.get(name)}`;

rmSync(project, { recursive: true, force: true });
cpSync(fixtureDir, project, { recursive: true });
writeFileSync(
  join(project, "package.json"),
  JSON.stringify(
    {
      name: "rtd-pack-smoke",
      private: true,
      type: "module",
      dependencies: Object.fromEntries([
        ...[...packed.keys()].map((name) => [name, fileRef(name)]),
        ["react", reactPkg.devDependencies.react],
        ["react-dom", reactPkg.devDependencies["react-dom"]],
        ["@types/react", reactPkg.devDependencies["@types/react"]],
        ["@types/react-dom", reactPkg.devDependencies["@types/react-dom"]],
        ["@types/node", rootPkg.devDependencies["@types/node"]],
        ["@testing-library/react", reactPkg.devDependencies["@testing-library/react"]],
        ["@testing-library/dom", reactPkg.devDependencies["@testing-library/dom"]],
        ["@testing-library/user-event", userEventPkg.devDependencies["@testing-library/user-event"]],
        ["@testing-library/jest-dom", reactPkg.devDependencies["@testing-library/jest-dom"]],
        ["vitest", rootPkg.devDependencies.vitest],
        ["jest", jestEnvPkg.devDependencies.jest],
        ["typescript", rootPkg.devDependencies.typescript],
      ]),
    },
    null,
    2,
  ),
);
// Overrides pin the tarballs' own `@rtd/*: 0.0.0` dependencies to the local tarballs (otherwise
// pnpm would look them up in the registry).
writeFileSync(
  join(project, "pnpm-workspace.yaml"),
  [
    "overrides:",
    ...[...packed.keys()].map((name) => `  "${name}": "${fileRef(name)}"`),
    "allowBuilds:",
    "  unrs-resolver: false",
    "",
  ].join("\n"),
);
run("pnpm", ["install", "--no-frozen-lockfile"], { cwd: project, quiet: true });

// ── 3. checks ─────────────────────────────────────────────────────────────────────────────────
interface Check {
  id: string;
  title: string;
  cmd: string[];
  /** Files (relative to node_modules/) that must appear in the load log. */
  mustLoad: string[];
  mustNotLoad?: RegExp;
}

const checks: Check[] = [
  {
    id: "a",
    title: "Vitest + stock @testing-library/*",
    cmd: ["vitest", "run", "--config", "vitest.stock.config.ts"],
    mustLoad: ["vitest-environment-rtd/dist/index.js", "@rtd/dom/dist/index.js", "@testing-library/react/"],
  },
  {
    id: "b",
    title: "Vitest + @rtd/react, @rtd/user-event, @rtd/jest-dom/vitest",
    cmd: ["vitest", "run", "--config", "vitest.rtd.config.ts"],
    mustLoad: ["@rtd/react/dist/index.js", "@rtd/user-event/dist/index.js", "@rtd/jest-dom/dist/vitest.js", "@rtd/testing-library/dist/index.js", "@rtd/aria/dist/index.js"],
    mustNotLoad: /\/node_modules\/@testing-library\//,
  },
  {
    id: "c",
    title: "Vitest + resolve.alias @testing-library/* → @rtd/*",
    cmd: ["vitest", "run", "--config", "vitest.alias.config.ts"],
    mustLoad: ["@rtd/react/dist/index.js", "@rtd/user-event/dist/index.js", "@rtd/jest-dom/dist/vitest.js"],
    mustNotLoad: /\/node_modules\/@testing-library\//,
  },
  {
    id: "d1",
    title: "Jest + testEnvironment jest-environment-rtd, stock Testing Library",
    cmd: ["jest", "--config", "jest.env.config.cjs"],
    mustLoad: ["jest-environment-rtd/dist/index.js", "@rtd/dom/dist/index.js", "@testing-library/react/"],
  },
  {
    id: "d2",
    title: "Jest + preset jest-environment-rtd, @rtd/* CommonJS builds",
    cmd: ["jest", "--config", "jest.preset.config.cjs"],
    mustLoad: [
      "jest-environment-rtd/dist/index.js",
      "jest-environment-rtd/src/shims/dom.cjs",
      "@rtd/react/dist/index.cjs",
      "@rtd/user-event/dist/index.cjs",
      "@rtd/jest-dom/dist/index.cjs",
      "@rtd/testing-library/dist/index.cjs",
    ],
    mustNotLoad: /\/node_modules\/@testing-library\//,
  },
  {
    id: "e",
    title: "tsc --noEmit with our declarations",
    cmd: ["tsc", "--noEmit", "-p", "tsconfig.json"],
    mustLoad: [],
  },
];

const OURS = /\/node_modules\/((?:@rtd\/[^/]+)|vitest-environment-rtd|jest-environment-rtd)\/(.*)$/;
const ALLOWED = /^(dist\/.*\.(?:c?js|d\.ts)|src\/shims\/[^/]+\.cjs|jest-preset\.cjs|package\.json)$/;

function verifyLoads(check: Check, log: string): string[] {
  const problems: string[] = [];
  const domRoots = new Set<string>();
  const seen = new Set<string>();
  for (const line of existsSync(log) ? readFileSync(log, "utf8").split("\n") : []) {
    if (!line) continue;
    const [, , raw] = line.split("\t");
    if (!raw.startsWith("file:") && !raw.startsWith("/")) continue;
    let path = raw.startsWith("file:") ? fileURLToPath(raw.split("?")[0]) : raw.split("?")[0];
    try {
      path = realpathSync(path);
    } catch {}
    if (path.startsWith(repoRoot)) problems.push(`loaded from the repository: ${path}`);
    // pnpm stores packages under node_modules/.pnpm/<id>/node_modules/<name>/: keep the last one.
    const nm = path.lastIndexOf("/node_modules/");
    const tail = nm === -1 ? path : path.slice(nm);
    seen.add(tail.slice("/node_modules/".length));
    if (check.mustNotLoad?.test(tail)) problems.push(`must not load ${path}`);
    const m = OURS.exec(tail);
    if (m === null) continue;
    const [, name, rel] = m;
    if (!ALLOWED.test(rel)) problems.push(`${name}: loaded non-dist file ${rel}`);
    if (name === "@rtd/dom") domRoots.add(path.slice(0, nm));
  }
  if (domRoots.size > 1) problems.push(`more than one @rtd/dom instance: ${[...domRoots].join(", ")}`);
  for (const file of check.mustLoad) {
    if (![...seen].some((s) => s.startsWith(file))) problems.push(`expected to load ${file}`);
  }
  return problems;
}

const results: { check: Check; ok: boolean; problems: string[]; ms: number }[] = [];
for (const check of checks) {
  const log = join(root, `loads-${check.id}.log`);
  rmSync(log, { force: true });
  const t0 = performance.now();
  const proc = spawnSync("pnpm", ["exec", ...check.cmd], {
    cwd: project,
    encoding: "utf8",
    env: {
      ...process.env,
      RTD_LOAD_LOG: log,
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import ${join(project, "record-loads.mjs")}`.trim(),
      CI: "1",
    },
  });
  const ms = performance.now() - t0;
  const problems = proc.status === 0 ? [] : [`exit ${proc.status}\n${proc.stdout}${proc.stderr}`];
  problems.push(...verifyLoads(check, log));
  results.push({ check, ok: problems.length === 0, problems, ms });
  console.log(`${problems.length === 0 ? "PASS" : "FAIL"} (${check.id}) ${check.title}  ${(ms / 1000).toFixed(1)} s`);
  for (const p of problems) console.log(`       ${p.replaceAll("\n", "\n       ")}`);
}

// Informational: the same type check without skipLibCheck (our .d.ts files checked too).
const strict = spawnSync("pnpm", ["exec", "tsc", "--noEmit", "-p", "tsconfig.json", "--skipLibCheck", "false"], { cwd: project, encoding: "utf8" });
const strictErrors = (strict.stdout.match(/error TS\d+/g) ?? []).length;
console.log(`info  tsc without skipLibCheck: ${strictErrors} error(s)${strictErrors ? " (see --keep project)" : ""}`);

if (flags.keep || flags.dir) console.log(`\nproject kept at ${project}`);
else rmSync(root, { recursive: true, force: true });

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
if (failed) process.exitCode = 1;
