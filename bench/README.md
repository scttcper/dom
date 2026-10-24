# @rtd/bench

Benchmarks for react-testing-dom against **jsdom** and **happy-dom** (and the stock
`@testing-library/*` packages on them). Never against browsers.

## Run

```sh
pnpm bench                                   # every workload, default configs, 5 samples
pnpm bench --list                            # workloads and configs
pnpm bench --workloads dom/,react/form       # ids or id prefixes, comma separated
pnpm bench --skip react/fill                 # exclude ids/prefixes
pnpm bench --configs jsdom,rtd --samples 3   # subset of configurations
pnpm bench --iterations 5 --warmup 1         # override per-workload iteration counts
pnpm bench --name before-cache               # results file name suffix
pnpm bench --keep-going                      # keep sampling a config after it errors

pnpm build                                   # bundle packages/*/dist (needed by *-dist configs)
pnpm bench --workloads startup/              # startup incl. bundled @rtd

pnpm bench:suite                             # Vitest end-to-end suite (100 files)
pnpm bench:suite --envs jsdom,rtd --samples 5 --files 100 --workers 4
```

Results go to `bench/results/<date>-<name>.md` (tables) and `.json` (every raw sample). The
directory is git-ignored; copy numbers you want to keep into a doc.

## Configurations

| config | DOM | testing stack |
| --- | --- | --- |
| `jsdom` | jsdom, installed by Vitest's own `jsdom` environment code | stock `@testing-library/{dom,react,user-event,jest-dom}` |
| `happy-dom` | happy-dom, via Vitest's own `happy-dom` environment code | stock |
| `rtd-dom` | `@rtd/dom` via `vitest-environment-rtd` | stock — the "swap only the environment" path |
| `rtd` | `@rtd/dom` | `@rtd/testing-library`, `@rtd/react`, `@rtd/user-event`, `@rtd/jest-dom` |
| `rtd-dom-dist`, `rtd-dist` | as above, but every `@rtd/*` import resolves to the bundled `packages/*/dist/*.js` | |

The `*-dist` configurations exist so startup can be measured without Node's TypeScript type
stripping. They are redirected with a `module.registerHooks` resolve hook
(`lib/dist-hooks.ts`); packages' `exports` still point at `src/`. The runner warns when a
bundle is older than its sources.

DOM-only workloads (`dom/*`) run `jsdom`, `happy-dom`, `rtd-dom` (the testing stack is
irrelevant there). React workloads run the first four. Startup runs all six.

