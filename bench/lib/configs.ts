// Bench configurations: which DOM and which testing-library stack a worker process loads.
//
//   jsdom          jsdom (via Vitest's own jsdom environment setup) + stock @testing-library/*
//   happy-dom      happy-dom (via Vitest's own happy-dom environment setup) + stock @testing-library/*
//   rtd-dom        @rtd/dom (via vitest-environment-rtd) + stock @testing-library/*  (DOM swap only)
//   rtd            @rtd/dom + @rtd/testing-library + @rtd/react + @rtd/user-event + @rtd/jest-dom
//   rtd-dom-dist   rtd-dom, but every @rtd/* import resolves to the bundled packages/*/dist
//   rtd-dist       rtd, bundled
//
// Nothing here statically imports a DOM or testing library: a worker must install the DOM
// globals before React / testing-library modules evaluate, and startup workloads time imports.

import { installDistResolution } from "./dist-hooks.ts";

export const CONFIGS = ["jsdom", "happy-dom", "rtd-dom", "rtd", "rtd-dom-dist", "rtd-dist"] as const;
export type ConfigName = (typeof CONFIGS)[number];

/** Configurations run by default for non-startup workloads. */
export const DEFAULT_CONFIGS: ConfigName[] = ["jsdom", "happy-dom", "rtd-dom", "rtd"];
/** For DOM-only workloads the testing-library stack is irrelevant: rtd === rtd-dom. */
export const DOM_CONFIGS: ConfigName[] = ["jsdom", "happy-dom", "rtd-dom"];

export function isConfig(name: string): name is ConfigName {
  return (CONFIGS as readonly string[]).includes(name);
}

const isRtd = (c: ConfigName) => c.startsWith("rtd");
const isFullStack = (c: ConfigName) => c === "rtd" || c === "rtd-dist";
const isDist = (c: ConfigName) => c.endsWith("-dist");

/** Loose handle on whichever implementation a config loaded. DOM types are intentionally `any`. */
export interface Env {
  config: ConfigName;
  window: any;
  document: any;
  React: typeof import("react");
  createRoot: (container: any) => any;
  act: (cb: () => unknown) => Promise<void>;
  /** @testing-library/dom or @rtd/testing-library */
  dom: any;
  /** @testing-library/react or @rtd/react */
  rtl: any;
  /** default export of @testing-library/user-event or @rtd/user-event */
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
  return "@rtd/dom";
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
  if (!isRtd(c)) vitestRuntime = await import("vitest/runtime");
}

/**
 * Import the DOM library, create its window and install globals exactly as the corresponding
 * Vitest environment does. Returns phase timings. Call `prepare()` first.
 */
export async function installDom(c: ConfigName): Promise<StartupTimings> {
  const t0 = performance.now();
  await import(domSpecifier(c));
  const t1 = performance.now();
  let setupPath: string;
  if (!isRtd(c)) {
    const env = vitestRuntime.builtinEnvironments[c];
    await env.setup(globalThis, {});
    setupPath = `vitest builtin ${c} environment`;
  } else {
    setupPath = await installRtd();
  }
  const t2 = performance.now();
  return { importMs: t1 - t0, setupMs: t2 - t1, totalMs: t2 - t0, setupPath };
}

async function installRtd(): Promise<string> {
  const env = (await dynamicImport("vitest-environment-rtd")).default;
  await env.setup(globalThis, {});
  return "vitest-environment-rtd";
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
    import(full ? "@rtd/testing-library" : "@testing-library/dom"),
    import(full ? "@rtd/react" : "@testing-library/react"),
    import(full ? "@rtd/user-event" : "@testing-library/user-event"),
    import(full ? "@rtd/jest-dom/matchers" : "@testing-library/jest-dom/matchers"),
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
