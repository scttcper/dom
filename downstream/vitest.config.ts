// Standalone Vitest project for downstream repros (minimal failures distilled from downstream
// downstream suites such as Base UI). Each repro runs the same scenario on jsdom (the oracle) and on
// @ctrl/dom, so the jsdom case passes and the @ctrl/dom case fails until the owning area fixes it.
// Repros are expected to fail, so this project is NOT in the root `vitest.config.ts` projects
// list (it would break `pnpm test`). Run it with:
//
//   pnpm vitest run --config downstream/vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "downstream-repros",
    root: import.meta.dirname,
    include: ["*/repros/**/*.test.ts"], // base-ui/repros, radix/repros, …
    environment: "node",
  },
});
