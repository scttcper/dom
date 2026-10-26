import { defineProject } from "vitest/config";
import { ctrlDom } from "@ctrl/dom/vitest";

// Layout-lite integration (docs/layout.md): React virtualizers and positioning code on @ctrl/dom
// with `environmentOptions["ctrl-dom"].layout = "lite"`. jsdom has no layout, so unlike
// react/**/*.test.tsx these files run on @ctrl/dom only.
export default defineProject({
  plugins: [ctrlDom({ testingLibrary: false })],
  resolve: { dedupe: ["react", "react-dom"] },
  test: {
    // One @ctrl/dom module instance for the environment and the tests (see vitest.react-ctrl-dom.config.ts).
    server: { deps: { external: [/\/packages\/(dom|vitest-environment)\/src\//] } },
    name: "compat:layout",
    include: ["layout/**/*.test.{ts,tsx}"],
    environment: "ctrl-dom",
    environmentOptions: { "ctrl-dom": { layout: "lite" } },
    setupFiles: ["./react/setup.ts"],
    env: { COMPAT_ENGINE: "ctrl-dom" },
  },
});
