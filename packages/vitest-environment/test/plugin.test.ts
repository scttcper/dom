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
import { constants, createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
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
  type Hook = (context: {
    project: { config: Record<string, unknown> };
    defineCacheKeyGenerator: (generate: () => string) => void;
  }) => void;
  const configure = (options: Parameters<typeof ctrlDom>[0], config: Record<string, unknown>) => {
    (ctrlDom(options).configureVitest as unknown as Hook)({ project: { config }, defineCacheKeyGenerator() {} });
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

describe("ctrlDom({ sharedWorkers }) — Vitest `isolate: false` with the plugin's setup file first, https://vitest.dev/config/#isolate", () => {
  type Config = { test: { isolate?: boolean; server: { deps: { inline?: RegExp[]; external?: RegExp[] } } } };
  type Hook = (context: {
    project: { config: Record<string, unknown> };
    defineCacheKeyGenerator: (generate: () => string) => void;
  }) => void;
  const config = (options: Parameters<typeof ctrlDom>[0]) =>
    (ctrlDom(options).config as unknown as (config: object) => Config)({});
  const configured = (options: Parameters<typeof ctrlDom>[0], project: Record<string, unknown>) => {
    (ctrlDom(options).configureVitest as unknown as Hook)({
      project: { config: project },
      defineCacheKeyGenerator() {},
    });
    return project as { setupFiles: string[]; env?: Record<string, string> };
  };
  const project = (extra: Record<string, unknown> = {}) => ({
    pool: "forks",
    execArgv: [],
    setupFiles: ["/project/setup.ts"],
    sequence: { hooks: "stack" },
    ...extra,
  });

  test("off by default: `isolate` and the setup files are the project's", () => {
    expect(config({}).test.isolate).toBeUndefined();
    expect(config({}).test.server.deps.inline).toBeUndefined();
    expect(configured({}, project()).setupFiles).toEqual(["/project/setup.ts"]);
  });

  test("on: `isolate: false`, and the plugin's setup file first and transformed by Vitest, so it runs again for every test file", () => {
    const { test: options } = config({ sharedWorkers: true });
    expect(options.isolate).toBe(false);
    const { setupFiles } = configured({ sharedWorkers: true }, project());
    expect(setupFiles).toHaveLength(2);
    expect(setupFiles[0]).toMatch(/[\\/]shared-workers\.[jt]s$/);
    expect(setupFiles[1]).toBe("/project/setup.ts");
    expect(options.server.deps.inline!.some((pattern) => pattern.test(setupFiles[0]))).toBe(true);
  });

  test("the VM pools give each file a context of its own already: no setup file", () => {
    for (const pool of ["vmThreads", "vmForks"])
      expect(configured({ sharedWorkers: true }, project({ pool })).setupFiles).toEqual(["/project/setup.ts"]);
  });

  test("a hook order other than Vitest's default leaves out the end-of-file reset, which has to run last — https://vitest.dev/config/#sequence-hooks", () => {
    expect(configured({ sharedWorkers: true }, project()).env).toBeUndefined();
    expect(configured({ sharedWorkers: true }, project({ sequence: { hooks: "list" } })).env).toEqual({
      CTRL_DOM_SHARED_WORKERS_END: "0",
    });
  });

  test("needs @ctrl/dom's Testing Library: stock @testing-library/react registers its cleanup for a worker's first file only", () => {
    expect(() => ctrlDom({ sharedWorkers: true, testingLibrary: false })).toThrow(/sharedWorkers.*testingLibrary/);
  });
});

describe("ctrlDom({ jsxRuntime }) — React's JSX runtime as an ES module without a default export", () => {
  type Resolve = (
    this: { resolve: (id: string) => Promise<{ id: string } | null> },
    id: string,
    importer: string | undefined,
    options: object,
  ) => Promise<string | null>;
  type Hook = (context: {
    project: { config: Record<string, unknown> };
    defineCacheKeyGenerator: (generate: () => string) => void;
  }) => void;
  const require = createRequire(import.meta.url);
  /** resolveId of a plugin that Vitest has configured, with Vite resolving `id` to `resolved`. */
  const resolver = (options: Parameters<typeof ctrlDom>[0], resolved: (id: string) => string | null) => {
    const plugin = ctrlDom(options);
    const keys: string[] = [];
    (plugin.configureVitest as unknown as Hook)({
      project: { config: { pool: "forks", execArgv: [], setupFiles: [], sequence: { hooks: "stack" } } },
      defineCacheKeyGenerator: (generate) => keys.push(generate()),
    });
    const context = { resolve: async (id: string) => (resolved(id) === null ? null : { id: resolved(id)! }) };
    const resolve = (id: string, importer = "/project/app.tsx") =>
      (plugin.resolveId as unknown as Resolve).call(context, id, importer, {});
    return { resolve, keys };
  };
  const react = (id: string) => require.resolve(id);

  test("the project's react/jsx-runtime and react/jsx-dev-runtime resolve to the copies next to the plugin", async () => {
    const { resolve } = resolver({}, react);
    expect(await resolve("react/jsx-runtime")).toMatch(/[\\/]jsx-runtime\.[jt]s$/);
    expect(await resolve("react/jsx-dev-runtime")).toMatch(/[\\/]jsx-dev-runtime\.[jt]s$/);
    expect(await resolve("react")).toBeNull();
    expect(await resolve("react-dom/client")).toBeNull();
  });

  test("the copies export what React's runtimes export, and nothing as default (Vitest wraps a module with a default in a Proxy)", async () => {
    const dev = await import("../src/jsx-dev-runtime.ts");
    const runtime = await import("../src/jsx-runtime.ts");
    const reactDev = require("react/jsx-dev-runtime") as Record<string, unknown>;
    const reactRuntime = require("react/jsx-runtime") as Record<string, unknown>;
    expect(Object.keys(dev).sort()).toEqual(Object.keys(reactDev).sort());
    expect(Object.keys(runtime).sort()).toEqual(Object.keys(reactRuntime).sort());
    for (const key of Object.keys(reactDev)) expect((dev as Record<string, unknown>)[key]).toBe(reactDev[key]);
    for (const key of Object.keys(reactRuntime))
      expect((runtime as Record<string, unknown>)[key]).toBe(reactRuntime[key]);
  });

  test("a copy's own import of the runtime is React's", async () => {
    const { resolve } = resolver({}, react);
    const copy = (await resolve("react/jsx-runtime"))!;
    expect(await resolve("react/jsx-runtime", copy)).toBeNull();
  });

  test("left alone when the project resolves the runtime to something else (an alias to another JSX runtime, a second React)", async () => {
    const { resolve } = resolver({}, () => fileURLToPath(import.meta.url));
    expect(await resolve("react/jsx-runtime")).toBeNull();
    expect(await resolver({}, () => null).resolve("react/jsx-dev-runtime")).toBeNull();
  });

  test("`jsxRuntime: false`, and a Vite build or dev server that shares the plugins, resolve nothing", async () => {
    expect(await resolver({ jsxRuntime: false }, react).resolve("react/jsx-runtime")).toBeNull();
    const outsideVitest = ctrlDom({}).resolveId as unknown as Resolve;
    const context = { resolve: async (id: string) => ({ id: react(id) }) };
    expect(await outsideVitest.call(context, "react/jsx-runtime", "/project/app.tsx", {})).toBeNull();
  });

  test("the options that change what imports resolve to are in the key of Vitest's on-disk module cache — https://vitest.dev/api/advanced/plugin", () => {
    const key = (options: Parameters<typeof ctrlDom>[0]) => resolver(options, react).keys[0];
    expect(new Set([key({}), key({ jsxRuntime: false }), key({ testingLibrary: false })]).size).toBe(3);
    expect(key({})).toBe(key({ debug: "aria" }));
  });
});
