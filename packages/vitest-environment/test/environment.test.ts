/**
 * @ctrl/dom/vitest-environment setup/teardown contract.
 *
 * Spec: HTML Standard — The Window object (the global the environment installs)
 *   https://html.spec.whatwg.org/#the-window-object
 * Vitest Environment interface (vitest/runtime `Environment`: setup → { teardown },
 * setupVM → { getVmContext, teardown }).
 */
import { runInContext } from "node:vm";
import { describe, expect, test, vi } from "vitest";
import environment from "@ctrl/dom/vitest-environment";

describe("Environment object — https://html.spec.whatwg.org/#the-window-object", () => {
  test("is a client environment named ctrl-dom", () => {
    expect(environment.name).toBe("ctrl-dom");
    expect(environment.viteEnvironment).toBe("client");
    expect(typeof environment.setup).toBe("function");
    expect(typeof environment.setupVM).toBe("function");
  });
});

describe("setup(global, options) / teardown", () => {
  test("installs a window on the given global with environmentOptions['ctrl-dom'], and teardown restores it", async () => {
    const global: Record<string, unknown> = { Event: "node-event", setTimeout };
    const env = await environment.setup(global, {
      "ctrl-dom": { url: "http://example.test/a", width: 640, height: 480 },
    });
    expect(global.window).toBe(global);
    expect((global.location as Location).href).toBe("http://example.test/a");
    expect(global.innerWidth).toBe(640);
    expect(global.innerHeight).toBe(480);
    expect(global.Event).not.toBe("node-event");
    expect((global.document as { defaultView: unknown }).defaultView).toBe(global);
    await env.teardown(global);
    expect(global.window).toBeUndefined();
    expect(global.document).toBeUndefined();
    expect(global.Event).toBe("node-event");
    expect(global.setTimeout).toBe(setTimeout);
  });

  test('the jsdom-30 compat profile by default (no matchMedia); compat: "modern" exposes it; teardown restores the global', async () => {
    const global: Record<string, unknown> = {};
    let env = await environment.setup(global, {});
    expect("matchMedia" in global).toBe(false);
    expect(typeof global.PointerEvent).toBe("function");
    await env.teardown(global);
    env = await environment.setup(global, { "ctrl-dom": { compat: "modern", width: 1200 } });
    expect((global.matchMedia as (q: string) => { matches: boolean })("(min-width: 1000px)").matches).toBe(true);
    await env.teardown(global);
    expect("matchMedia" in global).toBe(false);
  });

  test("setupVM: files with different profiles each see their own prototypes", async () => {
    const proto = () => (vm.getVmContext() as { HTMLElement: { prototype: object } }).HTMLElement.prototype;
    let vm = await environment.setupVM!({ "ctrl-dom": { compat: "modern" } });
    expect("inert" in proto()).toBe(true);
    await vm.teardown();
    vm = await environment.setupVM!({ "ctrl-dom": { compat: "jsdom-26" } });
    expect("inert" in proto()).toBe(false);
    expect("onpointerdown" in proto()).toBe(false);
    await vm.teardown();
    vm = await environment.setupVM!({});
    expect("onpointerdown" in proto()).toBe(true);
    await vm.teardown();
  });

  test("defaults to Vitest's jsdom/happy-dom URL", async () => {
    const global: Record<string, unknown> = {};
    const env = await environment.setup(global, {});
    expect((global.location as Location).href).toBe("http://localhost:3000/");
    await env.teardown(global);
  });

  test("teardown cancels pending animation frames and tasks created by the window", async () => {
    // The window's frames and tasks live on the environment's virtual clock (@ctrl/dom
    // window/clock.ts), which teardown disposes: nothing pending may run afterwards.
    const global: Record<string, unknown> = {};
    const env = await environment.setup(global, {});
    const frame = vi.fn();
    const message = vi.fn();
    (global.requestAnimationFrame as (cb: () => void) => void)(frame);
    (global.addEventListener as (t: string, cb: () => void) => void)("message", message);
    (global.postMessage as (m: unknown, o: string) => void)("x", "*");
    await env.teardown(global);
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(frame).not.toHaveBeenCalled();
    expect(message).not.toHaveBeenCalled();
  });
});

describe("interface isolation between VM-pool test files — https://webidl.spec.whatwg.org/#es-interfaces", () => {
  test("setupVM teardown undoes added, changed and removed properties on shared interface objects", async () => {
    const vm = await environment.setupVM!({});
    const context = vm.getVmContext() as unknown as Record<string, unknown>;
    const HTMLElement = context.HTMLElement as { prototype: Record<string, unknown> } & Record<string, unknown>;
    const Node = context.Node as Record<string, unknown>;
    const focus = HTMLElement.prototype.focus;
    const hiddenDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "hidden");
    HTMLElement.prototype.scrollIntoViewPatched = () => {};
    HTMLElement.prototype.focus = () => {};
    delete HTMLElement.prototype.hidden;
    Node.EXTRA = 1;
    const started = performance.now();
    await vm.teardown();
    const elapsed = performance.now() - started;
    expect("scrollIntoViewPatched" in HTMLElement.prototype).toBe(false);
    expect(HTMLElement.prototype.focus).toBe(focus);
    expect(Object.getOwnPropertyDescriptor(HTMLElement.prototype, "hidden")).toEqual(hiddenDesc);
    expect("EXTRA" in Node).toBe(false);
    expect(elapsed).toBeLessThan(50);
  });
});

describe("setupVM(options)", () => {
  test("returns a vm context whose global is the window, with host timers and URL", async () => {
    const vm = await environment.setupVM!({ "ctrl-dom": { url: "http://localhost:5173/" } });
    const context = vm.getVmContext();
    expect(runInContext("window === globalThis && location.href", context)).toBe("http://localhost:5173/");
    expect(runInContext("document.createElement('p').tagName", context)).toBe("P");
    expect(runInContext("typeof setTimeout + typeof URL + typeof requestAnimationFrame", context)).toBe(
      "functionfunctionfunction",
    );
    await vm.teardown();
    expect(runInContext("typeof document", context)).toBe("undefined");
  });
});
