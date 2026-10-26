# TanStack Query downstream harness

How the runner works, every option and what it checks. How to run it and its latest results: [README.md](README.md).

Runs the unmodified upstream [`TanStack/query`](https://github.com/TanStack/query) Vitest projects
of the React adapter packages (`react-query`, `react-query-persist-client`,
`react-query-devtools`: 26 files, 477 tests) on three stacks and compares each with the jsdom
baseline.

| mode | DOM | Testing Library |
| --- | --- | --- |
| `jsdom` | jsdom 27.4.0 (upstream configs, unchanged) | stock, from upstream's lockfile |
| `ctrl-dom` | `@ctrl/dom` via the stock `@ctrl/dom/vitest-environment` | stock, from upstream's lockfile |
| `ctrl-dom-full` | `@ctrl/dom` via the stock `@ctrl/dom/vitest-environment` | ours: `@testing-library/{react,dom,user-event,jest-dom}` (+ subpaths) aliased to `packages/*/src` |

## Why TanStack Query

The existing suites are component libraries (Radix, Base UI, React Aria) and an app (Sentry).
TanStack Query is the most used React data-fetching library and its tests are about asynchrony:
fake timers (`vi.advanceTimersByTimeAsync`), Suspense, transitions, error boundaries, `act`-wrapped
notification batching, hydration and persisters. Vitest 4 + jsdom + stock Testing Library, pnpm,
packages resolve each other's `src/` through an export condition (no build).
`react-query-next-experimental` has no tests.

## Run

```bash
node downstream/tanstack-query/run.ts --install            # first time: clone pinned commit + frozen install, smoke
node downstream/tanstack-query/run.ts --preset all         # the three projects
node downstream/tanstack-query/run.ts --files packages/react-query/src/__tests__/useQuery.test.tsx --modes ctrl-dom-full --grep 'should retry'
node downstream/track.ts --suites tanstack-query           # compare the latest run with downstream/baseline.json
```

Other flags: `--workers N` (default 4 in every mode), `--rounds N` (interleave the modes N times;
median wall/RSS, tests that change status between rounds), `--latest` (upstream `main`),
`--shims react,dom,user-event,jest-dom` (ctrl-dom-full subset), `--no-report`.

## How it works

- `manifest.json` pins the commit; the runner mirrors it into gitignored `checkout/` (shallow,
  detached) and refuses to run if tracked upstream files are modified.
- `--install` runs upstream's exact `pnpm@12.4.2` with `--frozen-lockfile --ignore-scripts`,
  filtered to the root and `{./packages/<tested>}...` (no examples, integrations or other
  frameworks).
- Per mode it writes `checkout/.ctrl-dom-harness/<mode>.config.mts` (deleted afterwards): it imports
  each package's own `vite.config.ts`, `mergeConfig`s in the environment, the ctrl-dom-full aliases,
  `resolve.dedupe` for React/Vitest, `test.server.deps.external` for
  `packages/(dom|vitest-environment)/src` (one `@ctrl/dom` instance shared by the environment and
  the test realm), anchors `dir`/`setupFiles` to the package, and runs the three as one Vitest
  `projects` run. Filters are passed as absolute paths (each project matches them against its own
  `src/`).
- Differences from upstream's own setup: `typecheck.enabled` and CI coverage off; ctrl-dom-full pins
  `react-dom` (see guards) and inlines `@testing-library/react-render-stream`.
- Vitest runs with this process's Node (26), not the checkout's `.nvmrc` (24).

## Startup costs (read before comparing modes)

The 26 files spend ~1 s in their tests, so per-file loading decides the wall time:

- The ctrl-dom modes load @ctrl/dom from its TypeScript sources (`packages/*/src`, natively, with
  types stripped in every worker): Vitest's `environment` phase is ~4.6 s summed over the files,
  against ~0.9 s with the published bundles.
- ctrl-dom-full also aliases our Testing Library to its sources, which Vite transforms and runs
  through its module runner: `transform` 3.6 s vs 1.3 s, and `setup` +2.4 s summed (~90 ms per
  file).
- With the published package installed in the checkout instead (`release/ctrl-dom` and the stock
  `ctrlDom()` plugin; 2026-10-26, 5 interleaved rounds), ctrl-dom took 3.63 s and ctrl-dom-full
  3.52 s, against 4.77 s and 5.31 s here. ctrl-dom-full being slower than ctrl-dom in this
  harness's results comes from loading the sources, not from the library: the tests themselves
  run faster on ours (0.97 s vs 1.06 s summed).
- Every mode loads jsdom: `@testing-library/react-render-stream`, which react-query's
  `test-setup.ts` imports in every file, imports it statically (~400 CommonJS files per file).
- `ctrlDom()`'s compile cache does not help on Vitest 4 (bench/README.md "Worker startup").

## Guards (every run; any failure makes the exit code 1)

- one `react` module id and one `react-dom` copy (inside the checkout) per mode, from the
  resolution records (`output/<mode>/resolutions.jsonl`). react-dom matters here: two of the
  packages depend on `react` only, so a bare `react-dom/client` import from our sources would
  otherwise resolve to this workspace's react-dom and its React (TRIAGE.md);
- a setup-file probe per test file (`output/<mode>/environments.jsonl`): jsdom mode is jsdom; ctrl-dom
  modes run on the `@ctrl/dom` module the test realm imports;
- ctrl-dom-full: each aliased specifier is our package entry, and no `@testing-library/*` import (other
  than the render-stream add-on) resolved outside `packages/`;
- discovered test counts equal jsdom's; the jsdom baseline must exit 0.

## Output

- `output/<mode>/` (gitignored): Vitest JSON, log, `summary.json`, records.
- `results/<date>-<preset>.md`: per-mode counts, wall, peak RSS, tests that pass on jsdom but fail
  on ctrl-dom, failures by file and error signature.
- `TRIAGE.md`: what differs and why.
