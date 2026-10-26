import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "vitest/config";

// Node's on-disk compile cache, for each worker from its first module and for the processes tests
// spawn (Jest, node --test, the ctrl-dom CLI), which load @ctrl/dom's TypeScript sources natively:
// stripping types and compiling would otherwise repeat in every one of them (~11% of a serial run
// here). Set before the workers fork; Vitest's `env` only reaches them once they run.
process.env.NODE_COMPILE_CACHE ??= join(tmpdir(), "node-compile-cache");

export default defineConfig({
  test: {
    // Config files rather than `packages/*`: a directory glob also matches the short-lived
    // `.watchman-cookie-*` files watchman drops in watched directories, which fails startup.
    projects: ["packages/*/vitest.config.ts", "tests/compat/vitest.*.config.ts"],
    // Vitest's end-of-run hints suggest `isolate: false` and VM pools; a fresh module graph and
    // environment per test file is what these tests check, so the hints are noise here.
    experimental: { diagnostics: false },
  },
});
