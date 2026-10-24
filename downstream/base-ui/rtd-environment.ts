// Vitest environment adapter used by the Base UI downstream runner for the `rtd-dom` and
// `rtd-full` modes.
//
// Upstream Base UI pins Vitest 5.0.x, the same major as our `vitest-environment-rtd`, so this
// adapter implements the same `Environment` contract (`name`, `viteEnvironment`, `setup()` ->
// `{ teardown }`). It is kept separate (instead of pointing upstream at `vitest-environment-rtd`
// directly) so the runner can:
//
//   - pin the window options that make both engines take the same headless code paths (see
//     the userAgent note below), and use upstream's own `url: 'http://localhost'`;
//   - keep working while `@rtd/dom`'s window/global-install layer is still being built: if
//     `installGlobals` is missing it falls back to a minimal local installer;
//   - publish `globalThis.__rtdDownstream` so the runner's identity probe can prove that the
//     DOM in the test realm really is the @rtd/dom instance this adapter created (and not a
//     second copy of the module graph; see run.ts `server.deps.external`).
//
// userAgent: Base UI (and `@mui/internal-test-utils`) branch on `/jsdom/.test(navigator.userAgent)`
// to skip tests that need real layout and to install a headless requestAnimationFrame shim
// (test/setupVitest.ts). A UA containing "jsdom" makes @rtd/dom exercise exactly the tests and
// branches the jsdom baseline exercises: no tests, assertions or skip conditions are edited, and
// the runner verifies identical discovered/skipped counts. It measures jsdom replacement, not a
// claim of layout-capable browser behaviour.

import * as dom from "../../packages/dom/src/index.ts";

export const RTD_DOWNSTREAM_USER_AGENT = "Mozilla/5.0 (darwin) rtd-dom (jsdom-compatible headless)";

interface EnvironmentOptions {
  rtd?: Record<string, unknown>;
  [key: string]: unknown;
}

type Global = Record<PropertyKey, unknown>;

/** Minimal installer used only when @rtd/dom does not export installGlobals yet. */
function fallbackInstall(window: Record<PropertyKey, unknown>, target: Global): () => void {
  const saved = new Map<PropertyKey, PropertyDescriptor | undefined>();
  const define = (key: PropertyKey, descriptor: PropertyDescriptor): void => {
    const existing = Object.getOwnPropertyDescriptor(target, key);
    if (existing !== undefined && !existing.configurable) return;
    if (!saved.has(key)) saved.set(key, existing);
    Object.defineProperty(target, key, descriptor);
  };
  const keys = new Set<PropertyKey>();
  for (let o: object | null = window; o !== null && o !== Object.prototype; o = Object.getPrototypeOf(o)) {
    for (const key of Reflect.ownKeys(o)) if (key !== "constructor") keys.add(key);
  }
  for (const key of keys) {
    if (typeof key === "string" && key.startsWith("_")) continue;
    let value: unknown;
    try {
      value = window[key];
    } catch {
      continue;
    }
    define(key, {
      value: typeof value === "function" && !/^[A-Z]/.test(String(key)) ? (value as Function).bind(window) : value,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }
  for (const key of ["window", "self", "top", "parent", "frames"]) {
    define(key, { value: target, writable: true, enumerable: true, configurable: true });
  }
  return () => {
    for (const [key, descriptor] of saved) {
      if (descriptor === undefined) delete target[key];
      else Object.defineProperty(target, key, descriptor);
    }
  };
}

// Triage-only shims (run.ts --triage): work around known blockers that are already filed in
// TRIAGE.md (each with a repro), to see the failures behind them. Every shim reports what it
// had to patch; a shim that patches nothing means the blocker is fixed and it can be deleted.
// Results produced this way are labelled in the report and are NOT compatibility results.
const TRIAGE_TAGS =
  "a abbr area audio b base body br button canvas caption col colgroup data datalist dd del details dialog div dl dt em embed fieldset figure font form frame frameset h1 head hr html i iframe img input ins label legend li link map marquee menu meta meter nav object ol optgroup option output p param picture pre progress q script section select slot source span style table tbody td template textarea tfoot th thead time title tr track u ul video unknown-el".split(" ");

const TRIAGE_SHIMS: Record<string, (global: Global, document: any) => { patched: string[]; restore: () => void }> = {
  // repros/html-elements-interface-objects.test.ts
  interfaces(global, document) {
    const patched: string[] = [];
    for (const tag of TRIAGE_TAGS) {
      let ctor: any = document.createElement(tag).constructor;
      while (typeof ctor === "function" && ctor.name && ctor.name !== "Object") {
        if (global[ctor.name] === undefined) {
          Object.defineProperty(global, ctor.name, { value: ctor, writable: true, configurable: true, enumerable: false });
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
  name: "rtd-downstream",
  viteEnvironment: "client",

  setup(global: Global, options: EnvironmentOptions) {
    const { triage, ...rtd } = (options?.rtd ?? {}) as Record<string, unknown>;
    const window = dom.createWindow({
      url: "http://localhost",
      userAgent: RTD_DOWNSTREAM_USER_AGENT,
      ...rtd,
    } as never) as unknown as Record<PropertyKey, unknown> & { close?: () => void; document: unknown };
    const install = (dom as Record<string, unknown>).installGlobals as
      | ((w: unknown, target: Global) => () => void)
      | undefined;
    const installer = typeof install === "function" ? "installGlobals" : "fallback";
    const uninstall = installer === "installGlobals" ? install!(window, global) : fallbackInstall(window, global);
    const triageAdded: string[] = [];
    const triageRestores: Array<() => void> = [];
    if (triage) {
      for (const [name, shim] of Object.entries(TRIAGE_SHIMS)) {
        const { patched, restore } = shim(global, window.document);
        if (patched.length) triageAdded.push(`${name}(${patched.length})`);
        triageRestores.push(restore);
      }
    }
    Object.defineProperty(global, "__rtdDownstream", {
      value: { window, document: window.document, Document: dom.Document, installer, triageAdded },
      configurable: true,
      enumerable: false,
      writable: true,
    });
    return {
      teardown() {
        delete global.__rtdDownstream;
        for (const restore of triageRestores) restore();
        try {
          window.close?.();
        } finally {
          uninstall();
        }
      },
    };
  },
};
