// Vitest globalSetup for the benchmark projects (vitest.config.ts): when the run ends, record its
// date, machine and versions next to each contender's results in results/raw/<contender>/_run.json
// (per contender, because a run limited to some contenders keeps the others' earlier results).

import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { selectContenders } from "../contenders/index.ts";
import { runInfo } from "./run-info.ts";

const raw = fileURLToPath(new URL("../results/raw/", import.meta.url));

export function teardown(): void {
  const contenders = selectContenders(process.env.COMPARE_CONTENDERS);
  const info = runInfo(contenders);
  for (const c of contenders) {
    const dir = join(raw, c.id);
    if (existsSync(dir)) writeFileSync(join(dir, "_run.json"), `${JSON.stringify(info, null, 2)}\n`);
  }
}
