/**
 * Downstream repro (Sentry components preset, current tree: ~270 tests fail with
 * "Cannot read properties of undefined (reading 'getAttribute' | 'name' | 'textContent' |
 * 'children' | 'getBoundingClientRect')" and "Virtualized list container has to render a scroll
 * container as its first child": `el.children[0]` / `Array.from(el.children)` yield undefined in
 * every test file after the first one in a Jest worker).
 *
 * Two mechanisms collide:
 *   - collections/indexed.ts installs indexed accessors `0..n-1` lazily on the collection
 *     PROTOTYPE and remembers the bound in `table.count` (grows on demand, never shrinks);
 *   - window/isolation.ts (@ctrl/dom-jest-environment since cf0a3f9: captureInterfaceBaseline() in the
 *     constructor, restoreInterfaces() at teardown) deletes every prototype key added after the
 *     baseline — including those index accessors. `table.count` still says they exist, so they
 *     are never re-added: indexed access on HTMLCollection is broken for the rest of the worker.
 * With jsdom every file gets a fresh window and collections behave the same in every file.
 *
 * Fix options: isolation ignores integer keys on collection prototypes (or the index tables
 * re-check the prototype), or the baseline is taken after the tables are grown to their bound.
 * Owner: jest-environment (window/isolation.ts) with dom-core (collections/indexed.ts).
 */
import { expect, test } from "vitest";
import { differential } from "./engines.ts";
import { captureInterfaceBaseline, restoreInterfaces } from "../../../packages/dom/src/internal.ts";

/** One Jest test file: fresh window, a few children, then the environment's teardown. */
function testFile(make: () => any, engine: "jsdom" | "ctrl-dom"): string[] {
  if (engine === "ctrl-dom") captureInterfaceBaseline(); // CtrlDomEnvironment constructor
  const window = make();
  const div = window.document.createElement("div");
  // More children than the initial index-getter bound (32), so the table grows after the baseline.
  div.innerHTML = Array.from({ length: 40 }, (_, i) => `<span>${i}</span>`).join("");
  window.document.body.append(div);
  const seen = [
    div.children[0]?.textContent,
    div.children[39]?.textContent,
    Array.from(div.children).length === 40 && Array.from(div.children).every(Boolean) ? "ok" : "holes",
  ];
  window.close();
  if (engine === "ctrl-dom") restoreInterfaces(); // CtrlDomEnvironment teardown
  return seen;
}

differential("indexed collection access across Jest test files in one worker", (make, engine) => {
  test("children[i] works in the first and in later files", () => {
    const files = [testFile(make, engine), testFile(make, engine), testFile(make, engine)];
    expect(files).toEqual([
      ["0", "39", "ok"],
      ["0", "39", "ok"],
      ["0", "39", "ok"],
    ]);
  });
});
