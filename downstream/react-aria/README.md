# React Aria downstream suite

Runs the **unmodified** upstream [`adobe/react-spectrum`](https://github.com/adobe/react-spectrum)
Jest suite for `react-aria` (hooks, incl. the former `@react-aria/*` packages, whose tests now live
in `packages/react-aria/test`) and `react-aria-components` (≈3k tests, 152 files) on our stack and
compares it with upstream's jsdom baseline. Template: `downstream/base-ui` (Vitest); upstream
know-how from the author's earlier Jest runner (`~/gh/vibedom/downstream/react-aria`).

## Run

```sh
pnpm downstream:react-aria --install                # first time: clone + focused yarn install, then smoke
pnpm downstream:react-aria --preset interactions    # react-aria/test/{interactions,focus,selection}
pnpm downstream:react-aria --preset all             # react-aria/test + react-aria-components/test
node downstream/react-aria/run.ts --files packages/react-aria-components/test/Menu.test.tsx --modes ctrl-dom-full --grep "click outside"
pnpm vitest run --config downstream/vitest.config.ts react-aria   # standalone repros (fail by design)
```

| option | purpose |
| --- | --- |
| `--preset smoke\|interactions\|all`, `--files a,b` | what to run (smoke: RAC Button, Checkbox, TextField, Select, ComboBox, Menu, Dialog, Tabs); entries are Jest path patterns |
| `--modes jsdom,ctrl-dom,ctrl-dom-full` | modes, run sequentially in the given order (use e.g. `ctrl-dom,ctrl-dom-full,jsdom` to interleave across presets) |
| `--workers N` | Jest `--maxWorkers`, identical for every mode (default `min(4, cores/2)`) |
| `--install` | `yarn workspaces focus` with upstream's exact Yarn (`.yarn/releases`), immutable lockfile, lifecycle scripts off, then upstream's root `postinstall` (patch-package + generated icons) |
| `--latest` | move the checkout to upstream `main` (detached; refuses tracked local changes); the report flags it |
| `--shims react,dom,user-event,jest-dom` | ctrl-dom-full: substitute only some packages (bisect a failure to one of ours) |
| `--triage all\|fake-raf,keep-globals,no-pointer-event,isolate` | look past blockers already filed in `TRIAGE.md` (see `jest-environment.mjs`); writes `results/<date>-<preset>-triage.md`, labelled — **not** compatibility results |
| `--no-build` | ctrl-dom-full: don't run `pnpm build` even if `packages/*/dist` is older than `src` |
| `--grep PATTERN`, `--no-report` | Jest `--testNamePattern`; skip `results/*.md` |

## What it does

1. **Mirror**: `checkout/` (gitignored) is a shallow, detached clone of `manifest.json`'s pinned
   commit. The runner refuses to run when upstream tracked files are modified.
2. **Install**: the focused workspace list in `manifest.json` (RAC, react-aria, react-stately,
   `@react-stately/flags`, the Spectrum Provider some tests render, both test-utils, icon
   workspaces). Upstream's `.nvmrc` pins Node 24; every command is spawned with the runner's own
   `process.execPath` (Node 26, required by @ctrl/dom-jest-environment), jsdom baseline included.
3. **Wrap, don't edit**: per mode it writes `checkout/.ctrl-dom-harness/<mode>.config.cjs` (untracked,
   removed after the run), which `require`s upstream's `jest.config.js` and overrides only:
   - `projects` dropped (it would reload upstream's jsdom config), `reporters` → default + our
     cycle-safe JSON reporter (`json-reporter.cjs`; `--json` crashes on our DOM nodes, TRIAGE 6),
     per-mode `cacheDirectory`;
   - ctrl-dom modes: `testEnvironment: jest-environment.mjs` — re-exports `@ctrl/dom-jest-environment`
     (`packages/jest-environment/src`) from a `.mjs` file so upstream's SWC transform does not
     recompile our environment and @ctrl/dom; Node loads them natively, once per worker;
     `moduleNameMapper` `@ctrl/dom(/internal)` → @ctrl/dom-jest-environment's shims (the environment's
     single instance), as `@ctrl/dom-jest-environment/jest-preset` does;
   - ctrl-dom-full: `moduleNameMapper` `@testing-library/react(/pure, /dont-cleanup-after-each)`,
     `/dom`, `/user-event`, `/jest-dom(/matchers, /jest-globals)` → our built bundles in
     `packages/*/dist` (`.cjs` when built, else the ESM `.js` compiled by `jest-transform.cjs`,
     which is upstream's @swc/jest plus a guard against module-level `await`), our internal
     `@ctrl/dom/*` specifiers → their bundles, `react`/`react-dom(/…)` → upstream's copies;
   - `setupFilesAfterEnv: [probe.cjs, ...upstream]`.
4. **Guards** (`probe.cjs`, first in every test file; records in `output/<mode>/environments.jsonl`):
   jsdom mode runs jsdom; ctrl-dom modes run under @ctrl/dom-jest-environment with **one @ctrl/dom per
   worker** (`require('@ctrl/dom') === env instance`, `.Node === globalThis.Node`, `document
   instanceof Document`); ctrl-dom-full resolves every `@testing-library/*` to our bundles (stock in the
   other modes); **one React**: `renderHook(() => React.useState())` through
   `@testing-library/react/pure` with the React the tests import (a second copy fails with
   "Invalid hook call"). A failed probe fails the file and the run's exit code.
5. **Run** `node jest.js --config <wrapper> --ci --maxWorkers N <patterns>` under
   `/usr/bin/time -l` with upstream's `yarn test` env (`STRICT_MODE=1 VIRT_ON=1`).
6. **Report**: `output/<mode>/` is deleted first; it gets `report.json`, `jest.log`,
   `summary.json`, records. `results/<date>-<preset>.md`: per-mode counts, wall, peak RSS (max RSS
   of Jest and the workers it reaps), tests passing on jsdom but failing here, missing tests,
   failures by component and by error signature. The exit code is non-zero when a report or probe
   receipt is missing, a probe failed, the jsdom baseline fails, or the discovered test set
   differs from jsdom.

## Modes

| mode | DOM environment | Testing Library packages |
| --- | --- | --- |
| `jsdom` | upstream's config unchanged: `jest-environment-jsdom` 30.4.1, jsdom 26.1.0 | stock from yarn.lock: RTL 16.3.2, DTL 10.4.1, user-event 14.6.5 (upstream-patched), jest-dom 6.9.1 |
| `ctrl-dom` | `@ctrl/dom-jest-environment` | stock, as above |
| `ctrl-dom-full` | `@ctrl/dom-jest-environment` | ours, from `packages/*/dist` |

## Caveats

- Upstream's suite targets jsdom **26**, which lacks `PointerEvent`, `DragEvent`/`DataTransfer`
  and `CSS`; React Aria feature-detects these, so exposing them (as browsers do) changes code
  paths. Counted separately in TRIAGE (cluster 2) rather than worked around.
- @ctrl/dom-jest-environment shares interface prototypes across the test files of a worker (TRIAGE 5),
  so a few results depend on worker scheduling; `--triage isolate` removes that variance.
- upstream patches user-event (`.yarn/patches`: dispatch `new Event('change')` in
  `prepareDocument`, follow focus into iframes in `getActiveElement`); ctrl-dom-full replaces the
  patched package with ours.
- `pnpm build` (ctrl-dom-full, when dist is stale) rewrites `packages/*/dist`; other agents may rebuild
  or edit sources during a run — reports say "our sources changed during the run" when the
  fingerprint of `packages/*/{src,dist}` changed.
- Wall times are diagnostics on a shared machine, all modes with the same worker count, not
  benchmarks.

## Status

Pinned `d5fb723a`, 2026-10-23, `--workers 4` (passed / failed / skipped; wall; peak RSS):

| preset | jsdom | ctrl-dom | ctrl-dom-full |
| --- | --- | --- | --- |
| smoke (8 files) | 366 / 0 / 0; 3.9s; 514 MiB | 333 / 33 / 0; 2.7s; 454 MiB | 331 / 35 / 0; 2.9s; 411 MiB |
| interactions (19 files) | 386 / 0 / 0; 3.6s; 561 MiB | 365 / 21 / 0; 3.7s; 550 MiB | 365 / 21 / 0; 2.4s; 319 MiB |
| all (152 files) | 2997 / 0 / 9; 15.0s; 973 MiB | 2632 / 297 / 9 (+68 missing); 13.5s; 858 MiB | 2639 / 266 / 9 (+92 missing); 12.5s; 1056 MiB |

With `--triage all` (labelled, not compatibility results): smoke 357/9 (ctrl-dom), 355/11
(ctrl-dom-full); interactions 378/8 both; all 2704/223 (+70 missing), 2685/249 (+63 missing).

See `TRIAGE.md` (clusters, owners, repros) and the latest `results/*.md`.
