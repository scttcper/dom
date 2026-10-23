// The published packages, assembled from the workspace packages' builds (`pnpm build` runs this
// as its last step; `node scripts/release.ts` re-assembles from existing dist/ directories):
//
//   release/ctrl-dom                     @ctrl/dom: packages/dom at the root, the other runtime
//                                        packages under subpaths (@ctrl/dom/react, /user-event,
//                                        /jest-dom, /testing-library, /aria, /vitest-environment),
//                                        plus the Jest preset and the Vitest plugin (publish/ctrl-dom)
//   release/jest-environment-ctrl-dom    packages/jest-environment (Jest's dependencies stay out of
//                                        @ctrl/dom for Vitest users), with its own preset
//   release/vitest-environment-ctrl-dom  re-exports @ctrl/dom/vitest-environment, so Vitest finds
//                                        `environment: "ctrl-dom"` by name
//
// The workspace names (@rtd/*, *-environment-rtd) are internal. Every bundle and declaration
// keeps its cross-package imports as bare specifiers (scripts/build.ts), and they are rewritten
// here to the published ones (`@rtd/aria` → `@ctrl/dom/aria`): inside @ctrl/dom they become
// self-references, so each internal package still exists exactly once. Hand-written files (READMEs,
// manifests' static fields, presets, the plugin) live in publish/<package>/.

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

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
};

/** Peer ranges where members disagree (jest-dom alone allows older Vitest/Jest than the environments). */
const PEER_OVERRIDES: Record<string, string> = { vitest: ">=5.0.0", jest: ">=30.0.0", "@jest/globals": ">=30.0.0" };

/** Rewrite workspace package names to the published ones (specifiers, messages, docs). */
export function rewriteNames(text: string): string {
  return text
    .replace(/@rtd\/(dom|aria|testing-library|react|user-event|jest-dom)(?![\w-])((?:\/[\w.-]+)*)/g, (_, pkg: string, rest: string) => {
      const sub = SUBPATHS[`@rtd/${pkg}`];
      return `@ctrl/dom${sub ? `/${sub}` : ""}${rest}`;
    })
    .replaceAll("vitest-environment-rtd", "vitest-environment-ctrl-dom")
    .replaceAll("jest-environment-rtd", "jest-environment-ctrl-dom");
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

function sorted<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
}

export function assembleRelease(): string[] {
  rmSync(releaseDir, { recursive: true, force: true });
  const templates = Object.fromEntries(
    ["ctrl-dom", "jest-environment-ctrl-dom", "vitest-environment-ctrl-dom"].map((name) => [name, readJson(join(publishDir, name, "package.template.json"))]),
  );
  const version: string = templates["ctrl-dom"].version;
  for (const [name, t] of Object.entries(templates)) {
    if (t.version !== version) throw new Error(`publish/${name}: version ${t.version} differs from @ctrl/dom's ${version}`);
  }

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
  exportsMap["./vitest"] = { types: "./vitest.d.ts", default: "./vitest.js" };
  exportsMap["./jest-preset"] = "./jest-preset.cjs";
  exportsMap["./package.json"] = "./package.json";
  const { dependencies, peerDependencies } = mergeDependencies(members);
  copyPublishFiles("ctrl-dom", ctrlDom, ["README.md", "jest-preset.cjs", "jest", "vitest.js", "vitest.d.ts"]);
  writeJson(join(ctrlDom, "package.json"), {
    ...templates["ctrl-dom"],
    main: "./dist/dom/index.js",
    types: "./dist/dom/types/index.d.ts",
    exports: exportsMap,
    files: ["dist", "jest", "jest-preset.cjs", "vitest.js", "vitest.d.ts", "README.md", "NOTICE", "LICENSE"],
    dependencies: sorted(dependencies),
    // Nothing is required to use the DOM alone: React for @ctrl/dom/react, Vitest or Jest for theirs.
    peerDependencies: sorted(peerDependencies),
    peerDependenciesMeta: sorted(Object.fromEntries(Object.keys(peerDependencies).map((name) => [name, { optional: true }]))),
  });

  // ── jest-environment-ctrl-dom ──
  const jestEnv = join(releaseDir, "jest-environment-ctrl-dom");
  const jestPkg = readJson(join(repoRoot, "packages/jest-environment/package.json"));
  copyTree(join(repoRoot, "packages/jest-environment/dist"), join(jestEnv, "dist"));
  copyPublishFiles("jest-environment-ctrl-dom", jestEnv, ["README.md", "jest-preset.cjs", "shims"]);
  writeJson(join(jestEnv, "package.json"), {
    ...templates["jest-environment-ctrl-dom"],
    main: "./dist/index.js",
    types: "./dist/types/index.d.ts",
    exports: {
      ".": { types: "./dist/types/index.d.ts", default: "./dist/index.js" },
      "./jest-preset": "./jest-preset.cjs",
      "./package.json": "./package.json",
    },
    files: ["dist", "shims", "jest-preset.cjs", "README.md", "NOTICE", "LICENSE"],
    dependencies: sorted(mergeDependencies([jestPkg]).dependencies),
    // A peer, so the environment and the test project share one @ctrl/dom.
    peerDependencies: { "@ctrl/dom": version, jest: PEER_OVERRIDES.jest },
  });

  // ── vitest-environment-ctrl-dom ──
  const vitestEnv = join(releaseDir, "vitest-environment-ctrl-dom");
  mkdirSync(vitestEnv, { recursive: true });
  copyPublishFiles("vitest-environment-ctrl-dom", vitestEnv, ["README.md", "index.js", "index.d.ts"]);
  writeJson(join(vitestEnv, "package.json"), {
    ...templates["vitest-environment-ctrl-dom"],
    main: "./index.js",
    types: "./index.d.ts",
    exports: { ".": { types: "./index.d.ts", default: "./index.js" }, "./package.json": "./package.json" },
    files: ["index.js", "index.d.ts", "README.md", "NOTICE", "LICENSE"],
    peerDependencies: { "@ctrl/dom": version, vitest: PEER_OVERRIDES.vitest },
  });

  return [ctrlDom, jestEnv, vitestEnv];
}

if (import.meta.main) {
  for (const dir of assembleRelease()) console.log(`assembled ${relative(repoRoot, dir)}`);
}
