// Cold start: environment setup and the first test, in a fresh process per sample, contenders
// interleaved. Writes results/startup.json.
//
//   node comparison/startup.ts [--contenders jsdom,ctrl-dom] [--samples 10]

import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { selectContenders, type Contender } from "./contenders/index.ts";
import { interleave, run, spread } from "./lib/spawn.ts";

const here = fileURLToPath(new URL(".", import.meta.url));

interface Sample {
  setupMs: number;
  firstTestMs: number;
  heapMB: number;
  rssMB: number;
}

export async function startup(contenders: Contender[], samples: number): Promise<void> {
  const raw = new Map<string, Sample[]>(contenders.map((c) => [c.id, []]));
  for (let s = 0; s < samples; s++) {
    for (const c of interleave(contenders, s)) {
      const args = ["--expose-gc", "--no-warnings", ...(c.preload ?? []).flatMap((p) => ["--import", p]), `${here}lib/startup-worker.ts`, c.id];
      const exit = await run(process.execPath, args, { cwd: here, env: { ...process.env, ...c.env }, timeoutMs: 120_000 });
      const line = exit.stdout.split("\n").findLast((l) => l.startsWith("@@RESULT "));
      if (line === undefined) throw new Error(`startup ${c.id} failed (exit ${exit.code}):\n${exit.stderr.trim().split("\n").slice(-8).join("\n")}`);
      raw.get(c.id)!.push(JSON.parse(line.slice("@@RESULT ".length)));
    }
    process.stderr.write(`startup: sample ${s + 1}/${samples}\n`);
  }
  const results = Object.fromEntries(
    [...raw].map(([id, xs]) => [
      id,
      {
        setupMs: spread(xs.map((x) => x.setupMs)),
        firstTestMs: spread(xs.map((x) => x.firstTestMs)),
        totalMs: spread(xs.map((x) => x.setupMs + x.firstTestMs)),
        heapMB: spread(xs.map((x) => x.heapMB)),
        rssMB: spread(xs.map((x) => x.rssMB)),
      },
    ]),
  );
  mkdirSync(`${here}results`, { recursive: true });
  writeFileSync(`${here}results/startup.json`, `${JSON.stringify({ samples, results }, null, 2)}\n`);
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { contenders: { type: "string" }, samples: { type: "string", default: "10" } } });
  const contenders = selectContenders(values.contenders);
  for (const c of contenders) c.check?.();
  await startup(contenders, Number(values.samples));
}
