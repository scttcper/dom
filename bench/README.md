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
stripping. They are redirected with a `module.registerHooks` resolve hook (`lib/dist-hooks.ts`
in-process; `lib/dist-preload.js`, plain JavaScript so workers never load the type stripper, in
the suite's Vitest workers); packages' `exports` still point at `src/`. The runner warns when a
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

## Worker startup: where a fresh Vitest worker's time goes

Vitest's default pool forks a fresh worker per test file, so everything below is paid once per
file. Measured 2026-10-23 at e68c6fc (Apple M4 Max, Node 26.12.1, shared machine: medians of
fresh, interleaved processes; profiles aggregated over 100 workers of comparison/'s suite with
`COMPARE_EXEC_ARGV="--cpu-prof ..."`).

Our environment's `setup()` is ~22 ms per file with @ctrl/dom's Testing Library (the compile
cache on) and ~32 ms with stock Testing Library (off). It splits into:

| step | ms | notes |
| --- | ---: | --- |
| import `@rtd/dom` (1.4 MB bundle) | 8.7 cached / 19 uncached | ~10 ms of the uncached import is V8 compiling the bundle; evaluation ~4 ms (class creation, prototype mixins; nothing large left to defer) |
| `installGlobals` | 11 | 10.7 ms of it is Node loading undici (below); our own work ~0.5 ms |
| `createWindow` | 2 | first window per process includes `preparePrototype` (interface objects, ~0.3 ms real) |
| clock, handlers | 0.3 | |

**undici.** Reading the descriptors of Node's lazy `FormData`/`MessageEvent`/`CloseEvent`/
`ErrorEvent` globals makes Node evaluate its bundled undici (agent, pool, client, `node:http2`,
`node:tls`): 10.7 ms. `installGlobals` does it on purpose before installing our `Event`/
`EventTarget` (window/globals.ts header): undici's classes extend whatever `Event`/`EventTarget`
are global when it first loads, so a test's first `fetch()` (MSW) or `new Response()` would
otherwise make Node's WebSocket/MessageEvent extend ours for the rest of the process, and
uninstall could not restore the originals. There is no way around it that keeps that behavior:
those globals are V8 lazy data properties (reading their value or descriptor, or redefining them,
triggers the load; only assignment and `delete` do not, and both lose the lazy property), Node's
`fetch` wrapper loads undici only when called, and no public synchronous path returns undici's
classes. It is also the one part a startup snapshot cannot hold (below).

### V8 startup snapshot: works, does not pay

A userland snapshot (`node --snapshot-blob x --build-snapshot entry.cjs`) holding the evaluated DOM
bundle, handed to workers with `--snapshot-blob` in `execArgv`, was evaluated end to end
(`node bench/startup-snapshot.ts [--warm] [--keep]` rebuilds it and times the process-level
numbers).

- **It works with Vitest's forks and vmForks pools.** Node runs the worker entry (ESM) after
  deserializing, `module.registerHooks` registered from `v8.startupSnapshot.addDeserializeCallback`
  can answer the DOM entries' URLs with re-exports of the snapshot's modules (so the environment,
  test code and the Testing Library bundles all get the snapshot instance, no bridge needed), and
  all 100 suite files pass. One Node bug to work around: a deserialized userland snapshot has no
  `console.Console` (Node 26.12), which Vitest's worker constructs (`TypeError: Console is not a
  constructor` in every file); the entry must save it before snapshotting and put it back.
  Worker threads (the `threads`/`vmThreads` pools) reject `--snapshot-blob` in `execArgv`
  (`ERR_WORKER_INVALID_EXEC_ARGV`), so it could only ever apply to forked pools.
- **undici cannot be in it**: loading it before snapshotting aborts the build (`global handle
  not serialized`: the HTTP parser and http2 bindings), so `installGlobals` still pays 10.7 ms.
- **Blob**: 11.6 MB (Node alone: 6.8 MB; 12.0 MB warmed), built in ~0.25 s plus ~55 ms to bundle
  the DOM as one CommonJS file (the builder cannot `require` user files). Valid only for the exact
  Node binary: Node refuses to start from a blob built by another version, so it would have to be
  built lazily per machine into a cache keyed by Node version + bundle hash.
- **Process level** (fresh process: import + `createWindow` + `installGlobals`): the import
  drops from 8.7 ms (compile cache) / 19 ms (none) to 1.9 ms (the generated re-export module),
  but deserializing the DOM's part of the heap adds 4.9 ms to Node's boot (an empty userland
  snapshot adds 0.6 ms), heap +0.4 MB and RSS +9 MB. Net: ~2 ms per process against the compile
  cache, ~12 ms without it. Functions the builder never ran have no bytecode in the blob and are
  compiled on first call; `--warm` exercises the DOM before snapshotting so a first render finds
  them compiled.
- **End to end** (comparison/'s 100-file suite, 3 workers, 9 interleaved runs per variant, warmed
  blob): Vitest's per-file environment setup drops 23.1 → 14.0 ms (whole stack) and 33.0 →
  13.8 ms (stock Testing Library), but nothing else gets faster and test-file import gets
  slower (+1.8 / +4.4 ms per file), so total CPU over the run is unchanged (18.31 → 18.13 s and
  30.32 → 30.37 s) and wall time within noise (5.01 → 5.08 s, 8.81 → 8.69 s), while every worker
  holds 14–20 MB more RSS (108 → 123 MB, 119 → 140 MB).

So it is not shipped: the saving is the bundle's evaluation (~4 ms), which deserialization
mostly costs again, and the large per-file costs (Node's own boot, Vitest's worker modules,
undici, test-file imports) are outside what a DOM snapshot can hold.

### Worker flags (`ctrlDom()`)

What did pay is how the worker process itself runs. Self time per worker, aggregated over the
100 profiles: Node's module loader (resolution + compilation) ~31 ms, @rtd/dom ~17 ms (import and
test work), Vitest's own modules ~12 ms, react-dom ~10 ms, undici ~5 ms, GC ~4.4 ms (profiler
inflated, but the proportions hold). Two flags, measured on comparison/'s suite (whole stack,
3 workers, 9 interleaved runs each; `COMPARE_WORKER_FLAGS=0` / `COMPARE_EXEC_ARGV` select them):

| flags | worker CPU per file | CPU over the run | wall | worker RSS |
| --- | ---: | ---: | ---: | ---: |
| none | 201.6 ms [184.5–232.3] | 21.27 s [19.83–24.45] | 5.94 s [5.54–7.09] | 108.5 MB |
| compile cache from start | 197.6 ms [156.9–207.9] | 20.87 s [16.50–22.13] | 5.86 s [4.55–6.41] | 108.9 MB |
| `--min-semi-space-size=16` | 186.1 ms [148.0–207.8] | 19.76 s [15.69–21.88] | 5.87 s [4.67–6.56] | 121.2 MB |
| both (what `ctrlDom()` adds) | 187.0 ms [145.3–222.2] | 19.86 s [15.50–23.41] | 5.93 s [4.54–7.60] | 121.7 MB |

Worker CPU per file is `process.cpuUsage()` at the end of the file (lib/suite-setup.ts), the
least load-sensitive number here; the machine was saturated by other jobs (load ~10 on 14
cores), which is why wall time did not move. An earlier run of the same comparison measured
CPU over the run 18.24 → 16.67 s (young generation), 17.22 s (compile cache from start), 16.13 s
(both). `pnpm compare --only startup,suite` afterwards (4 workers, 3 runs) against the run before
the change: whole stack 3.92 → 3.73 s wall (ctrl-dom with stock Testing Library, unchanged, went
7.00 → 6.78 s in the same runs, so ~2% of that is the machine), cold start 56.1 → 53.2 ms.

- **Compile cache from process start.** With @ctrl/dom's Testing Library the environment already
  enables Node's compile cache before importing the DOM; enabling it as the worker starts (an
  `--import=data:` preload) also caches Vitest's runner, chai and the module runner, which every
  worker loads before the environment.
- **`--min-semi-space-size=16`.** A worker lives for one file and most of what it allocates while
  loading modules and rendering dies young; starting the young generation at 16 MB instead of
  growing it from 1 MB skips most scavenges. Only for forked pools (`forks`, `vmForks`): worker
  threads reject V8 flags in `execArgv`.

The plugin adds only the compile-cache preload (with its Testing Library; it stays off for stock
Testing Library, see `compileCache`), in `configureVitest`, where the resolved pool is known.
The young generation flag is not shipped: −6% worker CPU did not show up as wall time on these
runs, and +13 MB RSS per worker (+11%) works against the memory half of priority 1. Pass
`--min-semi-space-size=16` in your own `execArgv` if CPU matters more than memory for you.
comparison/'s `ctrl-dom-stack` contender mirrors the plugin (`workerExecArgv` from
publish/ctrl-dom/vitest.js).

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
lib/dist-preload.js    the same, as an --import preload for Vitest workers (RTD_DIST_MAP)
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
