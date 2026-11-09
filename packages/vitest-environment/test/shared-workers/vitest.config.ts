// Fixture project for test/shared-workers.test.ts: the ctrlDom() plugin with `sharedWorkers`, one
// worker, so the three files run one after another in the same realm. @ctrl/dom loads through
// Node as it does from node_modules (the external pattern); the plugin's setup file is still
// transformed by Vitest (its own inline pattern wins).
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { ctrlDom } from "../../src/plugin.ts";

export default defineConfig({
  plugins: [ctrlDom({ sharedWorkers: process.env.FIXTURE_SHARED !== "0" })],
  test: {
    root: fileURLToPath(new URL(".", import.meta.url)),
    include: ["*.fixture.tsx"],
    globals: process.env.FIXTURE_GLOBALS === "1",
    maxWorkers: 1,
    fileParallelism: false,
    isolate: false,
    server: { deps: { external: [/\/packages\/(dom|vitest-environment)\/src\//] } },
  },
});
