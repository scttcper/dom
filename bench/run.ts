// `pnpm bench`: run workloads × configurations, one fresh Node process per sample, configs
// interleaved (rotated every sample), verify every result, report time + memory.
//
//   pnpm bench                                  all workloads, default configs, 5 samples
//   pnpm bench --workloads dom/,react/form      ids or id prefixes (comma separated)
//   pnpm bench --configs jsdom,ctrl-dom --samples 3
//   pnpm bench --workloads startup/ --configs jsdom,happy-dom,ctrl-dom,ctrl-dom-dist
//   pnpm bench --iterations 5 --warmup 1        override per-workload iteration counts
//   pnpm bench --name nightly                   results file name
//   pnpm bench --list                           list workloads and configs
//
// Results: bench/results/<date>-<name>.md and .json (raw samples).

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { cpus, totalmem, platform, release } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { allWorkloads } from "./workloads/index.ts";
import { CONFIGS, DEFAULT_CONFIGS, DOM_CONFIGS, isConfig, type ConfigName } from "./lib/configs.ts";
import { buildCell, markdown, terminal } from "./lib/report.ts";
import type { SampleResult } from "./worker.ts";
import type { AnyWorkload } from "./workloads/types.ts";
import { workspacePackages } from "./lib/packages.ts";

const benchDir = fileURLToPath(new URL(".", import.meta.url));

const { values: flags } = parseArgs({
  options: {
    workloads: { type: "string" },
    skip: { type: "string" },
    configs: { type: "string" },
    samples: { type: "string", default: "5" },
    iterations: { type: "string" },
    warmup: { type: "string" },
    name: { type: "string", default: "run" },
    timeout: { type: "string", default: "300" },
    "no-save": { type: "boolean", default: false },
    "keep-going": { type: "boolean", default: false },
    list: { type: "boolean", default: false },
  },
  allowPositionals: true,
});

function matches(id: string, patterns: string | undefined): boolean {
  if (!patterns) return true;
  return patterns.split(",").some((p) => p && (id === p || id.startsWith(p)));
}

function configsFor(w: AnyWorkload): ConfigName[] {
  const requested = flags.configs?.split(",").filter(Boolean);
  if (requested) {
    for (const c of requested) if (!isConfig(c)) throw new Error(`unknown config ${c} (have: ${CONFIGS.join(", ")})`);
    const allowed = w.configs ?? (w.kind === "dom" ? [...DOM_CONFIGS, "ctrl-dom-dist" as const] : [...CONFIGS]);
    return (requested as ConfigName[]).filter((c) => allowed.includes(c));
  }
  if (w.kind === "startup") return w.configs ?? [...CONFIGS];
  return w.configs ?? (w.kind === "dom" ? DOM_CONFIGS : DEFAULT_CONFIGS);
}

if (flags.list) {
  for (const w of allWorkloads) console.log(`${w.id.padEnd(30)} ${w.kind.padEnd(8)} ${w.title}`);
  console.log(`\nconfigs: ${CONFIGS.join(", ")}`);
  process.exit(0);
}

const workloads = allWorkloads.filter((w) => matches(w.id, flags.workloads) && !(flags.skip && matches(w.id, flags.skip)));
const samples = Number(flags.samples);
const timeoutMs = Number(flags.timeout) * 1000;

interface Pair {
  w: AnyWorkload;
  configs: ConfigName[];
}
const pairs: Pair[] = workloads.map((w) => ({ w, configs: configsFor(w) })).filter((p) => p.configs.length);
const results = new Map<string, SampleResult[]>();
const key = (w: string, c: string) => `${w}\u0000${c}`;

function runSample(w: AnyWorkload, config: ConfigName): Promise<SampleResult> {
  const args = ["--expose-gc", "--no-warnings", join(benchDir, "worker.ts"), w.id, config];
  if (w.kind !== "startup") {
    args.push(flags.iterations ?? "", flags.warmup ?? "");
  }
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: benchDir, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const line = out.split("\n").findLast((l) => l.startsWith("@@RESULT "));
      if (line) {
        resolve(JSON.parse(line.slice("@@RESULT ".length)));
        return;
      }
      const why = signal === "SIGKILL" ? `timed out after ${timeoutMs / 1000}s` : `exited ${code ?? signal}`;
      resolve({
        ok: false,
        workload: w.id,
        config,
        error: `worker ${why}\n${err.trim().split("\n").slice(-6).join("\n")}`,
      } as SampleResult);
    });
  });
}

