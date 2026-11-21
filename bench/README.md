# Benchmarks

Benchmarks for @ctrl/dom against **jsdom** and **happy-dom** (and the stock
`@testing-library/*` packages on them). Never against browsers.

## Run

```sh
pnpm bench                                   # every workload, default configs, 5 samples
pnpm bench --list                            # workloads and configs
pnpm bench --workloads dom/,react/form       # ids or id prefixes, comma separated
pnpm bench --skip react/fill                 # exclude ids/prefixes
pnpm bench --configs jsdom,ctrl-dom --samples 3   # subset of configurations
pnpm bench --iterations 5 --warmup 1         # override per-workload iteration counts
pnpm bench --name before-cache               # results file name suffix
pnpm bench --keep-going                      # keep sampling a config after it errors

pnpm build                                   # bundle packages/*/dist (needed by *-dist configs)
pnpm bench --workloads startup/              # startup incl. bundled @ctrl/dom

pnpm bench:suite                             # Vitest end-to-end suite (100 files)
pnpm bench:suite --envs jsdom,ctrl-dom --samples 5 --files 100 --workers 4
```

Results go to `bench/results/<date>-<name>.md` (tables) and `.json` (every raw sample). The
directory is git-ignored; copy numbers you want to keep into a doc.

## Configurations

| config | DOM | testing stack |
| --- | --- | --- |
| `jsdom` | jsdom, installed by Vitest's own `jsdom` environment code | stock `@testing-library/{dom,react,user-event,jest-dom}` |
| `happy-dom` | happy-dom, via Vitest's own `happy-dom` environment code | stock |
| `ctrl-dom` | `@ctrl/dom` via `@ctrl/dom/vitest-environment` | stock (the "swap only the environment" path) |
| `ctrl-dom-full` | `@ctrl/dom` | `@ctrl/dom/testing-library`, `@ctrl/dom/react`, `@ctrl/dom/user-event`, `@ctrl/dom/jest-dom` |
| `ctrl-dom-dist`, `ctrl-dom-full-dist` | as above, but every `@ctrl/dom` import resolves to the bundled `packages/*/dist/*.js` | |

