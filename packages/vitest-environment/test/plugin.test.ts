/**
 * The ctrlDom() Vitest plugin (publish/ctrl-dom/vitest.js, published as `@ctrl/dom/vitest`):
 * the worker flags it adds per resolved pool.
 *
 * Spec: Node.js CLI options — https://nodejs.org/api/cli.html#--importmodule (the compile-cache
 * preload), https://nodejs.org/api/module.html#moduleenablecompilecacheoptions, and V8's
 * `--min-semi-space-size`; worker threads reject V8 flags in `execArgv`
 * (https://nodejs.org/api/worker_threads.html#new-workerfilename-options, ERR_WORKER_INVALID_EXEC_ARGV).
 * Vitest plugin API — `configureVitest({ project })`, https://vitest.dev/api/advanced/plugin.
 */
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ctrlDom, workerExecArgv } from "../../../publish/ctrl-dom/vitest.js";

const SEMI = "--min-semi-space-size=16";
const isCompileCacheImport = (arg: string) => arg.startsWith("--import=data:text/javascript,") && arg.includes("enableCompileCache");

beforeEach(() => {
  // This repository's Vitest config turns the compile cache on for every test (vitest.config.ts).
  vi.stubEnv("CTRL_DOM_COMPILE_CACHE", undefined);
  vi.stubEnv("RTD_COMPILE_CACHE", undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("workerExecArgv — worker flags per pool", () => {
  test("forked pools (forks, vmForks) get a 16 MB young generation", () => {
    expect(workerExecArgv({ pool: "forks" })).toEqual([SEMI]);
    expect(workerExecArgv({ pool: "vmForks" })).toEqual([SEMI]);
    expect(workerExecArgv({})).toEqual([SEMI]); // Vitest's default pool is forks
  });

  test("thread pools and custom pools get no V8 flag (invalid in a worker thread's execArgv)", () => {
    expect(workerExecArgv({ pool: "threads" })).toEqual([]);
    expect(workerExecArgv({ pool: "vmThreads" })).toEqual([]);
    expect(workerExecArgv({ pool: "./my-pool.js" })).toEqual([]);
  });

  test("a semi-space size already in execArgv wins", () => {
    expect(workerExecArgv({ pool: "forks", execArgv: ["--max-semi-space-size=64"] })).toEqual([]);
    expect(workerExecArgv({ pool: "forks", execArgv: ["--min-semi-space-size=2"] })).toEqual([]);
  });

  test("compileCache adds a preload that enables the compile cache at process start, in every pool", () => {
    for (const pool of ["forks", "threads", "vmThreads"]) {
      const flags = workerExecArgv({ pool, compileCache: true });
      expect(flags.filter(isCompileCacheImport)).toHaveLength(1);
    }
  });

  test("CTRL_DOM_COMPILE_CACHE=0/1 overrides compileCache, as for the environment", () => {
    vi.stubEnv("CTRL_DOM_COMPILE_CACHE", "0");
    expect(workerExecArgv({ pool: "threads", compileCache: true })).toEqual([]);
    vi.stubEnv("CTRL_DOM_COMPILE_CACHE", "1");
    expect(workerExecArgv({ pool: "threads", compileCache: false }).filter(isCompileCacheImport)).toHaveLength(1);
  });

  test("the compile-cache preload is a valid --import: Node runs it and the cache is on", () => {
    const [flag] = workerExecArgv({ pool: "threads", compileCache: true });
    const env = { ...process.env, NODE_COMPILE_CACHE: undefined, NODE_DISABLE_COMPILE_CACHE: undefined };
    const run = spawnSync(process.execPath, [flag, "-e", 'console.log(typeof require("node:module").getCompileCacheDir())'], { encoding: "utf8", env });
    expect(run.stderr).toBe("");
    expect(run.stdout.trim()).toBe("string");
  });
});

describe("ctrlDom().configureVitest — flags follow the resolved pool", () => {
  type Hook = (context: { project: { config: Record<string, unknown> } }) => void;
  const configure = (options: Parameters<typeof ctrlDom>[0], config: Record<string, unknown>) => {
    (ctrlDom(options).configureVitest as unknown as Hook)({ project: { config } });
    return config.execArgv as string[];
  };

  test("appends to the project's execArgv for forks, keeping the user's flags first", () => {
    const argv = configure({}, { pool: "forks", execArgv: ["--conditions=dev"] });
    expect(argv[0]).toBe("--conditions=dev");
    expect(argv).toContain(SEMI);
    expect(argv.filter(isCompileCacheImport)).toHaveLength(1); // Testing Library routed: compileCache on
  });

  test("testingLibrary: false leaves the compile cache off; threads get nothing", () => {
    expect(configure({ testingLibrary: false }, { pool: "forks", execArgv: [] })).toEqual([SEMI]);
    expect(configure({ testingLibrary: false }, { pool: "threads", execArgv: [] })).toEqual([]);
  });

  test("browser projects are left alone", () => {
    expect(configure({}, { pool: "forks", execArgv: [], browser: { enabled: true } })).toEqual([]);
  });
});
