# @ctrl/dom/vitest-environment

Vitest environment that installs an `@ctrl/dom` window as the test globals. The `ctrlDom()` plugin
loads it (Vitest has no way to find a scoped package by environment name, so there is no
separate environment package):

```ts
// vitest.config.ts
import { ctrlDom } from "@ctrl/dom/vitest";

export default defineConfig({
  plugins: [ctrlDom({ testingLibrary: false, url: "http://localhost:3000/" })],
});
```

With the plugin installed, a file can pick it with `// @vitest-environment ctrl-dom`. Peer
dependency: `vitest` >= 5.

The plugin's options (or `environmentOptions["ctrl-dom"]`) take `createWindow` options (`url`, `width`, `height`, ...),
`timeSkip` (below) and `compileCache` (enable Node's compile cache before importing the DOM: on
for this repository's tests and with the `ctrlDom()` plugin's Testing Library; off by default
because it then applies to every module the worker loads, and stock Testing Library's hundreds
of small files load slower from it). `compat` defaults to `"jsdom-30"`, what Vitest's jsdom environment exposes:
no `matchMedia` (suites written for jsdom mock it, and helpers such as mock-match-media only
install themselves when it is missing) and no `ResizeObserver`. `"modern"` exposes everything,
`"jsdom-26"` matches jest-environment-jsdom 30. See `docs/deviations.md`.

## Fastest setup: a VM pool

Vitest's default pool starts a fresh worker for every test file, and that spawn (~350 ms) is
most of what a small test file costs. With `pool: "vmThreads"` (or `"vmForks"`) workers stay up
and each file gets a fresh vm context instead. This environment's `setupVM` + teardown take
~1 ms per file (jsdom builds a whole new window, ~70 ms), and nothing
is retained between files (0.03 MB/file after GC over 100 files; happy-dom 5.4 MB/file). The
context is a plain (non-contextified) vm global, as in @ctrl/dom-jest-environment, so global lookups
in test and app code are ordinary property loads.

```ts
export default defineConfig({ plugins: [ctrlDom()], test: { pool: "vmThreads" } });
```

100 small React test files (`pnpm bench:suite --pool …`, full stack bundled):

| pool | jsdom | happy-dom | ctrl-dom (environment only) | ctrl-dom (full stack) |
| --- | ---: | ---: | ---: | ---: |
| default (forks, per-file isolation) | 11.7 s | 6.55 s | 5.94 s | 3.66 s |
| vmForks | 2.12 s | 1.67 s | 1.66 s | 1.24 s |
| vmThreads | 2.00 s | 1.44 s | 1.42 s | 1.00 s |

VM pools have Vitest's usual caveats (Node built-ins come from another realm, so
`instanceof` checks against them can fail); see https://vitest.dev/config/#vmthreads.

## Idle time skipping

Timers run on a virtual clock. Whenever the test is only waiting for a timer (no pending
immediates, no I/O), the clock jumps to it and `Date`/`performance.now()` advance with it, so
`findBy*`/`waitFor`, debounces, user-event delays and timeouts finish without spending wall
time, in the same order and with the same app-visible elapsed time. A `findBy` that never
matches fails after 1 s of virtual time instead of 1 s of real time. Set `environmentOptions["ctrl-dom"].timeSkip` to `false` (or
`CTRL_DOM_TIME_SKIP=0`) for real-time timers.

Part of [ctrl-dom](../../README.md). MIT licensed; third-party notices in [NOTICE](../../NOTICE).
