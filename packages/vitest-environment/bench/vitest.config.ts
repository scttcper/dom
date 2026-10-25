// Environment-startup benchmark: the same React + Testing Library files under jsdom,
// happy-dom and ctrl-dom. Usage: node bench/run.ts (see that file).
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const env = process.env.CTRL_DOM_BENCH_ENV ?? "ctrl-dom";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  test: {
    include: ["fixtures/*.test.tsx"],
    environment: env === "ctrl-dom" ? fileURLToPath(new URL(process.env.CTRL_DOM_BENCH_TIMED ? "./timed-env.ts" : "../src/index.ts", import.meta.url)) : env,
    reporters: [fileURLToPath(new URL("./reporter.ts", import.meta.url))],
    pool: "forks",
    isolate: true,
    maxWorkers: 4,
    // Load the environment and @ctrl/dom natively (Node runs the .ts sources), like a published
    // package in node_modules would be; CTRL_DOM_BENCH_INLINE=1 measures the Vite-inlined path.
    server: { deps: { external: process.env.CTRL_DOM_BENCH_INLINE ? [] : [/\/packages\/(dom|vitest-environment)\/src\//] } },
  },
});
