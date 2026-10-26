# Sentry downstream harness

How the runner works, every option and what it checks. How to run it and its latest results: [README.md](README.md).

Runs [getsentry/sentry](https://github.com/getsentry/sentry)'s real frontend **Jest** suite
(unmodified specs, upstream `tests/js/setup.ts` + `setupFramework.ts` + `getsentry-test/setup`,
upstream Jest 30.5.1 / SWC transform / workspace resolver / moduleNameMapper / patched
jest-runtime + jest-resolve) on our stack, and compares it with Sentry's own jsdom setup.
Prior art: `~/gh/vibedom/downstream/sentry` (the author's earlier Jest adapter).

## Run

```sh
pnpm build                                   # ctrl-dom-full / ctrl-dom-nohacks use packages/*/dist/*.cjs
pnpm downstream:sentry --preset perf --modes jsdom,ctrl-dom,ctrl-dom-full --workers 4 --repeat 2
                                             # fast A/B set (39 files, ~1 min/round): iterate on this,
                                             # run --preset all for checkpoints
pnpm downstream:sentry --install             # first time: clone the pinned commit + frozen install
pnpm downstream:sentry --preset smoke        # 15 component-heavy files, all four modes
pnpm downstream:sentry --preset components   # static/app/components/** (~650 files)
pnpm downstream:sentry --preset views        # 9 representative static/app/views/** areas (~250 files)
pnpm downstream:sentry --preset all          # every spec of upstream's root config (~2,300 files; long)
node downstream/sentry/run.ts --files static/app/components/core/tabs/tabs.spec.tsx --modes ctrl-dom-full --grep overflow
```

| option | purpose |
| --- | --- |
| `--preset smoke\|components\|views\|all`, `--files a,b` | selection (paths or directories, relative to the checkout) |
| `--modes jsdom,ctrl-dom,ctrl-dom-full,ctrl-dom-nohacks` | modes, in order (default all four; jsdom first is the baseline) |
| `--workers N` | Jest `--maxWorkers`, identical for every mode (default **6**, so runs from other agents sharing the machine do not skew comparisons) |
| `--repeat N` | run every mode N times, **interleaved** (jsdom, ctrl-dom, …, jsdom, …); timings are medians |
| `--gc` | `--expose-gc` and a forced full GC before each per-file memory sample (clean leak signal; adds GC time to every mode alike) |
| `--shard i/n` | Jest `--shard` (split `all` into sequential runs) |
| `--triage` | ctrl-dom modes get workarounds for already-filed blockers (`navigator.platform = ""`, writable `navigator.clipboard`) to see what is behind them; report labelled `-triage`, **not** a compatibility result |
| `--shims react,dom,user-event,jest-dom` | ctrl-dom-full: substitute only some Testing Library packages (bisecting) |
| `--grep`, `--label`, `--no-report`, `--install`, `--latest` | Jest `-t`; output/report name; skip markdown; frozen install; move to upstream master (reports flag it) |
| `--scratch DIR` | run ad-hoc `*.spec.tsx` experiments from DIR (resolved as if in `tests/js`); never used for results |

`CTRL_DOM_SENTRY_REPORTER=1` adds @ctrl/sentry-tests' Jest reporter and test runner (ctrl-dom modes),
sending to `SENTRY_DSN` / `SENTRY_SPOTLIGHT`; `packages/sentry-tests/scripts/relay-check.ts --run`
runs a preset through Relay this way ([its README](../../packages/sentry-tests/README.md#development)).

## What it does

1. **Mirror**: `checkout/` (gitignored) is a shallow clone of `manifest.json`'s pinned commit. The
   runner refuses to run when upstream tracked files are modified. Dependencies come from
   upstream's frozen lockfile with upstream's exact pnpm (`npx pnpm@12.10.1 install
   --frozen-lockfile --ignore-scripts`; no Python/backend/Docker).
2. **Wrap, don't edit**: `harness/jest.config.mjs` imports upstream's root `jest.config.mjs`
   (`createJestConfig()`) and changes only, per mode: `testEnvironment`, `moduleNameMapper`
   additions, `resolver` (a delegate to upstream's `jestWorkspaceResolver.cjs`), a first
   `setupFiles` entry (`stash.cjs`), a first `setupFilesAfterEnv` entry (`probe.cjs`), a per-mode
   `cacheDirectory`, and `dsn: false`. It runs through upstream's own CLI
   (`tests/js/bin/test.mjs`: `NODE_ENV=test`, `TZ=America/New_York`) with `CI=true --ci` (so
   upstream's CI-only owner-stack skip is active, as in their CI) under `/usr/bin/time -l`.
3. **Guards** (per test file, written to `output/<label>/<mode>/environments.jsonl`; the file
   fails if a guard fails): jsdom mode runs jsdom; ctrl-dom modes run one `@ctrl/dom` instance
   (the environment's window, the test registry's `require('@ctrl/dom')` and `globalThis.Node` are
   the same objects); ctrl-dom-full resolves every `@testing-library/*` to our bundles. `resolutions.jsonl`
   records how `react`/`react-dom`/`@testing-library/*` resolve; the report checks there is one
   React (our bundles' `require("react")` is redirected to Sentry's copy by `harness/resolver.cjs`).
4. **Measure**: wall time; total CPU (user+sys of Jest and its reaped workers, `time -l`); peak
   **tree** RSS (sum over Jest + workers, `ps` every 500 ms) and peak single-process RSS; per test
   file, from an identical measurement-only environment subclass in every mode
   (`harness/instrument.cjs` → `workers/<pid>.jsonl`): environment setup time (constructor +
   `setup()`), and the worker's RSS / heap after teardown, giving **memory growth per file per
   worker** (least-squares slope; `--gc` for post-GC heap).
5. **Report**: `results/<date>-<label>.md`, raw Jest JSON/logs/samples in `output/<label>/`
   (gitignored). Exit code is non-zero when a report or guard records are missing, more than one
   React was loaded, or the discovered test set differs from jsdom.

## Modes

| mode | environment | Testing Library | Sentry's jsdom hacks |
| --- | --- | --- | --- |
| `jsdom` | upstream `tests/js/sentry-test/jest-environment.cjs` (`@sentry/jest-environment/jsdom` → jsdom 30.1.1, `--retain-maps-for-n-gc=0`) | stock (lockfile) | active |
| `ctrl-dom` | `@ctrl/dom-jest-environment` (what its preset names) wrapped like upstream wraps jsdom: `@sentry/jest-environment`'s `createEnvironment({baseEnvironment})`, `wrapWithStructuredClone`, same V8 flag; preset `moduleNameMapper` for `@ctrl/dom(/internal)` | stock | active |
| `ctrl-dom-full` | as ctrl-dom | `@testing-library/react` (+`/pure`, `/dont-cleanup-after-each`), `/dom`, `/user-event`, `/jest-dom` (+`/matchers`, `/jest-globals`) → `packages/*/dist/*.cjs`; `@ctrl/dom/aria`, `@ctrl/dom/testing-library` → their dist | active |
| `ctrl-dom-nohacks` | as ctrl-dom | as ctrl-dom-full | **experiment**: `harness/nohacks.ts` runs after upstream setup and restores our `getComputedStyle`, real `@floating-ui/react-dom` (`jest.unmock`, verified), our `matchMedia` and `IntersectionObserver` |
| `ctrl-dom-direct` (opt-in) | **experiment**: ctrl-dom, but the vm context is created with `vm.constants.DONT_CONTEXTIFY` (as jsdom 30 does) instead of jest-environment-node's contextified GlobalProxy context | stock | active |

Only adapter bridge in ctrl-dom modes: `global.jsdom.reconfigure({url})` (Sentry's
`setWindowLocation()` calls jsdom's API through `@sentry/jest-environment`; see "Adapter gaps").

## Sentry's jsdom speed hacks and test infrastructure

| upstream (tests/js/setup.ts, jest-environment.cjs) | why upstream has it | on our stack |
| --- | --- | --- |
| `window.getComputedStyle = el => el.style` | "The full jsdom CSS cascade is too slow, especially for dropdown positioning" | see results: ctrl-dom-nohacks keeps our real cascade |
| `jest.mock('@floating-ui/react-dom')` (no geometry) | jsdom has no layout; skips Floating UI work + React updates | see results |
| `matchMedia` stub (`matches: false`) | jsdom has no matchMedia | unnecessary: @ctrl/dom implements it (desktop defaults) |
| `IntersectionObserver` class | jsdom has none | unnecessary: @ctrl/dom provides an inert one |
| `ResizeObserver = MockResizeObserver` | jsdom has none; tests drive it with `triggerResizeObservers()` | still needed as **test infrastructure** (ours never fires callbacks) |
| `SVGElement.prototype.getTotalLength ??=`, `HTMLElement.prototype.setPointerCapture ??=` | jsdom lacks them | `??=` no-ops when present |
| `setImmediate`/`structuredClone` fallbacks, `TextEncoder/Decoder` | jsdom env lacks them | unnecessary (Node globals are present in @ctrl/dom-jest-environment) |
| `crypto.subtle` from `node:crypto` | jsdom lacks subtle | still assigned by upstream; harmless |
| `--retain-maps-for-n-gc=0` | jsdom windows kept alive by optimized code (~30 MB/file/worker leak) | kept in ctrl-dom modes (any per-file vm context is affected) |
| React owner-stack skip (CI only) | ~7% of test CPU | engine-independent; active in every mode (`CI=true`) |
| lodash `debounce` / Pacer / framer-motion `skipAnimations` mocks | determinism + speed | engine-independent; kept |

## Adapter gaps (@ctrl/dom-jest-environment)

None open. `sentry-test/utils`' `setWindowLocation()` calls jsdom's `reconfigure({url})`, which
the environment provides as `environment.dom.reconfigure` (as jest-environment-jsdom's `dom`), and
work a test file leaves behind after teardown finds the globals still in place instead of crashing
the worker.

## Caveats

- Our packages change under the runner while other agents work; a report notes "our packages
  changed during the run" when `packages/*/{src,dist}` fingerprints differ before/after. Several
  runs on 2026-10-23 overlapped with uncommitted @ctrl/dom work, and some clusters seen only in
  such runs were transient.
- Wall time depends on the worker count and machine load: compare modes from one interleaved
  run with equal workers, and treat CPU as the steadier signal.
- `navigator.platform` follows the host OS on @ctrl/dom (see TRIAGE.md): results on macOS differ
  from results on Linux CI.

## Time and memory (2026-10-25, pinned `503ad2e4`, @ctrl/dom `6614e19`, 4 workers)

Time and memory (components: 653 files, 6,432 tests; 3 interleaved runs, medians; warm Jest
caches; nothing else running; CPU = user+sys of Jest and its workers;
[report](results/2026-10-25-components.md)):

| mode | wall | CPU | peak tree RSS |
| --- | --: | --: | --: |
| jsdom | 52.1 s | 229 s | 8.3 GiB |
| ctrl-dom | 33.8 s (−35%) | 202 s (−12%) | 7.6 GiB (−9%) |
| ctrl-dom-full | 31.4 s (−40%, 1.66x) | 191 s (−17%) | 6.7 GiB (−19%) |

Wall time drops more than CPU because the environments' virtual clock skips idle time: a test
waiting on a timer (a `findBy` timeout, a debounce) jumps ahead instead of sleeping. A mode's
first run after its Jest cache is cleared is ~10 s slower (transforms); the medians are warm runs.
Peak tree RSS is the noisiest column (ctrl-dom's three runs: 6.8, 7.6 and 8.4 GiB): it depends on
when the four workers happen to collect garbage. Per worker, the heap a forced GC leaves between
files is 145–165 MiB on ctrl-dom-full (perf preset, `--gc`); before @ctrl/dom stopped finished
files' realms from staying alive (`6614e19`) it was 230–280 MiB.

Earlier measurements (2026-10-23, before most performance work, on a shared machine) are in
`results/2026-10-23-*.md`. See `TRIAGE.md` for what still differs, with owners and repros.
