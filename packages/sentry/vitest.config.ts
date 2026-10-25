import { defineProject } from "vitest/config";

// The collector tests run on @rtd/dom (vitest-environment-rtd): they subscribe to the tracing
// channel and drive @rtd/react, @rtd/testing-library and @rtd/user-event against the window.
export default defineProject({
  test: {
    name: "@rtd/sentry",
    include: ["test/**/*.test.{ts,tsx}"],
    // One @rtd/dom instance shared by the environment and the tests (see packages/react).
    server: { deps: { external: [/\/packages\/(dom|vitest-environment)\/src\//] } },
    environment: "rtd",
  },
});
