// Bench configurations: which DOM and which testing-library stack a worker process loads.
//
//   jsdom               jsdom (via Vitest's own jsdom environment setup) + stock @testing-library/*
//   happy-dom           happy-dom (via Vitest's own happy-dom environment setup) + stock @testing-library/*
//   ctrl-dom            @ctrl/dom (via @ctrl/dom/vitest-environment) + stock @testing-library/*  (DOM swap only)
//   ctrl-dom-full       @ctrl/dom + its Testing Library, React, user-event and jest-dom
//   ctrl-dom-dist       ctrl-dom, with every @ctrl/dom import resolved to the bundled packages/*/dist
//   ctrl-dom-full-dist  ctrl-dom-full, bundled
//
// bench/compare.ts maps these by position onto an older checkout's names: keep the order.
//
// Nothing here statically imports a DOM or testing library: a worker must install the DOM
// globals before React / testing-library modules evaluate, and startup workloads time imports.

import { installDistResolution } from "./dist-hooks.ts";

/**
 * The host's clock. The ctrl-dom environment replaces `globalThis.performance` with its virtual
 * clock's (time skipping), whose now() includes skipped idle time: a workload that waits on timers
 * (user-event's yields, waitFor) would be timed in skipped virtual milliseconds, not real ones.
 */
export const hostNow: () => number = performance.now.bind(performance);

export const CONFIGS = [
  "jsdom",
  "happy-dom",
  "ctrl-dom",
  "ctrl-dom-full",
  "ctrl-dom-dist",
  "ctrl-dom-full-dist",
] as const;
export type ConfigName = (typeof CONFIGS)[number];

/** Configurations run by default for non-startup workloads. */
export const DEFAULT_CONFIGS: ConfigName[] = ["jsdom", "happy-dom", "ctrl-dom", "ctrl-dom-full"];
/** For DOM-only workloads the testing-library stack is irrelevant: ctrl-dom-full === ctrl-dom. */
export const DOM_CONFIGS: ConfigName[] = ["jsdom", "happy-dom", "ctrl-dom"];

export function isConfig(name: string): name is ConfigName {
  return (CONFIGS as readonly string[]).includes(name);
}

const isCtrlDom = (c: ConfigName) => c.startsWith("ctrl-dom");
const isFullStack = (c: ConfigName) => c === "ctrl-dom-full" || c === "ctrl-dom-full-dist";
const isDist = (c: ConfigName) => c.endsWith("-dist");

/** Loose handle on whichever implementation a config loaded. DOM types are intentionally `any`. */
export interface Env {
  config: ConfigName;
  window: any;
  document: any;
  React: typeof import("react");
  createRoot: (container: any) => any;
  act: (cb: () => unknown) => Promise<void>;
  /** @testing-library/dom or @ctrl/dom/testing-library */
  dom: any;
  /** @testing-library/react or @ctrl/dom/react */
  rtl: any;
  /** default export of @testing-library/user-event or @ctrl/dom/user-event */
  userEvent: any;
  /** jest-dom matcher functions, callable through `expectMatcher` */
  matchers: Record<string, (...args: any[]) => { pass: boolean; message: () => string }>;
  /** How the DOM globals were installed (reported in results). */
  setupPath: string;
}

export interface StartupTimings {
  importMs: number;
  setupMs: number;
  totalMs: number;
  setupPath: string;
}

/** Module specifier of the DOM implementation itself (for import timing). */
export function domSpecifier(c: ConfigName): string {
  if (c === "jsdom") return "jsdom";
  if (c === "happy-dom") return "happy-dom";
  return "@ctrl/dom";
}

let vitestRuntime: any = null;

/** Import by runtime string: these packages are mid-construction, so no static type resolution. */
export function dynamicImport(specifier: string): Promise<any> {
  return import(specifier);
}

/**
 * Pre-load what is NOT part of the DOM cost: Vitest's environment helpers (for jsdom/happy-dom
 * this is the module that does `await import('jsdom')` + `new JSDOM()` + populateGlobal) and the
 * dist resolution hook.
 */
export async function prepare(c: ConfigName): Promise<void> {
  if (isDist(c)) installDistResolution();
  if (!isCtrlDom(c)) vitestRuntime = await import("vitest/runtime");
}

/**
 * Import the DOM library, create its window and install globals exactly as the corresponding
 * Vitest environment does. Returns phase timings. Call `prepare()` first.
 */
export async function installDom(c: ConfigName): Promise<StartupTimings> {
  const t0 = hostNow();
  await import(domSpecifier(c));
  const t1 = hostNow();
  let setupPath: string;
  if (!isCtrlDom(c)) {
    const env = vitestRuntime.builtinEnvironments[c];
    await env.setup(globalThis, {});
    setupPath = `vitest builtin ${c} environment`;
  } else {
    setupPath = await installCtrlDom();
  }
  const t2 = hostNow();
  return { importMs: t1 - t0, setupMs: t2 - t1, totalMs: t2 - t0, setupPath };
}

async function installCtrlDom(): Promise<string> {
  const env = (await dynamicImport("@ctrl/dom/vitest-environment")).default;
  await env.setup(globalThis, {});
  return "@ctrl/dom/vitest-environment";
}

/** Install the DOM and load React + the configuration's testing-library stack. */
export async function loadEnv(c: ConfigName): Promise<Env> {
  await prepare(c);
  const { setupPath } = await installDom(c);
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const full = isFullStack(c);
  const [dom, rtl, ue, matchers] = await Promise.all([
    import(full ? "@ctrl/dom/testing-library" : "@testing-library/dom"),
    import(full ? "@ctrl/dom/react" : "@testing-library/react"),
    import(full ? "@ctrl/dom/user-event" : "@testing-library/user-event"),
    import(full ? "@ctrl/dom/jest-dom/matchers" : "@testing-library/jest-dom/matchers"),
  ]);
  const g = globalThis as any;
  return {
    config: c,
    window: g.window,
    document: g.document,
    React,
    createRoot,
    act: React.act as any,
    dom,
    rtl,
    userEvent: (ue as any).default ?? (ue as any).userEvent,
    matchers: matchers as any,
    setupPath,
  };
}

/**
 * Call a jest-dom matcher directly the way expect() would (minimal matcher context) and throw if
 * it does not pass. Lets workloads exercise matchers without a test runner.
 */
const matcherContext = {
  isNot: false,
  promise: "",
  equals: (a: unknown, b: unknown) => Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b),
  utils: {
    matcherHint: (name: string) => name,
    printReceived: (v: unknown) => String(v),
    printExpected: (v: unknown) => String(v),
    printWithType: (_n: string, v: unknown) => String(v),
    stringify: (v: unknown) => String(v),
    diff: () => "",
    RECEIVED_COLOR: (s: string) => s,
    EXPECTED_COLOR: (s: string) => s,
    INVERTED_COLOR: (s: string) => s,
    BOLD_WEIGHT: (s: string) => s,
    DIM_COLOR: (s: string) => s,
  },
};

export function expectMatcher(env: Env, name: string, received: unknown, ...args: unknown[]): void {
  const fn = env.matchers[name];
  if (typeof fn !== "function") throw new Error(`jest-dom matcher ${name} is missing`);
  const result = fn.call(matcherContext, received, ...args);
  if (!result.pass) throw new Error(`${name} failed: ${result.message()}`);
}
