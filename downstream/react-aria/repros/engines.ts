// Shared helpers for the react-aria downstream repros.
//
// Jest-environment repros construct the environments directly (no Jest run): ours
// (packages/jest-environment) and, as the oracle, jest-environment-jsdom from the upstream
// checkout's frozen install (`pnpm downstream:react-aria --install`; the oracle cases are skipped
// when the checkout is missing). DOM repros use the jsdom from packages/react's devDependencies.
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createWindow, installGlobals } from "../../../packages/dom/src/index.ts";

const checkout = fileURLToPath(new URL("../checkout/", import.meta.url));
export const hasCheckout = existsSync(`${checkout}node_modules/jest-environment-jsdom/package.json`);
const requireFromCheckout = createRequire(`${checkout}package.json`);
const requireFromReact = createRequire(new URL("../../../packages/react/package.json", import.meta.url));
export const { JSDOM } = requireFromReact("jsdom") as { JSDOM: new (html: string, options?: object) => { window: any } };

export type AnyEnvironment = {
  global: any;
  fakeTimersModern: any;
  setup(): Promise<void>;
  teardown(): Promise<void>;
};

/** Minimal Jest 30 `JestEnvironmentConfig` / `EnvironmentContext` (what the environments read). */
export function jestConfig(testEnvironmentOptions: Record<string, unknown> = {}) {
  return {
    config: {
      globalConfig: {},
      projectConfig: { rootDir: "/", testEnvironmentOptions, globals: {}, fakeTimers: {}, setupFiles: [], snapshotSerializers: [] },
    },
    context: { console, docblockPragmas: {}, testPath: "/repro.test.js" },
  };
}

export const environments: Record<"jsdom" | "ctrl-dom", () => Promise<AnyEnvironment | null>> = {
  async jsdom() {
    if (!hasCheckout) return null;
    const { TestEnvironment } = requireFromCheckout("jest-environment-jsdom");
    const { config, context } = jestConfig();
    return new TestEnvironment(config, context);
  },
  async "ctrl-dom"() {
    const { TestEnvironment } = await import("../../../packages/jest-environment/src/index.ts");
    const { config, context } = jestConfig();
    return new TestEnvironment(config as never, context as never) as unknown as AnyEnvironment;
  },
};

export const windows: Record<"jsdom" | "ctrl-dom", () => any> = {
  jsdom: () => new JSDOM("<!doctype html><html><head></head><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true }).window,
  "ctrl-dom": () => createWindow({ url: "http://localhost/" }),
};

export { installGlobals };

/** Run a Jest fixture (repros/fixtures) with the upstream checkout's Jest under one environment. */
export function runJestFixture(fixture: string, engine: "jsdom" | "ctrl-dom", extraArgs: string[] = []): { failures: string[]; message: string } | null {
  if (!hasCheckout) return null;
  const { spawnSync } = requireFromReact("node:child_process") as typeof import("node:child_process");
  const environment = engine === "jsdom" ? "jsdom" : fileURLToPath(new URL("../jest-environment.mjs", import.meta.url));
  const fixtures = fileURLToPath(new URL("./fixtures/", import.meta.url));
  const run = spawnSync(
    process.execPath,
    [
      `${checkout}node_modules/jest/bin/jest.js`,
      "--config",
      JSON.stringify({ rootDir: fixtures, testMatch: [`**/${fixture}`], testEnvironment: environment, transform: {} }),
      "--json",
      "--ci",
      ...extraArgs,
    ],
    { cwd: checkout, encoding: "utf8" },
  );
  const json = JSON.parse(run.stdout);
  return {
    failures: json.testResults.flatMap((r: any) => r.assertionResults.filter((a: any) => a.status !== "passed").map((a: any) => a.title)),
    message: json.testResults.map((r: any) => r.message).join("\n").trim(),
  };
}
