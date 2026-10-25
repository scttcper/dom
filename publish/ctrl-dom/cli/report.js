// Shared formatting for the `ctrl-dom debug` reporters (./vitest-reporter.js, ./jest-reporter.js).
// Node built-ins only. The report is plain text for coding agents: no ANSI colors, failures first,
// stack traces cut to the first frame in the project, console output budgeted.

import { relative, sep } from "node:path";
import { stripVTControlCharacters } from "node:util";

/** Strip ANSI escape sequences. */
export function stripAnsi(text) {
  return stripVTControlCharacters(String(text));
}

const FRAME = /^\s*at (?:(.*?) \()?(?:file:\/\/)?(\/[^():]+|[A-Za-z]:\\[^():]+):(\d+):(\d+)\)?\s*$/;

/**
 * `file:line:column`, relative to `root`, of the first stack frame in `testFile`, else of the first
 * frame outside node_modules and Node internals.
 */
export function firstProjectFrame(stack, root, testFile) {
  let fallback = null;
  for (const line of String(stack ?? "").split("\n")) {
    const m = FRAME.exec(line);
    if (m === null) continue;
    const file = m[2];
    if (file.includes(`${sep}node_modules${sep}`) || file.includes("/node_modules/")) continue;
    const at = `${relative(root, file) || file}:${m[3]}:${m[4]}`;
    if (testFile === undefined || file === testFile) return at;
    fallback ??= at;
  }
  return fallback;
}

/** An error message without its stack frames (`    at …` lines). */
export function messageWithoutFrames(text) {
  const lines = stripAnsi(text).split("\n");
  const out = [];
  for (const line of lines) if (!/^\s*at .+(:\d+:\d+\)?|\(<anonymous>\)|native\))\s*$/.test(line)) out.push(line);
  while (out.length > 0 && out[out.length - 1].trim() === "") out.pop();
  return out.join("\n");
}

export function indent(text, prefix = "  ") {
  return text
    .split("\n")
    .map((line) => (line === "" ? line : prefix + line))
    .join("\n");
}

/** Keep at most `max` lines, noting how many were cut. */
export function budget(text, max) {
  const lines = text.split("\n");
  if (lines.length <= max) return text;
  return `${lines.slice(0, max).join("\n")}\n… ${lines.length - max} more lines`;
}

const CONSOLE_MAX_LINES =
  Number(process.env.CTRL_DOM_DEBUG_CONSOLE_LINES) > 0 ? Number(process.env.CTRL_DOM_DEBUG_CONSOLE_LINES) : 150;
const FAILURE_MAX_LINES = 400;

/**
 * The report.
 * @param {{
 *   runner: string,
 *   root: string,
 *   failures: Array<{ name: string, message: string, at: string | null }>,
 *   logs: Array<{ name: string, type: string, content: string }>,
 *   errors: Array<{ name: string, message: string, at: string | null }>,
 *   passed: number, failed: number, skipped: number,
 *   files: string[],
 *   durationMs: number,
 * }} r
 */
export function formatReport(r) {
  const out = [];
  for (const f of r.errors) {
    out.push(`ERROR  ${f.name}`, indent(budget(f.message, FAILURE_MAX_LINES)));
    if (f.at) out.push("", `  at ${f.at}`);
    out.push("");
  }
  for (const f of r.failures) {
    out.push(`FAIL  ${f.name}`, indent(budget(f.message, FAILURE_MAX_LINES)));
    if (f.at) out.push("", `  at ${f.at}`);
    out.push("");
  }
  if (r.logs.length > 0) {
    let used = 0;
    let cut = 0;
    const parts = [];
    for (const log of r.logs) {
      const content = stripAnsi(log.content).replace(/\n$/, "");
      const lines = content.split("\n").length + 1;
      if (used + lines > CONSOLE_MAX_LINES) {
        cut++;
        continue;
      }
      used += lines;
      parts.push(`${log.type === "stderr" ? "stderr" : "stdout"} | ${log.name}`, indent(content));
    }
    out.push("Console output:", ...parts);
    if (cut > 0) out.push(`… ${cut} more console messages (CTRL_DOM_DEBUG_CONSOLE_LINES raises the budget)`);
    out.push("");
  }
  const counts =
    [r.failed && `${r.failed} failed`, r.passed && `${r.passed} passed`, r.skipped && `${r.skipped} skipped`]
      .filter(Boolean)
      .join(", ") || "no tests ran";
  out.push(
    `${counts} · ${r.runner} · ${r.files.join(", ") || "(no test files)"} · ${(r.durationMs / 1000).toFixed(1)} s`,
  );
  return `${out.join("\n")}\n`;
}

/** A hint when failures came without the snapshot a failure should carry in agent mode. */
export function missingSnapshotHint(failures, runner) {
  if (failures.length === 0 || process.env.CTRL_DOM_DEBUG === undefined) return "";
  if (failures.some((f) => f.message.includes("when the test failed"))) return "";
  if (runner === "vitest") {
    return 'Note: no failure snapshots. Use ctrlDom() from "@ctrl/dom/vitest", or add "@ctrl/dom/vitest-environment/failure-snapshot" to test.setupFiles (the ctrl-dom environment is required).\n';
  }
  return 'Note: no failure snapshots. They need testEnvironment "@ctrl/dom-jest-environment" or preset "@ctrl/dom".\n';
}
