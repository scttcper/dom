// `pnpm compare`: every comparison, then the report.
//
//   pnpm compare [--contenders jsdom,ctrl-dom] [--only bench,startup,suite] [--time 1000]
//                [--samples 10] [--suite-samples 3] [--files 100] [--workers 4] [--readme]
//
//   bench     Vitest bench (vitest.config.ts): DOM and React benchmarks, one project per contender
//   startup   cold start in fresh processes (startup.ts)
//   suite     `vitest run` over generated React test files (suite.ts)
//
// ctrl-dom runs from its bundles: `pnpm build` first (the contender checks). --readme also
// rewrites the README's benchmark table.

import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { selectContenders } from "./contenders/index.ts";
import { report } from "./report.ts";
import { startup } from "./startup.ts";
import { suite } from "./suite.ts";

const here = fileURLToPath(new URL(".", import.meta.url));

const { values } = parseArgs({
  options: {
    contenders: { type: "string" },
    only: { type: "string", default: "bench,startup,suite" },
    time: { type: "string", default: "1000" },
    samples: { type: "string", default: "10" },
    "suite-samples": { type: "string", default: "3" },
    files: { type: "string", default: "100" },
    workers: { type: "string", default: "4" },
    readme: { type: "boolean", default: false },
  },
});

const contenders = selectContenders(values.contenders);
for (const c of contenders) c.check?.();
const only = new Set(values.only.split(","));

if (only.has("bench")) {
  for (const c of contenders) rmSync(`${here}results/raw/${c.id}`, { recursive: true, force: true });
  const vitest = join(dirname(createRequire(import.meta.url).resolve("vitest/package.json")), "vitest.mjs");
  const result = spawnSync(process.execPath, [vitest, "bench", "--run", "--config", `${here}vitest.config.ts`], {
    cwd: here,
    stdio: "inherit",
    env: { ...process.env, COMPARE_CONTENDERS: contenders.map((c) => c.id).join(","), COMPARE_TIME: values.time },
  });
  if (result.status !== 0) throw new Error(`vitest bench exited ${result.status}`);
}
if (only.has("startup")) await startup(contenders, Number(values.samples));
if (only.has("suite")) await suite(contenders, { samples: Number(values["suite-samples"]), files: Number(values.files), workers: Number(values.workers) });

report({ readme: values.readme });
console.log(`\nwrote comparison/RESULTS.md${values.readme ? " and the README table" : ""}`);
