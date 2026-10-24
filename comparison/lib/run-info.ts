// When, where and at what versions a comparison ran. Every results file stores it (benchmarks:
// results/raw/<contender>/_run.json), so report.ts labels each table with the run that measured
// it, not with the day and commit the report happens to be generated at.

import { arch, cpus, platform, totalmem } from "node:os";
import type { Contender } from "../contenders/index.ts";

export interface RunInfo {
  /** Local calendar date of the run (an evening run is not "tomorrow" in UTC). */
  date: string;
  /** CPU, cores, memory, OS and Node version. */
  machine: string;
  /** Each measured contender's version (`Contender.version()`), by id. */
  versions: Record<string, string>;
}

export function runInfo(contenders: readonly Contender[]): RunInfo {
  return {
    date: Temporal.Now.plainDateISO().toString(),
    machine: machine(),
    versions: Object.fromEntries(contenders.map((c) => [c.id, c.version()])),
  };
}

function machine(): string {
  const cpu = cpus()[0]?.model.replace(/\s+/g, " ").trim() ?? "unknown CPU";
  return `${cpu}, ${cpus().length} cores, ${(totalmem() / 2 ** 30).toFixed(0)} GB, ${platform()} ${arch()}, Node ${process.versions.node}`;
}

/** The run info a results file was written with; results from before it was recorded must be measured again. */
export function runOf(data: { run?: RunInfo }, file: string): RunInfo {
  if (data.run === undefined) throw new Error(`comparison/results/${file} has no run info (date, machine, versions): rerun \`pnpm compare\``);
  return data.run;
}

/** One date, or "first to last" when the runs span several days. */
export function dateRange(runs: readonly RunInfo[]): string {
  const dates = [...new Set(runs.map((r) => r.date))].sort();
  return dates.length === 1 ? dates[0] : `${dates[0]} to ${dates.at(-1)}`;
}

/** The distinct values in first-seen order: one when every run agrees. */
export function distinct(values: Iterable<string | undefined>, separator = " / "): string {
  return [...new Set([...values].filter((v): v is string => v !== undefined))].join(separator);
}
