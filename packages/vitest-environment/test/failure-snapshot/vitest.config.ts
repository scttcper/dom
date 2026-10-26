// Fixture project for test/failure-snapshot.test.ts: the bare environment (by path, no ctrlDom()
// plugin, which would add the setup file itself) plus the documented setup file line, with
// `globals: true` so stock Testing Library registers its auto-cleanup.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    root: fileURLToPath(new URL(".", import.meta.url)),
    include: ["*.fixture.tsx"],
    globals: true,
    environment: fileURLToPath(new URL("../../src/index.ts", import.meta.url)),
    setupFiles: [fileURLToPath(new URL("../../src/failure-snapshot.ts", import.meta.url))],
    server: { deps: { external: [/\/packages\/(dom|vitest-environment)\/src\//] } },
  },
});
