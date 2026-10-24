# React Router downstream suite

Runs the unmodified upstream [`remix-run/react-router`](https://github.com/remix-run/react-router)
Jest project of `packages/react-router` (119 files, ~2.6k tests: route matching, data routers,
`<Link>`/`<Form>` navigation through `window.history`, fetchers, `useSubmit`/FormData, scroll
restoration, SSR helpers) on three stacks and compares each with the jsdom baseline.

| mode | environment | Testing Library |
| --- | --- | --- |
| `jsdom` | jest-environment-jsdom 30 (upstream config, unchanged) | stock, from upstream's lockfile |
| `rtd-dom` | jest-environment-rtd (default options) | stock, from upstream's lockfile |
| `rtd-full` | jest-environment-rtd | ours: built bundles for `@testing-library/{react,dom,user-event,jest-dom}` |

## Why React Router

Routing is what none of the other suites exercise: history (`pushState`, hash routing), link
click interception, form submission with submitters, `Request`/`FormData` round trips, and
`AbortSignal`s. It is also the only suite whose Jest runs in **native ESM mode**
(`node --experimental-vm-modules`, ESM config and test files, a setup file with top-level
`await`), which is how jest-environment-rtd and our bundles get loaded through Jest's vm-modules
path.

## Run

```bash
node downstream/react-router/run.ts --install              # first time: clone + filtered frozen install, smoke
node downstream/react-router/run.ts --preset all
node downstream/react-router/run.ts --files packages/react-router/__tests__/dom/data-browser-router-test.tsx --modes rtd-full --grep submitter
node downstream/track.ts --suites react-router             # compare with downstream/baseline.json
pnpm vitest run --config downstream/vitest.config.ts react-router   # repros
```

Flags as in downstream/react-hook-form: `--workers N`, `--rounds N`, `--latest`, `--shims …`,
`--no-build`, `--no-report`, `--grep PATTERN`.

## How it works

- `manifest.json` pins the commit and lists 3 files excluded in every mode (they import the
  package's build output; see TRIAGE.md). `checkout/` (gitignored) is a shallow detached clone.
- `--install`: upstream's exact `pnpm@11.7.0`, `--frozen-lockfile --ignore-scripts`, filtered to
  the root (Jest, Babel) and `{./packages/react-router}...`.
- Per mode `packages/react-router/.rtd-harness/<mode>.config.mjs` (inside the package, so the
  probe resolves React and Testing Library from its `node_modules`; removed afterwards) imports
  upstream's ESM `jest.config.js` and overrides only `reporters`, `cacheDirectory`,
  `testPathIgnorePatterns` (the exclusions) and, in rtd modes, `testEnvironment:
  jest-environment.mjs` and `resolver: resolver.cjs`; rtd-full also maps `react`/`react-dom` to
  upstream's copies.
- `resolver.cjs` substitutes exact specifiers the way a published exports map would: the ESM
  bundle when Jest resolves with the "import" condition, the `.cjs` bundle for `require`. Mapped:
  `@testing-library/*` (rtd-full), our internal `@rtd/*` (rtd-full), and `@rtd/dom(/internal)` →
  the published package's bridges in `release/ctrl-dom/dist/bridge` (both rtd modes: the
  environment's single DOM, or a fresh load in `@jest-environment node` files). `pnpm build`
  produces both `packages/*/dist` and `release/`; the runner rebuilds when dist is stale.
- Jest runs as upstream's `pnpm test` does (`--experimental-vm-modules`) on this process's Node (26).

## Guards

`probe.cjs` runs first in every test file (records in `output/<mode>/environments.jsonl`). In DOM
files: jsdom mode is jsdom; rtd modes have one @rtd/dom per worker; rtd-full resolves every
substituted `@testing-library/*` to ours; one React (`renderHook(() => useState())`). In
`@jest-environment node` files it only checks that no DOM is installed. The run fails on probe
errors, more than one React path, a test-count mismatch with jsdom, or a failing jsdom baseline.
