// The workspace's Vitest projects name @ctrl/dom's environment "ctrl-dom", as users do. Vitest
// looks a custom environment up as the package `vitest-environment-<name>`, so this plugin answers
// for that name with the environment's sources, and turns `environment: "ctrl-dom"` into their
// path (Vitest checks a run's environment is an installed package before plugins resolve it). The
// published ctrlDom() plugin does the same with its bundle.

import { fileURLToPath } from "node:url";
import type { Plugin } from "vitest/config";

const ENVIRONMENT = fileURLToPath(new URL("./packages/vitest-environment/src/index.ts", import.meta.url));

/** `environment: "ctrl-dom"` (and `// @vitest-environment ctrl-dom`) for a project. */
export function ctrlDomEnvironment(): Plugin {
  return {
    name: "ctrl-dom-environment",
    enforce: "pre",
    config: (config) => ((config as { test?: { environment?: string } }).test?.environment === "ctrl-dom" ? { test: { environment: ENVIRONMENT } } : undefined),
    resolveId: (id) => (id === "vitest-environment-ctrl-dom" ? ENVIRONMENT : null),
  };
}
