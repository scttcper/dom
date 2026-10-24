// Reproduces the V8 startup snapshot experiment (bench/README.md, "Worker startup"): builds a
// userland snapshot (https://nodejs.org/api/cli.html#--build-snapshot-entry) holding the evaluated
// @rtd/dom bundle, then times a fresh process that imports the DOM, creates a window and installs
// it as the global, with and without the snapshot.
//
//   pnpm build && node bench/startup-snapshot.ts [--samples 15] [--warm] [--keep]
//
//   --warm   exercise the DOM (create windows, parse, query, dispatch) before snapshotting, so
//            the functions a first test calls are compiled in the blob
//   --keep   print and keep the temp directory (blob, entry, child script); `--snapshot-blob
//            <dir>/dom.blob` then works with any command, e.g. COMPARE_EXEC_ARGV for
//            comparison/suite.config.ts to run the Vitest suite from it
//
// The blob is only valid for the exact Node binary that built it (Node refuses to start from a
// blob built by another version), so it is built here, never stored.
//
// How the snapshot reaches importers: the entry puts the evaluated modules on globalThis and, at
// deserialization (v8.startupSnapshot.addDeserializeCallback), registers a module.registerHooks
// `load` hook that answers the dist entries' URLs with `export const { ... } = <snapshot module>`,
// so every `import "@rtd/dom"` in the process (environment, test code, Testing Library bundles)
// gets the snapshot instance without evaluating the bundle.

import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { build } from "rolldown";
import { repoRoot } from "./lib/packages.ts";
import { fmt, summarize } from "./lib/stats.ts";

const { values: flags } = parseArgs({
  options: { samples: { type: "string", default: "15" }, warm: { type: "boolean", default: false }, keep: { type: "boolean", default: false } },
});

const distIndex = join(repoRoot, "packages/dom/dist/index.js");
const distInternal = join(repoRoot, "packages/dom/dist/internal.js");
statSync(distIndex); // run `pnpm build` first
const dir = mkdtempSync(join(tmpdir(), "rtd-snapshot-"));

const warmup = `
for (let i = 0; i < 3; i++) {
  const w = dom.createWindow({ url: "http://localhost:3000/" });
  const d = w.document;
  d.body.innerHTML = '<main><h1>T</h1><form aria-label="f"><label>Name <input name="a"></label><label><input type="checkbox"> c</label><select><option>1</option></select><textarea></textarea><button type="submit">Go</button></form><ul><li class="x">a</li><li>b</li></ul></main>';
  const b = d.querySelector("button");
  d.querySelectorAll("li.x, [aria-label], input:not([type=checkbox])");
  w.getComputedStyle(b).display;
  b.addEventListener("click", (e) => e.preventDefault());
  b.click();
  b.focus();
  d.body.textContent = "";
  w.close();
}`;

writeFileSync(
  join(dir, "entry.mjs"),
  `import * as dom from ${JSON.stringify(distIndex)};
import * as internal from ${JSON.stringify(distInternal)};
import { startupSnapshot } from "node:v8";
import { registerHooks } from "node:module";
const KEY = Symbol.for("rtd.dom.snapshot");
globalThis[KEY] = { dom, internal };
// A deserialized userland snapshot comes back without console.Console (Node 26.12), which
// Vitest's worker needs (new Console(...) for its console interception): put it back.
const ConsoleCtor = console.Console;
${flags.warm ? warmup : ""}
const targets = new Map([
  [${JSON.stringify(pathToFileURL(distIndex).href)}, ["dom", Object.keys(dom)]],
  [${JSON.stringify(pathToFileURL(distInternal).href)}, ["internal", Object.keys(internal)]],
]);
startupSnapshot.addDeserializeCallback(() => {
  if (console.Console === undefined) Object.defineProperty(console, "Console", { value: ConsoleCtor, writable: true, enumerable: true, configurable: true });
  registerHooks({
    load(url, context, next) {
      const target = targets.get(url);
      if (target === undefined) return next(url, context);
      return { format: "module", shortCircuit: true, source: "const m = globalThis[Symbol.for('rtd.dom.snapshot')]." + target[0] + "; export const { " + target[1].join(", ") + " } = m;" };
    },
  });
});
`,
);

