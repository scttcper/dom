// Benchmark: role + accessible name for every element of a ~1000-element form.
//
//   node packages/aria/bench/role-name.ts            # driver: fresh process per sample, all engines
//   RULES=500 node packages/aria/bench/role-name.ts  # same with a 500-rule author style sheet
//   node --expose-gc packages/aria/bench/role-name.ts sample <engine>
//
// Engines:
//   rtd       @rtd/aria on @rtd/dom (warm passes hit the version-stamped name/hidden caches)
//   rtd-invalidated  same, but the document is mutated before every pass (no cache hits)
//   jsdom     Testing Library 10.4.2 getImplicitAriaRoles (aria-query 5.3.0) + dom-accessibility-api 0.5.16 on jsdom
//   happy-dom same upstream stack on happy-dom
//
// Each sample builds the document, then times (1) a cold pass and (2) the median of 20 warm
// passes over all elements: role (explicit first token or implicit) + computeAccessibleName,
// plus isInaccessible (what *ByRole does per candidate). Reports heap after GC and RSS.

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { $impl } from "@rtd/dom/internal";

const require = createRequire(import.meta.url);

/** RULES=N prepends a <style> with N author rules (a realistic mix; a few match form elements). */
function styleSheet(n: number): string {
  if (n === 0) return "";
  let css = "";
  for (let i = 0; i < n; i++) {
    switch (i % 5) {
      case 0: css += `.c${i} { color: red; margin: ${i % 7}px }\n`; break;
      case 1: css += `#id${i} > span { padding: 1px }\n`; break;
      case 2: css += `div.k${i} a[href] { text-decoration: none }\n`; break;
      case 3: css += `fieldset:nth-child(${(i % 9) + 1}) legend { font-weight: bold }\n`; break;
      default: css += `[data-r${i}] button, label .x${i} { display: inline-block }\n`;
    }
  }
  return `<style>${css}</style>`;
}

function formHtml(): string {
  let s = styleSheet(Number(process.env.RULES ?? 0)) + '<form aria-label="Big form">';
  for (let i = 0; i < 72; i++) {
    s += `<fieldset><legend>Group ${i}</legend>`;
    s += `<label for="t${i}">Text ${i}</label><input id="t${i}" type="text" value="v${i}">`;
    s += `<label>Check ${i} <input type="checkbox"></label>`;
    s += `<select aria-label="Select ${i}"><option>a</option><option selected>b</option></select>`;
    s += `<button type="button">Action <span>${i}</span></button>`;
    s += `<div><span>Help</span> <a href="#h${i}">more</a></div>`;
    s += `</fieldset>`;
  }
  return s + "</form>";
}

type Env = { invalidate?: () => void; body: any; elements: any[]; role(el: any): string; name(el: any): string; hidden(el: any): boolean };

async function setup(engine: string): Promise<Env> {
  const html = formHtml();
  if (engine.startsWith("rtd")) {
    const { createWindow } = await import("@rtd/dom");
    const aria = await import("@rtd/aria");
    const internal = await import("@rtd/aria/internal");
    const doc = createWindow().document;
    doc.body!.innerHTML = html;
    const elements = Array.from(doc.body!.querySelectorAll("form *")).map((e: any) => e[$impl]);
    void aria;
    let k = 0;
    return {
      // rtd-invalidated: mutate the document before every pass so no version-stamped cache hits.
      invalidate: engine.endsWith("invalidated") ? () => doc.body!.setAttribute("data-pass", String(k++)) : undefined,
      body: doc.body,
      elements,
      role: (el) => internal.tlRole(el),
      name: (el) => internal.computeAccessibleNameImpl(el, undefined, 5),
      hidden: (el) => internal.isInaccessibleImpl(el),
    };
  }
  const tlDir = require.resolve("@testing-library/dom/package.json").replace(/package\.json$/, "");
  const RH = require(tlDir + "dist/role-helpers.js");
  const daa = require("dom-accessibility-api");
  let doc: any;
  if (engine === "jsdom") {
    const { JSDOM } = require("jsdom");
    doc = new JSDOM("<!doctype html><html><body></body></html>").window.document;
  } else {
    const { Window } = require("happy-dom");
    doc = new Window().document;
  }
  doc.body.innerHTML = html;
  const elements = Array.from(doc.body.querySelectorAll("form *"));
  return {
    body: doc.body,
    elements,
    role: (el) => (el.hasAttribute("role") ? el.getAttribute("role").split(" ")[0] : (RH.getImplicitAriaRoles(el)[0] ?? "")),
    name: (el) => daa.computeAccessibleName(el, { computedStyleSupportsPseudoElements: false }),
    hidden: (el) => RH.isInaccessible(el),
  };
}

function pass(env: Env): number {
  env.invalidate?.();
  let n = 0;
  for (const el of env.elements) {
    n += env.role(el).length;
    n += env.name(el).length;
    if (env.hidden(el)) n++;
  }
  return n;
}

async function sample(engine: string): Promise<void> {
  const env = await setup(engine);
  let t = performance.now();
  pass(env);
  const cold = performance.now() - t;
  const warm: number[] = [];
  for (let i = 0; i < 20; i++) {
    t = performance.now();
    pass(env);
    warm.push(performance.now() - t);
  }
  warm.sort((a, b) => a - b);
  (globalThis as any).gc?.();
  const mem = process.memoryUsage();
  console.log(JSON.stringify({ engine, elements: env.elements.length, cold, warm: warm[10], heap: mem.heapUsed, rss: mem.rss }));
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function driver(): void {
  const self = fileURLToPath(import.meta.url);
  const samples = Number(process.env.SAMPLES ?? 7);
  const engines = (process.env.ENGINES ?? "rtd,rtd-invalidated,jsdom,happy-dom").split(",");
  const rows = new Map<string, any[]>(engines.map((e) => [e, []]));
  // Interleave engines within each round so machine-load drift hits all of them alike.
  for (let i = 0; i < samples; i++) {
    for (const engine of engines) {
      const r = spawnSync(process.execPath, ["--expose-gc", self, "sample", engine], { encoding: "utf8", env: process.env });
      if (r.status !== 0) {
        console.error(engine, r.stderr);
        continue;
      }
      rows.get(engine)!.push(JSON.parse(r.stdout.trim().split("\n").pop()!));
    }
  }
  for (const engine of engines) {
    const rs = rows.get(engine)!;
    if (rs.length === 0) continue;
    const f = (k: string) => rs.map((r) => r[k]);
    const spread = (k: string) => `${Math.min(...f(k)).toFixed(2)}–${Math.max(...f(k)).toFixed(2)}`;
    console.log(
      `${engine.padEnd(24)} n=${rs[0].elements} cold ${median(f("cold")).toFixed(2)} ms (${spread("cold")})  warm ${median(f("warm")).toFixed(3)} ms (${spread("warm")})  heap ${(median(f("heap")) / 2 ** 20).toFixed(1)} MB  rss ${(median(f("rss")) / 2 ** 20).toFixed(1)} MB`,
    );
  }
}

if (process.argv[2] === "sample") await sample(process.argv[3]);
else driver();
