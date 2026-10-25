import { summarize, fmt, median, type Summary } from "./stats.ts";
import type { SampleResult } from "../worker.ts";

export interface Cell {
  workload: string;
  title: string;
  config: string;
  samples: SampleResult[];
  errors: string[];
  time?: Summary;
  heap?: Summary;
  maxRss?: Summary;
  extra: Record<string, number>;
  setupPath?: string;
}

export function buildCell(workload: string, title: string, config: string, samples: SampleResult[]): Cell {
  const ok = samples.filter((s) => s.ok);
  const errors = [...new Set(samples.filter((s) => !s.ok).map((s) => s.error ?? "unknown error"))];
  const cell: Cell = { workload, title, config, samples, errors, extra: {} };
  if (ok.length) {
    // Each sample is one fresh process; its value is the median of its timed iterations.
    cell.time = summarize(ok.map((s) => s.medianMs));
    cell.heap = summarize(ok.map((s) => s.heapMB));
    cell.maxRss = summarize(ok.map((s) => s.maxRssMB));
    cell.setupPath = ok[0].setupPath;
    const keys = new Set(ok.flatMap((s) => Object.keys(s.extra ?? {})));
    for (const k of keys) cell.extra[k] = median(ok.map((s) => s.extra?.[k]).filter((v) => v !== undefined));
  }
  return cell;
}

function timeText(c: Cell): string {
  if (!c.time) return "error";
  return `${fmt(c.time.median)} [${fmt(c.time.min)}–${fmt(c.time.max)}]`;
}

function shortError(e: string): string {
  return e.split("\n")[0].replace(/\|/g, "\\|").slice(0, 140);
}

/** Markdown: summary matrix, then one table per workload with spread, memory and notes. */
export function markdown(cells: Cell[], configs: string[], meta: Record<string, string>): string {
  const lines: string[] = [];
  lines.push(`# Bench results: ${meta.name}`, "");
  for (const [k, v] of Object.entries(meta)) if (k !== "name") lines.push(`- **${k}**: ${v}`);
  lines.push(
    "",
    "Each cell: median over fresh processes of the per-process median iteration time, in ms, with",
    "[min–max across processes]. Memory: heap used after forced GC at the end of the sample",
    "(fixture alive) / peak RSS, in MB. Lower is better.",
    "",
  );
  const workloads = [...new Map(cells.map((c) => [c.workload, c.title])).entries()];
  const usedConfigs = configs.filter((cfg) => cells.some((c) => c.config === cfg));

  lines.push("## Summary", "");
  lines.push(`| Workload | ${usedConfigs.join(" | ")} |`);
  lines.push(`| --- | ${usedConfigs.map(() => "---:").join(" | ")} |`);
  for (const [id, title] of workloads) {
    const row = usedConfigs.map((cfg) => {
      const c = cells.find((x) => x.workload === id && x.config === cfg);
      if (!c) return "";
      if (!c.time) return "error";
      return `${timeText(c)}<br>${fmt(c.heap!.median)} / ${fmt(c.maxRss!.median)} MB`;
    });
    lines.push(`| ${title} | ${row.join(" | ")} |`);
  }
  lines.push("");

  lines.push("## Details", "");
  for (const [id, title] of workloads) {
    lines.push(`### ${title}`, "", `\`${id}\``, "");
    lines.push("| config | median ms | min–max | IQR | heap MB | peak RSS MB | vs jsdom | extra |");
    lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |");
    const base = cells.find((x) => x.workload === id && x.config === "jsdom")?.time?.median;
    for (const cfg of usedConfigs) {
      const c = cells.find((x) => x.workload === id && x.config === cfg);
      if (!c) continue;
      if (!c.time) {
        lines.push(`| ${cfg} | error | | | | | | ${shortError(c.errors[0] ?? "")} |`);
        continue;
      }
      const ratio = base ? `${(c.time.median / base).toFixed(2)}×` : "";
      const extra = Object.entries(c.extra)
        .map(([k, v]) => `${k}=${fmt(v)}`)
        .join(", ");
      const failed = c.errors.length
        ? ` (${c.samples.length - c.samples.filter((s) => s.ok).length} failed samples)`
        : "";
      lines.push(
        `| ${cfg} | ${fmt(c.time.median)} | ${fmt(c.time.min)}–${fmt(c.time.max)} | ${fmt(c.time.q1)}–${fmt(c.time.q3)} | ${fmt(c.heap!.median)} | ${fmt(c.maxRss!.median)} | ${ratio} | ${extra}${failed} |`,
      );
    }
    lines.push("");
  }

  const errored = cells.filter((c) => c.errors.length);
  if (errored.length) {
    lines.push("## Errors", "");
    for (const c of errored) {
      lines.push(
        `- \`${c.workload}\` × \`${c.config}\`:`,
        "",
        "  ```",
        ...c.errors[0].split("\n").map((l) => `  ${l}`),
        "  ```",
        "",
      );
    }
  }
  return lines.join("\n");
}

/** Terminal table: one row per workload × config. */
export function terminal(cells: Cell[], configs: string[]): string {
  const rows: string[][] = [["workload", "config", "median ms", "min–max", "heap MB", "peak RSS", "vs jsdom", "notes"]];
  const workloads = [...new Set(cells.map((c) => c.workload))];
  for (const id of workloads) {
    const base = cells.find((x) => x.workload === id && x.config === "jsdom")?.time?.median;
    for (const cfg of configs) {
      const c = cells.find((x) => x.workload === id && x.config === cfg);
      if (!c) continue;
      if (!c.time) {
        rows.push([id, cfg, "error", "", "", "", "", shortError(c.errors[0] ?? "").slice(0, 70)]);
        continue;
      }
      rows.push([
        id,
        cfg,
        fmt(c.time.median),
        `${fmt(c.time.min)}–${fmt(c.time.max)}`,
        fmt(c.heap!.median),
        fmt(c.maxRss!.median),
        base ? `${(c.time.median / base).toFixed(2)}×` : "",
        Object.entries(c.extra)
          .map(([k, v]) => `${k}=${fmt(v)}`)
          .join(" "),
      ]);
    }
  }
  const widths = rows[0].map((_, i) => Math.max(...rows.map((r) => r[i].length)));
  return rows
    .map((r, ri) => {
      const line = r.map((v, i) => (i >= 2 && i <= 6 ? v.padStart(widths[i]) : v.padEnd(widths[i]))).join("  ");
      return ri === 0 ? `${line}\n${widths.map((w) => "─".repeat(w)).join("  ")}` : line;
    })
    .join("\n");
}
