// Sends what the reporters build without holding up the run: envelopes go out as each test file
// finishes, a few at a time, and the end of the run waits for the rest and prints one line.

import type { Envelope, Target } from "./envelope.ts";
import type { ResolvedOptions } from "./options.ts";
import type { BuiltReport } from "./report.ts";

const CONCURRENCY = 6;

export class Delivery {
  #options: ResolvedOptions;
  #send: (envelope: Envelope, target: Target) => Promise<string | null>;
  #queue: Array<[Envelope, Target]> = [];
  #active = 0;
  #idle: Array<() => void> = [];
  #errors = new Set<string>();
  #totals = { traces: 0, failures: 0, flaky: 0 };

  constructor(options: ResolvedOptions, send: (envelope: Envelope, target: Target) => Promise<string | null>) {
    this.#options = options;
    this.#send = send;
  }

  add(report: BuiltReport): void {
    this.#totals.traces += report.traces;
    this.#totals.failures += report.failures;
    this.#totals.flaky += report.flaky;
    for (const envelope of report.envelopes)
      for (const target of this.#options.targets) this.#queue.push([envelope, target]);
    this.#pump();
  }

  /** Wait for every envelope; a one-line summary of the run (null when nothing was reported). Starts a new run's totals. */
  async flush(): Promise<string | null> {
    if (this.#queue.length > 0 || this.#active > 0) await new Promise<void>((resolve) => this.#idle.push(resolve));
    const { traces, failures, flaky } = this.#totals;
    const errors = [...this.#errors];
    this.#totals = { traces: 0, failures: 0, flaky: 0 };
    this.#errors.clear();
    if (traces + failures + flaky === 0) return null;
    const what = [plural(traces, "trace"), plural(failures, "failed test"), plural(flaky, "flaky test")].join(", ");
    const where = this.#options.targets.map((t) => t.label).join(" and ");
    const problems = errors.length > 0 ? `; not delivered: ${errors.join("; ")}` : "";
    return `@ctrl/sentry-tests: ${what} → ${where}${problems}`;
  }

  #pump(): void {
    while (this.#active < CONCURRENCY && this.#queue.length > 0) {
      const [envelope, target] = this.#queue.shift()!;
      this.#active++;
      void this.#send(envelope, target).then((error) => {
        if (error !== null) this.#errors.add(error);
        this.#active--;
        this.#pump();
        if (this.#active === 0 && this.#queue.length === 0) for (const resolve of this.#idle.splice(0)) resolve();
      });
    }
  }
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}
