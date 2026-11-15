// Fixture project for test/warm-workers.test.ts: the ctrlDom() plugin with Vitest's default pool
// (forks, isolated), two workers, six files. Each file records the process it ran in. The global
// setup file sets an environment variable after the plugin has forked its first worker, which
// every file must still see.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { ctrlDom } from "../../src/plugin.ts";

export default defineConfig({
  plugins: [ctrlDom({ warmWorkers: process.env.FIXTURE_WARM !== "0" })],
  test: {
    root: fileURLToPath(new URL(".", import.meta.url)),
    include: ["*.fixture.ts"],
    maxWorkers: 2,
    globalSetup: process.env.FIXTURE_GLOBAL_SETUP === "1" ? ["./global-setup.ts"] : [],
    server: { deps: { external: [/\/packages\/(dom|vitest-environment)\/src\//] } },
  },
});
