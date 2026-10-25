import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Config files rather than `packages/*`: a directory glob also matches the short-lived
    // `.watchman-cookie-*` files watchman drops in watched directories, which fails startup.
    projects: ["packages/*/vitest.config.ts", "tests/compat/vitest.*.config.ts"],
    // The tests load @ctrl/dom's TypeScript sources in every worker: keep the stripped code and V8
    // code across workers (@ctrl/dom/vitest-environment's compileCache option; ~7% faster here).
    env: { CTRL_DOM_COMPILE_CACHE: "1" },
  },
});
