# @rtd/comparison

How the DOMs people test React components with compare, measured the same way under Vitest:
**jsdom**, **happy-dom** and **ctrl-dom** (with stock Testing Library, and with its own). It
generates the benchmark table in the repository README and [RESULTS.md](RESULTS.md).

```sh
pnpm build                    # ctrl-dom is measured from its bundles, as installed
pnpm compare                  # everything (~8 min), then RESULTS.md
pnpm compare --readme         # … and the README table
pnpm compare --only bench --contenders jsdom,ctrl-dom --time 500
pnpm compare:report           # rewrite RESULTS.md from the last results
```

The deeper, per-package harness (allocation and GC per iteration, source vs bundle, the CI
regression check) is `bench/` (`pnpm bench`). This package is the side-by-side view.

## What is measured

**`vitest run` over 100 React test files** (`suite.ts`): the number users feel. Generated files
(`lib/suite-files.ts`) rotate three shapes: a render with role queries, a stateful click, a form
typed into with user-event. Every contender runs the same files with Vitest's defaults (forks
pool, a fresh worker per file) and 4 workers, a fresh `vitest` process per run, contenders
interleaved, 3 runs each. Reported: wall time, Vitest's own per-file environment setup
(`TestModule.diagnostic()`), and worker RSS at the end of each file. Every run must pass.
`COMPARE_EXEC_ARGV` passes extra Node flags to every worker (profiling,
experiments: bench/README.md, "Worker startup").

**The same files with `--pool vmForks`** (`suite.ts --pool vmForks`): Vitest's VM pool keeps
workers alive and gives each file a fresh vm context and environment instead of a fresh process,
which is where per-file environment cost shows most. vmForks rather than vmThreads so the ctrl-dom
contenders' `--import` preload applies in the workers.

**`jest` over the same tests** (`jest-suite.ts`): written as plain CommonJS with
`React.createElement` (`lib/jest-files.ts`) and run with `transform: {}`, so nobody pays for a
transformer, on each DOM's own Jest environment: jest-environment-jsdom (with the jsdom 26 it
ships), `@happy-dom/jest-environment`, jest-environment-ctrl-dom (stock Testing Library, or mapped
to @ctrl/dom's). One untimed run per contender first (Jest's haste map), then 3 interleaved runs
of a fresh Jest process with 4 workers. Reported: wall time, Jest's per-file environment load
(`perfStats`), worker RSS.

**Cold start** (`startup.ts`): a fresh Node process per sample (10, interleaved) runs the
contender's real Vitest environment `setup()` (its import of the DOM included), then a first
test: import React and the Testing Library stack, render, `getByRole`. Heap after two forced GCs
and RSS are recorded at the end.

**Benchmarks** (`benches/*.bench.ts`, `vitest bench`): one Vitest project per contender runs the
same files on the environment's global `document`, so each benchmark is the same code everywhere.
Each one runs 1 s after a warmup (`COMPARE_TIME`), timed with `process.hrtime` (ctrl-dom's
environment puts `performance.now()` on a virtual clock). Vitest prints a cross-project table per
benchmark; the report uses median time per iteration, with the margin of error.

- `dom.bench.ts`: happy-dom's own comparison (its README: parse, serialize,
  `querySelectorAll` by tag, class, attribute and `:nth-child`, custom elements with shadow
  roots), measured over many warm iterations instead of one cold call, on a generated 220 KB app
  page (`fixtures/page.ts`), plus work component tests lean on: building a form, dispatching
  events through deep trees, `getComputedStyle` (plain, and under a 1,200-rule CSS-in-JS sheet
  with a class change between reads), and a query after a mutation. Query results are consumed
  (`Array.from`), as Testing Library and app code do.
- `react.bench.tsx`: what component tests do with `@testing-library/react` and user-event:
  render and query by role, type, click, rerender a keyed list, query text, `findByRole` after a
  timer, and render + query by role under a CSS-in-JS sheet (`fixtures/css-in-js.ts`: ≈1,200
  rules shaped like Emotion/MUI output, where ByRole's visibility checks spend their time in
  style resolution).

Things to keep in mind when reading the numbers:

- happy-dom returns the same cached `querySelectorAll` NodeList until the document changes, so a
  bare `.length` would measure that cache; the query rows iterate the result, and "mutate, then
  query" measures a query after a change.
- ctrl-dom's environment skips idle time on a virtual clock, so `findByRole` after a timer, and
  user-event's delays, do not wait in real time. That is a feature users get, but it is not DOM
  speed.
- Contenders that share a DOM (`sameDomAs`) run the DOM benchmarks once.
- No browsers: this is about the DOMs that run in Node.

## Adding a contender

A contender is a file in `contenders/` exporting a `Contender` (`contenders/types.ts`), listed in
`contenders/index.ts`. Every runner and the report pick it up.

```ts
// contenders/linkedom.ts
import { createRequire } from "node:module";
import type { Contender } from "./types.ts";

const require = createRequire(import.meta.url);
const environment = new URL("../lib/linkedom-environment.ts", import.meta.url).pathname;

export const linkedom: Contender = {
  id: "linkedom",
  label: "linkedom",
  version: () => require("linkedom/package.json").version,
  // A built-in Vitest environment name, or a path to a module exporting an Environment.
  environment,
  loadEnvironment: async () => (await import(environment)).default,
  imports: { react: "@testing-library/react", userEvent: "@testing-library/user-event" },
};
```

Optional fields: `environmentOptions`, `alias` (route the stock `@testing-library/*` imports
elsewhere, as `ctrl-dom-stack` does), `preload` and `external` (how its modules load in Vitest
workers), `sameDomAs` (only the Testing Library stack differs from another contender), and
`check` (fail early with instructions, e.g. "run `pnpm build`"), `env` (variables for its workers),
and `jest` (its Jest environment, `moduleNameMapper` entries, and the column label: without it the
contender has no Jest row). Add the package to this package's dependencies.

## Adding a benchmark

Add a test to a file in `benches/` that calls `measure(context, "Label", fn)`; the label is the
row name in reports. It runs for every contender. To put it in the README, add the label to
`README_ROWS` in `report.ts`.
