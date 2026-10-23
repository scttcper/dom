// `pnpm build`: single-file ESM bundles per workspace package into `packages/*/dist/`.
//
// Each package is one rolldown build whose inputs are the package's `exports` entries (a package
// with several entries, e.g. @rtd/dom + @rtd/dom/internal, gets shared chunks so the entries keep
// sharing module state). Every bare specifier (other workspace packages, react, node builtins)
// stays external, so two bundles never carry two copies of the DOM. Packages' `exports` still
// point at src/; the bench's "*-dist" configurations redirect to dist/ (bench/lib/dist-hooks.ts).
//
// Flags: --minify, --filter <substring>.

import { rmSync, statSync, readdirSync } from "node:fs";
import { join, isAbsolute, relative } from "node:path";
import { parseArgs } from "node:util";
import { build } from "rolldown";
import { workspacePackages, repoRoot } from "./lib/packages.ts";

const { values: flags } = parseArgs({
  options: {
    minify: { type: "boolean", default: false },
    filter: { type: "string" },
  },
});

function dirSize(dir: string): number {
  let total = 0;
  for (const e of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (e.isFile()) total += statSync(join(e.parentPath, e.name)).size;
  }
  return total;
}

let failed = 0;
for (const pkg of workspacePackages()) {
  if (flags.filter && !pkg.name.includes(flags.filter)) continue;
  if (pkg.exports.length === 0) continue;
  const input: Record<string, string> = {};
  for (const e of pkg.exports) input[e.entryName] = e.source;
  const outDir = join(pkg.dir, "dist");
  rmSync(outDir, { recursive: true, force: true });
  const t0 = performance.now();
  try {
    await build({
      input,
      cwd: pkg.dir,
      platform: "node",
      logLevel: "warn",
      external: (id) => !id.startsWith(".") && !isAbsolute(id) && !id.startsWith("\0"),
      treeshake: true,
      output: {
        dir: outDir,
        format: "esm",
        entryFileNames: "[name].js",
        chunkFileNames: "_chunks/[name]-[hash].js",
        minify: flags.minify,
        sourcemap: false,
      },
    });
    const ms = performance.now() - t0;
    const kb = dirSize(outDir) / 1024;
    console.log(
      `${pkg.name.padEnd(24)} ${relative(repoRoot, outDir).padEnd(32)} ${kb.toFixed(1).padStart(8)} KB  ${ms.toFixed(0)} ms`,
    );
  } catch (error) {
    failed++;
    console.error(`${pkg.name}: bundle failed\n${(error as Error).message}`);
  }
}
if (failed) process.exitCode = 1;
