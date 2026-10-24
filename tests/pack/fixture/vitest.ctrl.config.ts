// (b) @ctrl/dom/react, @ctrl/dom/user-event, @ctrl/dom/jest-dom/vitest imported directly. The
// test file picks the environment with a `// @vitest-environment ctrl-dom` docblock, which only
// resolves through the plugin (there is no vitest-environment-ctrl-dom package).
import { defineConfig } from "vitest/config";
import { ctrlDom } from "@ctrl/dom/vitest";
import { recordLoads } from "./record-plugin.ts";

export default defineConfig({
  plugins: [recordLoads(), ctrlDom({ testingLibrary: false })],
  test: { include: ["ctrl.test.tsx"] },
});
