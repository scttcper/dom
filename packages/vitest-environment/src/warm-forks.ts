// Warm workers for Vitest's default pool (`pool: "forks"`), used by the ctrlDom() plugin.
//
// With `isolate: true` Vitest forks a worker process when a test file is scheduled, and the file
// waits while Node boots, Vitest's worker runtime loads (~70 ms) and the environment is set up:
// more than a short React test file then takes to run. Here the next workers are forked ahead of
// time, each still used for exactly one test file (nothing is reused: the isolation is Vitest's),
// so that boot overlaps the previous file's tests on cores Vitest leaves idle. With ./prewarm.ts
// as the workers' preload the DOM and Node's fetch globals are loaded by then too. comparison/'s
// 100 React test files, 4 workers on 12 cores: 4.39 s → 2.85 s. When every core is busy
// (`maxWorkers` = cores − 1, Vitest's default for `vitest run`) the boot has nowhere to overlap and
// the run takes what it took (2.57 → 2.53 s); a spare never costs a test file its core for long,
// since at most as many are kept as there are cores without a worker.
//
// How: Vitest's Pool creates a `ForksPoolWorker` per file and calls `start()`, which does
// `this._fork ||= fork(entrypoint, [], { env, execArgv, stdio: "pipe", serialization: "advanced" })`
// (vitest/dist/chunks/index.*.js). `start()` is wrapped to hand over a spare forked the same way
// for the same entry point, flags and environment variables when there is one. Only workers whose
// flags carry this plugin's preload are touched, and only while `start()` still has that shape:
// anything else falls through to Vitest's own code.

import { type ChildProcess, fork } from "node:child_process";
import { availableParallelism } from "node:os";
import { isatty } from "node:tty";
import { resolve } from "node:path";

/** What a fork is made from; a spare fits a worker when all three are equal by value. */
interface Template {
  entrypoint: string;
  execArgv: readonly string[];
  env: Record<string, string | undefined>;
}

interface Spare {
  child: ChildProcess;
  key: string;
}

interface ForksWorker {
  entrypoint: string;
  execArgv: string[];
  env: Record<string, string | undefined>;
  _fork: ChildProcess | undefined;
}

interface ForksWorkerClass {
  prototype: { start(this: ForksWorker): Promise<void>; [PATCHED]?: true };
}

const PATCHED = Symbol.for("ctrl-dom.warm-forks");
const MAX_SPARES = 4;

const spares: Spare[] = [];
interface Limit {
  /** Spares kept while files are waiting for a worker. */
  spares: number;
  /** Spares kept when none are (watch mode: for the next rerun). */
  idle: number;
}

/** Worker flags (the preload `--import`) that mark a project's workers as warmable → how many spares it may keep. */
const projects = new Map<string, Limit>();
/** Workers started since the last drain: spares are only kept once a run has shown it has more than one file. */
let starts = 0;
let draining = false;
/** Since the process started, for CTRL_DOM_WARM_WORKERS=debug and tests: spares forked, and workers that started from one. */
const stats = { forked: 0, adopted: 0, started: 0 };

const keyOf = (t: Template): string => JSON.stringify([t.entrypoint, t.execArgv, t.env]);

function setRef(child: ChildProcess, on: boolean): void {
  // A spare must not keep Vitest alive: its handle, IPC channel and pipes are unref'd until it is
  // handed to a worker. (A spare whose parent is gone exits by itself: the closed channel was the
  // only thing its event loop was waiting on.)
  const streams = [child.stdout, child.stderr] as unknown as ({ ref?(): void; unref?(): void } | null)[];
  if (on) {
    child.ref();
    child.channel?.ref();
    for (const s of streams) s?.ref?.();
  } else {
    child.unref();
    child.channel?.unref();
    for (const s of streams) s?.unref?.();
  }
}

function spawnSpare(template: Template): void {
  let child: ChildProcess;
  try {
    child = fork(template.entrypoint, [], {
      env: template.env,
      execArgv: [...template.execArgv],
      stdio: "pipe",
      serialization: "advanced",
    });
  } catch {
    return;
  }
  stats.forked++;
  const spare: Spare = { child, key: keyOf(template) };
  const drop = (): void => {
    const i = spares.indexOf(spare);
    if (i !== -1) spares.splice(i, 1);
  };
  child.once("exit", drop);
  child.once("error", drop);
  setRef(child, false);
  spares.push(spare);
}

