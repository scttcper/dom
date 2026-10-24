// Native (scriptc + Node-API) and wasm (scriptc wasm32-wasi reactor) vs JS (same TypeScript on V8)
// per module, warm and cold, one fresh process per sample, implementations interleaved (rotated
// per sample). Results are checked equal across impls.
//
//   node scripts/bench.ts [--samples 5] [--ops html-large,css-large] [--modes warm,cold] [--impls js,native,wasm]
//
// Requires dist/rtd-native.node (`node scripts/build.ts`) and, for wasm, dist/rtd.wasm
// (`node scripts/build.ts --target wasm32-wasi`).

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
    impls: { type: "string", default: "js,native" },
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
      const list = flags.impls.split(",");
      const impls = list.map((_, i) => list[(i + s) % list.length]);
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

const list = flags.impls.split(",");
const others = list.filter((x) => x !== "js");
const range = (rs: R[]) => `${f(med(rs.map((r) => r.ms)))} [${f(Math.min(...rs.map((r) => r.ms)))}–${f(Math.max(...rs.map((r) => r.ms)))}]`;
console.log(`| op | mode | ${list.map((x) => `${x} ms`).join(" | ")} | ${others.map((x) => `${x}/JS`).join(" | ")} | cold incl. load ${list.join(" / ")} | ${list.map((x) => `${x} RSS MB`).join(" | ")} | same result |`);
console.log(`| --- | --- | ${[...list, ...others, "load", ...list].map(() => "---:").join(" | ")} | --- |`);
for (const op of flags.ops.split(",")) {
  for (const mode of flags.modes.split(",")) {
    const pick = (impl: string) => results.filter((r) => r.op === op && r.mode === mode && r.impl === impl);
    const by = list.map(pick);
    const jm = med(pick("js").map((r) => r.ms));
    const first = by.flat().find((r) => !r.error);
    const same = by.every((rs) => rs.length && rs.every((r) => JSON.stringify(r.result) === JSON.stringify(first?.result)));
    const err = by.flat().find((r) => r.error)?.error;
    console.log(
      `| ${op} | ${mode} | ${by.map(range).join(" | ")} | ${others.map((x) => `${f(med(pick(x).map((r) => r.ms)) / jm)}×`).join(" | ")} | ${mode === "cold" ? by.map((rs) => f(med(rs.map((r) => r.coldWithLoadMs ?? NaN)))).join(" / ") : ""} | ${by.map((rs) => f(med(rs.map((r) => r.rssMB)))).join(" | ")} | ${same ? "yes" : err ? `error: ${err.slice(0, 80)}` : "NO"} |`,
    );
  }
}
console.log(`\nload (module import / dlopen + init / wasm compile + instantiate): ${list.map((x) => `${x} ${f(med(results.filter((r) => r.impl === x).map((r) => r.loadMs)))} ms`).join("; ")}`);
