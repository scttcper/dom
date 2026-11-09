// (cs) the ctrlDom() plugin with `sharedWorkers`: one worker runs both files in the same realm,
// each after the plugin's setup file reset the window and the first-party modules.
import { defineConfig } from "vitest/config";
import { ctrlDom } from "@ctrl/dom/vitest";
import { recordLoads } from "./record-plugin.ts";

export default defineConfig({
  plugins: [recordLoads(), ctrlDom({ sharedWorkers: true })],
  test: { include: ["shared-*.test.tsx"], maxWorkers: 1, fileParallelism: false },
});