// Bundled configurations measure packages/*/dist: warn when a bundle is older than its sources.
if (pairs.some((p) => p.configs.some((c) => c.endsWith("-dist")))) {
  for (const pkg of workspacePackages()) {
    const dist = pkg.exports[0]?.dist;
    if (!dist || !existsSync(dist)) continue;
    const srcDir = join(pkg.dir, "src");
    const newest = Math.max(
      ...readdirSync(srcDir, { recursive: true, withFileTypes: true })
        .filter((e) => e.isFile())
        .map((e) => statSync(join(e.parentPath, e.name)).mtimeMs),
    );
    if (newest > statSync(dist).mtimeMs) {
      process.stderr.write(`warning: ${pkg.name} dist/ is older than src/ — run \`pnpm build\` for current numbers\n`);
    }
  }
}

const totalRuns = pairs.reduce((n, p) => n + p.configs.length, 0) * samples;
let done = 0;
const started = performance.now();
const broken = new Set<string>();

for (let s = 0; s < samples; s++) {
  for (const { w, configs } of pairs) {
    // Interleave: rotate the config order every sample and reverse it on odd samples.
    const rot = s % configs.length;
    let order = [...configs.slice(rot), ...configs.slice(0, rot)];
    if (s % 2) order = order.reverse();
    for (const config of order) {
      done++;
      const k = key(w.id, config);
      if (broken.has(k)) continue;
      const r = await runSample(w, config);
      if (!results.has(k)) results.set(k, []);
      results.get(k)!.push(r);
      const status = r.ok ? `${r.medianMs.toFixed(2)} ms  heap ${r.heapMB.toFixed(1)} MB` : `ERROR ${r.error?.split("\n")[0]}`;
      process.stderr.write(`[${done}/${totalRuns}] s${s + 1} ${w.id} × ${config}: ${status}\n`);
      // A configuration that fails is reported, not retried for every sample.
      if (!r.ok && !flags["keep-going"]) broken.add(k);
    }
  }
}

const cells = pairs.flatMap(({ w, configs }) =>
  configs.filter((c) => results.has(key(w.id, c))).map((c) => buildCell(w.id, w.title, c, results.get(key(w.id, c))!)),
);

function version(pkg: string): string {
  try {
    const p = join(benchDir, "node_modules", pkg, "package.json");
    return JSON.parse(readFileSync(p, "utf8")).version;
  } catch {
    return "?";
  }
}

const date = new Date().toISOString().slice(0, 10);
const meta: Record<string, string> = {
  name: `${date}-${flags.name}`,
  date: new Date().toISOString(),
  machine: `${cpus()[0]?.model ?? "?"} × ${cpus().length}, ${(totalmem() / 2 ** 30).toFixed(0)} GB, ${platform()} ${release()}`,
  node: process.version,
  versions: ["jsdom", "happy-dom", "react", "react-dom", "@testing-library/dom", "@testing-library/react", "@testing-library/user-event", "@testing-library/jest-dom"]
    .map((p) => `${p} ${version(p)}`)
    .join(", "),
  samples: `${samples} fresh processes per cell (configs interleaved)${flags.iterations ? `, ${flags.iterations} iterations` : ""}`,
  duration: `${((performance.now() - started) / 1000).toFixed(0)} s`,
};

const allConfigs = [...CONFIGS];
console.log(`\n${terminal(cells, allConfigs)}\n`);

if (!flags["no-save"]) {
  const dir = join(benchDir, "results");
  mkdirSync(dir, { recursive: true });
  const base = join(dir, meta.name);
  writeFileSync(`${base}.md`, `${markdown(cells, allConfigs, meta)}\n`);
  writeFileSync(`${base}.json`, `${JSON.stringify({ meta, cells }, null, 2)}\n`);
  console.log(`wrote ${base}.md and .json`);
}
