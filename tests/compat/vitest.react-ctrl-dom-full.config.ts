import { defineProject } from "vitest/config";
import { ctrlDom } from "@ctrl/dom/vitest";
import { include, ourTestingLibrary } from "./vitest.react.shared.ts";

export default defineProject({
  plugins: [ctrlDom({ testingLibrary: false })],
  resolve: { alias: ourTestingLibrary, dedupe: ["react", "react-dom"] },
  test: {
    // Load @ctrl/dom and the environment natively (Node strips types) so the environment and the
    // tests share ONE @ctrl/dom module instance (Vite would otherwise inline a second copy).
    server: { deps: { external: [/\/packages\/(dom|vitest-environment)\/src\//] } },
    name: "compat:react-ctrl-dom-full",
    include,
    environment: "ctrl-dom",
    setupFiles: ["./react/setup.ts"],
    env: { COMPAT_ENGINE: "ctrl-dom-full" },
  },
});
