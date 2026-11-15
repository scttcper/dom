/**
 * The ctrlDom() plugin's warm workers under a real Vitest run (spawned, two runs: each costs a
 * second or two of CI): six fixture files, two workers, Vitest's default pool. Workers forked ahead of their file (src/warm-forks.ts) must
 * change nothing but when a process starts: every file still gets a process and a window of its
 * own, sees the environment variables of the run, and no process outlives the run. Where the
 * plugin must not touch the workers at all is checked on its `configureVitest` hook, without a run.
 * An @ctrl/dom addition, not a spec; what it relies on:
 *
 * Vitest `pool` — https://vitest.dev/config/#pool (forks: a child process per worker)
 * Vitest `isolate` — https://vitest.dev/config/#isolate (true: a new worker for every test file)
 * Vitest `globalSetup` — https://vitest.dev/config/#globalsetup
 * Node `child_process.fork` — https://nodejs.org/api/child_process.html#child_processforkmodulepath-args-options
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, test, vi } from "vitest";
import { ctrlDom } from "../src/plugin.ts";

const pkg = fileURLToPath(new URL("..", import.meta.url));
const out = mkdtempSync(join(tmpdir(), "ctrl-dom-warm-workers-"));
afterAll(() => rmSync(out, { recursive: true, force: true }));

interface Row {
  file: string;
  pid: number;
  fromGlobalSetup: string | null;
  formData: string;
  ownEvent: boolean;
}

interface Run {
  status: number | null;
  rows: Row[];
  /** `CTRL_DOM_WARM_WORKERS=debug`'s counts, when the plugin printed them. */
  warm: { forked: number; adopted: number; started: number } | null;
}

let run = 0;

function fixture(env: Record<string, string>, args: string[] = []): Run {
  const file = join(out, `run-${run++}.jsonl`);
  writeFileSync(file, "");
  const result = spawnSync(
    "pnpm",
    ["exec", "vitest", "run", "--config", "test/warm-workers/vitest.config.ts", ...args],
    {
      cwd: pkg,
      encoding: "utf8",
      env: { ...process.env, CTRL_DOM_WARM_WORKERS: "debug", FIXTURE_OUT: file, ...env },
    },
  );
  const rows = readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Row);
  const counts = /\[ctrl-dom\] warm workers: (\{.*\})/.exec(result.stderr);
  return { status: result.status, rows, warm: counts === null ? null : JSON.parse(counts[1]) };
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

const FILES = ["a", "b", "c", "d", "e", "f"];

describe("warm workers: a worker forked ahead of its file is still that file's own", () => {
  test(
    "every file passes in a process and window of its own, five of six forked ahead, none left over",
    { timeout: 60_000 },
    () => {
      const { status, rows, warm } = fixture({});
      expect(status).toBe(0);
      expect(rows.map((r) => r.file).sort()).toEqual(FILES);
      expect(new Set(rows.map((r) => r.pid)).size).toBe(6);
      // The DOM's Event is the global one and Node's fetch globals are there, as without the preload.
      expect(rows.every((r) => r.ownEvent && r.formData === "function")).toBe(true);
      // Two workers start at once: one in the spare forked while Vitest was starting, one forked
      // then. The other four files each find a spare waiting, and no spare is forked for nothing.
      expect(warm).toEqual({ forked: 5, adopted: 5, started: 6 });
      expect(rows.filter((r) => alive(r.pid))).toEqual([]);
    },
  );

  test(
    "an environment variable a global setup file sets reaches every file: the spare forked before it is not used",
    { timeout: 60_000 },
    () => {
      const { status, rows, warm } = fixture({ FIXTURE_GLOBAL_SETUP: "1" });
      expect(status).toBe(0);
      expect(rows.map((r) => r.fromGlobalSetup)).toEqual(Array(6).fill("set"));
      expect(new Set(rows.map((r) => r.pid)).size).toBe(6);
      // The first spare (forked without the variable) plus four that fit; the two first files fork their own.
      expect(warm).toEqual({ forked: 5, adopted: 4, started: 6 });
    },
  );
});

describe("warm workers: where the plugin leaves Vitest's workers alone", () => {
  type Hook = (context: {
    project: { config: Record<string, unknown> };
    defineCacheKeyGenerator: (generate: () => string) => void;
  }) => Promise<void>;
  const isPreload = (arg: string) => /^--import=file:.*\/prewarm\.[jt]s$/.test(arg);
  /** The project's worker flags after the plugin configured it: with the preload, its workers are forked ahead. */
  async function preloads(options: Parameters<typeof ctrlDom>[0], config: Record<string, unknown>): Promise<number> {
    const project = { environment: "ctrl-dom", pool: "forks", execArgv: [], ...config };
    await (ctrlDom(options).configureVitest as unknown as Hook)({
      project: { config: project },
      defineCacheKeyGenerator() {},
    });
    return (project.execArgv as string[]).filter(isPreload).length;
  }

  test("`warmWorkers: false` and CTRL_DOM_WARM_WORKERS=0", async () => {
    expect(await preloads({ warmWorkers: false }, {})).toBe(0);
    vi.stubEnv("CTRL_DOM_WARM_WORKERS", "0");
    expect(await preloads({}, {})).toBe(0);
    vi.unstubAllEnvs();
  });

  test("pools whose workers are not forked per file, and projects with another environment", async () => {
    for (const pool of ["threads", "vmThreads", "vmForks"])
      expect([pool, await preloads({}, { pool })]).toEqual([pool, 0]);
    expect(await preloads({}, { environment: "node" })).toBe(0);
  });

  test("a debugger or profiler: a port or an output file per process cannot be claimed ahead of time", async () => {
    expect(await preloads({}, { inspect: true })).toBe(0);
    expect(await preloads({}, { inspectBrk: true })).toBe(0);
    for (const flag of ["--inspect", "--inspect-brk=9229", "--cpu-prof", "--heap-prof"])
      expect([flag, await preloads({}, { execArgv: [flag] })]).toEqual([flag, 0]);
  });
});
