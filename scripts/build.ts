// `pnpm build`: the publishable build of every workspace package into `packages/*/dist/`.
//
// Per package:
//   dist/<entry>.js        ESM bundle per `exports` entry (rolldown). A package with several
//                          entries (@rtd/dom + @rtd/dom/internal) gets shared chunks in
//                          dist/_chunks/ so its entries keep sharing module state.
//   dist/<entry>.cjs       CommonJS bundle, only for the packages a Jest test file loads
//                          through Jest's own module registry (CJS_PACKAGES, see below).
//   dist/types/**.d.ts     declarations emitted from the sources (tsc --emitDeclarationOnly),
//                          except for packages that ship hand-maintained, upstream-identical
//                          typings under types/ (their dev `exports` carry a `types` condition).
//   dist/NOTICE            copy of the repository NOTICE (and LICENSE once there is one).
//
// Every bare specifier (other workspace packages, react, node builtins) stays external, so two
// bundles never carry two copies of the DOM. Packages' development `exports` keep pointing at
// src/*.ts; `publishConfig` (applied by `pnpm pack` / `pnpm publish`) points them at dist/.
// The bench's "*-dist" configurations read the same layout (bench/lib/packages.ts).
//
// Flags: --minify, --filter <substring>, --no-dts, --no-cjs.

