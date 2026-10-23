// (b) @rtd/react, @rtd/user-event, @rtd/jest-dom/vitest imported directly.
import { defineConfig } from "vitest/config";
import { recordLoads } from "./record-plugin.ts";

export default defineConfig({
  plugins: [recordLoads()],
  test: { environment: "rtd", include: ["rtd.test.tsx"] },
});