/**
 * A live spare forked from `template`, removed from the list. Spares forked from something else
 * stay: another project's workers (a workspace), or what a project was before a global setup file
 * changed its environment variables, which nothing will use and the drain stops.
 */
function takeSpare(key: string): ChildProcess | undefined {
  for (let i = 0; i < spares.length; i++) {
    const spare = spares[i];
    if (spare.key !== key) continue;
    spares.splice(i--, 1);
    const { child } = spare;
    child.removeAllListeners("exit");
    child.removeAllListeners("error");
    if (child.exitCode !== null || child.signalCode !== null || !child.connected) continue;
    setRef(child, true);
    return child;
  }
  // Bounded: the oldest go once more are waiting than any project keeps.
  while (spares.length > MAX_SPARES * 2) spares.shift()!.child.kill();
  return undefined;
}

/** Stops every spare. Called when Vitest closes and when the process exits. */
export function drainWarmForks(): void {
  starts = 0;
  early.length = 0;
  for (const spare of spares.splice(0)) spare.child.kill();
}

function wrapStart(Worker: ForksWorkerClass): boolean {
  const proto = Worker.prototype;
  if (proto[PATCHED]) return true;
  const original = proto.start;
  // The shape this relies on (see the header); a Vitest whose worker starts differently is left alone.
  if (
    typeof original !== "function" ||
    !/this\._fork\s*\|\|=\s*fork\(/.test(Function.prototype.toString.call(original))
  )
    return false;
  proto.start = async function start(this: ForksWorker): Promise<void> {
    const limit = draining || this._fork !== undefined ? undefined : projects.get(flagOf(this.execArgv));
    if (limit === undefined) return original.call(this);
    const template: Template = { entrypoint: this.entrypoint, execArgv: this.execArgv, env: this.env };
    const key = keyOf(template);
    this._fork = takeSpare(key);
    stats.started++;
    if (this._fork !== undefined) stats.adopted++;
    await original.call(this);
    starts++;
    // One file needs no spare; from the second on, as many as have been used, up to the limit and
    // to the files that still have no worker (all projects' files: an upper bound). In watch mode
    // one more waits for the next rerun, whose first file then starts in it.
    let waiting = 0;
    for (const spare of spares) if (spare.key === key) waiting++;
    const wanted = Math.max(Math.min(limit.spares, starts - 1, remainingFiles()), limit.idle);
    for (; waiting < wanted; waiting++) spawnSpare(template);
  };
  proto[PATCHED] = true;
  return true;
}

/** Test files scheduled so far (the first run's, plus each rerun's); Infinity when Vitest's state cannot say. */
let plannedFiles: () => number = () => Infinity;
let rerunFiles = 0;
/** Test files that have not started a worker yet. */
const remainingFiles = (): number => plannedFiles() + rerunFiles - stats.started;

/** First workers to fork once every project is configured (enableWarmForks). */
const early: Template[] = [];
let earlyScheduled = false;
let exitHooked = false;

let preloadFlag = "";
const flagOf = (execArgv: readonly string[]): string => (execArgv.includes(preloadFlag) ? preloadFlag : "");

interface WarmProject {
  config: {
    pool: unknown;
    isolate?: boolean;
    maxWorkers?: number;
    execArgv?: string[];
    env?: Record<string, string>;
    inspect?: unknown;
    inspectBrk?: unknown;
    coverage?: { enabled?: boolean; provider?: string };
  };
  vite: { config: { isProduction: boolean; ssr: { resolve?: { conditions?: string[] } } } };
  vitest: {
    distPath: string;
    /** Vitest's StateManager: `pathsSet` holds the files of the runs so far (TestRun.start). */
    state?: { pathsSet?: Set<string>; getPaths?(): string[] };
    onTestsRerun?(fn: (specifications: readonly unknown[]) => void): void;
    config: { watch?: boolean; env?: Record<string, string>; coverage?: { enabled?: boolean; provider?: string } };
    onClose(fn: () => void): void;
  };
}

/** Flags under which a process cannot be forked ahead of its file: a debugger port or a profile per process. */
const UNWARMABLE = /^--(inspect|cpu-prof|heap-prof|diagnostic-dir|prof\b)/;

/**
 * Turns warm workers on for `project` (ctrlDom()'s `configureVitest`): adds `preload` to its
 * workers' flags and wraps Vitest's fork worker. Returns false, changing nothing, when the project
 * does not use the forks pool, a debugger or profiler is attached, or this Vitest's fork worker is
 * not the one this was written against.
 */
export async function enableWarmForks(project: WarmProject, preload: string): Promise<boolean> {
  const config = project.config;
  if (config.pool !== "forks" || config.inspect || config.inspectBrk) return false;
  if ("Deno" in globalThis || "Bun" in globalThis || process.versions.pnp !== undefined) return false;
  if ([...process.execArgv, ...(config.execArgv ?? [])].some((arg) => UNWARMABLE.test(arg))) return false;
  let node: { ForksPoolWorker?: ForksWorkerClass; distDir?: string; rootDir?: string };
  try {
    node = (await import("vitest/node")) as never;
  } catch {
    return false;
  }
  // Another copy of Vitest than the one running would have another ForksPoolWorker.
  if (node.ForksPoolWorker === undefined || node.distDir !== project.vitest.distPath) return false;
  if (!wrapStart(node.ForksPoolWorker)) return false;

  preloadFlag = `--import=${preload}`;
  config.execArgv = [...(config.execArgv ?? []), preloadFlag];
  // Spares only where Vitest leaves cores idle, and never more than it runs workers. Without
  // isolation Vitest keeps a worker for many files: only the first one can start warm.
  const workers = Math.max(1, config.maxWorkers ?? 1);
  const isolated = config.isolate !== false;
  const watch = project.vitest.config.watch === true;
  projects.set(preloadFlag, {
    spares: isolated ? Math.max(1, Math.min(MAX_SPARES, workers, availableParallelism() - workers)) : 0,
    idle: isolated && watch ? 1 : 0,
  });
  draining = false;
  const state = project.vitest.state;
  plannedFiles = () => state?.pathsSet?.size ?? state?.getPaths?.().length ?? Infinity;
  // A rerun's files are already in the state's set of paths.
  project.vitest.onTestsRerun?.((specifications) => {
    rerunFiles += specifications.length;
  });
  project.vitest.onClose(() => {
    if (draining) return;
    draining = true;
    drainWarmForks();
    if (process.env.CTRL_DOM_WARM_WORKERS === "debug")
      process.stderr.write(`[ctrl-dom] warm workers: ${JSON.stringify(stats)}\n`);
  });
  if (!exitHooked) {
    exitHooked = true;
    process.once("exit", drainWarmForks);
  }

  // The first worker, forked while Vitest is still starting (its server, the file search, the
  // first transforms), from what Vitest will fork it from (createPool in vitest/dist/chunks/index.*.js:
  // `env` and `execArgv` of a task). A guess: when it turns out wrong the spare is stopped and
  // Vitest forks its own. Not with coverage, which changes the workers' environment variables.
  const coverage = project.vitest.config.coverage;
  if (coverage?.enabled || node.rootDir === undefined) return true;
  const conditions = [...new Set(project.vite.config.ssr.resolve?.conditions ?? [])]
    .map((c) =>
      c === "development|production" ? (project.vite.config.isProduction ? "production" : "development") : c,
    )
    .filter((c) =>
      c === "production"
        ? project.vite.config.isProduction
        : c === "development"
          ? !project.vite.config.isProduction
          : true,
    )
    .flatMap((c) => ["--conditions", c]);
  early.push({
    entrypoint: resolve(project.vitest.distPath, "workers/forks.js"),
    execArgv: [
      "--experimental-import-meta-resolve",
      "--require",
      resolve(node.rootDir, "./suppress-warnings.cjs"),
      ...conditions,
      ...config.execArgv,
    ],
    env: {
      ...process.env,
      TEST: "true",
      VITEST: "true",
      NODE_ENV: process.env.NODE_ENV || "test",
      VITEST_MODE: watch ? "WATCH" : "RUN",
      FORCE_TTY: isatty(1) ? "true" : "",
      ...project.vitest.config.env,
      ...config.env,
    },
  });
  // Once every project's hook has run: with several warm projects (a workspace) there is no
  // telling whose file comes first, and a spare per project would mostly be forked for nothing.
  if (!earlyScheduled) {
    earlyScheduled = true;
    setImmediate(() => {
      earlyScheduled = false;
      const templates = early.splice(0);
      if (templates.length === 1 && !draining) spawnSpare(templates[0]);
    });
  }
  return true;
}

/** @internal For tests: the spares alive now, and the counts since the process started. */
export function warmForksState(): { spares: number; forked: number; adopted: number; started: number } {
  return { spares: spares.length, ...stats };
}
