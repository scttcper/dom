# Base UI downstream harness

How the runner works, every option and what it checks. How to run it and its latest results: [README.md](README.md).

Runs the **unmodified** upstream [`mui/base-ui`](https://github.com/mui/base-ui) `@base-ui/react`
Vitest suite (≈7k tests, real-world React components exercised through `@mui/internal-test-utils`,
Testing Library and user-event) on our stack, and compares it with the upstream jsdom baseline.
Methodology follows the author's earlier runner (`~/gh/vibedom/downstream/base-ui`).

## Run

```sh
pnpm downstream:base-ui --install                 # first time: clone + install upstream deps, run smoke
pnpm downstream:base-ui --preset interactions     # button/checkbox/radio/switch/tabs/select/menu/dialog/combobox/field/form/number-field/slider
pnpm downstream:base-ui --preset all              # whole @base-ui/react project
node downstream/base-ui/run.ts --files packages/react/src/tabs/list/TabsList.test.tsx --modes ctrl-dom-full --grep "roving focus"
```

| option | purpose |
| --- | --- |
| `--preset smoke\|interactions\|all`, `--files a,b` | what to run (smoke: Button, CheckboxRoot, TabsRoot, SelectRoot, FieldRoot, Form) |
| `--modes jsdom,ctrl-dom,ctrl-dom-full` | which modes (default all three, jsdom first so ctrl-dom modes are compared with it) |
| `--install` | install upstream's frozen lockfile with upstream's exact `packageManager` pnpm (`npx pnpm@<ver>`), lifecycle scripts off, filtered to `@base-ui/react...`, `@base-ui/utils...`, the root and `test/` |
| `--latest` | move the checkout to upstream `master` (detached; refuses tracked local changes); reports flag the difference from the pin |
| `--workers N` | Vitest `--maxWorkers`, identical for every mode (default: half the cores) |
| `--grep PATTERN` | Vitest `--testNamePattern` |
| `--shims react,dom,user-event,jest-dom` | ctrl-dom-full: substitute only some of our packages (bisect a failure to one package; stock packages left in place are inlined so they bind to the chosen `@testing-library/dom`) |
| `--cold` | disable Vitest's on-disk module cache (every resolve receipt is recorded; slower) |
| `--triage` | apply the workarounds in `ctrl-dom-environment.ts` (workarounds for blockers already filed in `TRIAGE.md`) to see the failures behind them. Reports are written as `results/<date>-<preset>-triage.md` and labelled; they are **not** compatibility results |
| `--no-report` | skip `results/*.md` (raw output is still written) |

`CTRL_DOM_VITEST_ARGS` appends Vitest CLI arguments (space-separated). `CTRL_DOM_DOWNSTREAM_PROFILE=dir`
writes a CPU profile per worker (ctrl-dom modes), from environment setup to teardown, into `dir`:
Vitest ends its workers before `--cpu-prof` would write one.

`CTRL_DOM_SENTRY_REPORTER=1` adds @ctrl/sentry-tests' runner and Vitest reporter (ctrl-dom modes),
sending to `SENTRY_DSN` / `SENTRY_SPOTLIGHT`
([its README](../../packages/sentry-tests/README.md#development)).

## What it does

1. **Mirror**: `checkout/` (gitignored) is a shallow clone of `manifest.json`'s pinned commit
   (`git fetch --depth 1 <commit>` + detached checkout). The runner refuses to run when upstream
   tracked files are modified, so results always describe the unmodified suite. The checkout is
   its own pnpm workspace; every command runs inside it, never through our workspace.
2. **Wrap, don't edit**: per mode it generates `checkout/.ctrl-dom-harness/<mode>.config.mts`
   (untracked, deleted after the run; inside the checkout so Vitest's config loader resolves
   upstream's own Vitest/Vite/plugins). It imports upstream's root and `packages/react` configs and
   `mergeConfig`s:
   - `test.environment`, `resolve.alias` (ctrl-dom-full), `resolve.dedupe: ['react', 'react-dom',
     'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom/client', 'vitest']` (one React, one
     Vitest: our packages resolve upstream's copies), `server.fs.allow` for this repo;
   - `test.server.deps.external: [/packages\/(dom|vitest-environment)\/src\//]`: Vitest loads the
     environment through a separate module runner, so without this the environment and the test
     realm would each get their own `@ctrl/dom` instance. Externalized, Node loads our `.ts`
     natively (type stripping) once for both. Other packages of ours are inlined (Vite transforms
     the `.ts`, so their `react` imports go through `dedupe`);
   - ctrl-dom-full: `test.server.deps.inline: [/@mui\/internal-test-utils/]` so its
     `@testing-library/react/pure.js` / `dom` / `user-event` imports go through the aliases;
   - a Vite plugin that records how `react`, `react-dom`, `vitest`, `@testing-library/*` and our
     sources resolve (`output/<mode>/resolutions.jsonl`) and an identity-probe setup file that
     runs first in every test file and fails the file if the wrong DOM/shim is loaded
     (`output/<mode>/environments.jsonl`: UA, installer, single `@ctrl/dom` instance via
     `globalThis.Node === (await import('@ctrl/dom')).Node` and `document instanceof Document`,
     and for ctrl-dom-full that each `@testing-library/*` specifier is our module).
   - Vitest 5's on-disk module cache embeds resolved import ids, so each mode gets its own cache
     directory (`node_modules/.vitest-cache-ctrl-dom/<mode>`).
3. **Run** `node node_modules/vitest/vitest.mjs run --project @base-ui/react ...` under
   `/usr/bin/time -l` with `VITEST_ENV=jsdom TZ=UTC` (upstream's `test:jsdom` script), JSON +
   default reporters.
4. **Report**: old `output/<mode>/` is deleted first (stale JSON can't masquerade as passes).
   `results/<date>-<preset>.md` has per-mode counts, wall time, peak RSS (max RSS of Vitest and the
   workers it reaps, from `time -l`), the tests that pass on jsdom but fail on each ctrl-dom mode,
   missing/added/newly-skipped tests vs jsdom, and failures grouped by component and by error
   signature. Exit code is non-zero when a report is missing, records are missing, the jsdom
   baseline fails, or the discovered test set differs from jsdom.

## Modes

| mode | DOM environment | Testing Library packages |
| --- | --- | --- |
| `jsdom` | upstream's own config, unchanged (`jsdom` 27 with `pretendToBeVisual`, `url: http://localhost`) | stock, from upstream's lockfile |
| `ctrl-dom` | `ctrl-dom-environment.ts` → the stock `@ctrl/dom/vitest-environment` (default options plus `url` and `userAgent`) | stock, from upstream's lockfile |
| `ctrl-dom-full` | same as ctrl-dom | `@testing-library/react` (+`/pure`) → `packages/react`, `@testing-library/dom` → `packages/testing-library`, `@testing-library/user-event` → `packages/user-event`, `@testing-library/jest-dom` (+`/vitest`, `/matchers`) → `packages/jest-dom` |

`ctrl-dom-environment.ts` implements Vitest 5's `Environment` interface (upstream pins Vitest 5.0.x,
the same major as `@ctrl/dom/vitest-environment`). It runs the stock environment, so the window, the
virtual clock (idle time skipping) and error forwarding are what users get, and adds the identity
probe's `globalThis.__ctrlDomDownstream` and the `--triage` shims.

## Caveats

- **userAgent contains "jsdom"** (`Mozilla/5.0 (darwin) ctrl-dom (jsdom-compatible headless)`).
  Base UI and `@mui/internal-test-utils` branch on `/jsdom/.test(navigator.userAgent)` to skip
  tests that need real layout and to install a `setTimeout`-based requestAnimationFrame
  (`test/setupVitest.ts`). With this UA both engines run the same tests and branches; the
  runner checks identical discovered/skipped sets. It measures jsdom replacement, not a claim of
  browser-grade layout.
- Some upstream jsdom-only tests pin jsdom quirks rather than standards (e.g.
  `getViewportRect` expects `window.visualViewport === undefined`); those are listed in
  `TRIAGE.md` as tests that assume jsdom, not bugs.
- `@mui/internal-test-utils` also uses stock `dom-accessibility-api` (its `toHaveAccessibleName`
  chai matcher) in every mode; that dependency is not substituted.
- Our packages change under the runner while other agents work; a report notes "our sources
  changed during the run" when the fingerprint of `packages/*/src` differs before/after.
- Wall times are diagnostics on a shared machine (other agents run tests concurrently), not
  controlled benchmarks; use `bench/` for performance claims.

## Repros

`repros/*.test.ts` are minimal differential repros for every failure cluster (same scenario on
jsdom and on `@ctrl/dom`; the jsdom case passes, the ctrl-dom case fails until fixed):

```sh
pnpm vitest run --config downstream/vitest.config.ts
```

They are deliberately not in the root `vitest.config.ts` projects list (they fail by design).
