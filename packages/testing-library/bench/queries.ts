// Query microbenchmarks: @ctrl/dom/testing-library on @ctrl/dom vs stock @testing-library/dom@10.4.2
// on jsdom and on happy-dom.
//
//   node packages/testing-library/bench/queries.ts            # driver: all combos, fresh process per sample
//   node packages/testing-library/bench/queries.ts --worker ctrl-dom 1000 role
//
// Each worker process builds one form, warms the query up, then times it for ~MEASURE_MS and
// prints JSON {opsPerSec, usPerOp, heapUsedMB (after GC), rssMB}. The driver runs SAMPLES
// processes per combination and reports the median and min–max spread.
// Forms: groups of <div><label for><input data-testid><button><p></div> (5 elements/group).

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SAMPLES = Number(process.env.SAMPLES ?? 5);
const MEASURE_MS = Number(process.env.MEASURE_MS ?? 400);
const IMPLS = (process.env.IMPLS ?? "ctrl-dom,jsdom,happy-dom").split(",");
const SIZES = (process.env.SIZES ?? "100,1000").split(",").map(Number);
const QUERIES = (process.env.QUERIES ?? "role,label,text,testid").split(",");

function formHtml(elements: number): { html: string; last: number } {
  const groups = Math.max(1, Math.round(elements / 5));
  let html = "<form>";
  for (let i = 0; i < groups; i++) {
    html += `<div><label for="f${i}">Field ${i}</label><input id="f${i}" data-testid="t${i}"><button type="button">Action ${i}</button><p>Text ${i}</p></div>`;
  }
  return { html: html + "</form>", last: groups - 1 };
}

async function setup(impl: string, html: string): Promise<{ lib: any; container: any }> {
  if (impl === "ctrl-dom") {
    const { createWindow } = await import("@ctrl/dom");
    const lib = await import("../src/index.ts");
    const window: any = createWindow({ url: "http://localhost/" });
    window.document.body.innerHTML = html;
    return { lib, container: window.document.body };
  }
  const lib = await import("@testing-library/dom");
  if (impl === "jsdom") {
    const { JSDOM } = await import("jsdom");
    const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`);
    return { lib, container: dom.window.document.body };
  }
  if (impl === "happy-dom") {
    const { Window } = await import("happy-dom");
    const window: any = new Window({ url: "http://localhost/" });
    window.document.body.innerHTML = html;
    return { lib, container: window.document.body };
  }
  throw new Error(`unknown impl ${impl}`);
}

function makeQuery(lib: any, container: any, query: string, last: number): () => unknown {
  switch (query) {
    case "role":
      return () => lib.getByRole(container, "button", { name: `Action ${last}` });
    case "label":
      return () => lib.getByLabelText(container, `Field ${last}`);
    case "text":
      return () => lib.getByText(container, `Text ${last}`);
    case "testid":
      return () => lib.getByTestId(container, `t${last}`);
  }
  throw new Error(`unknown query ${query}`);
}

async function worker(impl: string, size: number, query: string): Promise<void> {
  const { html, last } = formHtml(size);
  const { lib, container } = await setup(impl, html);
  const run = makeQuery(lib, container, query, last);
  const first = run() as any;
  if (!first || first.nodeType !== 1) throw new Error("query did not return an element");
  // warm-up
  const warmEnd = performance.now() + MEASURE_MS / 4;
  while (performance.now() < warmEnd) run();
  let ops = 0;
  const start = performance.now();
  let now = start;
  while (now - start < MEASURE_MS) {
    run();
    ops++;
    if ((ops & 3) === 0 || ops < 8) now = performance.now();
  }
  now = performance.now();
  const elapsed = now - start;
  (globalThis as any).gc?.();
  const mem = process.memoryUsage();
  process.stdout.write(
    JSON.stringify({ usPerOp: (elapsed * 1000) / ops, ops, heapUsedMB: mem.heapUsed / 1048576, rssMB: mem.rss / 1048576 }) + "\n",
  );
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function fmt(us: number): string {
  return us >= 1000 ? `${(us / 1000).toFixed(2)} ms` : `${us.toFixed(1)} µs`;
}

function driver(): void {
  const self = fileURLToPath(import.meta.url);
  const rows: string[] = [];
  rows.push(`| query | elements | impl | median / op | spread (min–max) | heap after GC | RSS |`);
  rows.push(`| --- | --- | --- | --- | --- | --- | --- |`);
  for (const query of QUERIES) {
    for (const size of SIZES) {
      for (const impl of IMPLS) {
        const samples: { usPerOp: number; heapUsedMB: number; rssMB: number }[] = [];
        for (let i = 0; i < SAMPLES; i++) {
          const r = spawnSync(process.execPath, ["--expose-gc", self, "--worker", impl, String(size), query], { encoding: "utf8" });
          if (r.status !== 0) {
            process.stderr.write(`${impl} ${size} ${query} failed:\n${r.stderr}\n`);
            break;
          }
          samples.push(JSON.parse(r.stdout.trim().split("\n").at(-1)!));
        }
        if (samples.length === 0) {
          rows.push(`| ${query} | ${size} | ${impl} | failed | | | |`);
          continue;
        }
        const us = samples.map((s) => s.usPerOp);
        rows.push(
          `| ${query} | ${size} | ${impl} | ${fmt(median(us))} | ${fmt(Math.min(...us))} – ${fmt(Math.max(...us))} | ${median(samples.map((s) => s.heapUsedMB)).toFixed(1)} MB | ${median(samples.map((s) => s.rssMB)).toFixed(1)} MB |`,
        );
        process.stderr.write(rows.at(-1) + "\n");
      }
    }
  }
  process.stdout.write(rows.join("\n") + "\n");
}

const args = process.argv.slice(2);
if (args[0] === "--worker") {
  await worker(args[1], Number(args[2]), args[3]);
} else {
  driver();
}
