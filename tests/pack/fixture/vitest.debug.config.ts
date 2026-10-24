// (f1) `ctrl-dom debug` with the README's whole-stack setup: under CTRL_DOM_DEBUG the plugin adds
// the failure snapshot setup file.
import { defineConfig } from "vitest/config";
import { ctrlDom } from "@ctrl/dom/vitest";
import { recordLoads } from "./record-plugin.ts";

export default defineConfig({
  plugins: [recordLoads(), ctrlDom()],
  test: { include: ["debug.vitest.fixture.tsx"], globals: true, setupFiles: ["@testing-library/jest-dom/vitest"] },
});