The `*-dist` configurations exist so startup can be measured without Node's TypeScript type
stripping. They are redirected with a `module.registerHooks` resolve hook (`lib/dist-hooks.ts`
in-process; `lib/dist-preload.js`, plain JavaScript so workers never load the type stripper, in
the suite's Vitest workers); packages' `exports` still point at `src/`. The runner warns when a
bundle is older than its sources.

DOM-only workloads (`dom/*`) run `jsdom`, `happy-dom`, `ctrl-dom` (the testing stack is
irrelevant there). React workloads run the first four. Startup runs all six.

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
- `react/mount-unmount-churn`: 200 render → `cleanup()` cycles; extra `heapSlopeKBPerMount` is
  the least-squares slope of heap-after-GC sampled every 20 cycles (≈0 when nothing leaks).

DOM micro workloads, ported from `~/gh/dom-bench` and `~/gh/vibedom/bench/dom-bench`:
create 4,000 elements, build 1,000 attributed rows, 4×4 attribute revisions on 1,000 elements,
deep clone of 1,000 rows, `innerHTML` parse of 250 rows, warm selector queries, attribute
mutation + selector queries, 30-level capture/bubble propagation (10 dispatches),
MutationObserver streaming of 50 appends. Inline styles: `dom/inline-style-churn` rewrites 11
properties on 50 connected elements; `dom/inline-style-mount` writes 8 properties one at a time
on 500 new elements, as React's mount does; `dom/inline-style-shorthand-mount` does the same with
Base UI's visually hidden input style, whose border, padding and margin shorthands expand into
21 longhands; `dom/inline-style-positions` writes left/top/width values not written before, as a
positioning library with layout or an animation does.

Leak workload: `dom/window-churn` creates a window from a 250-row form document, queries,
focuses, adds a listener and closes it, 10 times per iteration (what a reused test worker does
per file); extra `heapSlopeKBPerWindow` is the least-squares slope of heap-after-GC per closed
window (≈0 when `close()` releases everything). Retention itself is asserted by the leak suite
(`tests/compat/test/leaks`, `pnpm vitest run --project compat:leaks`).

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
- **A test runner's console.** The worker deletes `console.createTask` and `console.timeStamp`
  before anything loads: Vitest and Jest give tests a `new Console()` without them, and React's
  development build does extra work per element when it finds them ("React's development build
  and V8" below).
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
- `ctrl-dom`: `environment: 'ctrl-dom'` (@ctrl/dom/vitest-environment), stock testing-library;
- `ctrl-dom-full`: `ctrl-dom` plus `resolve.alias` of `@testing-library/{react,dom,user-event}` and
  `@testing-library/jest-dom/vitest` to the `@ctrl/dom` drop-ins, with the same test files.

It reports **wall time** of the whole `vitest run` (what users feel), Vitest's own per-file
diagnostics summed over files (`environmentSetupDuration`, setup files, collect/import, test
duration: CPU time across workers, not wall), and per-file worker RSS/heap recorded by the
setup file. Only runs where every file passed are timed.

## Worker startup: where a fresh Vitest worker's time goes

Vitest's default pool forks a fresh worker per test file, so everything below is paid once per
file. Measured 2026-10-23 at e68c6fc (Apple M4 Max, Node 26.12.1, shared machine: medians of
fresh, interleaved processes; profiles aggregated over 100 workers of comparison/'s suite with
`COMPARE_EXEC_ARGV="--cpu-prof ..."`).

These are the published bundles. The downstream suites (`downstream/*`) load @ctrl/dom from its
TypeScript sources instead, which costs ~150 ms more per file (Node strips the DOM's types in
every worker) and in `ctrl-dom-full` ~90 ms more (Vite transforms our Testing Library's
sources). Their per-file costs, and full vs ctrl-dom comparisons on suites of many short files,
are not what users get (downstream/tanstack-query/HARNESS.md).

Our environment's `setup()` is ~22 ms per file with @ctrl/dom's Testing Library (the compile
cache on) and ~32 ms with stock Testing Library (off). It splits into:

| step | ms | notes |
| --- | ---: | --- |
| import `@ctrl/dom` (1.4 MB bundle) | 8.7 cached / 19 uncached | ~10 ms of the uncached import is V8 compiling the bundle; evaluation ~4 ms (class creation, prototype mixins; nothing large left to defer) |
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

Two more things tie it in place. Our `FormData` gets undici's class from the original read here:
without that read, ours would have to be a standalone class, which `fetch` and `Request` do not
send as multipart (React Router hands FormData straight to `new Request()` for multipart
submissions; its default urlencoded path converts it to `URLSearchParams` first). And Vitest's
own jsdom environment (4 and 5) reads Node's `FormData` and `Request` during setup for its fetch
compatibility layer, so jsdom users pay the same load. Who touches these APIs, from a static scan
of the downstream checkouts' test files (2026-10-26): `fetch`, `Request`, `Response`, WebSocket
and EventSource appear in none of Base UI's, Radix's or React Aria's and in 1 of Sentry's 2,493;
FormData in a handful of form tests per suite; React Router's in 74 of 243, and its data routers
build `Request`s internally.

**The rest of a full-mode test file.** Measured 2026-10-26 at 92076ba with `release/ctrl-dom`
installed next to React 19.3.1: one fresh process per sample, medians of 11, from a scratch
script rather than a bench workload.

| step | ms, warm compile cache | ms, no cache |
| --- | ---: | ---: |
| environment `setup()`: DOM import + window, undici included | 20.0 | 29.9 |
| `react` + `react-dom/client` | 11.4 | 16.2 |
| `@ctrl/dom/react` (with testing-library and aria) | 4.7 | 6.0 |
| `@ctrl/dom/user-event` | 0.9 | 1.6 |
| `@ctrl/dom/jest-dom/matchers` | 1.3 | 1.7 |
| first `render()` + `getByRole` (mostly react-dom compiling on first call) | 6.1 | 6.4 |
| total | 45 | 63 |

About 30 ms of the warm total is ours, ~9 ms of it undici; no other step of ours is above
~5 ms. The DOM's bundle is 854 KB minified, and its top-level evaluation is still ~3–4 ms of the
import.

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
100 profiles: Node's module loader (resolution + compilation) ~31 ms, @ctrl/dom ~17 ms (import and
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
  worker loads before the environment. Vitest 5 writes the cache before stopping each worker
  (`module.flushCompileCache()`). Vitest 4 stops forks with SIGTERM, so Node never writes it and
  every worker misses on every module: on TanStack Query's suite (Vitest 4, published bundles)
  full mode took 3.54 s with the preload and 3.17 s without. Not worked around: the peer range
  is vitest >=5.
- **`--min-semi-space-size=16`.** A worker lives for one file and most of what it allocates while
  loading modules and rendering dies young; starting the young generation at 16 MB instead of
  growing it from 1 MB skips most scavenges. Only for forked pools (`forks`, `vmForks`): worker
  threads reject V8 flags in `execArgv`.

### Warm workers (`ctrlDom()`)

Everything above is CPU a worker spends before its file's first test, and with `isolate: true`
the file waits for it: Vitest's Pool forks a worker when a file is scheduled
(`ForksPoolWorker.start()`). The plugin forks the next workers ahead of time
(packages/vitest-environment/src/warm-forks.ts: `start()` is handed a spare forked from the same
entry point, flags and environment variables), each still used for one file, with a preload
(src/prewarm.ts) that loads the DOM and undici while the spare waits. The boot then overlaps the
previous file's tests on cores Vitest leaves idle. comparison/'s suite, whole stack, medians of 7
interleaved runs, pinned to the cores listed (i5-12600K, Node 26.13.1):

| workers / cores | without | with | CPU without → with |
| --- | ---: | ---: | ---: |
| 4 / 12 | 4.22 s | 2.94 s | 20.9 → 23.3 s |
| 8 / 16 | 3.10 s | 2.51 s | 25.7 → 26.0 s |
| 15 / 16 (Vitest's default for `vitest run`) | 2.55 s | 2.42 s | 29.8 → 28.0 s |
| 1 file | 0.94 s | 0.90 s | 1.25 → 1.27 s |

Total CPU is the same work done earlier, so a saturated machine gains nothing; the number of
spares is capped at the cores without a worker (at most 4, and never more than files remain), so
they do not compete with tests either. `--pool threads` on the same suite: 3.78 s at 4 workers,
without the process isolation. What it does not change: `spawn` blocks Vitest's main thread for
~5.5 ms per fork on Linux (551 ms over 100 files in a main-process profile), spare or not.

Things measured on the way and not shipped: V8 flags in workers (`--single-threaded-gc`,
`--max-lazy`, `--no-opt`, `--v8-pool-size=1`, `--max-semi-space-size=32`: within noise at 4 and
15 workers); Node's compile cache for Vitest's main process (`NODE_COMPILE_CACHE`: ~5% of a
one-file run, and a plugin loads after the modules it would cache). Note for measuring here: on
this machine's `powersave` governor the first batch of workers of every run takes twice the CPU
time of later ones (cold cores), and `--cpu-prof` makes V8 reject the compile cache.

The plugin adds only the compile-cache preload (with its Testing Library; it stays off for stock
Testing Library, see `compileCache`), in `configureVitest`, where the resolved pool is known.
The young generation flag is not shipped: −6% worker CPU did not show up as wall time on these
runs, and +13 MB RSS per worker (+11%) works against the memory half of priority 1. Pass
`--min-semi-space-size=16` in your own `execArgv` if CPU matters more than memory for you.
comparison/'s `ctrl-dom-stack` contender mirrors the plugin (`workerExecArgv` from
packages/vitest-environment/src/plugin.ts).

## Where real suites spend their time

Check a subsystem's share in a downstream profile before optimizing it: bench/ workloads
exaggerate the DOM's part.

**Base UI, `interactions` preset, ctrl-dom-full** (2026-10-26 at 92076ba).
`CTRL_DOM_DOWNSTREAM_PROFILE=<dir> node downstream/base-ui/run.ts --preset interactions --modes
ctrl-dom-full --workers 4` writes one `.cpuprofile` per worker (Vitest kills its workers before
`--cpu-prof` would write). Self time over 153 workers, 72.5 s of non-idle CPU:

| where | share |
| --- | ---: |
| Node internals (module loading; includes stripping our TypeScript sources, which only the harness pays) | 23.1% |
| Vitest | 14.1% |
| Base UI's own source | 14.1% |
| native (V8 builtins, bindings) | 13.4% |
| react-dom | 11.9% |
| @ctrl/dom's DOM | 7.3% |
| react | 4.4% |
| vite (module runner) | 2.9% |
| GC | 2.1% |
| @ctrl/dom/user-event | 1.4% |
| @ctrl/dom/testing-library | 0.8% |
| @ctrl/dom/react, aria, jest-dom and the environment | 0.8% |

Ours is ~10% and flat: the top function, `addEventListener` (React adds 142 listeners to every
root container), is 0.2%. The largest clusters are inline-style writes at ~0.5 s (re-serializing
the style attribute: `_changed` in css/CSSStyleDeclaration.ts), event dispatch at ~0.45 s, the
virtual clock at ~0.15 s, and per-file window setup with CSS accessor installation at ~0.3 s.
Since 2026-10-28 a style write that only adds declarations, as React's mount does, appends to the
previous serialization (`dom/inline-style-mount` 1.18 → 0.80 ms), shorthands included, and
expanded shorthand values are cached (`dom/inline-style-shorthand-mount` 3.0 → 1.5 ms), and a
value changed in place outside every shorthand family is spliced into it
(`dom/inline-style-churn` 1.69 → 0.96 ms). A value the normalization memo has not seen (every
value, in a fresh worker) skips the tokenizer when it is one canonical number, dimension,
percentage or keyword (`dom/inline-style-positions` 1.30 → 0.91 ms); checked before the memo, that
check cost more than the hits it replaced. In the `interactions` preset's profiles (153 files),
React's style writes took 685 ms after the append change and 406 ms after the shorthand one.

The UA rule index (`uaRuleIndex` in css/cascade.ts) is built on the first full cascade in each
worker, so once per test file. Parsing the UA sheet through the CSS parser made that ~2 ms per
file (315 ms over the `interactions` preset's 153 files), mostly compiling the tokenizer, parser
and value normalizer on their first call. It now splits the sheet's text directly (its values are
written normalized; a test checks both against the parser): 135 ms, the rest being the first
selector compiles and the cascade's own cold start. A fresh process that writes inline styles and
then reads `display`, `overflow` and `visibility` from `getComputedStyle` went from 3.9 to 2.4 ms.

Two other views of the same profiles. Grouped by where outside code called into us (the innermost
frame in packages/ whose caller is not), the costliest entry points are React's inline style
writes (762 ms), floating-ui's `getComputedStyle(el).overflow`-style reads (507 ms), Testing
Library queries (408 ms), user-event's `pointer` (405 ms, its own work and our dispatch), the
first `element.style` per worker (244 ms, ~196 ms of it the per-file accessor installation) and
`userEvent.setup()` (207 ms). Native and Node time charged to the nearest caller of ours: undici
in `installGlobals` (1.9 s, deliberate, see "Worker startup"), importing the DOM from TypeScript
sources (0.5 s, a harness cost), the clock's `now()` (289 ms: call volume from React's scheduler;
the bound `performance.now()` it uses is already the fastest monotonic source on Node 26, 20 ns
against 24–27 ns for `hrtime` or `Date.now()`) and `armHost`'s host timer re-arming (130 ms).

Looked at and dropped (2026-10-26): caching `CSS.supports` (Base UI calls it once per file, at
module load: the 68 ms is a cold first call), caching parsed selectors (already cached by string;
what shows is the first parse in each fresh worker), serializing the style attribute lazily
(attribute records are read directly in ~20 files), and hiding `console.createTask` (React 19's
development build creates a task per element: renders are 19% faster without it in plain Node,
but Vitest's and Jest's consoles are `new Console()` instances, which lack it, so test runs
already skip it; only `node:test` and Bun through `@ctrl/dom/register` see Node's global console).
React Hook Form's and React Router's Jest suites (2026-10-26, one worker) profile like the rest:
ours ~8% and ~5%, flat; React Router's own tests construct jsdom windows, which shows up as
`jsdom` (1.6 s) and as `defineProperties` in our guard (below). The clock costs 0.36 µs for Vitest's deadline
pattern (`setTimeout`, `unref()`, `clearTimeout`) against Node's 0.054 µs, and 27 µs per skipped
`setTimeout(0)` hop against 1.16 ms of real waiting. Nearly all of a hop is the two event loop
turns the driver waits before skipping (an empty turn is ~12.6 µs here). The idle probe it runs on
each turn (`busy()`) was the clock's largest self time in Base UI's profiles, ~110 ms over the 153
files; since 2026-10-28 it no longer tallies resource types into a Map: 0.31 → 0.18 µs warm and
0.83 → 0.34 µs over a fresh process's first 2,000 probes, ~0.16 µs of it
`process.getActiveResourcesInfo()` itself. Hops did not get measurably faster: the turns bound them.

**React Aria (Jest), all, ctrl-dom-full, one worker** (2026-10-26; `NODE_OPTIONS=--cpu-prof`
with `--workers 1`). 34.1 s of CPU: React Aria's own source 24%, native 20%, react-dom 16%, ours
~11%. 1.4 s of ours is the `defineProperty` trap below; without it ~6.5%, spread like Base UI's.
The environment cost ~1.5 ms per test file, ~1 ms of it deleting and restoring the 44 members
jsdom-26 hides; 8df07dc removed that churn. Peak RSS on one worker: 1,503 MiB against jsdom's
1,990 MiB (a CPU profile inflates ours to 3.1 GB).

**Sentry, three of its slowest spec files, ctrl-dom-full** (2026-10-26, after the CSS survivors
cache). Jest leaves one profile with `NODE_OPTIONS=--cpu-prof node downstream/sentry/run.ts
--files ... --workers 1`; 15.7 s sampled. react-dom ~15%, Jest's resolver and file reads ~13%,
emotion ~8%, GC ~5%, @ctrl/dom's own self time ~3%. The whole CSS cascade was ~40 ms (0.2%) and
Testing Library queries ~20 ms. Two traps: `defineProperty` in window/isolation.ts (~1 s self) is
React's dev-mode work charged to our guard wrapper, and the native `now` (~250 ms) is the host
`performance.now()` that React's scheduler reads through our virtual clock.

**Sentry's CSS-in-JS** (2026-10-28, `smoke` preset: 15 component-heavy files, ctrl-dom-full, one
worker, 19.5 s sampled). Emotion's own code (serializing and hashing styles, stylis) is 10% of
CPU. The DOM work it causes is small: Jest loads emotion's non-development build, which runs in
speedy mode, so every rule goes through `insertRule` (45 ms, 0.23%). React's inline style
writes into the DOM are ~38 ms (0.19%), and upstream replaces `getComputedStyle` with
`el.style`, so the cascade runs only for visibility checks. Our self time is 16%, 6 points of it
the `defineProperty` trap above.

**Sentry's rule index** (2026-10-28, `perf` preset: 39 files, ctrl-dom-full). Between two emotion
inserts something often asks the cascade a question (`focus()` checking that the element is
rendered, Testing Library's visibility checks), and the first question after an insert rebuilt the
author rule index from every rule: `ruleIndexFor` took 104 ms of one worker's profile. It now
indexes only the new rules when sheets only had rules appended, or new sheets came after the
others (`extendIndex` in css/cascade.ts). Emotion's speedy mode does the first, with one sheet per
cache; its development mode does the second, with a `<style>` per rule. Over the preset, 183
questions extended the index and 26 rebuilt it (a sheet removed, or one inserted before others).
`ruleIndexFor` fell to 60 ms, most of it compiling each new rule's selectors, which happens once
either way. A scratch loop inserting 2,000 rules and reading a computed style after every second
insert: two caches alternating 64.1 → 11.5 µs per insert (RSS 188 → 146 MB), a `<style>` per rule
75.3 → 19.5 µs, one sheet 11.5 µs before and after.

**Sentry, where it stands** (2026-11-09 at 0f009cd, `perf` preset, ctrl-dom-full; one worker with
`NODE_OPTIONS=--cpu-prof`, 35.8 s sampled, and the same on jsdom, 45.2 s). Nothing of ours is left
to take out of this suite:

| where | ours | jsdom |
| --- | ---: | ---: |
| react-dom | 6.7 s | 7.1 s |
| react, with its `defineProperty` calls (charged to our guard on our stack) | 4.5 s | 4.5 s |
| Sentry's own source | 4.7 s | 4.8 s |
| emotion | 4.1 s | 4.2 s |
| Jest | 3.0 s | 3.1 s |
| GC | 2.1 s | 2.6 s |
| other dependencies | 4.4 s | 13.3 s (jsdom among them) |
| @ctrl/dom, testing-library, user-event, aria, react (without the guard) | 2.0 s | |

React, Sentry, emotion and Jest do the same work on both, so we cause none of it; 0.75 s of the
run is idle. Our 2.0 s (5.6%) is flat: after the guard the top function is the virtual `Date`
constructor at 0.5%, which costs what the native one does (30 ns; app code and moment construct
that many). The guard itself adds 5% to a `defineProperty` call (645 against 616 ns for the four
React makes per element): ~130 ms of its 2.65 s. React reads `performance.now()` 25 million times
(0.6 s, and 382 MB of boxed numbers). Allocation, sampled the same way: 23.6 GB over the run, 6.8%
ours, most of that the property storage React's `defineProperty` calls allocate under the guard.
The day's changes (container reuse, control state, turnless yields and the rest) moved the preset
63.5 → 61.7 s of CPU and ~12.4 → 11.9 s of wall time at four workers, three interleaved runs.

The `smoke` preset's wall time (13.8 s) is one file, `searchQueryBuilder/index.spec.tsx` at
12.5 s: react-dom 22%, react-aria and other dependencies 15%, ours 7% without the guard. Its one
entry of ours above 0.5% is `addEventListener` at 1.1%, all from one effect: Sentry's
`useSelectOnDrag` adds a `mouseup` listener to the document and removes `mousedown`, so every
mount leaves one behind, and step 5 of add-an-event-listener scans the document's growing list
for a duplicate on each add (jsdom scans it too).

**Labels** (2026-11-02). `element.labels` (which dom-accessibility-api reads for every candidate
of a stock `*ByRole` with `name`) walked the whole tree once per document version, and aria's
`labelsOf` rebuilt a whole-tree label index per version, even for a `<button>` with no ID. A
control's labels (`labelsFor` in html/forms/form-associated.ts, which aria's `labelsOf` now calls)
are its ancestor labels without `for` plus the document's connected labels with `for` equal to its
ID (`Document[$forLabels]`, kept by HTMLLabelElement's connected, disconnected and attribute change
steps); only a detached control with an ID still walks. In a
3,800-element document with a mutation before each read: `labels` 31 → 0.09 µs, stock
`getAllByRole('radio', { name })` 9.0 → 0.74 ms, ours 228 → 164 µs; unmutated repeats unchanged.
Inserting and removing a label costs ~60 ns more (8% on a 200-control churn loop). Base UI's whole
suite (ctrl-dom-full) asks for 1,781 label lists, half of them ID-less, so its wall time does not
move; the win is for large forms queried by name.

**Forms** (2026-11-02). A scaling probe (each API after a mutation, 1k vs 10k unrelated elements)
found two more whole-document walks. Dispatch reads `_hasActivationBehavior` on every click's
path; a `<form>` lacked it, so the read became a named property lookup through the form's
controls plus an uncached walk for `<img>` names. Element now defines it as false. And a form's
controls (`elements`, named access, FormData, constraint validation, submission, radio groups of
the form) were found by walking the whole tree per document version; outside its subtree only a
`form` attribute naming the form's ID or the parser's form element pointer can associate an
element, so an ID-less form walks only itself (`formOwnerScope` in html/forms/form-associated.ts).
At 10k elements with an ID-less form: `form.elements` 129 → 1.5 µs, `checkValidity()` 378 → 3.6
µs, a submit click 384 → 5.3 µs, radio checks and `validity` 111 → 0.2 µs, `userEvent.click` 458 →
63 µs, `userEvent.type` 322 → 88 µs. Still walking: forms with an ID, and `userEvent.tab` (needs
every focusable element).

Radio groups no longer walk at all for connected radios: `Document[$radios]` lists the connected
radios with a name, by name (the input's connected, disconnected and `name`/`type` change steps
keep it), and a group is that list filtered by form owner and tree. Insertion keeps the spec's
order (every node's insertion steps see the whole inserted subtree, so the first checked radio in
tree order wins) through `connectingRoot()` in nodes/tree.ts; radio-groups.test.ts checks that
against jsdom. Radios outside any form at 10k elements: inserting a checked one 113 → 0.47 µs,
checking one 110 → 0.14 µs, `validity` 115 → 0.17 µs. Inserting and removing a radio costs ~100
ns more (15% on a 100-radio churn loop).

**Quadratic loops** (2026-11-02). A second probe times loops that should be linear at n = 1k and
10k items and flags growth in the per-item cost. Live collections were stamped with
`Document._version`, which any attribute or form state change bumps, so mutating each member while
iterating `children`, `getElementsByTagName`, `select.options` or `table.rows` rebuilt the
collection on every step. Collections whose members depend only on the tree and tag names are now
`structural`, stamped with `Document[$treeVersion]` (bumped only by nodes/tree.ts): adding a class
to each of 10k children 43.9 → 0.19 µs per item, toggling `selected` on each of 10k options 97 →
0.13 µs. And `[id="x"]`, which stock Testing Library's `getByLabelText` runs per element with
`aria-labelledby`, now uses the id index like `#x` (case-sensitive in every mode): 72 → 1.4 µs per
element at 10k (what remains is compiling each distinct selector string). Left as they are: a
parent whose `childNodes` was read rebuilds the list on every non-tail removal (own index
properties, see collections/NodeList.ts), so removing 10k children from the front is quadratic;
checking each radio of one huge group visits the group each time; and adding attributes one by one
to one element copies its exact-size attribute array.

A second pass (same probe, more areas) found three more. Appending a child to a shadow host reran
assign slottables, which found each host child's slot by walking the shadow tree and checked each
old node with `includes` (O(n²) per insert): find slottables now looks the first slot per name up
once, a slot's list is extended or shortened in place when a host's last child is appended or an
assigned one removed (nodes/slots.ts), and appending 10k children went 1,455 → 0.45 µs each.
DOMTokenList re-parses the attribute on every `add()` and deduped pairwise; past 16 tokens it uses
a Set (an add to 1,000 classes 377 → 48 µs, now linear in the tokens it has to serialize). And
inherited `visibility` / `pointer-events` of an element without author styles climbed every
ancestor recursively, once per `*ByRole` candidate: in a document with no sheet and no inline style
it is now the initial value at once, otherwise a loop to the nearest styled ancestor (`getByRole`
in a 1,000-deep tree 6.1 → 0.09 µs per element). Not changed: `addEventListener`'s duplicate check
is a scan of that type's listeners (10k listeners of one type on one target: 9 µs per add), and
`.a ~ .b`, `:has()` and descendant selectors with no match rescan siblings, subtrees or ancestors
per candidate, as browsers' query paths also do.

**What React does to our objects** (2026-11-09). An allocation profile of the React workloads
(the inspector's sampling heap profiler with collected objects included, `bench/worker.ts` under
`ctrl-dom-full`) puts our DOM at 14% of what a mount allocates, react-dom at 47% and react at 19%.
Two of our largest entries were React's doing rather than ours:

- `createRoot` adds 142 event listeners to a container it has not listened on: 142 listener
  records on our side (9 KB, plus the slots array), 142 bound functions on React's, on every
  `render()`. A container `render()` created is now given to a later `render()` once `cleanup()`
  has removed it, when it is still what a new `<div>` would be (`reusableContainers` in
  packages/react/src/pure.ts), and React skips the registration: a warm render + unmount of a
  three-element tree 18.8 → 12.8 µs.
- react-dom's `trackValueOnNode` was the largest allocator of a form mount (15%). It defines an
  own `value`/`checked` accessor on every input and textarea, which sends the wrapper to V8's
  dictionary mode; with the element's state in 17 own fields that was 2,238 B per input against
  390 B untracked, and reads through the wrapper took 168 ns against 27 ns. The state is now one
  object (html/forms/control-state.ts): 1,245 B and 100 ns.

`react/mount-unmount-churn` (the 20-field form) with both, two equal-path worktrees, 7 pairs:
0.381 → 0.348 ms (ratios 0.89–0.94) and 0.345 → 0.290 MB allocated per mount. The other React
workloads did not move outside an A/A run's spread (they mount once per iteration, or do not call
`cleanup()`).

