// Benchmarks @rtd/react + @rtd/jest-dom vs stock @testing-library/* on jsdom and happy-dom.
// Fresh process per sample; reports median and min–max of per-iteration time, setup
// (environment + library import) time, heap after GC and RSS.
//
//   node packages/react/bench/run.ts [samples=7] [stacks=rtd,jsdom,happy-dom]
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const samples = Number(process.argv[2] ?? 7);
const stacks = (process.argv[3] ?? "rtd,jsdom,happy-dom").split(",");
const worker = fileURLToPath(new URL("./worker.ts", import.meta.url));
const scenarios: Array<[string, number]> = [
  ["tree", 100],
  ["form", 200],
];

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const fmt = (xs: number[], digits = 3) => `${median(xs).toFixed(digits)} (${Math.min(...xs).toFixed(digits)}–${Math.max(...xs).toFixed(digits)})`;

for (const [scenario, iterations] of scenarios) {
  console.log(`\n### ${scenario} (${iterations} iterations/sample, ${samples} samples)`);
  console.log("| stack | ms/iteration | setup ms | heap MB | rss MB |");
  console.log("| --- | --- | --- | --- | --- |");
  for (const stack of stacks) {
    const runs: Array<{ setupMs: number; perIterationMs: number; heapUsedMB: number; rssMB: number }> = [];
    try {
      for (let i = 0; i < samples; i++) {
        const out = execFileSync(process.execPath, ["--expose-gc", "--conditions=development", worker, stack, scenario, String(iterations)], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          env: { ...process.env, NODE_ENV: "development" },
        });
        runs.push(JSON.parse(out.trim().split("\n").at(-1)!));
      }
    } catch (error) {
      const msg = String((error as { stderr?: string }).stderr ?? error).split("\n").find((l) => /Error/.test(l)) ?? "failed";
      console.log(`| ${stack} | n/a: ${msg.trim().slice(0, 120)} | | | |`);
      continue;
    }
    console.log(
      `| ${stack} | ${fmt(runs.map((r) => r.perIterationMs))} | ${fmt(runs.map((r) => r.setupMs), 0)} | ${fmt(runs.map((r) => r.heapUsedMB), 1)} | ${fmt(runs.map((r) => r.rssMB), 0)} |`,
    );
  }
}
