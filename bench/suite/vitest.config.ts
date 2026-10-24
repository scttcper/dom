// Vitest config for the end-to-end suite benchmark (driven by bench/suite/run.ts).
//
//   BENCH_ENV=jsdom | happy-dom | rtd | rtd-full | rtd-dist | rtd-full-dist
//
// `rtd` swaps only the environment (stock @testing-library/* on @rtd/dom). `rtd-full` also
// aliases the stock testing-library packages to the @rtd drop-ins, with the same test files.
// `*-dist` load the bundled dist/ builds (`pnpm build`) instead of the TypeScript sources —
// what users installing the packages get.

import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { distMapEnv, workspacePackages } from "../lib/packages.ts";

const benchEnv = process.env.BENCH_ENV ?? "jsdom";
const dist = benchEnv.endsWith("-dist");
const env = dist ? benchEnv.slice(0, -"-dist".length) : benchEnv;
const distPreload = new URL("../lib/dist-preload.js", import.meta.url).href;
const workers = process.env.BENCH_WORKERS ? Number(process.env.BENCH_WORKERS) : undefined;
// BENCH_POOL=vmForks|vmThreads|threads: Vitest pool (default: Vitest's, forks with per-file isolation).
const pool = process.env.BENCH_POOL || undefined;
const root = fileURLToPath(new URL(".", import.meta.url));

// In dist mode the aliases must point straight at the bundles: Vite resolves a bare `@rtd/*`
// through package.json exports (src/) and hands Node the absolute source path, which the dist
// resolution hook (keyed on bare specifiers) would never see.
const distEntry = new Map(workspacePackages().flatMap((p) => p.exports.map((e) => [e.specifier, e.dist] as const)));
const target = (specifier: string) => (dist ? distEntry.get(specifier)! : specifier);
const fullStackAliases = [
  { find: /^@testing-library\/react$/, replacement: target("@rtd/react") },
  { find: /^@testing-library\/dom$/, replacement: target("@rtd/testing-library") },
  { find: /^@testing-library\/user-event$/, replacement: target("@rtd/user-event") },
  { find: /^@testing-library\/jest-dom\/vitest$/, replacement: target("@rtd/jest-dom/vitest") },
];

export default defineConfig({
  root,
  resolve: { alias: env === "rtd-full" ? fullStackAliases : [] },
  test: {
    include: [".generated/*.test.tsx"],
    environment: env === "rtd-full" ? "rtd" : env,
    setupFiles: ["./setup.ts"],
    // Load @rtd/* and the environment through Node (type stripping) instead of Vite's module
    // runner, as a user installing the packages would get them.
    server: { deps: { external: [/@rtd\//, /vitest-environment-rtd/, /packages\/(dom|aria|testing-library|react|user-event|jest-dom|vitest-environment)\//] } },
    ...(dist ? { execArgv: ["--import", distPreload], env: distMapEnv() } : {}),
    reporters: ["default", "./reporter.ts"],
    ...(workers ? { maxWorkers: workers } : {}),
    ...(pool ? { pool: pool as "forks" } : {}),
  },
});
