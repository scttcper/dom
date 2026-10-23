import type { ConfigName, Env } from "../lib/configs.ts";

export interface Instance {
  /** Untimed per-iteration reset. */
  beforeEach?(): unknown;
  /** The timed operation. Its return value goes to `verify`. */
  run(): unknown;
  /** Untimed; throws when the observable result is wrong, so a broken DOM cannot "win". */
  verify(result: unknown): unknown;
  /** Untimed per-iteration cleanup. */
  afterEach?(): unknown;
  /** Extra numbers to report (e.g. memory slope), read after the last iteration. */
  extra?(): Record<string, number> | Promise<Record<string, number>>;
  close?(): unknown;
}

export interface Workload {
  id: string;
  title: string;
  /** dom: DOM-only (runs DOM_CONFIGS); react: React + testing-library (DEFAULT_CONFIGS). */
  kind: "dom" | "react";
  iterations: number;
  warmup: number;
  configs?: ConfigName[];
  setup(env: Env): Instance | Promise<Instance>;
}

export interface StartupWorkload {
  id: string;
  title: string;
  kind: "startup";
  configs?: ConfigName[];
}

export type AnyWorkload = Workload | StartupWorkload;

export function check(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(`verify: ${message}`);
}

export function eq(actual: unknown, expected: unknown, what: string): void {
  if (!Object.is(actual, expected)) {
    throw new Error(`verify: ${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
