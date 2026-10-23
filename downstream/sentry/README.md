# Sentry downstream corpus

Runs [getsentry/sentry](https://github.com/getsentry/sentry)'s real frontend **Jest** suite
(unmodified specs, upstream `tests/js/setup.ts` + `setupFramework.ts` + `getsentry-test/setup`,
upstream Jest 30.5.1 / SWC transform / workspace resolver / moduleNameMapper / patched
jest-runtime + jest-resolve) on our stack, and compares it with Sentry's own jsdom setup.
Prior art: `~/gh/vibedom/downstream/sentry` (the author's earlier Jest adapter).

## Run

```sh
pnpm build                                   # rtd-full / rtd-nohacks use packages/*/dist/*.cjs
pnpm downstream:sentry --install             # first time: clone the pinned commit + frozen install
pnpm downstream:sentry --preset smoke        # 15 component-heavy files, all four modes
pnpm downstream:sentry --preset components   # static/app/components/** (~650 files)
pnpm downstream:sentry --preset views        # 9 representative static/app/views/** areas (~250 files)
pnpm downstream:sentry --preset all          # every spec of upstream's root config (~2,300 files; long)
node downstream/sentry/run.ts --files static/app/components/core/tabs/tabs.spec.tsx --modes rtd-full --grep overflow
```

| option | purpose |
| --- | --- |
| `--preset smoke\|components\|views\|all`, `--files a,b` | selection (paths or directories, relative to the checkout) |
| `--modes jsdom,rtd-dom,rtd-full,rtd-nohacks` | modes, in order (default all four; jsdom first is the baseline) |
| `--workers N` | Jest `--maxWorkers`, identical for every mode (default **6**, so runs from other agents sharing the machine do not skew comparisons) |
| `--repeat N` | run every mode N times, **interleaved** (jsdom, rtd-dom, …, jsdom, …); timings are medians |
| `--gc` | `--expose-gc` and a forced full GC before each per-file memory sample (clean leak signal; adds GC time to every mode alike) |
| `--shard i/n` | Jest `--shard` (split `all` into sequential runs) |
| `--triage` | rtd modes get workarounds for already-filed blockers (`navigator.platform = ""`, writable `navigator.clipboard`) to see what is behind them; report labelled `-triage`, **not** a compatibility result |
| `--shims react,dom,user-event,jest-dom` | rtd-full: substitute only some Testing Library packages (bisecting) |
| `--grep`, `--label`, `--no-report`, `--install`, `--latest` | Jest `-t`; output/report name; skip markdown; frozen install; move to upstream master (reports flag it) |
| `--scratch DIR` | run ad-hoc `*.spec.tsx` experiments from DIR (resolved as if in `tests/js`); never used for results |

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
   fails if a guard fails): jsdom mode really runs jsdom; rtd modes run one `@rtd/dom` instance
   (the environment's window, the test registry's `require('@rtd/dom')` and `globalThis.Node` are
   the same objects); rtd-full resolves every `@testing-library/*` to our bundles. `resolutions.jsonl`
   records how `react`/`react-dom`/`@testing-library/*` resolve; the report checks there is one
   React (our bundles' `require("react")` is redirected to Sentry's copy by `harness/resolver.cjs`).
4. **Measure**: wall time; total CPU (user+sys of Jest and its reaped workers, `time -l`); peak
   **tree** RSS (sum over Jest + workers, `ps` every 500 ms) and peak single-process RSS; per test
   file, from an identical measurement-only environment subclass in every mode
   (`harness/instrument.cjs` → `workers/<pid>.jsonl`): environment setup time (constructor +
   `setup()`), and the worker's RSS / heap after teardown, giving **memory growth per file per
   worker** (least-squares slope; `--gc` for post-GC heap).
5. **Report**: `results/<date>-<label>.md`, raw Jest JSON/logs/samples in `output/<label>/`
   (gitignored). Exit code is non-zero when a report or guard receipts are missing, more than one
   React was loaded, or the discovered test set differs from jsdom.

## Modes

| mode | environment | Testing Library | Sentry's jsdom hacks |
| --- | --- | --- | --- |
| `jsdom` | upstream `tests/js/sentry-test/jest-environment.cjs` (`@sentry/jest-environment/jsdom` → jsdom 30.1.1, `--retain-maps-for-n-gc=0`) | stock (lockfile) | active |
| `rtd-dom` | `jest-environment-rtd` (exactly what its preset names) wrapped like upstream wraps jsdom: `@sentry/jest-environment`'s `createEnvironment({baseEnvironment})`, `wrapWithStructuredClone`, same V8 flag; preset `moduleNameMapper` for `@rtd/dom(/internal)` | stock | active |
| `rtd-full` | as rtd-dom | `@testing-library/react` (+`/pure`, `/dont-cleanup-after-each`), `/dom`, `/user-event`, `/jest-dom` (+`/matchers`, `/jest-globals`) → `packages/*/dist/*.cjs`; `@rtd/aria`, `@rtd/testing-library` → their dist | active |
| `rtd-nohacks` | as rtd-dom | as rtd-full | **experiment**: `harness/nohacks.ts` runs after upstream setup and restores our `getComputedStyle`, real `@floating-ui/react-dom` (`jest.unmock`, verified), our `matchMedia` and `IntersectionObserver` |
| `rtd-direct` (opt-in) | **experiment**: rtd-dom, but the vm context is created with `vm.constants.DONT_CONTEXTIFY` (as jsdom 30 does) instead of jest-environment-node's contextified GlobalProxy context | stock | active |

Only adapter bridge in rtd modes: `global.jsdom.reconfigure({url})` (Sentry's
`setWindowLocation()` calls jsdom's API through `@sentry/jest-environment`; see "Adapter gaps").

## Sentry's jsdom speed hacks and test infrastructure

| upstream (tests/js/setup.ts, jest-environment.cjs) | why upstream has it | on our stack |
| --- | --- | --- |
| `window.getComputedStyle = el => el.style` | "The full jsdom CSS cascade is too slow, especially for dropdown positioning" | see results: rtd-nohacks keeps our real cascade |
| `jest.mock('@floating-ui/react-dom')` (no geometry) | jsdom has no layout; skips Floating UI work + React updates | see results |
| `matchMedia` stub (`matches: false`) | jsdom has no matchMedia | unnecessary: @rtd/dom implements it (desktop defaults) |
| `IntersectionObserver` class | jsdom has none | unnecessary: @rtd/dom provides an inert one |
| `ResizeObserver = MockResizeObserver` | jsdom has none; tests drive it with `triggerResizeObservers()` | still needed as **test infrastructure** (ours never fires callbacks) |
| `SVGElement.prototype.getTotalLength ??=`, `HTMLElement.prototype.setPointerCapture ??=` | jsdom lacks them | `??=` no-ops when present |
| `setImmediate`/`structuredClone` fallbacks, `TextEncoder/Decoder` | jsdom env lacks them | unnecessary (Node globals are present in jest-environment-rtd) |
| `crypto.subtle` from `node:crypto` | jsdom lacks subtle | still assigned by upstream; harmless |
| `--retain-maps-for-n-gc=0` | jsdom windows kept alive by optimized code (~30 MB/file/worker leak) | kept in rtd modes (any per-file vm context is affected) |
| React owner-stack skip (CI only) | ~7% of test CPU | engine-independent; active in every mode (`CI=true`) |
| lodash `debounce` / Pacer / framer-motion `skipAnimations` mocks | determinism + speed | engine-independent; kept |

## Adapter gaps (jest-environment-rtd)

- **`global.jsdom.reconfigure({url})`**: jsdom-specific API used by `sentry-test/utils`'
  `setWindowLocation()`. The harness bridges it with the window's internal URL setter.
  Proposed: jest-environment-rtd exposes an equivalent (`this.global.jsdom = { reconfigure }`
  or a documented `rtd.setURL(url)`), since every jsdom-based suite that changes the URL uses it.
- **Late work after teardown killed workers** (fixed by the jest-environment owner in
  `cf0a3f9` during this run: globals stay on the discarded vm global). Before the fix, the
  components preset lost 21 files and restarted ~130 workers per run.

## Caveats

- Our packages change under the runner while other agents work; a report notes "our packages
  changed during the run" when `packages/*/{src,dist}` fingerprints differ before/after. Several
  runs on 2026-10-23 overlapped with uncommitted @rtd/dom work, and some clusters seen only in
  such runs were transient.
- Wall/CPU numbers come from a shared machine; modes are run back to back with equal workers.
- `navigator.platform` follows the host OS on @rtd/dom (see TRIAGE.md): results on macOS differ
  from results on Linux CI.

## Status (2026-10-23, pinned `503ad2e4`, 6 workers, CPU = user+sys of Jest + workers)

The tree was being edited by other agents throughout (reports flag "our packages changed during
the run"); runs where every rtd file failed to import (mid-edit @rtd/dom) were discarded and
rerun. Wall times are noisy on the shared machine; CPU is the steadier signal.

Compatibility, as-is (`results/2026-10-23-{smoke-cold,components,views}.md`; passed / failed):

| preset | jsdom | rtd-dom | rtd-full | rtd-nohacks |
| --- | --- | --- | --- | --- |
| smoke (15 files, 589 tests) | 589 / 0 | 542 / 47 | 541 / 48 | 541 / 48 |
| components (653 files, 6,432 tests) | 6,429 / 0 | 5,993 / 432 | 5,923 / 502 | 5,913 / 512 |
| views (9 areas, 1,818 tests) | 1,818 / 0 | 1,561 / 257 | 1,533 / 285 | 1,499 / 319 |

With `--triage` (workarounds for TRIAGE.md clusters 1, 2, 5 and the timer leak):

| preset | jsdom | rtd-dom | rtd-full | rtd-nohacks |
| --- | --- | --- | --- | --- |
| smoke | 589 / 0 | 587 / 2 | 586 / 3 | 585 / 4 |
| components | 6,429 / 0 | 6,357 / 72 | 6,289 / 140 | 6,272 / 157 |
| views | 1,818 / 0 | 1,810 / 8 | 1,781 / 37 | 1,734 / 84 |
| all (2,437 files, 23,426 tests) | 23,421 / 0 | 23,244 / 177 | 23,017 / 404 | — |

Time and memory (components, `--triage`, 3 interleaved runs, medians;
`results/2026-10-23-components-triage-x3.md`):

| mode | wall | CPU | peak tree RSS | env setup / file (median) |
| --- | --: | --: | --: | --: |
| jsdom | 43.7 s | 280 s | 9.6 GiB | 8 ms |
| rtd-dom | 44.5 s | 270 s | 9.7 GiB | 6 ms |
| rtd-full | 46.3 s | 258 s | 9.3 GiB | 6 ms |
| rtd-nohacks (2 valid runs) | 49.8 / 65.9 s | 252 / 290 s | 8.6 GiB | 6 ms |

Direct-context experiment (components, `--triage`, 2 interleaved runs, heavier machine load;
`results/2026-10-23-components-direct-x2.md`): CPU jsdom 368 / 383 s, rtd-dom 349 / 347 s,
**rtd-direct 321 / 308 s** (same 6,357 / 72 results) — the contextified jest-environment-node
context costs rtd ~10% CPU on this suite.

Worker memory (forced GC per file, `results/2026-10-23-components-gc-triage.md`):

| mode | heap growth / file | heap after last file | max worker RSS |
| --- | --: | --: | --: |
| jsdom | 0.18 MiB | 232 MiB | 1,084 MiB |
| rtd-dom, timers **not** cleared (window timers leak, TRIAGE.md) | **7.2 MiB** | 1,023 MiB | 1,695 MiB |
| rtd-dom, timers cleared (triage shim) | 0.17 MiB | 189 MiB | 704 MiB |
| rtd-full, timers cleared | 0.39 MiB | 230 MiB | 535 MiB |

Full suite (`all`, triage, no forced GC): heap growth/file jsdom 0.55 MiB, rtd-dom 0.04 MiB,
rtd-full −0.47 MiB; max worker RSS 2,380 / 2,051 / 1,721 MiB; peak tree RSS 10.1 / 8.4 / 6.9 GiB.
Upstream sets no `workerIdleMemoryLimit`; rtd needs none once window timers are cleared at
teardown, and would need one without that fix.

See `TRIAGE.md` for clusters, owners and repros, and `results/*.md` for every run.
