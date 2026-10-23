// Runs test/wpt-aria-triage.scratch.ts (not part of the suite).
import { defineConfig } from "vitest/config";
export default defineConfig({
  root: new URL("..", import.meta.url).pathname,
  test: { include: ["test/wpt-aria-triage.scratch.ts"], testTimeout: 3_600_000 },
});
