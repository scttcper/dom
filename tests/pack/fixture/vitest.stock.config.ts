// (a) stock @testing-library/* on vitest-environment-rtd.
import { defineConfig } from "vitest/config";
import { recordLoads } from "./record-plugin.ts";

export default defineConfig({
  plugins: [recordLoads()],
  test: { environment: "rtd", include: ["stock.test.tsx"] },
});
