import { fileURLToPath } from "node:url";
import { defineProject } from "vitest/config";
import { ctrlDomEnvironment } from "../../vitest.environment.ts";

// Which DOM the ported upstream suite (test/upstream/**) and the React tests run on:
//   CTRL_DOM_STACK=ctrl-dom    -> @ctrl/dom/vitest-environment (@ctrl/dom)          (the target, default)
//   CTRL_DOM_STACK=jsdom  -> jsdom                                       (oracle mode: verifies the port itself)
// test/differential/** creates its own jsdom / @ctrl/dom windows and runs on both regardless.
const stack = process.env.CTRL_DOM_STACK ?? "ctrl-dom";

// Oracle mode for the ported suite: CTRL_DOM_UE_IMPL=stock runs test/upstream/** against the stock
// @testing-library/user-event@14.6.8 build (its dist/esm has the same module layout as src/),
// so differences caused by the environment (jsdom 30 vs the jsdom 20 upstream was written
// against) can be told apart from differences in our port.
const impl = process.env.CTRL_DOM_UE_IMPL ?? "ctrl-dom";
const stockDist = fileURLToPath(
  new URL("./node_modules/@testing-library/user-event/dist/esm/", import.meta.url),
);

export default defineProject({
  plugins: [ctrlDomEnvironment()],
  resolve: {
    alias:
      impl === "stock"
        ? [
            {
              find: "#testHelpers/react.ts",
              replacement: fileURLToPath(new URL("./test/upstream/_helpers/react-stock.ts", import.meta.url)),
            },
            {
              find: "#testHelpers/dtl.ts",
              replacement: fileURLToPath(new URL("./test/upstream/_helpers/dtl-stock.ts", import.meta.url)),
            },
            { find: /^#src\/(.*)\.ts$/, replacement: `${stockDist}$1.js` },
          ]
        : [],
  },
  test: {
    name: "@ctrl/dom/user-event",
    include:
      impl === "stock"
        ? ["test/upstream/**/*.test.{ts,tsx}"]
        : ["test/**/*.test.{ts,tsx}", "src/**/*.test.{ts,tsx}"],
    environment: stack,
    globals: true,
    setupFiles: ["./test/_setup.ts"],
    // Keep @ctrl/dom and the environment out of Vite's module graph so tests share the single
    // @ctrl/dom instance @ctrl/dom/vitest-environment installed (otherwise Vite inlines a second copy).
    server: { deps: { external: [/\/packages\/(dom|vitest-environment)\/src\//] } },
  },
});
