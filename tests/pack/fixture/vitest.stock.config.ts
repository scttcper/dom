// (a) stock @testing-library/* on `environment: "ctrl-dom"` (vitest-environment-ctrl-dom).
import { defineConfig } from "vitest/config";
import { recordLoads } from "./record-plugin.ts";

export default defineConfig({
  plugins: [recordLoads()],
  test: { environment: "ctrl-dom", include: ["stock.test.tsx"] },
});
