import type { AnyWorkload, StartupWorkload } from "./types.ts";
import { domWorkloads } from "./dom.ts";
import { reactWorkloads } from "./react.ts";
import { CONFIGS } from "../lib/configs.ts";

/**
 * Startup workloads run once per fresh process (cold), timed from before the first import.
 *  - startup/import: `await import()` of the DOM library alone (jsdom / happy-dom / @ctrl/dom).
 *  - startup/env: import the DOM library, create the window, install globals (what a Vitest
 *    environment does per test file).
 *  - startup/first-render: startup/env + import React, react-dom and the testing-library stack,
 *    render a small component and run one getByRole (time to first query of a test file).
 */
export const startupWorkloads: StartupWorkload[] = [
  {
    id: "startup/import",
    title: "Import the DOM library only (cold)",
    kind: "startup",
    configs: ["jsdom", "happy-dom", "ctrl-dom", "ctrl-dom-dist"],
  },
  {
    id: "startup/env",
    title: "Environment startup: import DOM + create window + install globals",
    kind: "startup",
    configs: [...CONFIGS],
  },
  {
    id: "startup/first-render",
    title: "Cold first test: env + import React/testing-library + render + getByRole",
    kind: "startup",
    configs: [...CONFIGS],
  },
];

export const allWorkloads: AnyWorkload[] = [...startupWorkloads, ...reactWorkloads, ...domWorkloads];

export function findWorkload(id: string): AnyWorkload | undefined {
  return allWorkloads.find((w) => w.id === id);
}
