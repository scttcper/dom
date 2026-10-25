// testEnvironment for the react-aria downstream runner's `ctrl-dom` / `ctrl-dom-full` modes:
// `@ctrl/dom-jest-environment` (packages/jest-environment) unchanged, unless `run.ts --triage`.
//
// Why a `.mjs` re-export instead of pointing `testEnvironment` at src/index.ts directly: Jest
// loads the environment with `ScriptTransformer.requireAndTranspileModule`, i.e. through the
// project's `transform`. Upstream transforms every `.(t|j)sx?` outside node_modules with
// @swc/jest, which would recompile @ctrl/dom-jest-environment *and @ctrl/dom's sources* into CommonJS.
// A `.mjs` file matches no transform pattern, and Node 26 `require(esm)`s it natively, so our
// environment and @ctrl/dom run exactly as Node runs them in `pnpm test` (type stripping), once
// per worker, in the outer realm.
//
// Triage shims (`run.ts --triage`, env CTRL_DOM_RA_TRIAGE): workarounds for jest-environment blockers
// already filed in TRIAGE.md (each with a repro), applied only to look past them. Reports made
// with them are labelled "-triage" and are NOT compatibility results.
import { createRequire } from "node:module";
import CtrlDomEnvironment, { CTRL_DOM_MODULES } from "../../packages/jest-environment/src/index.ts";

const triage = new Set((process.env.CTRL_DOM_RA_TRIAGE ?? "").split(",").filter(Boolean));

class TriageEnvironment extends CtrlDomEnvironment {
  constructor(config, context) {
    super(config, context);
    if (triage.has("fake-raf")) {
      // repros/window-raf-frame-task-lost-with-fake-timers.test.ts: jest-environment-node creates
      // its ModernFakeTimers (which snapshot the global's timer functions) before the window is
      // installed, so jest.useFakeTimers() never fakes requestAnimationFrame, and a frame
      // scheduled on a fake clock that is later uninstalled wedges @ctrl/dom's rAF batching.
      const require = createRequire(
        createRequire(import.meta.url).resolve("../../packages/jest-environment/package.json"),
      );
      const { ModernFakeTimers } = createRequire(require.resolve("jest-environment-node"))("@jest/fake-timers");
      this.fakeTimersModern = new ModernFakeTimers({ config: config.projectConfig, global: this.global });
    }
    if (triage.has("no-pointer-event")) {
      // TRIAGE.md "PointerEvent exposed (jsdom 26 has none)": React Aria feature-detects
      // `typeof PointerEvent` and then listens for pointer events, while upstream tests written
      // against jsdom 26 fire mouse/touch events (or define PointerEvent via installPointerEvent).
      // Not a bug: this only measures how many failures come from that jsdom assumption.
      delete this.global.PointerEvent;
    }
  }
  async teardown() {
    if (triage.has("keep-globals")) {
      // repros/jest-environment-teardown-removes-window.test.ts: uninstalling the globals makes
      // React work scheduled with Node's setImmediate throw `window is not defined` after
      // teardown, which kills the Jest worker.
      this._uninstall = null;
    }
    await super.teardown();
  }
}

export default triage.size ? TriageEnvironment : CtrlDomEnvironment;
export const TestEnvironment = triage.size ? TriageEnvironment : CtrlDomEnvironment;
export { CTRL_DOM_MODULES };
