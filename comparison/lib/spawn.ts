// Child processes for the runners, and the statistics they report.
import { spawn } from "node:child_process";

export interface Exit {
  code: number | null;
  stdout: string;
  stderr: string;
  wallMs: number;
}

/** Run a command to completion, capturing output and wall time. */
export function run(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number } = {},
): Promise<Exit> {
  return new Promise((resolve) => {
    const started = performance.now();
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    const timer = options.timeoutMs ? setTimeout(() => child.kill("SIGKILL"), options.timeoutMs) : null;
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code, stdout, stderr, wallMs: performance.now() - started });
    });
  });
}

export function median(xs: readonly number[]): number {
  const s = xs.toSorted((a, b) => a - b);
  const m = s.length >> 1;
  return s.length === 0 ? Number.NaN : s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export interface Spread {
  median: number;
  min: number;
  max: number;
  samples: number;
}

export function spread(xs: readonly number[]): Spread {
  return { median: median(xs), min: Math.min(...xs), max: Math.max(...xs), samples: xs.length };
}

/** Rotate the order every sample and reverse it on odd ones, so drift hits every contender alike. */
export function interleave<T>(items: readonly T[], sample: number): T[] {
  const rot = sample % items.length;
  const order = [...items.slice(rot), ...items.slice(0, rot)];
  return sample % 2 ? order.reverse() : order;
}
