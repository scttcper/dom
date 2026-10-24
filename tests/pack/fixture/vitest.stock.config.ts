// (a) the README's DOM-only setup: `ctrlDom({ testingLibrary: false })` sets the environment and
// leaves the stock @testing-library/* imports alone.
import { defineConfig } from "vitest/config";
import { ctrlDom } from "@ctrl/dom/vitest";
import { recordLoads } from "./record-plugin.ts";

export default defineConfig({
  plugins: [recordLoads(), ctrlDom({ testingLibrary: false })],
  test: { include: ["stock.test.tsx"] },
});
