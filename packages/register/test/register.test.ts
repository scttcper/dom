/**
 * @rtd/register (`@ctrl/dom/register`): a window installed as the process global for test runners
 * without a DOM environment.
 *
 * Spec: HTML Standard — The Window object (the global register() installs)
 *   https://html.spec.whatwg.org/#the-window-object
 *   https://html.spec.whatwg.org/#report-an-exception (listener exceptions fail the running test)
 * Runners: node:test (https://nodejs.org/api/test.html) and bun test (https://bun.com/docs/cli/test),
 * spawned on the fixtures in fixtures/.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import * as dom from "@rtd/dom";
import { isRegistered, register, unregister } from "@rtd/register/pure";

const fixtures = fileURLToPath(new URL("../fixtures/", import.meta.url));
const host = globalThis as unknown as Record<PropertyKey, unknown>;

afterEach(() => unregister());

describe("register(options) / unregister() — https://html.spec.whatwg.org/#the-window-object", () => {
  test("installs a window as the global with the Vitest environment's defaults, and unregister restores the host", () => {
    const hostSetTimeout = globalThis.setTimeout;
    const hostDate = globalThis.Date;
    expect(host.document).toBeUndefined();
    const { window } = register();
    expect(isRegistered()).toBe(true);
    expect(host.window).toBe(globalThis);
    expect(host.document).toBe(window.document);
    expect((host.location as { href: string }).href).toBe("http://localhost:3000/");
    // jsdom-30 profile: no matchMedia.
    expect(host.matchMedia).toBeUndefined();
    expect(globalThis.setTimeout).not.toBe(hostSetTimeout);
    expect(globalThis.Date).not.toBe(hostDate);
    expect(host[Symbol.for("rtd.dom.modules")]).toMatchObject({ dom: { createWindow: dom.createWindow } });
    unregister();
    expect(isRegistered()).toBe(false);
    expect(host.document).toBeUndefined();
    expect(host.window).toBeUndefined();
    expect(globalThis.setTimeout).toBe(hostSetTimeout);
    expect(globalThis.Date).toBe(hostDate);
    expect(host[Symbol.for("rtd.dom.modules")]).toBeUndefined();
  });

  test("passes window options through (url, compat, width) and timeSkip: false keeps real Date", () => {
    const hostDate = globalThis.Date;
    register({ url: "http://example.test/a", compat: "modern", width: 640, timeSkip: false });
    expect((host.location as { href: string }).href).toBe("http://example.test/a");
    expect(typeof host.matchMedia).toBe("function");
    expect(host.innerWidth).toBe(640);
    expect(globalThis.Date).toBe(hostDate);
  });

  test("a second register() replaces the first registration; the stale handle's unregister() is a no-op", () => {
    const first = register({ url: "http://one.test/" });
    const second = register({ url: "http://two.test/" });
    expect(first.window.closed).toBe(true);
    expect(host.document).toBe(second.window.document);
    first.unregister();
    expect(host.document).toBe(second.window.document);
    second.unregister();
    expect(host.document).toBeUndefined();
  });

  test("testHooks outside node:test and bun test defines no hook globals", () => {
    register({ testHooks: true });
    expect(host.afterEach).toBeUndefined();
    expect(host.beforeAll).toBeUndefined();
  });

  test("unregister() without a registration does nothing", () => {
    expect(() => unregister()).not.toThrow();
  });
});

function run(cmd: string, args: string[], cwd: string, env: Record<string, string> = {}, timeout?: number) {
  const result = spawnSync(cmd, args, { cwd, encoding: "utf8", timeout, env: { ...process.env, ...env, NODE_OPTIONS: "" } });
  return { status: result.status, output: `${result.stdout}${result.stderr}`, error: result.error };
}

describe("node:test — https://nodejs.org/api/test.html", () => {
  test("node --import @rtd/register --test: render, user-event, node:assert and jest-dom matchers on `expect`; auto cleanup; time skipping", () => {
    const { status, output } = run(process.execPath, ["--import", "@rtd/register", "--test", "node/signup.test.ts"], fixtures);
    expect(output).toMatch(/ℹ pass 3/);
    expect(status, output).toBe(0);
  });

  test("CTRL_DOM_URL configures the preload", () => {
    const url = "http://app.test/start";
    const { status, output } = run(process.execPath, ["--import", "@rtd/register", "--test", "node/signup.test.ts"], fixtures, { CTRL_DOM_URL: url, EXPECT_URL: url });
    expect(status, output).toBe(0);
  });

  test('a per-file `import "@rtd/register"` without a preload', () => {
    const { status, output } = run(process.execPath, ["--test", "node/per-file.test.ts"], fixtures);
    expect(output).toMatch(/ℹ pass 2/);
    expect(status, output).toBe(0);
  });

  test("--test-isolation=none: every file shares the one registration", () => {
    const { status, output } = run(process.execPath, ["--import", "@rtd/register", "--test", "--test-isolation=none", "node/signup.test.ts", "node/per-file.test.ts"], fixtures);
    expect(output).toMatch(/ℹ pass 5/);
    expect(status, output).toBe(0);
  });

  test("after the last test the window closes and its timers are dropped, so a leftover interval does not keep the process alive", () => {
    const { status, output, error } = run(process.execPath, ["--import", "@rtd/register", "--test", "node/interval.test.ts"], fixtures, {}, 10_000);
    expect(error).toBeUndefined();
    expect(status, output).toBe(0);
  });

  test("an exception thrown by an event listener fails the running test (report an exception → uncaughtException)", () => {
    const { status, output } = run(process.execPath, ["--import", "@rtd/register", "--test", "node/uncaught.test.ts"], fixtures);
    expect(status).toBe(1);
    expect(output).toMatch(/✖ a throwing listener fails the test/);
    expect(output).toMatch(/listener boom/);
  });
});

const bun = spawnSync("bun", ["--version"], { encoding: "utf8" });

describe.skipIf(bun.status !== 0)("bun test — https://bun.com/docs/cli/test", () => {
  test("bunfig.toml preload: render, user-event and jest-dom matchers via bun's expect.extend; auto cleanup", () => {
    const { status, output } = run("bun", ["test", "./signup.test.tsx", "./second.test.ts"], `${fixtures}bun`);
    expect(output).toMatch(/ 4 pass/);
    expect(status, output).toBe(0);
  });

  test("files share one window; --isolate gives every file a fresh global, and the preload a fresh window", () => {
    const shared = run("bun", ["test", "./second.test.ts", "./third.test.ts"], `${fixtures}bun`);
    expect(shared.output).toMatch(/window carried over: true/);
    const { status, output } = run("bun", ["test", "--isolate", "./second.test.ts", "./third.test.ts"], `${fixtures}bun`);
    expect(output).not.toMatch(/window carried over: true/);
    expect(status, output).toBe(0);
  });

  test("an exception thrown by an event listener fails the running test", () => {
    const { status, output } = run("bun", ["test", "./uncaught.fail.ts"], `${fixtures}bun`);
    expect(status).toBe(1);
    expect(output).toMatch(/\(fail\) a throwing listener fails the test/);
    expect(output).toMatch(/listener boom/);
  });
});
