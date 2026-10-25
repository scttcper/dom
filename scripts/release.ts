// The published packages, assembled from the workspace packages' builds (`pnpm build` runs this
// as its last step; `node scripts/release.ts` re-assembles from existing dist/ directories):
//
//   release/ctrl-dom                     @ctrl/dom: packages/dom at the root, the other runtime
//                                        packages under subpaths (@ctrl/dom/react, /user-event,
//                                        /jest-dom, /testing-library, /aria, /vitest-environment,
//                                        /register, /sentry),
//                                        plus the Jest preset and the Vitest plugin (publish/ctrl-dom)
//   release/dom-jest-environment         @ctrl/dom-jest-environment: packages/jest-environment
//                                        (Jest's dependencies stay out of @ctrl/dom for Vitest users)
//
// Every published package is under @ctrl. Vitest has no separate environment package: it can only
// look a custom environment up by name as an unscoped `vitest-environment-<name>` package, so the
// ctrlDom() plugin references the environment by path and answers for the name itself.
//
// The workspace names (@rtd/*, *-environment-rtd) are internal. Every bundle and declaration
// keeps its cross-package imports as bare specifiers (scripts/build.ts), and they are rewritten
// here to the published ones (`@rtd/aria` → `@ctrl/dom/aria`): inside @ctrl/dom they become
// self-references, so each internal package still exists exactly once. `@ctrl/dom` and
// `@ctrl/dom/internal` themselves resolve to generated bridges (writeBridges) that hand every
// importer the DOM instance the running environment loaded. Hand-written files (READMEs,
// manifests' static fields, the Jest preset, the Vitest plugin) live in publish/<package>/.

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
export const releaseDir = join(repoRoot, "release");
const publishDir = join(repoRoot, "publish");

/** Workspace package name → subpath of @ctrl/dom ("" is the package root). */
const SUBPATHS: Record<string, string> = {
  "@rtd/dom": "",
  "@rtd/aria": "aria",
  "@rtd/testing-library": "testing-library",
  "@rtd/react": "react",
  "@rtd/user-event": "user-event",
  "@rtd/jest-dom": "jest-dom",
  "vitest-environment-rtd": "vitest-environment",
  "@rtd/register": "register",
  "@rtd/sentry": "sentry",
};

/** packages/<dir> for each @ctrl/dom member, in SUBPATHS order. */
const MEMBER_DIRS: Record<string, string> = {
  "@rtd/dom": "dom",
  "@rtd/aria": "aria",
  "@rtd/testing-library": "testing-library",
  "@rtd/react": "react",
  "@rtd/user-event": "user-event",
  "@rtd/jest-dom": "jest-dom",
  "vitest-environment-rtd": "vitest-environment",
  "@rtd/register": "register",
  "@rtd/sentry": "sentry",
};

/** Peer ranges where members disagree (jest-dom alone allows older Vitest/Jest than the environments). */
const PEER_OVERRIDES: Record<string, string> = { vitest: ">=5.0.0", jest: ">=30.0.0", "@jest/globals": ">=30.0.0" };

/** Rewrite workspace package names to the published ones (specifiers, messages, docs). */
export function rewriteNames(text: string): string {
  return text
    .replace(/@rtd\/(dom|aria|testing-library|react|user-event|jest-dom|register|sentry)(?![\w-])((?:\/[\w.-]+)*)/g, (_, pkg: string, rest: string) => {
      const sub = SUBPATHS[`@rtd/${pkg}`];
      return `@ctrl/dom${sub ? `/${sub}` : ""}${rest}`;
    })
    .replaceAll("vitest-environment-rtd", "@ctrl/dom/vitest-environment")
    .replaceAll("jest-environment-rtd", "@ctrl/dom-jest-environment");
}

type Json = Record<string, any>;
const readJson = (path: string): Json => JSON.parse(readFileSync(path, "utf8"));
const writeJson = (path: string, value: unknown) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

const TEXT = /\.(?:[cm]?js|d\.[cm]?ts|json)$/;

/** Copy a directory, rewriting names in code/declaration files and dropping per-package NOTICE copies. */
function copyTree(from: string, to: string): void {
  if (!existsSync(from)) throw new Error(`missing ${relative(repoRoot, from)} (run pnpm build first)`);
  cpSync(from, to, { recursive: true });
  for (const e of readdirSync(to, { withFileTypes: true, recursive: true })) {
    if (!e.isFile()) continue;
    const path = join(e.parentPath, e.name);
    if (e.name === "NOTICE" || e.name === "LICENSE") rmSync(path);
    else if (TEXT.test(e.name)) writeFileSync(path, rewriteNames(readFileSync(path, "utf8")));
  }
}