// The child: one cold sample. Plain JavaScript, so the process never loads the type stripper.
writeFileSync(
  join(dir, "child.mjs"),
  `const now = () => performance.now();
const boot = now();
const [dom, internal] = await Promise.all([import(${JSON.stringify(distIndex)}), import(${JSON.stringify(distInternal)})]);
const imported = now();
const window = dom.createWindow({ compat: "jsdom-30", url: "http://localhost:3000/" });
const created = now();
dom.installGlobals(window, globalThis);
const installed = now();
document.body.innerHTML = "<form><label>Name <input></label><button>Go</button></form>";
if (document.querySelector("button").textContent !== "Go") throw new Error("broken DOM");
const used = now();
globalThis.gc?.();
globalThis.gc?.();
const m = process.memoryUsage();
console.log(JSON.stringify({ snapshot: globalThis[Symbol.for("rtd.dom.snapshot")] !== undefined, bootMs: boot, importMs: imported - boot, createWindowMs: created - imported, installGlobalsMs: installed - created, firstUseMs: used - installed, totalMs: used, heapMB: m.heapUsed / 2 ** 20, rssMB: m.rss / 2 ** 20 }));
`,
);

let t = performance.now();
await build({ input: join(dir, "entry.mjs"), platform: "node", logLevel: "warn", output: { file: join(dir, "entry.cjs"), format: "cjs" } });
const bundleMs = performance.now() - t;
t = performance.now();
execFileSync(process.execPath, ["--snapshot-blob", join(dir, "dom.blob"), "--build-snapshot", join(dir, "entry.cjs")], { stdio: "inherit" });
const blobMs = performance.now() - t;
// A snapshot of Node alone, to separate Node's own heap from the DOM's in the blob size.
writeFileSync(join(dir, "empty.cjs"), "globalThis.__empty = true;\n");
execFileSync(process.execPath, ["--snapshot-blob", join(dir, "empty.blob"), "--build-snapshot", join(dir, "empty.cjs")]);
const mb = (file: string) => (statSync(join(dir, file)).size / 2 ** 20).toFixed(1);
console.log(`CJS entry ${mb("entry.cjs")} MB (rolldown ${bundleMs.toFixed(0)} ms); blob ${mb("dom.blob")} MB (Node alone: ${mb("empty.blob")} MB), built in ${blobMs.toFixed(0)} ms${flags.warm ? " (warmed)" : ""}`);

const cache = join(dir, "compile-cache");
const variants = [
  { name: "no compile cache", args: [], env: { NODE_DISABLE_COMPILE_CACHE: "1" } },
  { name: "compile cache", args: [], env: { NODE_COMPILE_CACHE: cache } },
  { name: "snapshot", args: ["--snapshot-blob", join(dir, "dom.blob")], env: { NODE_DISABLE_COMPILE_CACHE: "1" } },
  { name: "empty snapshot", args: ["--snapshot-blob", join(dir, "empty.blob")], env: { NODE_COMPILE_CACHE: cache } },
];
const run = (v: (typeof variants)[number]) => {
  const r = spawnSync(process.execPath, ["--expose-gc", ...v.args, join(dir, "child.mjs")], { encoding: "utf8", env: { ...process.env, ...v.env } });
  if (r.status !== 0) throw new Error(`${v.name}: ${r.stderr}`);
  return JSON.parse(r.stdout.trim().split("\n").at(-1)!) as Record<string, number | boolean>;
};
run(variants[1]); // fill the compile cache
const samples = new Map(variants.map((v) => [v.name, [] as Record<string, number | boolean>[]]));
for (let s = 0; s < Number(flags.samples); s++) {
  for (const v of s % 2 ? variants.toReversed() : variants) samples.get(v.name)!.push(run(v));
}
const metrics = ["bootMs", "importMs", "createWindowMs", "installGlobalsMs", "firstUseMs", "totalMs", "heapMB", "rssMB"];
console.log(`\n${flags.samples} fresh processes per row, interleaved: median [min–max]\n`);
console.log(`| | ${metrics.join(" | ")} |\n| --- |${" ---: |".repeat(metrics.length)}`);
for (const [name, xs] of samples) {
  if (name === "snapshot" && !xs.every((x) => x.snapshot)) throw new Error("the snapshot run did not start from the snapshot");
  const cells = metrics.map((k) => {
    const s = summarize(xs.map((x) => x[k] as number));
    return `${fmt(s.median)} [${fmt(s.min)}–${fmt(s.max)}]`;
  });
  console.log(`| ${name} | ${cells.join(" | ")} |`);
}
if (flags.keep) console.log(`\nkept ${dir}`);
else rmSync(dir, { recursive: true, force: true });
