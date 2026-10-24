// Vitest config of the suite benchmark (driven by suite.ts): the generated test files, one
// project per contender. Vitest's defaults otherwise (forks pool, a fresh worker per file), with
// a fixed worker count so runs are comparable.
//
//   COMPARE_WORKERS=4   Vitest workers (default 4)

import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { selectContenders } from "./contenders/index.ts";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  test: {
    projects: selectContenders(process.env.COMPARE_CONTENDERS).map((c) => ({
      resolve: { alias: c.alias ?? [] },
      test: {
        name: c.id,
        root,
        include: [".generated/*.test.tsx"],
        environment: c.environment,
        environmentOptions: c.environmentOptions ?? {},
        setupFiles: ["./lib/suite-setup.ts"],
        execArgv: (c.preload ?? []).flatMap((p) => ["--import", p]),
        server: { deps: { external: c.external ?? [] } },
      },
    })),
    maxWorkers: Number(process.env.COMPARE_WORKERS ?? 4),
    reporters: ["default", "./lib/suite-reporter.ts"],
  },
});
