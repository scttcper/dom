// Records Vitest's own per-file diagnostics for the suite benchmark (COMPARE_DIAGNOSTICS_FILE):
// environment setup, import/collect and test time as Vitest measured them.
import { appendFileSync } from "node:fs";
import type { Reporter, TestModule } from "vitest/node";

export default class SuiteReporter implements Reporter {
  onTestRunEnd(testModules: ReadonlyArray<TestModule>): void {
    const out = process.env.COMPARE_DIAGNOSTICS_FILE;
    if (!out) return;
    let lines = "";
    for (const m of testModules) {
      const d = m.diagnostic();
      lines += `${JSON.stringify({ state: m.state(), environmentSetupMs: d.environmentSetupDuration, collectMs: d.collectDuration, durationMs: d.duration })}\n`;
    }
    appendFileSync(out, lines);
  }
}
