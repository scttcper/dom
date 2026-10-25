// What the reporters send and where. Every option has an environment variable fallback, so CI can
// turn reporting on without touching the test config.

import { execFileSync } from "node:child_process";
import { parseDsn, type Target } from "./envelope.ts";

export interface SentryTestsOptions {
  /** Project DSN. Default: `SENTRY_DSN`. */
  dsn?: string;
  /**
   * Also (or only) send to Spotlight, Sentry's local debugging UI (https://spotlightjs.com):
   * `true` for its default sidecar at http://localhost:8969/stream, or the stream URL.
   * Default: `SENTRY_SPOTLIGHT` (`1`/`true` or a URL).
   */
  spotlight?: boolean | string;
  /** Default: `SENTRY_ENVIRONMENT`, else "ci" under CI and "local" otherwise. */
  environment?: string;
  /** Default: `SENTRY_RELEASE`, else `GITHUB_SHA`, else the checkout's commit. */
  release?: string;
  /** One trace per test file: spans for describe blocks, tests, hooks and traced calls (default true). */
  traces?: boolean;
  /**
   * Fraction of test files sent as traces, for suites big enough to matter for span quota.
   * Failures and flaky tests are always sent. Default: `SENTRY_TRACES_SAMPLE_RATE`, else 1.
   */
  tracesSampleRate?: number;
  /** An issue per failing test, grouped by test (default true). */
  failures?: boolean;
  /** An issue per test that failed and then passed on a retry (default true). */
  flaky?: boolean;
  /**
   * Attach the page when a test failed (its HTML, and with @ctrl/dom its accessibility snapshot)
   * and whatever "sentry-tests:failure" subscribers add, to failure events (default true).
   */
  attachments?: boolean;
  /** Extra tags on every event. */
  tags?: Record<string, string>;
}

export interface ResolvedOptions {
  targets: Target[];
  environment: string;
  release: string | undefined;
  traces: boolean;
  tracesSampleRate: number;
  failures: boolean;
  flaky: boolean;
  attachments: boolean;
  tags: Record<string, string>;
}

const SPOTLIGHT_DEFAULT = "http://localhost:8969/stream";

/** Where reports go and what they contain, or null when there is nowhere to send them. */
export function resolveOptions(options: SentryTestsOptions = {}, env: NodeJS.ProcessEnv = process.env): ResolvedOptions | null {
  const targets: Target[] = [];
  const dsn = options.dsn ?? env.SENTRY_DSN;
  if (dsn) {
    const parsed = parseDsn(dsn);
    targets.push({ label: parsed.host, url: parsed.url, dsn: parsed });
  }
  const spotlight = options.spotlight ?? spotlightFromEnv(env.SENTRY_SPOTLIGHT);
  if (spotlight) targets.push({ label: "Spotlight", url: spotlight === true ? SPOTLIGHT_DEFAULT : spotlight, dsn: null });
  if (targets.length === 0) return null;
  return {
    targets,
    environment: options.environment ?? env.SENTRY_ENVIRONMENT ?? (env.CI ? "ci" : "local"),
    release: options.release ?? env.SENTRY_RELEASE ?? env.GITHUB_SHA ?? gitCommit(),
    traces: options.traces ?? true,
    tracesSampleRate: sampleRate(options.tracesSampleRate ?? env.SENTRY_TRACES_SAMPLE_RATE),
    failures: options.failures ?? true,
    flaky: options.flaky ?? true,
    attachments: options.attachments ?? true,
    tags: options.tags ?? {},
  };
}

function sampleRate(value: number | string | undefined): number {
  const rate = typeof value === "string" ? Number(value) : (value ?? 1);
  return Number.isFinite(rate) ? Math.min(1, Math.max(0, rate)) : 1;
}

function spotlightFromEnv(value: string | undefined): boolean | string {
  if (value === undefined || value === "" || value === "0" || value.toLowerCase() === "false") return false;
  if (value === "1" || value.toLowerCase() === "true") return true;
  return value;
}

function gitCommit(): string | undefined {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || undefined;
  } catch {
    return undefined;
  }
}
