// Workspace package discovery shared by the bundler (bench/bundle.ts) and the "dist" bench
// configurations (bench/lib/dist-hooks.ts), so both agree on where each export's bundle lives.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
export const packagesDir = join(repoRoot, "packages");

export interface WorkspaceExport {
  /** Full specifier, e.g. "@ctrl/dom/internal". */
  specifier: string;
  /** Absolute path of the TypeScript source entry. */
  source: string;
  /** Entry name inside dist/, e.g. "internal" → dist/internal.js. */
  entryName: string;
  /** Absolute path of the bundled entry. */
  dist: string;
}

export interface WorkspacePackage {
  /** The published name: @ctrl/dom's members are its subpaths ("@ctrl/dom/aria"). */
  name: string;
  dir: string;
  exports: WorkspaceExport[];
}

/** A string target, or the `import`/`default` branch of a conditional export. */
function resolveTarget(raw: unknown): string | undefined {
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    return resolveTarget(o.import) ?? resolveTarget(o.node) ?? resolveTarget(o.default);
  }
  return undefined;
}

/**
 * @ctrl/dom's members (packages without a name of their own) by what they export, from the root
 * package.json, which is @ctrl/dom inside the workspace: "./packages/aria/src/index.ts" → "@ctrl/dom/aria".
 */
function rootSpecifiers(): Map<string, string> {
  const root = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
  const out = new Map<string, string>();
  for (const [key, raw] of Object.entries<unknown>(root.exports ?? {})) {
    const target = resolveTarget(raw);
    if (target !== undefined) out.set(join(repoRoot, target), key === "." ? root.name : `${root.name}/${key.slice(2)}`);
  }
  return out;
}

export function workspacePackages(): WorkspacePackage[] {
  const out: WorkspacePackage[] = [];
  const members = rootSpecifiers();
  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(packagesDir, entry.name);
    const pkgPath = join(dir, "package.json");
    if (!existsSync(pkgPath)) continue;
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    const exportsField: Record<string, unknown> =
      typeof pkg.exports === "string" ? { ".": pkg.exports } : (pkg.exports ?? {});
    const exports: WorkspaceExport[] = [];
    for (const [key, raw] of Object.entries(exportsField)) {
      const target = resolveTarget(raw);
      if (target === undefined || !target.endsWith(".ts") || target.endsWith(".d.ts")) continue;
      const source = join(dir, target);
      const rel = relative(join(dir, "src"), source).replace(/\.ts$/, "");
      const specifier =
        pkg.name !== undefined ? (key === "." ? pkg.name : `${pkg.name}/${key.slice(2)}`) : members.get(source);
      if (specifier === undefined)
        throw new Error(`packages/${entry.name} exports ${key}, which the root package.json (@ctrl/dom) does not`);
      exports.push({
        specifier,
        source,
        entryName: rel,
        dist: join(dir, "dist", `${rel}.js`),
      });
    }
    out.push({
      name: pkg.name ?? exports.find((e) => e.entryName === "index")?.specifier ?? exports[0]?.specifier ?? entry.name,
      dir,
      exports,
    });
  }
  return out;
}

/** CTRL_DOM_DIST_MAP for lib/dist-preload.js: every workspace export's specifier → its bundle. */
export function distMapEnv(): { CTRL_DOM_DIST_MAP: string } {
  const map: Record<string, string> = {};
  for (const pkg of workspacePackages()) for (const e of pkg.exports) map[e.specifier] = e.dist;
  return { CTRL_DOM_DIST_MAP: JSON.stringify(map) };
}
