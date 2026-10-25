// Forms performance comparison: @ctrl/dom vs jsdom vs happy-dom.
//
//   node packages/dom/test/perf/forms-perf.ts            # all implementations, 7 samples each
//   node packages/dom/test/perf/forms-perf.ts --samples 11
//
// Each sample runs in a fresh Node process (`--child <impl>`), so JIT state and heap growth do
// not leak between implementations. Reports the median and min–max per operation in ms, and
// heap after GC + RSS at the end of the sample (median). Not a vitest file on purpose
// (bench/README.md: fresh process per sample, medians and spread, memory next to time).

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

type Impl = "ctrl-dom" | "jsdom" | "happy-dom";
const IMPLS: Impl[] = ["ctrl-dom", "jsdom", "happy-dom"];

// biome-ignore lint: untyped DOM surface
type AnyWindow = any;

async function makeWindow(impl: Impl): Promise<AnyWindow> {
  if (impl === "ctrl-dom") {
    const { createWindow } = await import("@ctrl/dom");
    return createWindow({ url: "http://localhost/" });
  }
  if (impl === "jsdom") {
    const { JSDOM } = await import("jsdom");
    return new JSDOM("<!doctype html><html><head></head><body></body></html>", { url: "http://localhost/" }).window;
  }
  const { Window } = await import("happy-dom");
  const w = new Window({ url: "http://localhost/" });
  w.document.write("<!doctype html><html><head></head><body></body></html>");
  return w;
}

/** A 40-field form built the way React builds DOM: createElement + setAttribute + appendChild. */
function buildForm(doc: AnyWindow): AnyWindow {
  const form = doc.createElement("form");
  for (let i = 0; i < 40; i++) {
    const wrap = doc.createElement("div");
    const label = doc.createElement("label");
    label.setAttribute("for", "f" + i);
    label.appendChild(doc.createTextNode("Field " + i));
    wrap.appendChild(label);
    let field: AnyWindow;
    switch (i % 5) {
      case 0:
      case 1:
        field = doc.createElement("input");
        field.setAttribute("type", i % 5 === 0 ? "text" : "email");
        field.setAttribute("required", "");
        field.setAttribute("value", "v" + i + "@x.test");
        break;
      case 2:
        field = doc.createElement("input");
        field.setAttribute("type", "checkbox");
        if (i % 2 === 0) field.setAttribute("checked", "");
        break;
      case 3:
        field = doc.createElement("select");
        for (let j = 0; j < 5; j++) {
          const o = doc.createElement("option");
          o.setAttribute("value", "o" + j);
          o.appendChild(doc.createTextNode("Option " + j));
          field.appendChild(o);
        }
        break;
      default:
        field = doc.createElement("textarea");
        field.appendChild(doc.createTextNode("text " + i));
    }
    field.setAttribute("id", "f" + i);
    field.setAttribute("name", "f" + i);
    wrap.appendChild(field);
    form.appendChild(wrap);
  }
  const button = doc.createElement("button");
  button.appendChild(doc.createTextNode("Submit"));
  form.appendChild(button);
  doc.body.appendChild(form);
  return form;
}

function time(fn: () => void): number {
  const t0 = performance.now();
  fn();
  return performance.now() - t0;
}

async function child(impl: Impl): Promise<void> {
  const window = await makeWindow(impl);
  const doc = window.document;
  const results: Record<string, number> = {};

  // Warm-up (small) so we measure steady state, not first-call compilation alone.
  for (let i = 0; i < 5; i++) buildForm(doc).remove();

  results["build 40-field form ×100"] = time(() => {
    for (let i = 0; i < 100; i++) buildForm(doc).remove();
  });

  const form = buildForm(doc);
  const text = doc.getElementById("f0");
  const checkbox = doc.getElementById("f2");
  const select = doc.getElementById("f3");
  const textarea = doc.getElementById("f4");

  results["input.value = … ×1000"] = time(() => {
    for (let i = 0; i < 1000; i++) {
      text.value = "value " + i;
      if (text.value.length === 0) throw new Error("unreachable");
    }
  });
  results["textarea.value = … ×1000"] = time(() => {
    for (let i = 0; i < 1000; i++) textarea.value = "line\n" + i;
  });
  results["checkbox.checked toggle ×1000"] = time(() => {
    for (let i = 0; i < 1000; i++) checkbox.checked = !checkbox.checked;
  });
  results["select.value = … ×1000"] = time(() => {
    for (let i = 0; i < 1000; i++) {
      select.value = "o" + (i % 5);
      if (select.selectedIndex !== i % 5) throw new Error("select.value mismatch");
    }
  });
  results["new FormData(form) ×200"] = time(() => {
    for (let i = 0; i < 200; i++) new window.FormData(form);
  });
  results["form.checkValidity() ×200"] = time(() => {
    for (let i = 0; i < 200; i++) form.checkValidity();
  });
  results["form.elements + labels ×200"] = time(() => {
    for (let i = 0; i < 200; i++) {
      const els = form.elements;
      for (let j = 0; j < els.length; j++) if (els[j].labels && els[j].labels.length > 1) throw new Error("labels");
    }
  });

  (globalThis as { gc?: () => void }).gc?.();
  const mem = process.memoryUsage();
  results["heap after GC (MB)"] = mem.heapUsed / 1048576;
  results["rss (MB)"] = mem.rss / 1048576;
  process.stdout.write(JSON.stringify(results));
  if (impl === "jsdom" || impl === "happy-dom") window.close?.();
}

function median(xs: number[]): number {
  const s = xs.slice().sort((a, b) => a - b);
  return s[s.length >> 1];
}

function main(): void {
  const samplesArg = process.argv.indexOf("--samples");
  const samples = samplesArg === -1 ? 7 : Number(process.argv[samplesArg + 1]);
  const file = fileURLToPath(import.meta.url);
  const all: Record<Impl, Record<string, number[]>> = { "ctrl-dom": {}, jsdom: {}, "happy-dom": {} };
  for (let s = 0; s < samples; s++) {
    for (const impl of IMPLS) {
      const out = execFileSync(process.execPath, ["--expose-gc", file, "--child", impl], { encoding: "utf8", maxBuffer: 1 << 24 });
      const r = JSON.parse(out) as Record<string, number>;
      for (const [k, v] of Object.entries(r)) (all[impl][k] ??= []).push(v);
    }
  }
  const ops = Object.keys(all["ctrl-dom"]);
  const fmt = (xs: number[]) => `${median(xs).toFixed(2)} (${Math.min(...xs).toFixed(2)}–${Math.max(...xs).toFixed(2)})`;
  const rows = ops.map((op) => [op, ...IMPLS.map((impl) => fmt(all[impl][op])), (median(all.jsdom[op]) / median(all["ctrl-dom"][op])).toFixed(1) + "×", (median(all["happy-dom"][op]) / median(all["ctrl-dom"][op])).toFixed(1) + "×"]);
  const header = ["operation (median ms, min–max)", ...IMPLS, "jsdom/ctrl-dom", "happy/ctrl-dom"];
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (r: string[]) => "| " + r.map((c, i) => c.padEnd(widths[i])).join(" | ") + " |";
  console.log(`Node ${process.version}, ${samples} samples per implementation (fresh process each)\n`);
  console.log(line(header));
  console.log("|" + widths.map((w) => "-".repeat(w + 2)).join("|") + "|");
  for (const r of rows) console.log(line(r));
}

const childIdx = process.argv.indexOf("--child");
if (childIdx !== -1) await child(process.argv[childIdx + 1] as Impl);
else main();
