// Vitest environment adapter used by the Base UI downstream runner for the `ctrl-dom` and
// `ctrl-dom-full` modes.
//
// It runs the stock `@ctrl/dom/vitest-environment` (Base UI pins Vitest 5.0.x, its major), so the
// window, globals, virtual clock and error forwarding are what users get, and adds only what the
// runner needs on top:
//
//   - upstream's own `url: 'http://localhost'` and a userAgent that keeps both engines on the same
//     headless code paths (see the userAgent note below);
//   - `globalThis.__ctrlDomDownstream`, so the runner's identity probe can prove that the DOM in
//     the test realm really is the @ctrl/dom instance the environment created (and not a second
//     copy of the module graph; see run.ts `server.deps.external`);
//   - the `--triage` shims.
//
// userAgent: Base UI (and `@mui/internal-test-utils`) branch on `/jsdom/.test(navigator.userAgent)`
// to skip tests that need real layout and to install a headless requestAnimationFrame shim
// (test/setupVitest.ts). A UA containing "jsdom" makes @ctrl/dom exercise exactly the tests and
// branches the jsdom baseline exercises: no tests, assertions or skip conditions are edited, and
// the runner verifies identical discovered/skipped counts. It measures jsdom replacement, not a
// claim of layout-capable browser behaviour.

import { writeFileSync } from "node:fs";
import { Session } from "node:inspector/promises";
import { join } from "node:path";
import * as dom from "../../packages/dom/src/index.ts";
import stock from "../../packages/vitest-environment/src/index.ts";

export const CTRL_DOM_DOWNSTREAM_USER_AGENT = "Mozilla/5.0 (darwin) ctrl-dom (jsdom-compatible headless)";

interface EnvironmentOptions {
  "ctrl-dom"?: Record<string, unknown>;
  [key: string]: unknown;
}

type Global = Record<PropertyKey, unknown>;

// Triage-only shims (run.ts --triage): work around known blockers that are already filed in
// TRIAGE.md (each with a repro), to see the failures behind them. Every shim reports what it
// had to patch; a shim that patches nothing means the blocker is fixed and it can be deleted.
// Results produced this way are labelled in the report and are NOT compatibility results.
const TRIAGE_TAGS =
  "a abbr area audio b base body br button canvas caption col colgroup data datalist dd del details dialog div dl dt em embed fieldset figure font form frame frameset h1 head hr html i iframe img input ins label legend li link map marquee menu meta meter nav object ol optgroup option output p param picture pre progress q script section select slot source span style table tbody td template textarea tfoot th thead time title tr track u ul video unknown-el".split(
    " ",
  );

const TRIAGE_SHIMS: Record<string, (global: Global, document: any) => { patched: string[]; restore: () => void }> = {
  // repros/html-elements-interface-objects.test.ts
  interfaces(global, document) {
    const patched: string[] = [];
    for (const tag of TRIAGE_TAGS) {
      let ctor: any = document.createElement(tag).constructor;
      while (typeof ctor === "function" && ctor.name && ctor.name !== "Object") {
        if (global[ctor.name] === undefined) {
          Object.defineProperty(global, ctor.name, {
            value: ctor,
            writable: true,
            configurable: true,
            enumerable: false,
          });
          patched.push(ctor.name);
        }
        ctor = Object.getPrototypeOf(ctor);
      }
    }
    return { patched, restore: () => {} };
  },
  // repros/dom-core-node-constants-on-prototype.test.ts
  "node-constants"(global) {
    const Node = global.Node as any;
    const patched: string[] = [];
    for (const key of Object.getOwnPropertyNames(Node)) {
      if (!/^[A-Z_]+$/.test(key) || typeof Node[key] !== "number" || key in Node.prototype) continue;
      Object.defineProperty(Node.prototype, key, { value: Node[key], configurable: true, enumerable: true });
      patched.push(key);
    }
    return { patched, restore: () => patched.forEach((key) => delete Node.prototype[key]) };
  },
};

export default {
  name: "ctrl-dom-downstream",
  viteEnvironment: "client",
  prewarmModules: false,

  async setup(global: Global, options: EnvironmentOptions) {
    // CTRL_DOM_DOWNSTREAM_PROFILE=dir: a CPU profile of each worker from environment setup to
    // teardown (Vitest ends its workers before --cpu-prof would write one).
    const profileDir = process.env.CTRL_DOM_DOWNSTREAM_PROFILE;
    const profiler = profileDir ? new Session() : null;
    if (profiler !== null) {
      profiler.connect();
      await profiler.post("Profiler.enable");
      await profiler.post("Profiler.setSamplingInterval", { interval: 250 });
      await profiler.post("Profiler.start");
    }
    const { triage, ...ctrlDom } = (options?.["ctrl-dom"] ?? {}) as Record<string, unknown>;
    const environment = await stock.setup(
      global as never,
      {
        ...options,
        "ctrl-dom": { url: "http://localhost", userAgent: CTRL_DOM_DOWNSTREAM_USER_AGENT, ...ctrlDom },
      } as never,
    );
    const document = global.document as { createElement(tag: string): unknown };
    const triageAdded: string[] = [];
    const triageRestores: Array<() => void> = [];
    if (triage) {
      for (const [name, shim] of Object.entries(TRIAGE_SHIMS)) {
        const { patched, restore } = shim(global, document);
        if (patched.length) triageAdded.push(`${name}(${patched.length})`);
        triageRestores.push(restore);
      }
    }
    Object.defineProperty(global, "__ctrlDomDownstream", {
      value: { document, Document: dom.Document, installer: "@ctrl/dom/vitest-environment", triageAdded },
      configurable: true,
      enumerable: false,
      writable: true,
    });
    return {
      async teardown() {
        delete global.__ctrlDomDownstream;
        for (const restore of triageRestores) restore();
        await environment.teardown(global as never);
        if (profiler !== null) {
          const { profile } = await profiler.post("Profiler.stop");
          writeFileSync(join(profileDir!, `${process.pid}-${Date.now()}.cpuprofile`), JSON.stringify(profile));
          profiler.disconnect();
        }
      },
    };
  },
};
