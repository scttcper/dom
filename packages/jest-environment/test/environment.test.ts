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
 *   XMLHttpRequest Standard — https://xhr.spec.whatwg.org/#the-send()-method (jsdom's window
 *     has XMLHttpRequest; axios's browser build, which the "browser" export condition selects,
 *     needs it since fetch is absent)
 *   jest-circus's event handlers (https://jestjs.io/docs/configuration#testenvironment-string,
 *     handleTestEvent) for @ctrl/dom/sentry's collector
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { jestDataFile } from "@rtd/sentry/jest-collector";
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

describe("XMLHttpRequest — https://xhr.spec.whatwg.org/#the-send()-method", () => {
  test("the test global's XMLHttpRequest completes a request against the environment's window URL", async () => {
    const server = createServer((req, res) => res.end(`got ${req.url}`));
    await new Promise<void>((resolve) => server.listen(0, "localhost", resolve));
    const url = `http://localhost:${(server.address() as { port: number }).port}/app/`;
    try {
      await withEnvironment({ url }, async (_env, global) => {
        const xhr = new global.XMLHttpRequest();
        const done = new Promise((resolve) => xhr.addEventListener("loadend", resolve));
        xhr.open("GET", "data.json");
        xhr.send();
        await done;
        expect([xhr.readyState, xhr.status, xhr.responseText]).toEqual([4, 200, "got /app/data.json"]);
      });
    } finally {
      server.close();
    }
  });
});

describe("compat profiles — @rtd/dom src/window/compat.ts", () => {
  test("jsdom-26 by default, like jest-environment-jsdom 30: no PointerEvent or onpointer* handlers, no matchMedia", async () => {
    await withEnvironment({}, (_env, global) => {
      expect(typeof global.PointerEvent).toBe("undefined");
      expect("onpointerdown" in global).toBe(false);
      expect("onpointerdown" in global.document.body).toBe(false);
      expect(typeof global.MouseEvent).toBe("function");
      expect("matchMedia" in global).toBe(false);
    });
  });

  test('compat: "jsdom-30" exposes PointerEvent (environments built on jsdom >= 27)', async () => {
    await withEnvironment({ compat: "jsdom-30" }, (_env, global) => {
      expect(new global.PointerEvent("pointerdown", { pointerType: "touch" }).pointerType).toBe("touch");
      expect("onpointerdown" in global.document.body).toBe(true);
    });
  });

  test('compat: "modern" exposes matchMedia and the inert IDL attribute', async () => {
    await withEnvironment({ compat: "modern", width: 1200 }, (_env, global) => {
      expect(global.matchMedia("(min-width: 1000px)").matches).toBe(true);
      expect(global.document.createElement("div").inert).toBe(false);
    });
  });

  test("files with different profiles in one worker each see their own prototypes (teardown restores the baseline)", async () => {
    await withEnvironment({ compat: "modern" }, (_env, global) => {
      expect("inert" in global.HTMLElement.prototype).toBe(true);
    });
    await withEnvironment({}, (_env, global) => {
      expect("inert" in global.HTMLElement.prototype).toBe(false);
      expect("onpointerdown" in global.HTMLElement.prototype).toBe(false);
    });
    await withEnvironment({ compat: "jsdom-30" }, (_env, global) => {
      expect("inert" in global.HTMLElement.prototype).toBe(false);
      expect("onpointerdown" in global.HTMLElement.prototype).toBe(true);
    });
  });
});

describe("interface isolation — definitions on shared interface objects stay undoable", () => {
  test("Object.defineProperties on a prototype from the test realm defines a configurable property, removed at teardown", async () => {
    let proto: object | null = null;
    await withEnvironment({}, (_env, global) => {
      proto = global.ShadowRoot.prototype;
      global.Object.defineProperties(proto, { outerHTML: { get: () => "patched" } });
      expect(Object.getOwnPropertyDescriptor(proto, "outerHTML")!.configurable).toBe(true);
    });
    expect(Object.hasOwn(proto!, "outerHTML")).toBe(false);
  });
});

describe("@ctrl/dom/sentry's collector (CTRL_DOM_SENTRY_DIR set by its Jest reporter)", () => {
  test("a subclass's own handleTestEvent method keeps its `this` and gets jest-circus's state; teardown writes the file's data", async () => {
    const dir = mkdtempSync(join(tmpdir(), "rtd-sentry-"));
    const previous = process.env.CTRL_DOM_SENTRY_DIR;
    process.env.CTRL_DOM_SENTRY_DIR = dir;
    try {
      // As @sentry/jest-environment does: a subclass whose handler is a method using `this`.
      const seen: unknown[] = [];
      class Subclass extends RtdEnvironment {
        marker = "subclass";
      }
      (Subclass.prototype as AnyGlobal).handleTestEvent = async function (this: AnyGlobal, event: { name: string }, state: unknown) {
        seen.push([this.marker, event.name, state]);
      };
      const env = new Subclass(
        { globalConfig: {}, projectConfig: { testEnvironmentOptions: {}, globals: {}, fakeTimers: {}, testPath: "x.test.js" } } as never,
        { console, docblockPragmas: {}, testPath: "/repo/x.test.js" } as never,
      );
      await env.setup();
      const test = { name: "renders", parent: { name: "Form", parent: { name: "ROOT_DESCRIBE_BLOCK" } } };
      const state = { unhandledErrors: [] };
      await env.handleTestEvent!({ name: "test_start", test } as never, state as never);
      await env.handleTestEvent!({ name: "test_done", test } as never, state as never);
      await env.teardown();
      expect(seen).toEqual([
        ["subclass", "test_start", state],
        ["subclass", "test_done", state],
      ]);
      const data = JSON.parse(readFileSync(jestDataFile(dir, "/repo/x.test.js"), "utf8"));
      expect(Object.keys(data.tests)).toEqual(["Form > renders"]);
      expect(data.tests["Form > renders"].endedAt).toBeGreaterThanOrEqual(data.tests["Form > renders"].startedAt);
    } finally {
      if (previous === undefined) delete process.env.CTRL_DOM_SENTRY_DIR;
      else process.env.CTRL_DOM_SENTRY_DIR = previous;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
