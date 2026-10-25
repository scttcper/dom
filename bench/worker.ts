// One bench sample: a fresh Node process runs one workload under one configuration and prints
// a single `@@RESULT <json>` line. Spawned by bench/run.ts with --expose-gc.
//
//   node --expose-gc bench/worker.ts <workload-id> <config> [iterations] [warmup]

import { GCProfiler, getHeapStatistics } from "node:v8";
import { isConfig, prepare, installDom, loadEnv, domSpecifier, dynamicImport, type ConfigName } from "./lib/configs.ts";
import { findWorkload } from "./workloads/index.ts";
import type { Workload, StartupWorkload } from "./workloads/types.ts";

export interface SampleResult {
  ok: boolean;
  workload: string;
  config: string;
  /** Timed iterations (ms). Startup workloads have one. */
  times: number[];
  medianMs: number;
  meanMs: number;
  /** Heap used after two forced GCs at the end of the sample, workload state still alive. */
  heapMB: number;
  /** Current RSS at the end of the sample. */
  rssMB: number;
  /** Peak RSS of the process. */
  maxRssMB: number;
  extra: Record<string, number>;
  setupPath?: string;
  error?: string;
}

const MB = 1024 * 1024;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function memory() {
  const gc = (globalThis as any).gc as (() => void) | undefined;
  if (gc) {
    gc();
    gc();
  }
  const mu = process.memoryUsage();
  return {
    heapMB: mu.heapUsed / MB,
    rssMB: mu.rss / MB,
    // resourceUsage().maxRSS is in kilobytes.
    maxRssMB: process.resourceUsage().maxRSS / 1024,
  };
}

async function runStartup(
  w: StartupWorkload,
  config: ConfigName,
): Promise<Omit<SampleResult, keyof ReturnType<typeof memory>>> {
  await prepare(config);
  if (w.id === "startup/import") {
    const t = performance.now();
    const mod = await dynamicImport(domSpecifier(config));
    const ms = performance.now() - t;
    if (Object.keys(mod).length === 0) throw new Error("verify: DOM module has no exports");
    return { ok: true, workload: w.id, config, times: [ms], medianMs: ms, meanMs: ms, extra: {} };
  }
  const t0 = performance.now();
  const phases = await installDom(config);
  const extra: Record<string, number> = { importMs: phases.importMs, setupMs: phases.setupMs };
  if (w.id === "startup/first-render") {
    const t1 = performance.now();
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const full = config === "ctrl-dom-full" || config === "ctrl-dom-full-dist";
    const React = await import("react");
    const rtl: any = await import(full ? "@ctrl/dom/react" : "@testing-library/react");
    await import(full ? "@ctrl/dom/user-event" : "@testing-library/user-event");
    await import(full ? "@ctrl/dom/jest-dom/matchers" : "@testing-library/jest-dom/matchers");
    const t2 = performance.now();
    const view = rtl.render(React.createElement("button", { type: "button" }, "Hello"));
    const button = rtl.screen.getByRole("button", { name: "Hello" });
    const t3 = performance.now();
    if (button.textContent !== "Hello" || !view.container.contains(button)) {
      throw new Error("verify: first render did not produce the button");
    }
    extra.stackImportMs = t2 - t1;
    extra.renderQueryMs = t3 - t2;
  }
  const total = performance.now() - t0;
  return {
    ok: true,
    workload: w.id,
    config,
    times: [total],
    medianMs: total,
    meanMs: total,
    extra,
    setupPath: phases.setupPath,
  };
}

interface GCStat {
  gcType: string;
  /** Microseconds. */
  cost: number;
  beforeGC: { heapStatistics: { usedHeapSize: number } };
  afterGC: { heapStatistics: { usedHeapSize: number } };
}

/**
 * Allocation and GC during one timed `run()`: bytes allocated are estimated from the used heap
 * size between collections (V8 exposes no cumulative allocation counter): the growth from the
 * start (or the previous GC's result) up to each GC, plus the growth after the last one.
 */
function gcCosts(stats: GCStat[], usedStart: number, usedEnd: number) {
  let alloc = 0;
  let prev = usedStart;
  let gcUs = 0;
  let scavenges = 0;
  let majors = 0;
  for (const s of stats) {
    alloc += Math.max(0, s.beforeGC.heapStatistics.usedHeapSize - prev);
    prev = s.afterGC.heapStatistics.usedHeapSize;
    gcUs += s.cost;
    if (s.gcType === "Scavenge" || s.gcType === "MinorMarkSweep") scavenges++;
    else if (s.gcType === "MarkSweepCompact") majors++;
  }
  alloc += Math.max(0, usedEnd - prev);
  return { allocMB: alloc / MB, gcMs: gcUs / 1000, scavenges, majorGCs: majors };
}

async function runWorkload(w: Workload, config: ConfigName, iterations: number, warmup: number) {
  const env = await loadEnv(config);
  const inst = await w.setup(env);
  const times: number[] = [];
  const costs: ReturnType<typeof gcCosts>[] = [];
  for (let i = 0; i < warmup + iterations; i++) {
    await inst.beforeEach?.();
    const profiler = new GCProfiler();
    const usedStart = getHeapStatistics().used_heap_size;
    profiler.start();
    const t0 = performance.now();
    const result = await inst.run();
    const dt = performance.now() - t0;
    const profile = profiler.stop() as { statistics: GCStat[] } | undefined;
    const usedEnd = getHeapStatistics().used_heap_size;
    await inst.verify(result);
    await inst.afterEach?.();
    if (i >= warmup) {
      times.push(dt);
      costs.push(gcCosts(profile?.statistics ?? [], usedStart, usedEnd));
    }
  }
  const extra: Record<string, number> = { ...(await inst.extra?.()) };
  // Medians per timed iteration (see gcCosts).
  extra.allocMB = median(costs.map((c) => c.allocMB));
  extra.gcMs = median(costs.map((c) => c.gcMs));
  extra.scavenges = median(costs.map((c) => c.scavenges));
  extra.majorGCs = median(costs.map((c) => c.majorGCs));
  // Memory is read with the workload's fixture still alive, then the fixture is closed.
  const mem = memory();
  await inst.close?.();
  return {
    ok: true,
    workload: w.id,
    config,
    times,
    medianMs: median(times),
    meanMs: times.reduce((a, b) => a + b, 0) / times.length,
    extra,
    setupPath: env.setupPath,
    ...mem,
  };
}

async function main(): Promise<SampleResult> {
  const [id, config, iterArg, warmArg] = process.argv.slice(2);
  const w = findWorkload(id);
  if (!w) throw new Error(`unknown workload ${id}`);
  if (!isConfig(config)) throw new Error(`unknown config ${config}`);
  if (w.kind === "startup") {
    const r = await runStartup(w, config);
    return { ...r, ...memory() };
  }
  const iterations = iterArg ? Number(iterArg) : w.iterations;
  const warmup = warmArg ? Number(warmArg) : w.warmup;
  return runWorkload(w, config, iterations, warmup);
}

// Workloads must not leave the process hanging (timers from user-event, happy-dom, ...).
try {
  const result = await main();
  process.stdout.write(`\n@@RESULT ${JSON.stringify(result)}\n`);
  process.exit(0);
} catch (error) {
  const e = error as Error;
  const result = {
    ok: false,
    workload: process.argv[2],
    config: process.argv[3],
    error: (e?.stack ?? String(e)).split("\n").slice(0, 8).join("\n"),
  };
  process.stdout.write(`\n@@RESULT ${JSON.stringify(result)}\n`);
  process.exit(1);
}
