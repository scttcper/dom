import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["packages/*", "tests/compat/vitest.*.config.ts"],
    // The tests load @rtd/dom's TypeScript sources in every worker: keep the stripped code and V8
    // code across workers (vitest-environment-rtd's compileCache option; ~7% faster here).
    env: { CTRL_DOM_COMPILE_CACHE: "1" },
  },
});
