// Jest reporter for `ctrl-dom debug` (passed as `--reporters=<this file>`): prints ./report.js's
// compact report once the run ends. https://jestjs.io/docs/configuration#custom-reporters
import { relative } from "node:path";
import { firstProjectFrame, formatReport, messageWithoutFrames, missingSnapshotHint } from "./report.js";

export default class CtrlDomDebugReporter {
  constructor() {
    // Paths relative to where `ctrl-dom debug` ran, which is where the agent reads them from.
    this.root = process.cwd();
    this.start = performance.now();
  }

  onRunComplete(_testContexts, results) {
    const failures = [];
    const errors = [];
    const logs = [];
    const files = [];
    for (const file of results.testResults) {
      const name = relative(this.root, file.testFilePath) || file.testFilePath;
      files.push(name);
      if (file.testExecError) {
        const error = file.testExecError;
        errors.push({
          name,
          message: messageWithoutFrames(error.stack ?? error.message ?? String(error)),
          at: firstProjectFrame(error.stack, this.root, file.testFilePath),
        });
      }
      for (const test of file.testResults) {
        if (test.status !== "failed") continue;
        const text = test.failureMessages.join("\n\n");
        failures.push({
          name: test.fullName,
          message: messageWithoutFrames(text),
          at: firstProjectFrame(text, this.root, file.testFilePath),
        });
      }
      // Jest buffers a file's console calls (not per test): name them by file.
      for (const entry of file.console ?? [])
        logs.push({
          name,
          type: entry.type === "error" || entry.type === "warn" ? "stderr" : "stdout",
          content: entry.message,
        });
    }
    process.stdout.write(
      formatReport({
        runner: "jest",
        root: this.root,
        failures,
        errors,
        logs,
        passed: results.numPassedTests,
        failed: results.numFailedTests,
        skipped: results.numPendingTests + results.numTodoTests,
        files,
        durationMs: performance.now() - this.start,
      }),
    );
    process.stdout.write(missingSnapshotHint(failures, "jest"));
  }
}
