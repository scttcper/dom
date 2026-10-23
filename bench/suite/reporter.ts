// Records Vitest's own per-file diagnostics (environment setup, setup files, import/collect,
// test time) so the suite benchmark can report Vitest's numbers next to wall time.

import { appendFileSync } from "node:fs";
import type { Reporter, TestModule } from "vitest/node";

export default class BenchReporter implements Reporter {
  onTestRunEnd(testModules: ReadonlyArray<TestModule>): void {
    const out = process.env.BENCH_DIAGNOSTICS_FILE;
    if (!out) return;
    let lines = "";
    for (const m of testModules) {
      const d = m.diagnostic();
      lines += `${JSON.stringify({
        file: m.moduleId,
        state: m.state(),
        environmentSetupMs: d.environmentSetupDuration,
        prepareMs: d.prepareDuration,
        collectMs: d.collectDuration,
        setupMs: d.setupDuration,
        durationMs: d.duration,
      })}\n`;
    }
    appendFileSync(out, lines);
  }
}