Still there: an element with one listener pays for a slots array as long as that event type's id
(React's non-delegated `invalid` listener on every input: ~600 B), and adding attributes one by
one copies the exact-size attribute array.

**Forms, per operation** (2026-11-09). A scratch probe timed each thing a form test does (user-event
calls, queries, matchers, form APIs) on a React form of 20 and 200 fields, warm, on the
environment's clock. The CPU profile of our code is flat there too; what stood out was not in it:

- **Event-loop turns.** An empty turn (`await new Promise(setImmediate)`) costs Node ~12.6 µs on
  this machine (macOS: libuv polls for I/O on every turn), with or without our clock. user-event
  yields between actions and at the end of a call, and Testing Library's asyncWrapper drains once
  more: two to four turns per call, which was half of a `user.click()` and nearly all of a
  `user.clear()`. Those yields now go through `loopTurn` (window/clock.ts): after a full
  microtask drain, with no event-loop turn when the loop is idle (no immediate but the clock's
  own, no I/O beyond the baseline, no timer due), and a real turn at least every 1 ms. On the
  20-field form: `user.clear` 33.6 → 7.8 µs, `user.click` on a checkbox 77 → 27 µs, on the submit
  button 82 → 32 µs, `user.type` of one character 159 → 95 µs, `user.selectOptions` 155 → 93 µs,
  `user.tab` 105 → 68 µs.
- **`toHaveFormValues`** ran upstream's `querySelectorAll('[name="…"]')` once per form control:
  23 µs at 20 fields, 1.4 ms at 200, 33 ms at 1,000. One walk grouping by name: 16 µs, 76 µs,
  0.36 ms.
- **user-event's `isDisabled`** runs for every event target and climbed to the root on the
  wrappers (`parentElement`, `tagName`, `hasAttribute` per ancestor, through a `<form>`'s Proxy).
  On the node records instead: `user.type` of one character 85 → 69 µs, `user.tab` 73 → 53 µs,
  `user.click` on a checkbox 25 → 21 µs.
- Not ours: `fireEvent.change` on one field grows with the form (38 → 84 µs) because React walks
  the form's fibers, reading `performance.now()` about three times per fiber in development (14%
  of that workload is the native clock read behind our virtual one).

- **What a mounted input weighs.** Heap per element of 5,000 mounted by React (development
  build, its fibers included): a `<span>` 1,677 B, an `<input>` 4,082 B. Of the difference, 513 B
  was the listener array for the `invalid` listener React adds to every input, select and
  textarea (indexed by event type id, with V8's growth slack: now `[id, head]` pairs for a target
  with few types), and 384 B the wrapper's property dictionary being 32 entries for 12 own
  properties (four of them rarely used state, now added on first use: 16 entries for 8). An
  input is 3,226 B, a textarea 3,957 → 3,100 B, a select 2,597 → 2,090 B. The rest is React's
  value tracker and the dictionary itself, which React's own accessor forces.
- `getByLabelText` matched `aria-label` in a second walk and checked every element for being
  labelable before looking it up among the labeled controls: one walk, 40 → 36 µs at 200 fields.

Still there: `getByLabelText` builds the tree's label map and every label's text per call (6.4 µs
at 20 fields, 36 µs at 200, against 2.5 and 16 µs for `getByRole` with a name);
`form.elements.namedItem` scans the
controls; `user.tab` needs every focusable element; and a `<form>` is a Proxy, whose `get` trap
is still ~1% of the user-event calls' CPU. With the three changes above the profile of those
calls is flat again: `dispatch` leads at 3%.

**Forms, worst cases** (2026-11-09). A second scratch probe went after the bad shapes: a form whose
every field re-renders on each keystroke (state in the root; with validation of the whole form
and an error element per field; with an inline style object per field), 20 against 200 fields;
one input or textarea typed to 500 characters, pasted 10,000 and edited while holding 10,000; a
select of 1,000 options; a group of 500 radios; 500 controlled checkboxes toggled at once; and a
five-control form inside a page of 10,000 other nodes, with and without an ID on the form.
Nothing grew faster than its size, and long values cost nothing extra (33 µs per character at 20
and at 500). In the re-render-everything cases React is 65–70% of the CPU and we are 8–12%: a
keystroke in the 200-field form is 1.8 ms, nearly all of it React rendering 200 fields. What was
ours:

- **A radio's `name`, on every update.** react-dom's `updateInput` sets a radio's `name` to "" and
  back around each update, so the radio leaves and rejoins the document's radio index
  (`Document[$radios]`), an array per name: each removal spliced it, 250,000 element moves to
  re-render a group of 500 (8% of a click's CPU there, 21% → 16% ours). The indexes are sets now.
- **React's radio query, on the whole document.** The same update runs
  `document.querySelectorAll('input[name="…"][type="radio"]')`. In the 10,000-node page that walk
  was 32% of the CPU of a click on a radio (159 µs in a 100-node page, 298 µs in that one). A
  document query whose subject names an element type now only looks at the document's elements of
  that type, a list stamped with the tree version (`elementsOfType` in selectors/index.ts), so
  attribute and state changes keep it: 183 µs.
- **A form with an ID**, which is most forms, was looked for across its whole tree at every
  document version, since a `form` attribute anywhere can name it. A document remembers whether
  any element of it has had one (`Document[$formAttrSeen]`); until then the form's own subtree is
  enough. In the 10,000-node page, after a mutation: `form.elements` 119 → 1.7 µs,
  `checkValidity()` 113 → 3.2 µs, `new FormData(form)` 115 → 2.7 µs. Awaiting a form
  (`await screen.findByRole("form")`) paid the same walk, because resolving a promise reads
  `then`, which on a form is a named-property lookup through its controls: 116 → 0.8 µs.

Left alone: validating a 200-field form on every keystroke is 200 fields' worth of attribute
reads (12% ours); a 1,000-option select re-rendered by React sets `selected` on each option.

**React's development build and V8** (2026-11-21, React 19.3.1, Node 26.13.1). A V8 inline-cache
log of a React workload (`node --expose-gc --log-ic --log-deopt --logfile=<file>
--no-logfile-per-isolate bench/worker.ts <workload> ctrl-dom-full`: an IC line with states `N,N`
is a megamorphic load that missed V8's stub cache and went to the runtime; its `pc` resolves to a
function through the `code-creation` lines) found no deopt loop and no megamorphic miss of ours in
steady state, but 749,392 misses in 160 iterations of `react/fill-10-submit`, 684,300 of them
inside react-dom and 53,000 inside our DOM and user-event. They have one cause, and it is React's:

- **The `key` warning getter.** `defineKeyPropWarningGetter` (react.development.js and both JSX
  runtimes) defines a `key` getter on the props of every element that has a key, a new closure
  each time. V8 keeps one accessor pair per map transition, so the second props object of a shape
  goes to dictionary mode ("TransitionToDifferentAccessor"), and `Object.freeze` on a
  dictionary-mode object copies its map ("SlowCopyForPreventExtensions"). Every keyed props
  object ends up with a map of its own (`%HasFastProperties` false, `%HaveSameMap` false; 99,200
  maps in that run), so each read of one in react-dom (`children`, `ref`, `is`,
  `dangerouslySetInnerHTML`, `contentEditable`, `hasOwnProperty`) misses, and those maps push
  everyone else's entries out of the stub cache: our 53,000 were `event.type`, `init.bubbles`,
  `target.dispatchEvent` and the like. `installGlobals` now wraps the realm's
  `Object.defineProperty` to give them all one getter (window/shared-accessors.ts: it finds
  React's own getter by the props object in a WeakMap and calls it, so the warning is unchanged;
  it has to be there before the first keyed element, or that shape's transition is taken), which
  leaves 11,018 misses, all at startup. In plain Node a keyed element costs 1,044 ns to create
  and read six props of, against 508 ns unkeyed; 760 ns with the shared getter. In a Vitest run,
  40 `fireEvent.change` on a keyed 60-field form: 21.7 → 19.4 ms.
- **React's value tracker** (see "What React does to our objects") is shared the same way: one
  accessor pair for every input and textarea, defined with React's own attributes (defining it
  enumerable at once normalizes on React's second call), React's closures kept in the element's
  `ControlState`. A React-mounted element with its fibers, 5,000 of each: `<input>` 3,039 →
  2,445 B, `<textarea>` 2,788 → 2,172 B, a checkbox 2,838 → 2,155 B, and a keyed `<span>` 1,896 →
  1,699 B from the getter above.
- **Both together**, toggled in one tree, 7 pairs, no `console.createTask` (as under a runner):
  `react/keyed-list-1000` 5.03 → 3.94 ms, `tab-radio-groups` 0.421 → 0.348, `select-project`
  1.15 → 0.99, `form-100-rerender` 5.85 → 5.29, `form-10-getByRole` 0.444 → 0.397,
  `fill-10-submit` 8.70 → 8.10, `mount-unmount-churn` 0.303 → 0.282, `form-20-rerender` 1.40 →
  1.32, `type-search-filter` 0.817 → 0.767; `pointer-release`, `edit-labelled-fields` and
  `validate-named-fields` unchanged. Sentry's `perf` preset did not move (three interleaved
  pairs, ctrl-dom-full: 62.5 and 62.0 s of CPU, 12.3 → 12.0 s, inside the spread between runs;
  665 passed both ways): 141,571 of its 23.0 million `Object.defineProperty` calls define a key
  getter. Base UI's `interactions` preset did not move either (three pairs, 118.8 and 119.0 s of
  CPU). The win is for tests that re-render keyed lists and forms.
- **Owner stacks look large here and are not.** `createElement`/`jsxDEV` capture
  `Error("react-stack-top-frame")` per element: 1.2 µs of an unkeyed element's 1.7 µs. React
  limits itself to 10,000 a second (`recentlyCreatedOwnerStacks`, reset in `prepareFreshStack`
  once 1 s of `performance.now()` has passed), so the cost is at most 12 ms per second of a
  worker. A bench sample is a short process (`form-20-rerender` creates 5,168 elements, all of
  them captured; `keyed-list-1000` 100,150, 10% captured), which is why skipping them takes 6–29%
  off iteration times and nothing off a long file. Pinning the counter with an accessor also puts
  `ReactSharedInternals` in dictionary mode (+5–11% where the limit was already reached).
- **Plain Node is not what the runners see.** `console.createTask` and `console.timeStamp` exist
  only on Node's global console; Vitest's and Jest's `new Console()` have neither. With them
  React creates a task per element (9–13% of the React workloads' iteration times) and logs its
  performance tracks: `console.timeStamp` per component and `performance.measure`, whose detail
  Node structured-clones (1.2% of `fill-10-submit`) and keeps in the performance timeline.
  `installGlobals` now hides the two while no debugger is attached (window/devtools-console.ts),
  which is what `@ctrl/dom/register` under node:test and a runner with its console interception
  off get (register in plain Node, a 20-field form rendered and re-rendered three times: 0.38 →
  0.30 ms); bench/worker.ts deletes them for every configuration, so rows measured before
  2026-11-21 carry that extra React time and are not comparable with later ones.
- **What is left of an element** is five `Object.defineProperty` calls and two `Object.freeze`
  in `ReactElement`: 12.6% of `fill-10-submit` without the key getters and owner stacks, and the 23.0
  million calls of Sentry's `perf` preset (some 4.6 million elements). Native code, the same on
  jsdom, and nothing a DOM can take out.

**Real suites after those changes** (same day, at 336bb8f). Base UI's `interactions` preset,
ctrl-dom-full, a profile per worker (153 files, 68.6 s sampled): ours 11.1%, of which 1.3 points
are React's native `defineProperty` work, now charged to the wrapper in shared-accessors.ts
(`sharedAccessor` itself: 0.14%). Nothing else of ours is above 0.15% self. By entry point:
React's inline style writes 0.76%, computed style reads 0.54% (floating-ui's `isOverflowElement`
is 152 of those 368 ms), the environment's `setup` 0.65%, Testing Library queries 0.52%, and the
first `element.style` of each file 0.37%: 1.4 ms a file, which every file that imports react-dom
pays, since it probes `document.createElement("div").style` for vendor prefixes when it loads
(`buildTable` 0.27 ms, defining the 1,700 accessors 0.7 ms, their names 0.26 ms). Property
metadata is now built per property on first use and the accessors defined with less ceremony:
from the bundle with a warm compile cache, that first `element.style` went 1.65 → 1.28 ms. What
is left is V8 defining 1,700 accessors on a dictionary (0.4 ms) and their 1,400 closures; a Proxy
at the end of the prototype chain could define them on demand, but every new index or field
store on a declaration would then reach its `set` trap. Sentry's
`perf` preset, one worker (37.9 s sampled): ours 12.6%, 7.6 points of it that same native
`defineProperty` work under the guard in isolation.ts; after it the virtual `Date` at 0.4% and
nothing else above 0.15%. React's five `defineProperty` calls and two `Object.freeze` cost 430 ns
an element in the main realm and the same in the `DONT_CONTEXTIFY` realm our Jest environment
makes (920 ns in a contextified one, which resolves every `Object` through the sandbox's
interceptors); our wrapper adds 22 ns an element, the guard 35.

**Outliers of ours, by workload** (same day; `--cpu-prof-interval 100`, two seconds or more of
steady state per workload). None of these was worth its change:

- `validate-named-fields`: `form.elements.namedItem` is 21% inclusive, a scan of the controls per
  lookup. An index stamped by `id` and `name` changes (Blink's NamedItemCache) does not survive
  React: `updateInput` sets an input's `name` to "" and back on every update, so the index was
  rebuilt on each keystroke (0.40 → 0.43 ms, twice the allocation).
- `select-project`: `settleFlatOptions` 6% self, a walk of the options for each option React
  appends: 65 µs for 250 options, under a microsecond for a select of twenty.
- `click-remove`: `compact` in traversal/live.ts 6% self. A removal at a node a range has touched
  walks every range registration, and a WeakRef is cleared only by a major GC (`removeChild`
  after 5,000 ranges were created and dropped: 150 µs). user-event registers two ranges per
  press on text and one per focus change, nothing per keystroke, and 1,200 `user.click` calls
  before the removals did not slow them: the bench row comes from thousands of iterations in
  one process.
- `tab-radio-groups`: `pruneRadioGroups` 13% self, `isDisabledImpl` 8% (a climb per radio, 400 of
  them); `edit-labelled-fields`: `buildLabelMap` 5%; `styled-form-rerender`: about 20% in the
  cascade, since a class or tree change still invalidates every record.

Looked at and dropped: user-event's two `Object.defineProperty` calls per event with a behavior
(0.45% of `fill-10-submit`), `replaceAll` for `normalizeNewlines` (27 against the regular
expression's 22 µs on 1,000 CRLF lines), defining the CSSStyleDeclaration accessors in one
`Object.create(proto, descriptors)` (3.1 against 1.5 ms), the keyed misses of `buildTable`
(0.06 ms per worker), and the megamorphic `[$impl]` loads on wrappers (the symbol is every
wrapper's first descriptor, so they never reach the runtime).

## CSS (2026-11-09)

A scratch probe timed what tests do with CSS at two sizes: parsing a style sheet, the first
cascade after it, `getComputedStyle` on 200 elements after a class change under 200 and 5,000
rules (class rules, Tailwind-like rules with `@media`, descendant/`:is`/`:not` rules), custom
properties, `getAllByRole` and `toBeVisible` under 1,000 rules, inline style writes and
`insertRule`. The cascade itself does not grow with the sheet (132 µs for 200 elements at 5,000
rules, as at 200), and `var()` with 2,000 custom properties on `:root` costs 1.7 µs an element.
Two things did stand out:

- **Parsing.** A sheet cost 2.1 µs per rule (5,000 class rules: 10.5 ms, per test file that loads
  it), two thirds of it the declarations: tokenizing each value, normalizing it, expanding
  shorthands, building the block. Most rules of a sheet match nothing a test renders, so a block
  that holds only declarations is now left as text until something asks for it (`flatBlockEnd` in
  css/parser.ts, `CSSStyleRule[$block]`; Blink puts the same work off): the rule's `style`,
  `cssText`, or the cascade when an element first matches it (`IndexedRule.owner`). 5,000 class
  rules: 10.5 → 3.8 ms; 5,000 Tailwind-like rules with `@media`: 23.2 → 14.6 ms; the first computed
  style after a new 5,000-rule sheet: 16.5 → 8.9 ms. What is left is the selectors.
- **Every mutation threw every computed style away.** Style records were stamped with the
  document version, which a text update or an `aria-expanded` flip bumps like anything else, so
  the next visibility check cascaded each element it looked at again. Text changing between two
  non-empty strings, and `aria-*` / `data-*` attributes no indexed selector mentions, now count
  as benign (css/style-deps.ts) and leave the records valid. After one such change, under 1,000
  rules: `getAllByRole("button")` over 500 rows 776 → 87 µs, `toBeVisible` on a button 100
  levels deep 104 → 21 µs; `dom/computed-style-mutation` 0.237 → 0.125 ms and 0.70 → 0.18 MB
  allocated (9 of 9 pairs). The check on attribute writes starts with the first cached style
  record: before that it cost `dom/attr-revisions` 24%.

Not changed: an attribute other than `aria-*`/`data-*`, any tree change and any form state change
still invalidate everything (they can feed selectors and pseudo-classes).

## Shared workers (`ctrlDom({ sharedWorkers: true })`)

Measured 2026-11-09. A suite of many short files spends most of its time starting workers ("Worker
startup" above), and Vitest's `isolate: false` skips that: the 100-file suite here takes 3.4 s of
Vitest's reported duration in the default pool, 0.95 s in vmForks and 0.28 s with `isolate: false`.
Alone it is not usable: stock Testing Library (and ours) registered its cleanup for the first file
of a worker only (29 of those 100 files fail, on every DOM), 31 of Base UI's tests fail on jsdom and
on us alike (files that `vi.mock` a module another file loaded first), and more fail from what a
file leaves in the document. The plugin's mode (packages/vitest-environment/src/shared-workers.ts)
adds a setup file that, before every test file, evaluates first-party modules again
(`vi.resetModules()`), resets the window (window/file-reset.ts) and registers the testing
library's hooks for the file. Base UI, `all`, ctrl-dom-full, default workers
(`CTRL_DOM_SHARED_WORKERS=1 node downstream/base-ui/run.ts`): 9,197 passed and 2 failed in
7.0–7.6 s, against 9,198 and 1 in 36.1 s isolated; the failures in both are the Popover focus tests
downstream/baseline.json lists as flaky. jsdom gets less from `isolate: false` (29.9 → 18.7 s on the
`interactions` preset, where ours went 17.0 → 4.7 s): its time is in running the tests.

What the setup file had to learn from that suite:

- Vitest runs a setup file again for each test file only when it evaluates the module itself. A
  setup file in node_modules is loaded by Node, once: the plugin marks its own as inlined.
- Timers a file leaves pending fire in the pause before the next file starts (at once, on the
  clock that skips idle time), so the window is reset when a file ends too, in an afterAll hook
  registered first (it runs last under Vitest's default hook order).
- React 19 hoists `<style precedence>` and the like to `<head>` and tracks them in a map on the
  document; both have to go, or a test that expects no style element finds the previous file's
  (Base UI's CSPProvider tests). @ctrl/dom/react does it in its `fileEnd` hook.
- Listeners on the window and document, and properties on them, stay. Removing the listeners a
  file added without also removing React's "already listening" markers left its portals deaf
  (4,125 failures); a dependency that adds its listeners once per module instance (React Aria)
  would be left the same way.

**Memory grows with every file, and it is Vitest's.** Heap after a forced GC, one worker, Base UI's
`interactions` preset (149 files): 163 MB after 10 files, 482 MB after 149, 2.3 MB per file. A heap
snapshot at the 31st file (retaining paths from the roots, through weak-map keys) leads from chai's
`used` array: `chai.use(fn)` keeps every plugin function it is given, Vitest's `createExpect(test)`
calls `expect.extend()` twice for each test's own `expect`, and each call hands chai a new closure
over that `expect`, which holds the test, whose function holds its file's module graph. 3,543
entries after 2,471 tests. Nothing we can reach holds them: the array is private to chai, and
Vitest 5 no longer exports the helpers that could clear a finished test's function
(`vitest/suite`). With `isolate: true` the worker ends with the file. Not reported upstream yet.

**The JSX runtime** (`jsxRuntime`, on by default). Vitest hands the code it transforms a Proxy over
an external CommonJS namespace (`shouldInterop` in its module evaluator: not `.mjs`, has a
`default`), so `jsxDEV(...)` for every element, and `React.useState` when React is imported as a
namespace, go through its `get` trap: 3.5% of the CPU in Base UI's shared-worker profile. With
`react/jsx-runtime` and `react/jsx-dev-runtime` resolved to ES modules that export the same
functions and no default, a hooks-heavy render (200 components, mount and rerender, warm median of
five fresh runs) goes 3.29 → 3.01 ms; doing the same for `react` itself gives 2.80 ms but makes the
namespace immutable (`vi.spyOn(React, "useState")` throws), so it is not done. The plugin's
resolution options are in the key of Vitest's on-disk module cache (`defineCacheKeyGenerator`): a
file transformed with one setting was otherwise reused with the other.

## Regression check (`compare.ts`)

`pnpm bench:compare --base <checkout> --head <checkout>` runs our configurations (`ctrl-dom-full` for React
rows, `ctrl-dom` for DOM rows, the bundles for startup) from two checkouts of the repository and
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
(minified; `--no-minify` for readable bundles; see `scripts/build.ts` for the CJS builds and declarations it also writes). Bare specifiers stay external, so `@ctrl/dom/react`'s bundle imports
`@ctrl/dom` rather than embedding a second DOM; packages with several entries
(`@ctrl/dom` + `@ctrl/dom/internal`) share chunks.

## Files

```
run.ts                 orchestrator (flags above), writes results/
worker.ts              one sample in a fresh process
lib/configs.ts         configurations: install DOM globals, load testing stack, matcher helper
lib/dist-hooks.ts      resolve @ctrl/dom to dist/ for *-dist configs
lib/dist-preload.js    the same, as an --import preload for Vitest workers (CTRL_DOM_DIST_MAP)
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
