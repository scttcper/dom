/**
 * The inspector-only console members React's development build probes for (window/devtools-console.ts).
 * Not a spec algorithm: `console.createTask` and `console.timeStamp` are V8 inspector extensions
 * (https://console.spec.whatwg.org/ defines neither). A window installed as a realm's global hides
 * them while no debugger is attached, as a test runner's own console does, and restores them.
 */
import { describe, expect, test } from "vitest";
import { createWindow, installGlobals } from "@ctrl/dom";

const debugging = process.execArgv.some((arg) => arg.startsWith("--inspect"));

describe("installGlobals and the realm's console", () => {
  test.skipIf(debugging)("createTask and timeStamp are hidden while installed and put back on uninstall", () => {
    const createTask = () => ({ run: (fn: () => unknown) => fn() });
    const timeStamp = () => {};
    const log = () => {};
    const console = { log, createTask, timeStamp };
    const before = Object.getOwnPropertyDescriptors(console);
    const window = createWindow();
    const uninstall = installGlobals(window, { console });
    expect(Object.keys(console)).toEqual(["log"]);
    expect("createTask" in console || "timeStamp" in console).toBe(false);
    uninstall();
    expect(Object.getOwnPropertyDescriptors(console)).toEqual(before);
    window.close();
  });

  test("a console without them (Vitest's, Jest's) is left as it is, and a member the test defined meanwhile is kept", () => {
    const console: Record<string, unknown> = { log() {} };
    const window = createWindow();
    const uninstall = installGlobals(window, { console });
    expect(Object.keys(console)).toEqual(["log"]);
    uninstall();
    expect(Object.keys(console)).toEqual(["log"]);

    const own = () => null;
    const second: Record<string, unknown> = { createTask() {} };
    const uninstallSecond = installGlobals(window, { console: second });
    second.createTask = own;
    uninstallSecond();
    if (!debugging) expect(second.createTask).toBe(own);
    window.close();
  });
});
