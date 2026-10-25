// Collects Vitest's per-file environment setup time (TestModule.diagnostic()).
import type { Reporter, TestModule } from "vitest/node";

export default class EnvironmentReporter implements Reporter {
  samples: number[] = [];
  onTestModuleEnd(module: TestModule): void {
    this.samples.push(module.diagnostic().environmentSetupDuration);
  }
  onTestRunEnd(): void {
    const s = this.samples.toSorted((a, b) => a - b);
    const median = s[Math.floor(s.length / 2)] ?? 0;
    const sum = s.reduce((a, b) => a + b, 0);
    console.log(
      `ENV ${process.env.CTRL_DOM_BENCH_ENV} files=${s.length} median=${median.toFixed(2)}ms min=${(s[0] ?? 0).toFixed(2)}ms max=${(s.at(-1) ?? 0).toFixed(2)}ms sum=${sum.toFixed(0)}ms`,
    );
  }
}
