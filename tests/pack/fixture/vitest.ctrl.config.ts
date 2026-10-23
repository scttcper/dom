// (b) @ctrl/dom/react, @ctrl/dom/user-event, @ctrl/dom/jest-dom/vitest imported directly.
import { defineConfig } from "vitest/config";
import { recordLoads } from "./record-plugin.ts";

export default defineConfig({
  plugins: [recordLoads()],
  test: { environment: "ctrl-dom", include: ["ctrl.test.tsx"] },
});
