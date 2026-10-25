import { defineProject } from "vitest/config";
import { ctrlDomEnvironment } from "../../vitest.environment.ts";

// The collector tests run on @ctrl/dom's environment: they drive its React, Testing Library and
// user-event packages, whose spans arrive on the "ctrl-dom:span" tracing channel. The runner tests
// start Vitest and Jest themselves on test/fixtures.
export default defineProject({
  plugins: [ctrlDomEnvironment()],
  test: {
    name: "@ctrl/sentry-tests",
    include: ["test/**/*.test.{ts,tsx}"],
    // One @ctrl/dom instance shared by the environment and the tests (see packages/react).
    server: { deps: { external: [/\/packages\/(dom|vitest-environment)\/src\//] } },
    environment: "ctrl-dom",
  },
});
