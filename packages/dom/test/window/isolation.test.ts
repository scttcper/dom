/**
 * Per-file interface isolation (window/isolation.ts, docs/deviations.md "Interface objects are
 * shared by every test file in a worker"). Not a spec algorithm: environments snapshot the
 * shared interface objects (https://webidl.spec.whatwg.org/#es-interfaces) once and undo test
 * files' patches at teardown.
 */
import { describe, expect, test } from "vitest";
import { createWindow } from "@rtd/dom";
import { captureInterfaceBaseline, restoreInterfaces } from "@rtd/dom/internal";

describe("restoreInterfaces", () => {
  test("keeps the index getters collections grow on demand (downstream/sentry TRIAGE #1)", () => {
    captureInterfaceBaseline();
    const file = () => {
      const window = createWindow();
      const div = window.document.createElement("div");
      // More children than the initial index-getter bound (32): the table grows after the baseline.
      div.innerHTML = Array.from({ length: 40 }, (_, i) => `<span>${i}</span>`).join("");
      const seen = [div.children[0]?.textContent, div.children[39]?.textContent, div.getElementsByTagName("span")[39]?.textContent];
      window.close();
      restoreInterfaces();
      return seen;
    };
    expect([file(), file(), file()]).toEqual([["0", "39", "39"], ["0", "39", "39"], ["0", "39", "39"]]);
  });

  test("still undoes a test file's own patches", () => {
    captureInterfaceBaseline();
    const window = createWindow();
    const HTMLElement = (window as unknown as { HTMLElement: { prototype: Record<string, unknown> } }).HTMLElement;
    HTMLElement.prototype.scrollIntoViewPatched = () => {};
    window.close();
    restoreInterfaces();
    expect("scrollIntoViewPatched" in HTMLElement.prototype).toBe(false);
  });
});