import { rmSync, statSync, readdirSync, readFileSync, writeFileSync, mkdirSync, cpSync, existsSync, mkdtempSync } from "node:fs";
import { join, isAbsolute, relative, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { build, type OutputOptions } from "rolldown";
import { workspacePackages, repoRoot, type WorkspacePackage } from "../bench/lib/packages.ts";

const { values: flags } = parseArgs({
  options: {
    minify: { type: "boolean", default: false },
    filter: { type: "string" },
    "no-dts": { type: "boolean", default: false },
    "no-cjs": { type: "boolean", default: false },
  },
});

/**
 * Packages that also get CommonJS bundles. Jest (without `--experimental-vm-modules`) cannot
 * `require()` an ES module from a test file: its runtime implements `require(esm)` only on top
 * of `vm.SourceTextModule`, which Node 26 still hides behind that flag. So everything a Jest
 * test file `require`s needs a CJS build. @rtd/dom does not: jest-environment-rtd's preset maps
 * it to a CJS shim returning the environment's own (ESM) instance. The environments themselves
 * are loaded by Node in the outer realm, where `require(esm)` works.
 */
const CJS_PACKAGES = new Set(["@rtd/aria", "@rtd/testing-library", "@rtd/react", "@rtd/user-event", "@rtd/jest-dom"]);

const external = (id: string) => !id.startsWith(".") && !isAbsolute(id) && !id.startsWith("\0");

function dirSize(dir: string): number {
  let total = 0;
  for (const e of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (e.isFile()) total += statSync(join(e.parentPath, e.name)).size;
  }
  return total;
}

/** Hand-maintained typings: the dev `exports` already name a `types` file for every entry. */
function shipsOwnTypes(pkg: WorkspacePackage): boolean {
  const json = JSON.parse(readFileSync(join(pkg.dir, "package.json"), "utf8"));
  return Object.values(json.exports ?? {}).some((v) => typeof v === "object" && v !== null && "types" in v);
}

/**
 * One tsc program over the sources of every package that needs emitted declarations; returns
 * the output root (mirrors packages/, so <out>/<dir>/src/... belongs to packages/<dir>).
 */
function emitDeclarations(pkgs: WorkspacePackage[]): string {
  const out = mkdtempSync(join(tmpdir(), "rtd-dts-"));
  const tsconfig = join(out, "tsconfig.json");
  writeFileSync(
    tsconfig,
    JSON.stringify({
      extends: join(repoRoot, "tsconfig.base.json"),
      compilerOptions: {
        noEmit: false,
        declaration: true,
        emitDeclarationOnly: true,
        outDir: join(out, "emit"),
        rootDir: join(repoRoot, "packages"),
        typeRoots: [join(repoRoot, "node_modules/@types")],
      },
      include: pkgs.map((p) => join(p.dir, "src")),
      // Code generators that live next to the data they write; not part of any entry.
      exclude: [join(repoRoot, "packages/*/src/**/generate*.ts")],
    }),
  );
  const tsc = spawnSync(join(repoRoot, "node_modules/.bin/tsc"), ["-p", tsconfig], { encoding: "utf8" });
  if (tsc.status !== 0) throw new Error(`declaration emit failed\n${tsc.stdout}${tsc.stderr}`);
  return join(out, "emit");
}

/**
 * Declaration files whose structural DOM types are replaced by the lib.dom globals of the same
 * name in the published types. @rtd/user-event's src/dom-types.ts declares minimal DOM
 * interfaces so the monorepo compiles without lib.dom, but TypeScript cannot prove lib.dom's
 * `HTMLElement` assignable to them (deeply recursive structural check), so `user.click(
 * screen.getByRole(...))` failed to type-check for users. Upstream user-event is typed against
 * lib.dom; aliasing restores exactly that. (Found by `pnpm test:pack` check (e).)
 * TODO(user-event): make dom-types.ts assignable from lib.dom and drop this.
 */
const LIB_DOM_ALIASES: Record<string, string> = { "@rtd/user-event": "dom-types.d.ts" };

/** lib.dom's constraints on generic interfaces that the structural copies leave unconstrained. */
const LIB_DOM_PARAMS: Record<string, string> = { NodeListOf: "<T extends Node>", HTMLCollectionOf: "<T extends Element>" };

function libDomAliases(declarations: string): string {
  const lines = ["// Published declarations: these are the lib.dom types (see scripts/build.ts)."];
  for (const m of declarations.matchAll(/^export (?:declare )?(?:interface|type|class) (\w+)(<[^{=]*?>)?[\s{=]/gm)) {
    const name = m[1];
    const params = LIB_DOM_PARAMS[name] ?? m[2] ?? "";
    const args = params ? `<${params.slice(1, -1).split(",").map((p) => p.trim().split(/\s/)[0]).join(", ")}>` : "";
    lines.push(`export type ${name}${params} = globalThis.${name}${args};`);
  }
  return `${lines.join("\n")}\n`;
}

/** Copy <emit>/<pkg>/src → dist/types, rewriting relative `.ts` specifiers to `.js`. */
function copyDeclarations(emitRoot: string, pkg: WorkspacePackage): void {
  const from = join(emitRoot, relative(join(repoRoot, "packages"), pkg.dir), "src");
  const to = join(pkg.dir, "dist", "types");
  for (const e of readdirSync(from, { withFileTypes: true, recursive: true })) {
    if (!e.isFile() || !e.name.endsWith(".d.ts")) continue;
    const src = join(e.parentPath, e.name);
    const dest = join(to, relative(from, src));
    mkdirSync(dirname(dest), { recursive: true });
    let text = readFileSync(src, "utf8");
    if (LIB_DOM_ALIASES[pkg.name] === relative(from, src)) text = libDomAliases(text);
    text = text.replace(
      /((?:from|import|declare module)\s*\(?\s*["'])(\.{1,2}\/[^"']*?)\.ts(["'])/g,
      (_, head: string, path: string, tail: string) => `${head}${path}.js${tail}`,
    );
    writeFileSync(dest, text);
  }
}

const selected = workspacePackages().filter((p) => p.exports.length > 0 && (!flags.filter || p.name.includes(flags.filter)));
const dtsPackages = flags["no-dts"] ? [] : selected.filter((p) => !shipsOwnTypes(p));

let failed = 0;
let emitRoot: string | undefined;
if (dtsPackages.length > 0) {
  const t0 = performance.now();
  try {
    emitRoot = emitDeclarations(dtsPackages);
    console.log(`declarations (${dtsPackages.map((p) => p.name).join(", ")}) ${(performance.now() - t0).toFixed(0)} ms`);
  } catch (error) {
    failed++;
    console.error((error as Error).message);
  }
}

const notices = ["NOTICE", "LICENSE"].map((f) => join(repoRoot, f)).filter((f) => existsSync(f));

for (const pkg of selected) {
  const input: Record<string, string> = {};
  for (const e of pkg.exports) input[e.entryName] = e.source;
  const outDir = join(pkg.dir, "dist");
  rmSync(outDir, { recursive: true, force: true });
  const t0 = performance.now();
  const formats: OutputOptions[] = [
    { format: "esm", entryFileNames: "[name].js", chunkFileNames: "_chunks/[name]-[hash].js" },
  ];
  if (CJS_PACKAGES.has(pkg.name) && !flags["no-cjs"]) {
    formats.push({ format: "cjs", exports: "named", entryFileNames: "[name].cjs", chunkFileNames: "_chunks/[name]-[hash].cjs" });
  }
  try {
    for (const format of formats) {
      await build({
        input,
        cwd: pkg.dir,
        platform: "node",
        logLevel: "warn",
        external,
        treeshake: true,
        output: { dir: outDir, minify: flags.minify, sourcemap: false, ...format },
      });
    }
    if (emitRoot && dtsPackages.includes(pkg)) copyDeclarations(emitRoot, pkg);
    for (const f of notices) cpSync(f, join(outDir, f.slice(repoRoot.length).replace(/^\//, "")));
    const ms = performance.now() - t0;
    const kb = dirSize(outDir) / 1024;
    console.log(
      `${pkg.name.padEnd(24)} ${relative(repoRoot, outDir).padEnd(32)} ${kb.toFixed(1).padStart(8)} KB  ${formats.map((f) => f.format).join("+").padEnd(7)} ${ms.toFixed(0)} ms`,
    );
  } catch (error) {
    failed++;
    console.error(`${pkg.name}: build failed\n${(error as Error).message}`);
  }
}
if (emitRoot) rmSync(dirname(emitRoot), { recursive: true, force: true });
if (failed) process.exitCode = 1;
