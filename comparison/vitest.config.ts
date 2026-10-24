// One Vitest project per contender (contenders/index.ts), all running the same benchmark files:
// `vitest bench` prints a cross-project table per benchmark, and report.ts reads the results
// each project writes to results/raw/<project>/.
//
//   COMPARE_CONTENDERS=jsdom,ctrl-dom   only these contenders
//   COMPARE_TIME=1000                   time budget per benchmark, ms (after warmup)
//
// Projects run one at a time (fileParallelism: false), so contenders never compete for CPU.

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
        include: [],
        benchmark: { include: ["benches/*.bench.{ts,tsx}"] },
        environment: c.environment,
        environmentOptions: c.environmentOptions ?? {},
        provide: { contender: c.id, sameDomAs: c.sameDomAs ?? null },
        execArgv: (c.preload ?? []).flatMap((p) => ["--import", p]),
        server: { deps: { external: c.external ?? [] } },
        testTimeout: 120_000,
      },
    })),
    fileParallelism: false,
    maxWorkers: 1,
  },
});
