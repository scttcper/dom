// What the reporters send and where. Every option has an environment variable fallback, so CI can
// turn reporting on without touching the test config.

import { execFileSync } from "node:child_process";
import { parseDsn, type Target } from "./envelope.ts";

export interface CtrlDomSentryOptions {
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
  /** One trace per test file, a span per test and per traced call (default true). */
  traces?: boolean;
  /** An issue per failing test, grouped by test (default true). */
  failures?: boolean;
  /** An issue per test that failed and then passed on a retry (default true). */
  flaky?: boolean;
  /** Attach the page's accessibility snapshot and HTML to failure events (default true). */
  snapshots?: boolean;
  /** Extra tags on every event. */
  tags?: Record<string, string>;
}

export interface ResolvedOptions {
  targets: Target[];
  environment: string;
  release: string | undefined;
  traces: boolean;
  failures: boolean;
  flaky: boolean;
  snapshots: boolean;
  tags: Record<string, string>;
}

const SPOTLIGHT_DEFAULT = "http://localhost:8969/stream";

/** Where reports go and what they contain, or null when there is nowhere to send them. */
export function resolveOptions(options: CtrlDomSentryOptions = {}, env: NodeJS.ProcessEnv = process.env): ResolvedOptions | null {
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
    failures: options.failures ?? true,
    flaky: options.flaky ?? true,
    snapshots: options.snapshots ?? true,
    tags: options.tags ?? {},
  };
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
