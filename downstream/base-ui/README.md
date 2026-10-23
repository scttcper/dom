# Base UI downstream corpus

Runs the **unmodified** upstream [`mui/base-ui`](https://github.com/mui/base-ui) `@base-ui/react`
Vitest suite (≈7k tests, real-world React components exercised through `@mui/internal-test-utils`,
Testing Library and user-event) on our stack, and compares it with the upstream jsdom baseline.
Methodology follows the author's earlier runner (`~/gh/vibedom/downstream/base-ui`).

## Run

```sh
pnpm downstream:base-ui --install                 # first time: clone + install upstream deps, run smoke
pnpm downstream:base-ui --preset interactions     # button/checkbox/radio/switch/tabs/select/menu/dialog/combobox/field/form/number-field/slider
pnpm downstream:base-ui --preset all              # whole @base-ui/react project
node downstream/base-ui/run.ts --files packages/react/src/tabs/list/TabsList.test.tsx --modes rtd-full --grep "roving focus"
```

| option | purpose |
| --- | --- |
| `--preset smoke\|interactions\|all`, `--files a,b` | what to run (smoke: Button, CheckboxRoot, TabsRoot, SelectRoot, FieldRoot, Form) |
| `--modes jsdom,rtd-dom,rtd-full` | which modes (default all three, jsdom first so rtd modes are compared with it) |
| `--install` | install upstream's frozen lockfile with upstream's exact `packageManager` pnpm (`npx pnpm@<ver>`), lifecycle scripts off, filtered to `@base-ui/react...`, `@base-ui/utils...`, the root and `test/` |
| `--latest` | move the checkout to upstream `master` (detached; refuses tracked local changes); reports flag the difference from the pin |
| `--workers N` | Vitest `--maxWorkers`, identical for every mode (default: half the cores) |
| `--grep PATTERN` | Vitest `--testNamePattern` |
| `--shims react,dom,user-event,jest-dom` | rtd-full: substitute only some of our packages (bisect a failure to one package; stock packages left in place are inlined so they bind to the chosen `@testing-library/dom`) |
| `--cold` | disable Vitest's on-disk module cache (every resolve receipt is recorded; slower) |
| `--triage` | apply the triage shims in `rtd-environment.ts` (workarounds for blockers already filed in `TRIAGE.md`) to see the failures behind them. Reports are written as `results/<date>-<preset>-triage.md` and labelled; they are **not** compatibility results |
| `--no-report` | skip `results/*.md` (raw output is still written) |

## What it does

1. **Mirror**: `checkout/` (gitignored) is a shallow clone of `manifest.json`'s pinned commit
   (`git fetch --depth 1 <commit>` + detached checkout). The runner refuses to run when upstream
   tracked files are modified, so results always describe the unmodified suite. The checkout is
   its own pnpm workspace; every command runs inside it, never through our workspace.
2. **Wrap, don't edit**: per mode it generates `checkout/.rtd-harness/<mode>.config.mts`
   (untracked, deleted after the run; inside the checkout so Vitest's config loader resolves
   upstream's own Vitest/Vite/plugins). It imports upstream's root and `packages/react` configs and
   `mergeConfig`s:
   - `test.environment`, `resolve.alias` (rtd-full), `resolve.dedupe: ['react', 'react-dom',
     'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom/client', 'vitest']` (one React, one
     Vitest: our packages resolve upstream's copies), `server.fs.allow` for this repo;
   - `test.server.deps.external: [/packages\/(dom|vitest-environment)\/src\//]`: Vitest loads the
     environment through a separate module runner, so without this the environment and the test
     realm would each get their own `@rtd/dom` instance. Externalized, Node loads our `.ts`
     natively (type stripping) once for both. Other packages of ours are inlined (Vite transforms
     the `.ts`, so their `react` imports go through `dedupe`);
   - rtd-full: `test.server.deps.inline: [/@mui\/internal-test-utils/]` so its
     `@testing-library/react/pure.js` / `dom` / `user-event` imports go through the aliases;
   - a Vite plugin that records how `react`, `react-dom`, `vitest`, `@testing-library/*` and our
     sources resolve (`output/<mode>/resolutions.jsonl`) and an identity-probe setup file that
     runs first in every test file and fails the file if the wrong DOM/shim is loaded
     (`output/<mode>/environments.jsonl`: UA, installer, single `@rtd/dom` instance via
     `globalThis.Node === (await import('@rtd/dom')).Node` and `document instanceof Document`,
     and for rtd-full that each `@testing-library/*` specifier is our module).
   - Vitest 5's on-disk module cache embeds resolved import ids, so each mode gets its own cache
     directory (`node_modules/.vitest-cache-rtd/<mode>`).
3. **Run** `node node_modules/vitest/vitest.mjs run --project @base-ui/react ...` under
   `/usr/bin/time -l` with `VITEST_ENV=jsdom TZ=UTC` (upstream's `test:jsdom` script), JSON +
   default reporters.
4. **Report**: old `output/<mode>/` is deleted first (stale JSON can't masquerade as passes).
   `results/<date>-<preset>.md` has per-mode counts, wall time, peak RSS (max RSS of Vitest and the
   workers it reaps, from `time -l`), the tests that pass on jsdom but fail on each rtd mode,
   missing/added/newly-skipped tests vs jsdom, and failures grouped by component and by error
   signature. Exit code is non-zero when a report is missing, receipts are missing, the jsdom
   baseline fails, or the discovered test set differs from jsdom.

## Modes

| mode | DOM environment | Testing Library packages |
| --- | --- | --- |
| `jsdom` | upstream's own config, unchanged (`jsdom` 27 with `pretendToBeVisual`, `url: http://localhost`) | stock, from upstream's lockfile |
| `rtd-dom` | `rtd-environment.ts` → `@rtd/dom` `createWindow` + `installGlobals` | stock, from upstream's lockfile |
| `rtd-full` | same as rtd-dom | `@testing-library/react` (+`/pure`) → `packages/react`, `@testing-library/dom` → `packages/testing-library`, `@testing-library/user-event` → `packages/user-event`, `@testing-library/jest-dom` (+`/vitest`, `/matchers`) → `packages/jest-dom` |

`rtd-environment.ts` implements Vitest 5's `Environment` interface (upstream pins Vitest 5.0.x,
the same major as `vitest-environment-rtd`). It uses `installGlobals` from `@rtd/dom` and keeps a
minimal fallback installer for when that is unavailable.

## Caveats

- **userAgent contains "jsdom"** (`Mozilla/5.0 (darwin) rtd-dom (jsdom-compatible headless corpus)`).
  Base UI and `@mui/internal-test-utils` branch on `/jsdom/.test(navigator.userAgent)` to skip
  tests that need real layout and to install a `setTimeout`-based requestAnimationFrame
  (`test/setupVitest.ts`). With this UA both engines run exactly the same tests and branches; the
  runner checks identical discovered/skipped sets. This is a jsdom-replacement corpus, not a
  claim of browser-grade layout.
- Some upstream jsdom-only tests pin jsdom quirks rather than standards (e.g.
  `getViewportRect` expects `window.visualViewport === undefined`); those are listed in
  `TRIAGE.md` as fixture assumptions, not bugs.
- `@mui/internal-test-utils` also uses stock `dom-accessibility-api` (its `toHaveAccessibleName`
  chai matcher) in every mode; that dependency is not substituted.
- Our packages change under the runner while other agents work; a report notes "our sources
  changed during the run" when the fingerprint of `packages/*/src` differs before/after.
- Wall times are diagnostics on a shared machine (other agents run tests concurrently), not
  controlled benchmarks; use `bench/` for performance claims.

## Repros

`repros/*.test.ts` are minimal differential repros for every failure cluster (same scenario on
jsdom and on `@rtd/dom`; the jsdom case passes, the rtd case fails until fixed):

```sh
pnpm vitest run --config downstream/vitest.config.ts
```

They are deliberately not in the root `vitest.config.ts` projects list (they fail by design).

## Status

Pinned `205831ca`, 2026-10-23 (passed / failed / skipped; wall; peak RSS):

| preset | jsdom | rtd-dom | rtd-full |
| --- | --- | --- | --- |
| smoke (6 files) | 608 / 0 / 78; 24.8s; 408 MiB | 606 / 2 / 78; 10.9s; 309 MiB | 603 / 5 / 78; 13.7s; 357 MiB |
| interactions (13 dirs) | 4830 / 0 / 722; 110s; 500 MiB | 4755 / 75 / 722; 119s; 540 MiB | 4747 / 83 / 722; 109s; 595 MiB |
| all (354 files) | 9199 / 0 / 1578; 278s; 511 MiB | 9080 / 119 / 1578; 254s; 591 MiB | 9080 / 119 / 1578; 176s; 586 MiB |

See `TRIAGE.md` (clusters, owners, repros) and the latest `results/*.md`.