Until `vitest-environment-rtd` is usable, the `rtd*` configs fall back to `@rtd/dom`'s
`createWindow()` + `installGlobals()` (or Vitest's `populateGlobal`); the result's
`setupPath` says which path was used.

## Workloads

Startup (one cold measurement per fresh process, timed from before the first import):

- `startup/import`: `await import()` of the DOM library alone.
- `startup/env`: import + create the window + install globals, as the Vitest environment does
  per test file. Extras: `importMs`, `setupMs`.
- `startup/first-render`: `startup/env` + import React, react-dom and the testing stack, render
  one button and `getByRole` it. Extras: `stackImportMs`, `renderQueryMs`.

React + testing-library (unmodified development React 19; unmount and resets untimed):

- `react/form-10-getByRole`: render a 20-field form and run 10 `getByRole(…, { name })`
  queries + `toBeInTheDocument` (a hidden duplicate form must be skipped).
- `react/fill-10-submit`: same form, `user.type` into 10 fields, click submit; verifies
  `FormData`, change counts and focus.
- `react/form-20-rerender`, `react/form-100-rerender`: mount + 3 rerenders, each followed by
  named role queries.
- `react/keyed-list-1000`: reorder 200 and replace 100 of 1,000 keyed rows; verifies order and
  node identity.
- `react/text-queries`: 10 each of `getByText`, `getByLabelText`, `getByTestId` over a mounted
  200-row tree (query time only).
- `react/findby-waitfor`: `findByRole` after an async load, then 5 click → `waitFor` async
  saves, then `findByText`. Real timers: a DOM whose MutationObserver doesn't drive `waitFor`
  pays the 50 ms polling interval, which is a real cost users feel.
- `react/mount-unmount-churn`: 200 mount/unmount cycles; extra `heapSlopeKBPerMount` is the
  least-squares slope of heap-after-GC sampled every 20 cycles (≈0 when nothing leaks).

DOM micro workloads, ported from `~/gh/dom-bench` and `~/gh/vibedom/bench/dom-bench`:
create 4,000 elements, build 1,000 attributed rows, 4×4 attribute revisions on 1,000 elements,
deep clone of 1,000 rows, `innerHTML` parse of 250 rows, warm selector queries, attribute
mutation + selector queries, 30-level capture/bubble propagation (10 dispatches),
MutationObserver streaming of 50 appends.

Leak workload: `dom/window-churn` creates a window from a 250-row form document, queries,
focuses, adds a listener and closes it, 10 times per iteration (what a reused test worker does
per file); extra `heapSlopeKBPerWindow` is the least-squares slope of heap-after-GC per closed
window (≈0 when `close()` releases everything). Retention itself is asserted by the leak suite
(`tests/compat/test/leaks`, `pnpm vitest run --project @rtd/leaks`).

Every workload **verifies its observable result** after every iteration (untimed), so a DOM
that skips work fails instead of winning. A failing configuration is reported with its error
(in the table and the `## Errors` section) and not re-sampled; the others keep running.

## Methodology

- **Fresh process per sample.** `run.ts` spawns `node --expose-gc worker.ts <workload> <config>`
  for every sample. Nothing is shared between samples, so module caches, JIT state and heap
  growth from one configuration never leak into another.
- **Interleaved.** Samples are taken round-robin: for each sample index, each workload runs
  every config, with the config order rotated each sample and reversed on odd samples, so
  thermal/background drift spreads evenly.
- **Within a process:** `warmup` untimed iterations, then `iterations` timed ones. The
  process's value is the median of its timed iterations.
- **Across processes:** the cell shows the median of the per-process values and
  `[min–max]` across processes (plus IQR in the details table). Default 5 samples.
- **Memory next to time, always:** `heap MB` is `heapUsed` after two forced GCs at the end of
  the sample with the workload's fixture still alive (what the DOM retains);
  `peak RSS MB` is the process's max RSS. Startup rows show the memory of a freshly set-up
  environment.
- `vs jsdom` is the ratio of medians against the jsdom cell of the same workload.

### Reading results

- Look at the ranges before the medians. Overlapping `[min–max]` ranges are not a win.
- Sub-millisecond rows (event propagation, MutationObserver) are dominated by per-call
  overhead; treat differences under ~10% as noise.
- `happy-dom` caches `querySelectorAll` results, which shows up as near-zero `selector-warm`
  times; that is legitimate (any caching an implementation does is included) but say so when
  quoting it.

## Vitest suite benchmark (`suite/`)

`suite/generate.ts` writes 100 small React test files to `suite/.generated/` (git-ignored; a
dot directory so the root `tsc -p` skips it; regenerated when the file count changes): a
rotating mix of static render + role queries, a stateful click, and a user-event form.
`suite/run.ts` runs `vitest run --config suite/vitest.config.ts` once per environment per
sample (fresh process, default pool, interleaved) with:

- `jsdom`, `happy-dom`: Vitest's built-in environments;
- `rtd`: `environment: 'rtd'` (vitest-environment-rtd), stock testing-library;
- `rtd-full`: `rtd` plus `resolve.alias` of `@testing-library/{react,dom,user-event}` and
  `@testing-library/jest-dom/vitest` to the `@rtd` drop-ins — same test files.

It reports **wall time** of the whole `vitest run` (what users feel), Vitest's own per-file
diagnostics summed over files (`environmentSetupDuration`, setup files, collect/import, test
duration — CPU time across workers, not wall), and per-file worker RSS/heap recorded by the
setup file. Only runs where every file passed are timed.

## Regression check (`compare.ts`)

`pnpm bench:compare --base <checkout> --head <checkout>` runs our configurations (`rtd` for React
rows, `rtd-dom` for DOM rows, the bundles for startup) from two checkouts of the repository and
fails when head regresses. Both must be clean checkouts with dependencies installed and `pnpm
build` run: the main working tree times about 10% differently from a fresh checkout of the same
commit. For each sample index every workload runs base then head (head first on odd samples), a
fresh process each, and a metric regresses when the median of the per-sample head/base ratios
exceeds 1.10 (`--threshold`) and the medians differ by more than 0.5 ms / 0.25 MB (sub-millisecond
rows are per-call overhead). Median time and allocation per iteration gate; heap after GC and
peak RSS are reported next to them. CI runs it on pull requests with 9 samples
(.github/workflows/bench.yml) and writes the table to the job summary.

## Bundling (`pnpm build`, `scripts/build.ts`)

One rolldown build per package from its `exports` entries into `packages/<pkg>/dist/`
(`--minify` optional; see `scripts/build.ts` for the CJS builds and declarations it also writes). Bare specifiers stay external, so `@rtd/react`'s bundle imports
`@rtd/dom` rather than embedding a second DOM; packages with several entries
(`@rtd/dom` + `@rtd/dom/internal`) share chunks.

## Files

```
run.ts                 orchestrator (flags above), writes results/
worker.ts              one sample in a fresh process
lib/configs.ts         configurations: install DOM globals, load testing stack, matcher helper
lib/dist-hooks.ts      resolve @rtd/* to dist/ for *-dist configs
lib/packages.ts        workspace package/exports discovery (shared with scripts/build.ts)
lib/report.ts          markdown + terminal tables
lib/stats.ts           median/quantiles/formatting
workloads/*.ts         startup, react, dom workloads
suite/                 Vitest end-to-end suite benchmark
compare.ts             regression check between two checkouts (CI)
bundle.ts              shim for scripts/build.ts (pnpm build)
```

Package-level microbenchmarks written by the package owners (not duplicated here):
`packages/aria/bench` (role/name computation), `packages/testing-library/bench` (queries),
`packages/react/bench`, `packages/user-event/bench`, `packages/jest-dom/bench`, and
`packages/vitest-environment/bench` (environment setup inside Vitest). This harness covers
cross-stack, user-visible workloads.

Native (scriptc) per-module measurements live in `packages/native` (`pnpm --filter
@rtd/native bench`, results in `packages/native/RESULTS.md`).
