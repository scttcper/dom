// `pnpm scriptc:check`: every module under packages/*/src that starts with
// `// @scriptc-compatible` must compile with scriptc.
//
// Each marked file is analyzed with `scriptc coverage <file> --print=diagnostics
// --fail-on=blockers`: exported functions count as reached, and the module graph it imports is
// analyzed too (a compatible module may only import compatible code). A file fails when scriptc
// reports blockers on its entry path or a type error under scriptc's own settings (ES2025 lib,
// strict null checks). Divergence (SC6xxx) and dynamic-tier warnings are printed but do not fail.
//
// Flags: --json (machine-readable summary), --filter <substring>, --verbose (print warnings in full).
// Exit status: 1 when any marked file fails.

import { spawn } from "node:child_process";
import { readdirSync, readFileSync, openSync, readSync, closeSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { availableParallelism } from "node:os";

const nativeDir = fileURLToPath(new URL("../", import.meta.url));
const repoRoot = join(nativeDir, "../..");
const scriptc = join(nativeDir, "node_modules/.bin/scriptc");
const MARKER = "// @scriptc-compatible";

const { values: flags } = parseArgs({
  options: {
    json: { type: "boolean", default: false },
    filter: { type: "string" },
    verbose: { type: "boolean", default: false },
  },
});

/** Files whose first five lines contain the marker. */
export function findCompatibleModules(): string[] {
  const out: string[] = [];
  const packagesDir = join(repoRoot, "packages");
  for (const pkg of readdirSync(packagesDir)) {
    let entries;
    try {
      entries = readdirSync(join(packagesDir, pkg, "src"), { recursive: true, withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isFile() || !e.name.endsWith(".ts") || e.name.endsWith(".d.ts")) continue;
      const file = join(e.parentPath, e.name);
      const fd = openSync(file, "r");
      const buf = Buffer.alloc(1024);
      const n = readSync(fd, buf, 0, 1024, 0);
      closeSync(fd);
      const head = buf.toString("utf8", 0, n).split("\n").slice(0, 5);
      if (head.some((l) => l.trim() === MARKER)) out.push(file);
    }
  }
  return out.sort();
}

interface Diag {
  code: string;
  category: string;
  severity: string;
  scope: string;
  file: string;
  line: number;
  column: number;
  message: string;
  hint?: string;
}

interface Report {
  success: boolean;
  phase: string;
  stats?: { statementsTotal: number; statementsStatic: number; statementsDynamic: number; percentStatic: number };
  diagnostics: Diag[];
}

export interface FileResult {
  file: string;
  ok: boolean;
  percentStatic: number | null;
  statements: number | null;
  dynamic: number | null;
  errors: Diag[];
  warnings: Diag[];
  /** Set when scriptc itself could not produce a report. */
  crash?: string;
  ms: number;
}

function coverage(file: string): Promise<FileResult> {
  const t0 = performance.now();
  return new Promise((resolve) => {
    const child = spawn(scriptc, ["coverage", file, "--print=diagnostics", "--fail-on=blockers"], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code) => {
      const ms = performance.now() - t0;
      let report: Report;
      try {
        report = JSON.parse(out.slice(out.indexOf("{")));
      } catch {
        resolve({
          file,
          ok: false,
          percentStatic: null,
          statements: null,
          dynamic: null,
          errors: [],
          warnings: [],
          crash: `scriptc exited ${code}: ${(err || out).trim().slice(0, 2000)}`,
          ms,
        });
        return;
      }
      const errors = report.diagnostics.filter(
        (d) => d.severity === "error" && (d.scope === "reached" || d.scope === "preflight"),
      );
      const warnings = report.diagnostics.filter((d) => !errors.includes(d) && d.scope !== "unreached");
      resolve({
        file,
        ok: code === 0 && report.success && errors.length === 0,
        percentStatic: report.stats?.percentStatic ?? null,
        statements: report.stats?.statementsTotal ?? null,
        dynamic: report.stats?.statementsDynamic ?? null,
        errors,
        warnings,
        ms,
      });
    });
  });
}

async function pool<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = Array.from({ length: items.length });
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

function sourceLine(file: string, line: number): string {
  try {
    return readFileSync(file, "utf8").split("\n")[line - 1]?.trim() ?? "";
  } catch {
    return "";
  }
}

function formatDiag(d: Diag): string {
  const loc = `${relative(repoRoot, d.file)}:${d.line}:${d.column}`;
  const src = sourceLine(d.file, d.line);
  return [
    `    ${d.code} ${loc}  ${d.message}`,
    src ? `        | ${src.slice(0, 120)}` : "",
    d.hint ? `        hint: ${d.hint.split("\n")[0].slice(0, 200)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

if (import.meta.main) {
  let files = findCompatibleModules();
  if (flags.filter) files = files.filter((f) => f.includes(flags.filter!));
  const results = await pool(files, Math.max(1, Math.min(4, availableParallelism() >> 1)), coverage);
  if (flags.json) {
    console.log(JSON.stringify(results.map((r) => ({ ...r, file: relative(repoRoot, r.file) })), null, 2));
  } else {
    if (files.length === 0) console.log(`no files marked ${MARKER}`);
    for (const r of results) {
      const rel = relative(repoRoot, r.file);
      if (r.crash) {
        console.log(`FAIL ${rel}\n    ${r.crash.split("\n").join("\n    ")}`);
        continue;
      }
      const stat = r.percentStatic === null ? "" : ` (${r.percentStatic}% static of ${r.statements} statements${r.dynamic ? `, ${r.dynamic} dynamic-tier` : ""})`;
      console.log(`${r.ok ? "ok  " : "FAIL"} ${rel}${stat}  ${(r.ms / 1000).toFixed(1)}s`);
      // Group repeated diagnostics (one root cause often hits many sites).
      const shown = new Set<string>();
      for (const d of r.errors) {
        const k = `${d.code}:${d.file}:${d.line}`;
        if (shown.has(k)) continue;
        shown.add(k);
        if (shown.size > 25) {
          console.log(`    … ${r.errors.length - 25} more`);
          break;
        }
        console.log(formatDiag(d));
      }
      if (r.warnings.length) {
        if (flags.verbose) for (const d of r.warnings) console.log(formatDiag(d).replace(/^ {4}/, "    warning "));
        else console.log(`    ${r.warnings.length} warning(s) (${[...new Set(r.warnings.map((w) => w.code))].join(", ")}); --verbose to show`);
      }
    }
    const failed = results.filter((r) => !r.ok).length;
    console.log(`\n${results.length - failed}/${results.length} @scriptc-compatible modules compile${failed ? `; ${failed} failing` : ""}`);
  }
  if (results.some((r) => !r.ok)) process.exitCode = 1;
}
