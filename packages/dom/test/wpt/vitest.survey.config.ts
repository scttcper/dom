// Runs test/wpt/survey.scratch.ts (not part of the suite): see the usage comment there.
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: new URL("../..", import.meta.url).pathname,
  test: {
    include: ["test/wpt/survey.scratch.ts"],
    testTimeout: 3_600_000,
  },
});
