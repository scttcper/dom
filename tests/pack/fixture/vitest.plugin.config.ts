// (c) the README's whole-stack setup: `ctrlDom()` sets the environment (by path) and routes the
// stock @testing-library/* imports to @ctrl/dom.
import { defineConfig } from "vitest/config";
import { ctrlDom } from "@ctrl/dom/vitest";
import { recordLoads } from "./record-plugin.ts";

export default defineConfig({
  plugins: [recordLoads(), ctrlDom()],
  test: { include: ["stock.test.tsx"] },
});
