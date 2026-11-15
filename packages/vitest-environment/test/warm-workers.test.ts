/**
 * The ctrlDom() plugin's warm workers under a real Vitest run (spawned): six fixture files, two
 * workers, Vitest's default pool. Workers forked ahead of their file (src/warm-forks.ts) must
 * change nothing but when a process starts: every file still gets a process and a window of its
 * own, sees the environment variables of the run, and no process outlives the run. An @ctrl/dom
 * addition, not a spec; what it relies on:
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
import { afterAll, describe, expect, test } from "vitest";

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
  test("every file passes in a process and window of its own, most of them forked ahead, none left over", () => {
    const { status, rows, warm } = fixture({});
    expect(status).toBe(0);
    expect(rows.map((r) => r.file).sort()).toEqual(FILES);
    expect(new Set(rows.map((r) => r.pid)).size).toBe(6);
    // The DOM's Event is the global one and Node's fetch globals are there, as without the preload.
    expect(rows.every((r) => r.ownEvent && r.formData === "function")).toBe(true);
    // Two workers start at once (one in the plugin's first spare); the other four files find one waiting.
    expect(warm).toEqual({ forked: 5, adopted: 5, started: 6 });
    expect(rows.filter((r) => alive(r.pid))).toEqual([]);
  });

  test("a single file starts in the worker forked while Vitest was starting, and no other is forked", () => {
    const { status, rows, warm } = fixture({}, ["a.fixture.ts"]);
    expect(status).toBe(0);
    expect(rows.map((r) => r.file)).toEqual(["a"]);
    expect(warm).toEqual({ forked: 1, adopted: 1, started: 1 });
  });

  test("an environment variable a global setup file sets reaches every file: the spare forked before it is not used", () => {
    const { status, rows, warm } = fixture({ FIXTURE_GLOBAL_SETUP: "1" });
    expect(status).toBe(0);
    expect(rows.map((r) => r.fromGlobalSetup)).toEqual(Array(6).fill("set"));
    expect(new Set(rows.map((r) => r.pid)).size).toBe(6);
    // The first spare (forked without the variable) plus four that fit; the two first files fork their own.
    expect(warm).toEqual({ forked: 5, adopted: 4, started: 6 });
  });

  test("off with `warmWorkers: false`, CTRL_DOM_WARM_WORKERS=0, another pool, or a debugger flag", () => {
    for (const [env, args] of [
      [{ FIXTURE_WARM: "0" }, []],
      [{ CTRL_DOM_WARM_WORKERS: "0" }, []],
      [{}, ["--pool", "threads"]],
      [{}, ["--execArgv=--inspect-port=0"]],
    ] as [Record<string, string>, string[]][]) {
      const { status, rows, warm } = fixture(env, args);
      expect([env, args, status, rows.length, warm]).toEqual([env, args, 0, 6, null]);
    }
  });
});
