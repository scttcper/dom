// @ctrl/dom from this repository's bundles (packages/*/dist, `pnpm build`): what installing the
// package gets, rather than the TypeScript sources Node would strip on every import. Two
// contenders share the DOM:
//
//   ctrl-dom        the environment alone; stock @testing-library/* (swap only the DOM)
//   ctrl-dom-stack  plus @ctrl/dom's Testing Library, user-event and jest-dom (the whole stack)
//
// The resolve hook in bench/lib/dist-hooks.ts sends bare `@rtd/*` imports (the bundles' own) to
// dist/; the aliases send test files' imports straight to the bundles.

import { execFileSync } from "node:child_process";
import { existsSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { workspacePackages, repoRoot } from "../../bench/lib/packages.ts";
import type { Contender } from "./types.ts";

const dist = new Map(workspacePackages().flatMap((p) => p.exports.map((e) => [e.specifier, e.dist] as const)));
const bundle = (specifier: string): string => {
  const path = dist.get(specifier);
  if (path === undefined) throw new Error(`no workspace export ${specifier}`);
  return path;
};

const environment = bundle("vitest-environment-rtd");
const preload = [new URL("../lib/dist-preload.ts", import.meta.url).pathname];
const external = [/[\\/]packages[\\/](dom|aria|testing-library|react|user-event|jest-dom|vitest-environment)[\\/]dist[\\/]/];

function version(): string {
  const sha = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
  const dirty = execFileSync("git", ["status", "--porcelain", "--", "packages"], { cwd: repoRoot, encoding: "utf8" }).trim() !== "";
  return `${sha}${dirty ? "+changes" : ""}`;
}

/** Every bundle exists and is newer than its package's sources. */
function check(): void {
  for (const pkg of workspacePackages()) {
    const entry = pkg.exports[0]?.dist;
    if (entry === undefined || !/[\\/]packages[\\/](dom|aria|testing-library|react|user-event|jest-dom|vitest-environment)[\\/]/.test(entry)) continue;
    if (!existsSync(entry)) throw new Error(`${pkg.name}: ${entry} is missing — run \`pnpm build\` first`);
    const src = join(pkg.dir, "src");
    const newest = Math.max(...readdirSync(src, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => statSync(join(e.parentPath, e.name)).mtimeMs));
    if (newest > statSync(entry).mtimeMs) throw new Error(`${pkg.name}: dist/ is older than src/ — run \`pnpm build\` first`);
  }
}

const loadEnvironment = async () => (await import(pathToFileURL(environment).href)).default;

export const ctrlDom: Contender = {
  id: "ctrl-dom",
  label: "ctrl-dom",
  version,
  environment,
  preload,
  external,
  loadEnvironment,
  imports: { react: "@testing-library/react", userEvent: "@testing-library/user-event" },
  check,
};

export const ctrlDomStack: Contender = {
  id: "ctrl-dom-stack",
  label: "ctrl-dom + its Testing Library",
  version,
  environment,
  preload,
  external,
  // What `ctrlDom()` (@ctrl/dom/vitest) configures when it routes Testing Library to @ctrl/dom.
  environmentOptions: { "ctrl-dom": { compileCache: true } },
  alias: [
    { find: /^@testing-library\/react$/, replacement: bundle("@rtd/react") },
    { find: /^@testing-library\/dom$/, replacement: bundle("@rtd/testing-library") },
    { find: /^@testing-library\/user-event$/, replacement: bundle("@rtd/user-event") },
    { find: /^@testing-library\/jest-dom\/vitest$/, replacement: bundle("@rtd/jest-dom/vitest") },
  ],
  loadEnvironment,
  imports: { react: "@rtd/react", userEvent: "@rtd/user-event" },
  sameDomAs: "ctrl-dom",
  check,
};
