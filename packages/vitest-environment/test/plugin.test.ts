/**
 * The ctrlDom() Vitest plugin (src/plugin.ts, published as `@ctrl/dom/vitest`):
 * the worker flags it adds per resolved pool, and where the compile cache it turns on (and the
 * environment's, src/index.ts) ends up.
 *
 * Spec: Node.js CLI options — https://nodejs.org/api/cli.html#--importmodule (the compile-cache
 * preload), https://nodejs.org/api/module.html#moduleenablecompilecacheoptions.
 * Vitest plugin API — `configureVitest({ project })`, https://vitest.dev/api/advanced/plugin.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { constants } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ctrlDom, workerExecArgv } from "../src/plugin.ts";

const isCompileCacheImport = (arg: string) =>
  arg.startsWith("--import=data:text/javascript,") && arg.includes("enableCompileCache");

const { ALREADY_ENABLED } = constants.compileCacheStatus;

/** Node code printing what module.enableCompileCache() reports once the flags before it ran. */
const REPORT = 'console.log(JSON.stringify(process.getBuiltinModule("node:module").enableCompileCache()))';

/**
 * What module.enableCompileCache() reports in a fresh Node run with `args`, which end with REPORT:
 * ALREADY_ENABLED and the directory once `args` turned the cache on, or why Node could not. The
 * run gets a temp directory of its own, "<tmp>" in the result, since Node's default cache
 * directory is `<tmpdir>/node-compile-cache`; `prepare` can set it up first. NODE_COMPILE_CACHE
 * would turn the cache on by itself (this repository's Vitest config sets it), and Vitest's v8
 * coverage sets NODE_DISABLE_COMPILE_CACHE.
 */
function compileCacheAfter(args: string[], prepare?: (tmp: string) => void): unknown {
  const tmp = mkdtempSync(join(tmpdir(), "ctrl-dom-compile-cache-"));
  try {
    prepare?.(tmp);
    const env = { ...process.env, TMPDIR: tmp, NODE_COMPILE_CACHE: undefined, NODE_DISABLE_COMPILE_CACHE: undefined };
    const run = spawnSync(process.execPath, args, { encoding: "utf8", env });
    expect(run.stderr).toBe("");
    const report = JSON.parse(run.stdout) as { directory?: string };
    if (report.directory !== undefined) report.directory = report.directory.replace(tmp, "<tmp>");
    return report;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** A default cache directory this user cannot create its own directory in, as with another user's. */
const othersDefaultDirectory = (tmp: string) => mkdirSync(join(tmp, "node-compile-cache"), { mode: 0o555 });
const perUserDirectory = new RegExp(`^<tmp>/node-compile-cache-${process.getuid?.()}/`);

beforeEach(() => {
  // This repository's Vitest config turns the compile cache on for every test (vitest.config.ts).
  vi.stubEnv("CTRL_DOM_COMPILE_CACHE", undefined);
  vi.stubEnv("CTRL_DOM_COMPILE_CACHE", undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("workerExecArgv — worker flags per pool", () => {
  test("no V8 flags: without the compile cache nothing is added, in any pool", () => {
    expect(workerExecArgv({})).toEqual([]);
    expect(workerExecArgv({ compileCache: false })).toEqual([]);
  });

  test("compileCache adds a preload that enables the compile cache at process start, in every pool", () => {
    const flags = workerExecArgv({ compileCache: true });
    expect(flags.filter(isCompileCacheImport)).toHaveLength(1);
  });

  test("CTRL_DOM_COMPILE_CACHE=0/1 overrides compileCache, as for the environment", () => {
    vi.stubEnv("CTRL_DOM_COMPILE_CACHE", "0");
    expect(workerExecArgv({ compileCache: true })).toEqual([]);
    vi.stubEnv("CTRL_DOM_COMPILE_CACHE", "1");
    expect(workerExecArgv({ compileCache: false }).filter(isCompileCacheImport)).toHaveLength(1);
  });

  test("the compile-cache preload is a valid --import: Node runs it and the cache is on, in Node's default directory", () => {
    const [flag] = workerExecArgv({ pool: "threads", compileCache: true });
    expect(compileCacheAfter([flag!, "-e", REPORT])).toEqual({
      status: ALREADY_ENABLED,
      directory: expect.stringMatching(/^<tmp>\/node-compile-cache\//),
    });
  });
});

describe("the compile cache when Node cannot use its default directory — module.enableCompileCache(), https://nodejs.org/api/module.html#moduleenablecompilecacheoptions", () => {
  // GitHub's Ubuntu 26.04 runner images ship a root-owned /tmp/node-compile-cache: the runner user
  // cannot create its own directory in it, and enableCompileCache() fails without a word.
  test("the worker preload turns it on in a per-user node-compile-cache-<uid> beside the default directory", () => {
    const [flag] = workerExecArgv({ pool: "threads", compileCache: true });
    expect(compileCacheAfter([flag!, "-e", REPORT], othersDefaultDirectory)).toEqual({
      status: ALREADY_ENABLED,
      directory: expect.stringMatching(perUserDirectory),
    });
  });

  test("the environment's enableNodeCompileCache() does the same, and uses the default directory when it can", () => {
    const environment = JSON.stringify(new URL("../src/index.ts", import.meta.url).href);
    const code = `import { enableNodeCompileCache } from ${environment}; enableNodeCompileCache(); ${REPORT}`;
    expect(compileCacheAfter(["--input-type=module", "-e", code], othersDefaultDirectory)).toEqual({
      status: ALREADY_ENABLED,
      directory: expect.stringMatching(perUserDirectory),
    });
    expect(compileCacheAfter(["--input-type=module", "-e", code])).toEqual({
      status: ALREADY_ENABLED,
      directory: expect.stringMatching(/^<tmp>\/node-compile-cache\//),
    });
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
    expect(argv.filter(isCompileCacheImport)).toHaveLength(1); // Testing Library routed: compileCache on
  });

  test("testingLibrary: false leaves the compile cache off: no flags", () => {
    expect(configure({ testingLibrary: false }, { pool: "forks", execArgv: [] })).toEqual([]);
    expect(configure({ testingLibrary: false }, { pool: "threads", execArgv: [] })).toEqual([]);
  });

  test("browser projects are left alone", () => {
    expect(configure({}, { pool: "forks", execArgv: [], browser: { enabled: true } })).toEqual([]);
  });
});
