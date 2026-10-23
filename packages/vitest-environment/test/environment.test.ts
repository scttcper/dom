/**
 * vitest-environment-rtd setup/teardown contract.
 *
 * Spec: HTML Standard — The Window object (the global the environment installs)
 *   https://html.spec.whatwg.org/#the-window-object
 * Vitest Environment interface (vitest/runtime `Environment`: setup → { teardown },
 * setupVM → { getVmContext, teardown }).
 */
import { runInContext } from "node:vm";
import { describe, expect, test, vi } from "vitest";
import environment from "vitest-environment-rtd";

describe("Environment object — https://html.spec.whatwg.org/#the-window-object", () => {
  test("is a client environment named rtd", () => {
    expect(environment.name).toBe("rtd");
    expect(environment.viteEnvironment).toBe("client");
    expect(typeof environment.setup).toBe("function");
    expect(typeof environment.setupVM).toBe("function");
  });
});

describe("setup(global, options) / teardown", () => {
  test("installs a window on the given global with environmentOptions.rtd, and teardown restores it", async () => {
    const global: Record<string, unknown> = { Event: "node-event", setTimeout };
    const env = await environment.setup(global, { rtd: { url: "http://example.test/a", width: 640, height: 480 } });
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

  test("defaults to Vitest's jsdom/happy-dom URL", async () => {
    const global: Record<string, unknown> = {};
    const env = await environment.setup(global, {});
    expect((global.location as Location).href).toBe("http://localhost:3000/");
    await env.teardown(global);
  });

  test("teardown cancels pending animation frames and tasks created by the window", async () => {
    vi.useFakeTimers();
    try {
      const global: Record<string, unknown> = {};
      const env = await environment.setup(global, {});
      const spy = vi.fn();
      (global.requestAnimationFrame as (cb: () => void) => void)(spy);
      (global.postMessage as (m: unknown, o: string) => void)("x", "*");
      expect(vi.getTimerCount()).toBe(2);
      await env.teardown(global);
      expect(vi.getTimerCount()).toBe(0);
      vi.runAllTimers();
      expect(spy).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
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
    const vm = await environment.setupVM!({ rtd: { url: "http://localhost:5173/" } });
    const context = vm.getVmContext();
    expect(runInContext("window === globalThis && location.href", context)).toBe("http://localhost:5173/");
    expect(runInContext("document.createElement('p').tagName", context)).toBe("P");
    expect(runInContext("typeof setTimeout + typeof URL + typeof requestAnimationFrame", context)).toBe("functionfunctionfunction");
    await vm.teardown();
    expect(runInContext("typeof document", context)).toBe("undefined");
  });
});