/** A member's dist-based `exports` (publishConfig), moved under ./dist/<distDir>/ and ./<sub>. */
function memberExports(pkg: Json, sub: string, distDir: string): Json {
  const out: Json = {};
  const move = (value: unknown): unknown => {
    if (typeof value === "string") return value.replace(/^\.\/(dist|types)\//, (_, d: string) => (d === "dist" ? `./dist/${distDir}/` : `./dist/${distDir}/types/`));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, move(v)]));
    return value;
  };
  for (const [key, value] of Object.entries(pkg.publishConfig?.exports ?? {})) {
    if (key === "./package.json") continue;
    const published = key === "." ? (sub ? `./${sub}` : ".") : sub ? `./${sub}/${key.slice(2)}` : key;
    out[published] = move(value);
  }
  return out;
}

/** Union of members' external dependencies and peers (workspace links dropped). */
function mergeDependencies(pkgs: Json[]) {
  const dependencies: Record<string, string> = {};
  const peerDependencies: Record<string, string> = {};
  for (const pkg of pkgs) {
    for (const [name, range] of Object.entries<string>(pkg.dependencies ?? {})) {
      if (range.startsWith("workspace:")) continue;
      if (dependencies[name] !== undefined && dependencies[name] !== range) throw new Error(`conflicting ranges for ${name}: ${dependencies[name]} vs ${range}`);
      dependencies[name] = range;
    }
    for (const [name, range] of Object.entries<string>(pkg.peerDependencies ?? {})) {
      peerDependencies[name] = PEER_OVERRIDES[name] ?? peerDependencies[name] ?? range;
    }
  }
  return { dependencies, peerDependencies };
}

function copyPublishFiles(name: string, to: string, files: string[]): void {
  for (const file of files) {
    const from = join(publishDir, name, file);
    if (!existsSync(from)) continue;
    mkdirSync(dirname(join(to, file)), { recursive: true });
    cpSync(from, join(to, file), { recursive: true });
  }
  for (const f of ["NOTICE", "LICENSE"]) {
    if (existsSync(join(repoRoot, f))) writeFileSync(join(to, f), rewriteNames(readFileSync(join(repoRoot, f), "utf8")));
  }
}

/**
 * `@ctrl/dom` and `@ctrl/dom/internal` resolve to these bridges rather than to the DOM's entries.
 * The ctrl-dom environments publish the DOM modules they loaded on the test global
 * (Symbol.for("rtd.dom.modules")), and a bridge hands that instance to every importer: test code,
 * and @ctrl/dom's own Testing Library bundles through their self-references. Jest and Vitest's VM
 * pools evaluate a test file's modules inside a vm context, where a plain import would evaluate
 * a second DOM per file whose classes fail `instanceof` against the installed globals; in Vitest's
 * other pools the bridge returns what Node's module cache would. With no environment running
 * (an environment's own import, or plain Node) it loads the DOM itself: `require(esm)` keeps that
 * synchronous and shares Node's ES module instance. ES modules need their export names
 * statically, so they are read from the built entries.
 */
async function writeBridges(ctrlDom: string): Promise<void> {
  const out = join(ctrlDom, "dist", "bridge");
  mkdirSync(out, { recursive: true });
  for (const [entry, key] of [
    ["index", "dom"],
    ["internal", "internal"],
  ] as const) {
    const target = JSON.stringify(`../dom/${entry}.js`);
    const ns = await import(pathToFileURL(join(ctrlDom, "dist", "dom", `${entry}.js`)).href);
    const names = Object.keys(ns).sort();
    if (names.includes("default")) throw new Error(`dist/dom/${entry}.js has a default export, which the bridge cannot destructure`);
    const shared = `globalThis[Symbol.for("rtd.dom.modules")]?.${key}`;
    const header = "// Generated by scripts/release.ts (writeBridges): the running ctrl-dom environment's DOM, else a fresh load.";
    writeFileSync(
      join(out, `${entry}.js`),
      `${header}\nimport { createRequire } from "node:module";\nconst dom = ${shared} ?? createRequire(import.meta.url)(${target});\nexport const { ${names.join(", ")} } = dom;\n`,
    );
    writeFileSync(join(out, `${entry}.cjs`), `${header}\n"use strict";\nmodule.exports = ${shared} ?? require(${target});\n`);
  }
}

/**
 * The Vitest environment is what loads the DOM, so it imports the DOM's entries rather than the
 * bridges: with nothing published yet a bridge falls back to `require(esm)`, which made every
 * forked Vitest worker start ~15 ms slower than a native import (60-file suite, `isolate`).
 * `@ctrl/dom/register` (node:test, bun test) is what loads the DOM there, so it is pinned too.
 */
function pinEnvironmentDom(ctrlDom: string, member = "vitest-environment"): void {
  const envDir = join(ctrlDom, "dist", member);
  for (const e of readdirSync(envDir, { withFileTypes: true, recursive: true })) {
    if (!e.isFile() || !e.name.endsWith(".js")) continue;
    const path = join(e.parentPath, e.name);
    const text = readFileSync(path, "utf8").replace(/(["'])@ctrl\/dom(\/internal)?\1/g, (_, quote: string, internal?: string) => {
      const target = relative(e.parentPath, join(ctrlDom, "dist", "dom", internal ? "internal.js" : "index.js"));
      return `${quote}${target.startsWith(".") ? target : `./${target}`}${quote}`;
    });
    writeFileSync(path, text);
  }
}

function sorted<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
}

export async function assembleRelease(): Promise<string[]> {
  rmSync(releaseDir, { recursive: true, force: true });
  const templates = Object.fromEntries(
    ["ctrl-dom", "dom-jest-environment"].map((name) => [name, readJson(join(publishDir, name, "package.template.json"))]),
  );
  // Each package is released on its own version line (tools/release): templates hold a
  // placeholder version that semantic-release replaces at publish time.
  const version: string = templates["ctrl-dom"].version;

  // ── @ctrl/dom ──
  const ctrlDom = join(releaseDir, "ctrl-dom");
  const members: Json[] = [];
  let exportsMap: Json = {};
  for (const [workspaceName, sub] of Object.entries(SUBPATHS)) {
    const pkgDir = join(repoRoot, "packages", MEMBER_DIRS[workspaceName]);
    const pkg = readJson(join(pkgDir, "package.json"));
    if (pkg.name !== workspaceName) throw new Error(`packages/${MEMBER_DIRS[workspaceName]} is ${pkg.name}, expected ${workspaceName}`);
    members.push(pkg);
    const distDir = sub || "dom";
    copyTree(join(pkgDir, "dist"), join(ctrlDom, "dist", distDir));
    // Hand-maintained, upstream-identical typings (their exports name ./types/...).
    if (existsSync(join(pkgDir, "types"))) copyTree(join(pkgDir, "types"), join(ctrlDom, "dist", distDir, "types"));
    exportsMap = { ...exportsMap, ...memberExports(pkg, sub, distDir) };
  }
  await writeBridges(ctrlDom);
  pinEnvironmentDom(ctrlDom);
  pinEnvironmentDom(ctrlDom, "register");
  for (const key of [".", "./internal"]) {
    const entry = key === "." ? "index" : "internal";
    exportsMap[key] = { types: exportsMap[key].types, require: `./dist/bridge/${entry}.cjs`, default: `./dist/bridge/${entry}.js` };
  }
  exportsMap["./vitest"] = { types: "./vitest.d.ts", default: "./vitest.js" };
  exportsMap["./jest-preset"] = "./jest-preset.cjs";
  exportsMap["./package.json"] = "./package.json";
  const { dependencies, peerDependencies } = mergeDependencies(members);
  // cli/: `npx ctrl-dom debug <test file>` and its reporters (docs/agent-debugging.md).
  copyPublishFiles("ctrl-dom", ctrlDom, ["README.md", "jest-preset.cjs", "vitest.js", "vitest.d.ts", "cli"]);
  writeJson(join(ctrlDom, "package.json"), {
    ...templates["ctrl-dom"],
    main: "./dist/bridge/index.js",
    types: "./dist/dom/types/index.d.ts",
    bin: { "ctrl-dom": "./cli/ctrl-dom.js" },
    exports: exportsMap,
    files: ["dist", "cli", "jest-preset.cjs", "vitest.js", "vitest.d.ts", "README.md", "NOTICE", "LICENSE"],
    dependencies: sorted(dependencies),
    // Nothing is required to use the DOM alone: React for @ctrl/dom/react, Vitest or Jest for theirs.
    peerDependencies: sorted(peerDependencies),
    peerDependenciesMeta: sorted(Object.fromEntries(Object.keys(peerDependencies).map((name) => [name, { optional: true }]))),
  });

  // ── @ctrl/dom-jest-environment ──
  const jestEnv = join(releaseDir, "dom-jest-environment");
  const jestPkg = readJson(join(repoRoot, "packages/jest-environment/package.json"));
  copyTree(join(repoRoot, "packages/jest-environment/dist"), join(jestEnv, "dist"));
  copyPublishFiles("dom-jest-environment", jestEnv, ["README.md"]);
  writeJson(join(jestEnv, "package.json"), {
    ...templates["dom-jest-environment"],
    main: "./dist/index.js",
    types: "./dist/types/index.d.ts",
    exports: { ".": { types: "./dist/types/index.d.ts", default: "./dist/index.js" }, "./package.json": "./package.json" },
    files: ["dist", "README.md", "NOTICE", "LICENSE"],
    dependencies: sorted(mergeDependencies([jestPkg]).dependencies),
    // A peer, so the environment and the test project share one @ctrl/dom. The release sets the
    // range to ^<latest @ctrl/dom> (tools/release/scoped-plugin.ts).
    peerDependencies: { "@ctrl/dom": `^${version}`, jest: PEER_OVERRIDES.jest },
  });

  return [ctrlDom, jestEnv];
}

if (import.meta.main) {
  for (const dir of await assembleRelease()) console.log(`assembled ${relative(repoRoot, dir)}`);
}
