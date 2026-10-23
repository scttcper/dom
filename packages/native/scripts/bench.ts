// Native (scriptc + Node-API) vs JS (same TypeScript on V8) per module, warm and cold, one fresh
// process per sample, implementations interleaved. Results are checked equal across impls.
//
//   node scripts/bench.ts [--samples 5] [--ops html-large,css-large] [--modes warm,cold]
//
// Requires dist/rtd-native.node (`node scripts/build.ts`).

import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const here = fileURLToPath(new URL(".", import.meta.url));
const { values: flags } = parseArgs({
  options: {
    samples: { type: "string", default: "5" },
    ops: {
      type: "string",
      default:
        "noop,html-large,html-fragment-x200,html-tokens-large,css-large,css-inline-x10k,selector-x10k,selector-batch-10k,entities-attr-x100k,entities-text-1mb",
    },
    modes: { type: "string", default: "warm,cold" },
  },
});

interface R {
  impl: string;
  op: string;
  mode: string;
  ms: number;
  result: unknown;
  rssMB: number;
  loadMs: number;
  coldWithLoadMs?: number;
  error?: string;
}

const samples = Number(flags.samples);
const results: R[] = [];
for (let s = 0; s < samples; s++) {
  for (const op of flags.ops.split(",")) {
    for (const mode of flags.modes.split(",")) {
      const impls = s % 2 ? ["native", "js"] : ["js", "native"];
      for (const impl of impls) {
        const p = spawnSync(process.execPath, ["--no-warnings", join(here, "bench-worker.ts"), impl, op, mode], {
          encoding: "utf8",
          maxBuffer: 64 * 2 ** 20,
        });
        const line = p.stdout.split("\n").find((l) => l.startsWith("@@RESULT "));
        if (!line) {
          results.push({ impl, op, mode, ms: NaN, result: null, rssMB: NaN, loadMs: NaN, error: p.stderr.trim().split("\n").slice(-3).join(" ") });
          continue;
        }
        results.push(JSON.parse(line.slice(9)));
      }
    }
  }
  process.stderr.write(`sample ${s + 1}/${samples} done\n`);
}

const med = (xs: number[]) => {
  const a = xs.filter(Number.isFinite).sort((x, y) => x - y);
  return a.length ? a[a.length >> 1] : NaN;
};
const f = (x: number) => (Number.isFinite(x) ? (x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2)) : "–");

console.log("| op | mode | JS ms | native ms | native/JS | incl. module load JS / native | JS RSS MB | native RSS MB | same result |");
console.log("| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |");
for (const op of flags.ops.split(",")) {
  for (const mode of flags.modes.split(",")) {
    const pick = (impl: string) => results.filter((r) => r.op === op && r.mode === mode && r.impl === impl);
    const j = pick("js");
    const n = pick("native");
    const jm = med(j.map((r) => r.ms));
    const nm = med(n.map((r) => r.ms));
    const same = j.length && n.length && j.every((r) => JSON.stringify(r.result) === JSON.stringify(n[0].result));
    const err = [...j, ...n].find((r) => r.error)?.error;
    console.log(
      `| ${op} | ${mode} | ${f(jm)} [${f(Math.min(...j.map((r) => r.ms)))}–${f(Math.max(...j.map((r) => r.ms)))}] | ${f(nm)} [${f(Math.min(...n.map((r) => r.ms)))}–${f(Math.max(...n.map((r) => r.ms)))}] | ${f(nm / jm)}× | ${mode === "cold" ? `${f(med(j.map((r) => r.coldWithLoadMs ?? NaN)))} / ${f(med(n.map((r) => r.coldWithLoadMs ?? NaN)))}` : ""} | ${f(med(j.map((r) => r.rssMB)))} | ${f(med(n.map((r) => r.rssMB)))} | ${same ? "yes" : err ? `error: ${err.slice(0, 80)}` : "NO"} |`,
    );
  }
}
const loads = results.filter((r) => r.impl === "native").map((r) => r.loadMs);
const jsLoads = results.filter((r) => r.impl === "js").map((r) => r.loadMs);
console.log(`\naddon load (dlopen + init) median ${f(med(loads))} ms; JS module import median ${f(med(jsLoads))} ms`);
