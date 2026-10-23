import { defineProject } from "vitest/config";
import { include } from "./vitest.react.shared.ts";

export default defineProject({
  test: {
    // Load @rtd/dom and the environment natively (Node strips types) so the environment and the
    // tests share ONE @rtd/dom module instance (Vite would otherwise inline a second copy).
    server: { deps: { external: [/\/packages\/(dom|vitest-environment)\/src\//] } },
    name: "compat:react-rtd",
    include,
    environment: "rtd",
    setupFiles: ["./react/setup.ts"],
    env: { COMPAT_ENGINE: "rtd" },
  },
});
