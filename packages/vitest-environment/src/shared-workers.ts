// Vitest setup file of the ctrlDom() plugin's `sharedWorkers` mode (./plugin.ts), published as
// `@ctrl/dom/vitest-environment/shared-workers`. The plugin puts it first among the setup files,
// so it runs at the start of every test file, before the project's own setup files and the file.
//
// The mode runs a worker's test files one after another in the same realm (`isolate: false`)
// instead of starting a worker per file, which is where a suite of many short files spends most
// of its time: Node's boot, Vitest's worker modules, React and react-dom, and every function of
// them cold again. Base UI's 9,199 tests take 35 s isolated and 7–8 s this way. What a fresh
// worker gave each file is put back here as far as it can be:
//
// - first-party modules are evaluated again for each file (`vi.resetModules()`): module state,
//   and `vi.mock()` of a module another file loaded unmocked. Modules Vitest loads from
//   node_modules through Node (React, this package, most dependencies) stay loaded;
// - the window is reset (@ctrl/dom window/file-reset.ts: mounted trees, pending timers, the
//   body, focus, storage, cookies, the URL). What a module that stays loaded may still hold is
//   left: `<head>`, listeners on the window and document, patched prototypes;
// - the hooks a testing library registers when it is loaded, which reach only the file that
//   loaded it, are registered for this file: @ctrl/dom/react's cleanup after each test.
//
// So a file can still see what an earlier one did to a dependency's module state, to `<head>`, or
// to a prototype. That is why the mode is opt-in.

import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { currentWindowOrNull } from "@ctrl/dom";
import { resetWindowBetweenFiles, testHooks } from "@ctrl/dom/internal";

vi.resetModules();

const window = currentWindowOrNull();
if (window !== null) {
  resetWindowBetweenFiles(window);
  // And when the file ends, or its pending timers would fire in the pause before the next file
  // (on the clock that skips idle time, at once). Registered first, so with Vitest's default hook
  // order ("stack") it runs after every afterAll hook of the file; the plugin leaves it out for
  // another order, where it would run before hooks that may still need the document.
  if (process.env.CTRL_DOM_SHARED_WORKERS_END !== "0") afterAll(() => resetWindowBetweenFiles(window));
}

for (const hooks of testHooks()) {
  if (hooks.beforeAll !== undefined) beforeAll(hooks.beforeAll);
  if (hooks.afterEach !== undefined) afterEach(hooks.afterEach);
  if (hooks.afterAll !== undefined) afterAll(hooks.afterAll);
}
