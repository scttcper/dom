// Workspace package discovery shared by the bundler (bench/bundle.ts) and the "dist" bench
// configurations (bench/lib/dist-hooks.ts), so both agree on where each export's bundle lives.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
export const packagesDir = join(repoRoot, "packages");

export interface WorkspaceExport {
  /** Full specifier, e.g. "@rtd/dom/internal". */
  specifier: string;
  /** Absolute path of the TypeScript source entry. */
  source: string;
  /** Entry name inside dist/, e.g. "internal" → dist/internal.js. */
  entryName: string;
  /** Absolute path of the bundled entry. */
  dist: string;
}

export interface WorkspacePackage {
  name: string;
  dir: string;
  exports: WorkspaceExport[];
}

/** Packages that are bundled. `@rtd/native` is a build tool + optional loader, not a runtime dep. */
const SKIP = new Set(["@rtd/native"]);

/** A string target, or the `import`/`default` branch of a conditional export. */
function resolveTarget(raw: unknown): string | undefined {
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    return resolveTarget(o.import) ?? resolveTarget(o.node) ?? resolveTarget(o.default);
  }
  return undefined;
}

export function workspacePackages(): WorkspacePackage[] {
  const out: WorkspacePackage[] = [];
  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(packagesDir, entry.name);
    const pkgPath = join(dir, "package.json");
    if (!existsSync(pkgPath)) continue;
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    if (SKIP.has(pkg.name)) continue;
    const exportsField: Record<string, unknown> =
      typeof pkg.exports === "string" ? { ".": pkg.exports } : (pkg.exports ?? {});
    const exports: WorkspaceExport[] = [];
    for (const [key, raw] of Object.entries(exportsField)) {
      const target = resolveTarget(raw);
      if (target === undefined || !target.endsWith(".ts") || target.endsWith(".d.ts")) continue;
      const source = join(dir, target);
      const rel = relative(join(dir, "src"), source).replace(/\.ts$/, "");
      exports.push({
        specifier: key === "." ? pkg.name : `${pkg.name}/${key.slice(2)}`,
        source,
        entryName: rel,
        dist: join(dir, "dist", `${rel}.js`),
      });
    }
    out.push({ name: pkg.name, dir, exports });
  }
  return out;
}
