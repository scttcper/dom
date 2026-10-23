// Vitest config for the end-to-end suite benchmark (driven by bench/suite/run.ts).
//
//   BENCH_ENV=jsdom | happy-dom | rtd | rtd-full
//
// `rtd` swaps only the environment (stock @testing-library/* on @rtd/dom). `rtd-full` also
// aliases the stock testing-library packages to the @rtd drop-ins, with the same test files.

import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const env = process.env.BENCH_ENV ?? "jsdom";
const workers = process.env.BENCH_WORKERS ? Number(process.env.BENCH_WORKERS) : undefined;
const root = fileURLToPath(new URL(".", import.meta.url));

const fullStackAliases = [
  { find: /^@testing-library\/react$/, replacement: "@rtd/react" },
  { find: /^@testing-library\/dom$/, replacement: "@rtd/testing-library" },
  { find: /^@testing-library\/user-event$/, replacement: "@rtd/user-event" },
  { find: /^@testing-library\/jest-dom\/vitest$/, replacement: "@rtd/jest-dom/vitest" },
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
    reporters: ["default", "./reporter.ts"],
    ...(workers ? { maxWorkers: workers } : {}),
  },
});
