import { defineProject } from "vitest/config";
import { ctrlDomEnvironment } from "../../vitest.environment.ts";
import { include } from "./vitest.react.shared.ts";

export default defineProject({
  plugins: [ctrlDomEnvironment()],
  test: {
    // Load @ctrl/dom and the environment natively (Node strips types) so the environment and the
    // tests share ONE @ctrl/dom module instance (Vite would otherwise inline a second copy).
    server: { deps: { external: [/\/packages\/(dom|vitest-environment)\/src\//] } },
    name: "compat:react-ctrl-dom",
    include,
    environment: "ctrl-dom",
    setupFiles: ["./react/setup.ts"],
    env: { COMPAT_ENGINE: "ctrl-dom" },
  },
});
