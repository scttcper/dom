/**
 * jest-environment-rtd's global surface and teardown, compared with jest-environment-jsdom
 * (@jest/environment-jsdom-abstract 30, whose global is a jsdom window).
 *
 * Specs / reference behavior:
 *   HTML Standard — Timers, the map of active timers belongs to the global:
 *     https://html.spec.whatwg.org/#timers; closing it: https://html.spec.whatwg.org/#close-a-browsing-context
 *     (jsdom: lib/jsdom/browser/Window.js stopAllTimers(), called by window.close(), which
 *     jest-environment-jsdom's teardown calls)
 *   Fetch Standard — https://fetch.spec.whatwg.org/#fetch-method (jsdom implements none of
 *     fetch/Request/Response; jest-environment-jsdom adds none)
 *   jsdom — JSDOM#reconfigure: https://github.com/jsdom/jsdom#reconfiguring-the-jsdom-with-reconfiguresettings
 *     (jest-environment-jsdom exposes the JSDOM object as `environment.dom`)
 */
import { describe, expect, test } from "vitest";
import RtdEnvironment from "../src/index.ts";

type AnyGlobal = Record<string, any>;

function environment(testEnvironmentOptions: Record<string, unknown> = {}): RtdEnvironment {
  return new RtdEnvironment(
    { globalConfig: {}, projectConfig: { testEnvironmentOptions, globals: {}, fakeTimers: {}, testPath: "x.test.js" } } as never,
    { console, docblockPragmas: {}, testPath: "x.test.js" } as never,
  );
}

async function withEnvironment(options: Record<string, unknown>, body: (env: RtdEnvironment, global: AnyGlobal) => void | Promise<void>): Promise<void> {
  const env = environment(options);
  await env.setup();
  try {
    await body(env, env.global as unknown as AnyGlobal);
  } finally {
    await env.teardown();
  }
}

describe("fetch primitives — https://fetch.spec.whatwg.org/#fetch-method", () => {
  test("fetch, Request and Response are absent like under jest-environment-jsdom; Headers stays (jsdom has it)", async () => {
    await withEnvironment({}, (_env, global) => {
      expect([typeof global.fetch, typeof global.Request, typeof global.Response]).toEqual(["undefined", "undefined", "undefined"]);
      expect(typeof global.Headers).toBe("function");
      expect(typeof global.FormData).toBe("function");
      expect(typeof global.window.fetch).toBe("undefined");
    });
  });

  test("testEnvironmentOptions.nodeFetch keeps Node's", async () => {
    await withEnvironment({ nodeFetch: true }, (_env, global) => {
      expect(global.fetch).toBe(fetch);
      expect(global.Request).toBe(Request);
      expect(global.Response).toBe(Response);
    });
  });
});

describe("environment.dom.reconfigure — https://github.com/jsdom/jsdom#reconfiguring-the-jsdom-with-reconfiguresettings", () => {
  test("reconfigure({ url }) replaces the document URL without navigating", async () => {
    await withEnvironment({}, (env, global) => {
      expect(env.dom!.window).toBe(env.rtdWindow);
      const length = global.history.length;
      env.dom!.reconfigure({ url: "https://sentry.io/organizations/org-slug/issues/?project=1#hash" });
      expect(global.location.href).toBe("https://sentry.io/organizations/org-slug/issues/?project=1#hash");
      expect(global.location.pathname).toBe("/organizations/org-slug/issues/");
      expect(global.document.URL).toBe(global.location.href);
      expect(global.history.length).toBe(length);
    });
  });

  test("an unparsable URL throws jsdom's TypeError; unsupported settings throw", async () => {
    await withEnvironment({}, (env) => {
      expect(() => env.dom!.reconfigure({ url: "not a url" })).toThrow(new TypeError('Could not parse "not a url" as a URL'));
      expect(() => env.dom!.reconfigure({ windowTop: {} })).toThrow(TypeError);
    });
  });

  test("dom is released at teardown", async () => {
    const env = environment();
    await env.setup();
    await env.teardown();
    expect(env.dom).toBeNull();
  });
});

describe("timers belong to the window — https://html.spec.whatwg.org/#close-a-browsing-context", () => {
  test("timers a test file left pending never run after teardown; later ones are not scheduled", async () => {
    const env = environment();
    await env.setup();
    const global = env.global as unknown as AnyGlobal;
    let fired = 0;
    global.setTimeout(() => fired++, 5);
    global.setInterval(() => fired++, 5);
    global.window.setTimeout(() => fired++, 5);
    await env.teardown();
    expect(global.setTimeout(() => fired++, 1)).toBe(0);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(fired).toBe(0);
  });

  test("timers keep working during the file, with arguments and util.promisify", async () => {
    await withEnvironment({}, async (_env, global) => {
      const value = await new Promise((resolve) => global.setTimeout(resolve, 1, "arg"));
      expect(value).toBe("arg");
      const { promisify } = await import("node:util");
      expect(await promisify(global.setTimeout)(1, "p")).toBe("p");
      expect(global.setTimeout.name).toBe("setTimeout");
    });
  });

  test("modern and legacy fake timers install over the tracked timers and restore them", async () => {
    await withEnvironment({}, (env, global) => {
      const real = { setTimeout: global.setTimeout, setInterval: global.setInterval };
      env.fakeTimersModern!.useFakeTimers();
      expect(global.setTimeout).not.toBe(real.setTimeout);
      let calls = 0;
      global.setTimeout(() => calls++, 10);
      global.requestAnimationFrame(() => calls++);
      env.fakeTimersModern!.advanceTimersByTime(20);
      expect(calls).toBe(2);
      env.fakeTimersModern!.useRealTimers();
      expect(global.setTimeout).toBe(real.setTimeout);

      env.fakeTimers!.useFakeTimers();
      expect(global.setTimeout).not.toBe(real.setTimeout);
      global.setTimeout(() => calls++, 10);
      env.fakeTimers!.runAllTimers();
      expect(calls).toBe(3);
      env.fakeTimers!.useRealTimers();
      expect(global.setTimeout).toBe(real.setTimeout);
      expect(global.setInterval).toBe(real.setInterval);
    });
  });
});

describe("PointerEvent — https://w3c.github.io/pointerevents/#pointerevent-interface", () => {
  test("absent by default, like jest-environment-jsdom 30 (jsdom 26)", async () => {
    await withEnvironment({}, (_env, global) => {
      expect(typeof global.PointerEvent).toBe("undefined");
      expect(typeof global.MouseEvent).toBe("function");
    });
  });

  test("testEnvironmentOptions.pointerEvent exposes it (environments built on jsdom >= 27)", async () => {
    await withEnvironment({ pointerEvent: true }, (_env, global) => {
      expect(new global.PointerEvent("pointerdown", { pointerType: "touch" }).pointerType).toBe("touch");
    });
  });
});
