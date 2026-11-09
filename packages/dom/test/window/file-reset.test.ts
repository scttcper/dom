/**
 * The boundary between two test files that share a window (packages/dom/src/window/file-reset.ts):
 * what `resetWindowBetweenFiles()` puts back and what it leaves, and the hooks a testing library
 * registers for a runner to call. An @ctrl/dom addition for runners that reuse a realm; the
 * state it resets is the specs':
 *
 *   HTML — timers: https://html.spec.whatwg.org/#timers
 *   HTML — animation frames: https://html.spec.whatwg.org/#animation-frames
 *   HTML — focus fixup when the focused element is removed: https://html.spec.whatwg.org/#focus-fixup-rule
 *   HTML — session history: https://html.spec.whatwg.org/#the-history-interface
 *   HTML — Web Storage: https://html.spec.whatwg.org/#webstorage
 *   HTML — document.cookie: https://html.spec.whatwg.org/#dom-document-cookie
 *   Selection API — removeAllRanges: https://w3c.github.io/selection-api/#dom-selection-removeallranges
 */
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createWindow, type Window } from "@ctrl/dom";
import {
  VirtualClock,
  installClock,
  registerTestHooks,
  resetWindowBetweenFiles,
  testHooks,
  type InstalledClock,
} from "@ctrl/dom/internal";

// biome-ignore lint: untyped DOM surface in tests
type Any = any;

let window: Window & Any;
let document: Any;
let installed: InstalledClock;
let timers: { setTimeout: (fn: () => void, ms: number) => unknown };

const turn = () => new Promise<void>((resolve) => setImmediate(resolve));

beforeEach(() => {
  window = createWindow({ url: "http://localhost:3000/start?x=1" });
  document = window.document;
  // The file's globals: its timers are on a clock of its own, as under the environments.
  const global = { Date, performance } as unknown as Record<PropertyKey, unknown>;
  installed = installClock(new VirtualClock({ skip: true }), global);
  timers = global as unknown as typeof timers;
});

afterEach(() => {
  installed.uninstall();
  window.close();
});

describe("resetWindowBetweenFiles — what belongs to one test file", () => {
  test("the body's children, the attributes of <body> and <html>, focus and the selection — https://html.spec.whatwg.org/#focus-fixup-rule", () => {
    document.body.innerHTML = "<main><input id=field><p id=text>some text</p></main>";
    document.body.setAttribute("class", "modal-open");
    document.documentElement.setAttribute("data-theme", "dark");
    document.getElementById("field").focus();
    window.getSelection().selectAllChildren(document.getElementById("text"));
    expect(document.activeElement.id).toBe("field");
    expect(window.getSelection().rangeCount).toBe(1);

    resetWindowBetweenFiles(window);

    expect(document.body.childNodes.length).toBe(0);
    expect(document.body.getAttributeNames()).toEqual([]);
    expect(document.documentElement.getAttributeNames()).toEqual([]);
    expect(document.activeElement).toBe(document.body);
    expect(window.getSelection().rangeCount).toBe(0);
  });

  test("pending timers, animation frames and idle callbacks never run — https://html.spec.whatwg.org/#timers", async () => {
    const ran: string[] = [];
    timers.setTimeout(() => ran.push("clock timer"), 1);
    window.setTimeout(() => ran.push("window timer"), 1);
    window.requestAnimationFrame(() => ran.push("frame"));
    window.requestIdleCallback(() => ran.push("idle"));

    resetWindowBetweenFiles(window);
    for (let i = 0; i < 6; i++) await turn();
    expect(ran).toEqual([]);

    // The clock and the window go on: the next file's timers and frames run.
    await new Promise<void>((resolve) => timers.setTimeout(resolve, 1));
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    expect(ran).toEqual([]);
  });

  test("localStorage, sessionStorage and cookies — https://html.spec.whatwg.org/#webstorage", () => {
    window.localStorage.setItem("token", "a");
    window.sessionStorage.setItem("step", "2");
    document.cookie = "seen=1";

    resetWindowBetweenFiles(window);

    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(document.cookie).toBe("");
  });

  test("the URL and session history go back to where the first file started — https://html.spec.whatwg.org/#the-history-interface", () => {
    // The first file's start: the URL the reset remembers.
    resetWindowBetweenFiles(window);
    window.history.pushState({ page: 2 }, "", "/checkout?step=2#pay");
    window.history.pushState({ page: 3 }, "", "/done");
    expect(window.history.length).toBe(3);

    resetWindowBetweenFiles(window);

    expect(window.location.href).toBe("http://localhost:3000/start?x=1");
    expect(document.URL).toBe("http://localhost:3000/start?x=1");
    expect(window.history.length).toBe(1);
    expect(window.history.state).toBeNull();
  });

  test("<head>, listeners on the window and document, and properties put on them stay: modules that stay loaded may hold them", () => {
    const style = document.head.appendChild(document.createElement("style"));
    const calls: string[] = [];
    document.addEventListener("keydown", () => calls.push("document"));
    window.addEventListener("resize", () => calls.push("window"));
    document.__marker = true;

    resetWindowBetweenFiles(window);

    expect(style.parentNode).toBe(document.head);
    document.dispatchEvent(new window.KeyboardEvent("keydown"));
    window.dispatchEvent(new window.Event("resize"));
    expect(calls).toEqual(["document", "window"]);
    expect(document.__marker).toBe(true);
  });
});

describe("registerTestHooks — a testing library's hooks, for the runner's setup file to call", () => {
  test("hooks are kept per library for the current window; registering again adds to and replaces them", () => {
    const first = () => {};
    const second = () => {};
    const enter = () => {};
    expect(testHooks()).toEqual([]);
    registerTestHooks("react", { afterEach: first });
    registerTestHooks("react", { beforeAll: enter });
    registerTestHooks("other", { afterEach: second });
    expect(testHooks()).toEqual([{ afterEach: first, beforeAll: enter }, { afterEach: second }]);
    // A fresh instance of the library, after a module reset.
    registerTestHooks("react", { afterEach: second });
    expect(testHooks()[0]).toEqual({ afterEach: second, beforeAll: enter });
  });

  test("a window made for another file starts without them", () => {
    registerTestHooks("react", { afterEach() {} });
    const other = createWindow();
    expect(testHooks()).toEqual([]);
    other.close();
  });

  test("resetWindowBetweenFiles runs every library's fileEnd, and one that throws does not stop the reset", () => {
    const ended: string[] = [];
    registerTestHooks("react", {
      fileEnd() {
        ended.push("react");
        throw new Error("unmount failed");
      },
    });
    registerTestHooks("other", { fileEnd: () => void ended.push("other") });
    document.body.innerHTML = "<p>left</p>";

    resetWindowBetweenFiles(window);

    expect(ended).toEqual(["react", "other"]);
    expect(document.body.childNodes.length).toBe(0);
  });
});
