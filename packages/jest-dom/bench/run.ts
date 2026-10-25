// jest-dom matcher benchmark: @ctrl/dom/jest-dom on @ctrl/dom vs stock @testing-library/jest-dom
// on jsdom and happy-dom. Fresh process per sample; median (min–max).
//   node packages/jest-dom/bench/run.ts [samples=7]
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const samples = Number(process.argv[2] ?? 7);
const worker = fileURLToPath(new URL("./worker.ts", import.meta.url));
const iterations = 2000;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const fmt = (xs: number[], d = 3) =>
  `${median(xs).toFixed(d)} (${Math.min(...xs).toFixed(d)}–${Math.max(...xs).toFixed(d)})`;

console.log(`### 10 jest-dom assertions on a login form (${iterations} iterations/sample, ${samples} samples)`);
console.log("| stack | ms/iteration | setup ms | heap MB | rss MB |");
console.log("| --- | --- | --- | --- | --- |");
for (const stack of ["ctrl-dom", "jsdom", "happy-dom"]) {
  const runs: any[] = [];
  try {
    for (let i = 0; i < samples; i++) {
      const out = execFileSync(process.execPath, ["--expose-gc", worker, stack, String(iterations)], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      runs.push(JSON.parse(out.trim().split("\n").at(-1)!));
    }
  } catch (error) {
    const msg =
      String((error as { stderr?: string }).stderr ?? error)
        .split("\n")
        .find((l) => /Error/.test(l)) ?? "failed";
    console.log(`| ${stack} | n/a: ${msg.trim().slice(0, 140)} | | | |`);
    continue;
  }
  console.log(
    `| ${stack} | ${fmt(runs.map((r) => r.perIterationMs))} | ${fmt(
      runs.map((r) => r.setupMs),
      0,
    )} | ${fmt(
      runs.map((r) => r.heapUsedMB),
      1,
    )} | ${fmt(
      runs.map((r) => r.rssMB),
      0,
    )} |`,
  );
}
