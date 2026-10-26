// Jest reporter for `ctrl-dom debug` (passed as `--reporters=<this file>`): prints ./report.ts's
// compact report once the run ends. https://jestjs.io/docs/configuration#custom-reporters
import { relative } from "node:path";
import { type Failure, firstProjectFrame, formatReport, messageWithoutFrames, missingSnapshotHint } from "./report.ts";

/** The fields of Jest's AggregatedResult (@jest/test-result) the report reads. */
interface AggregatedResult {
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests: number;
  numTodoTests: number;
  testResults: {
    testFilePath: string;
    testExecError?: { message?: string; stack?: string | null };
    testResults: { status: string; fullName: string; failureMessages: string[] }[];
    console?: { type: string; message: string }[] | null;
  }[];
}

export default class CtrlDomDebugReporter {
  // Paths relative to where `ctrl-dom debug` ran, which is where the agent reads them from.
  root = process.cwd();
  start = performance.now();

  onRunComplete(_testContexts: unknown, results: AggregatedResult): void {
    const failures: Failure[] = [];
    const errors: Failure[] = [];
    const logs: { name: string; type: string; content: string }[] = [];
    const files: string[] = [];
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
