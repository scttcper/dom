import { defineProject } from "vitest/config";

// Layout-lite integration (docs/layout.md): React virtualizers and positioning code on @rtd/dom
// with `environmentOptions["ctrl-dom"].layout = "lite"`. jsdom has no layout, so unlike
// react/**/*.test.tsx these files run on @rtd/dom only.
export default defineProject({
  resolve: { dedupe: ["react", "react-dom"] },
  test: {
    // One @rtd/dom module instance for the environment and the tests (see vitest.react-rtd.config.ts).
    server: { deps: { external: [/\/packages\/(dom|vitest-environment)\/src\//] } },
    name: "compat:layout",
    include: ["layout/**/*.test.{ts,tsx}"],
    environment: "rtd",
    environmentOptions: { "ctrl-dom": { layout: "lite" } },
    setupFiles: ["./react/setup.ts"],
    env: { COMPAT_ENGINE: "rtd" },
  },
});
