// Vitest reporter for `ctrl-dom debug` (passed as `--reporter=<this file>`): prints ./report.js's
// compact report once the run ends. https://vitest.dev/advanced/api/reporters
import { relative } from "node:path";
import { firstProjectFrame, formatReport, messageWithoutFrames, missingSnapshotHint, stripAnsi } from "./report.js";

function formatError(error) {
  const prefix = typeof error?.name === "string" && error.name !== "" ? `${error.name}: ` : "";
  let message = `${prefix}${messageWithoutFrames(error?.message ?? String(error))}`;
  // toBe & co. carry the expected/received diff separately.
  if (typeof error?.diff === "string" && error.diff !== "") message += `\n\n${stripAnsi(error.diff)}`;
  return message;
}

function frameOf(error, root, testFile) {
  const stack = Array.isArray(error?.stacks) && error.stacks.length > 0 ? error.stacks.map((s) => `    at ${s.file}:${s.line}:${s.column}`).join("\n") : error?.stack;
  return firstProjectFrame(stack, root, testFile);
}

export default class CtrlDomDebugReporter {
  // Paths relative to where `ctrl-dom debug` ran, which is where the agent reads them from.
  root = process.cwd();
  logs = [];
  start = performance.now();

  onUserConsoleLog(log) {
    this.logs.push(log);
  }

  onTestRunEnd(testModules, unhandledErrors) {
    const names = new Map();
    const failures = [];
    const errors = [];
    const files = [];
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    for (const module of testModules) {
      const file = relative(this.root, module.moduleId) || module.moduleId;
      files.push(file);
      names.set(module.id, file);
      for (const error of module.errors?.() ?? []) errors.push({ name: file, message: formatError(error), at: frameOf(error, this.root, module.moduleId) });
      for (const test of module.children.allTests()) {
        names.set(test.id, test.fullName);
        const result = test.result();
        if (result.state === "passed") passed++;
        else if (result.state === "failed") {
          failed++;
          const [first, ...rest] = result.errors ?? [];
          let message = first ? formatError(first) : "(failed without an error)";
          for (const error of rest) message += `\n\n${formatError(error)}`;
          failures.push({ name: test.fullName, message, at: first ? frameOf(first, this.root, module.moduleId) : null });
        } else skipped++;
      }
    }
    for (const error of unhandledErrors) errors.push({ name: "Unhandled error", message: formatError(error), at: frameOf(error, this.root) });
    const logs = this.logs.map((log) => ({ name: names.get(log.taskId) ?? "(outside a test)", type: log.type, content: log.content }));
    process.stdout.write(formatReport({ runner: "vitest", root: this.root, failures, errors, logs, passed, failed, skipped, files, durationMs: performance.now() - this.start }));
    process.stdout.write(missingSnapshotHint(failures, "vitest"));
  }
}
