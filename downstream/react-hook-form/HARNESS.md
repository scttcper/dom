# React Hook Form downstream harness

How the runner works, every option and what it checks. How to run it and its latest results: [README.md](README.md).

Runs the **unmodified** upstream [`react-hook-form/react-hook-form`](https://github.com/react-hook-form/react-hook-form)
Jest `Web` project (124 files, 1,729 tests: `register`, `Controller`/`useController`,
`useFieldArray`, `useWatch`, `useFormState`, `handleSubmit`, validation, resolvers) on three
stacks and compares each against the jsdom baseline.

| mode | DOM | Testing Library |
| --- | --- | --- |
| `jsdom` | `jest-fixed-jsdom` (jest-environment-jsdom 30 / jsdom 26 plus Node's fetch globals), upstream config unchanged | stock, from upstream's lockfile |
| `ctrl-dom` | `@ctrl/dom-jest-environment` with `nodeFetch: true` (its jest-fixed-jsdom equivalent) | stock, from upstream's lockfile |
| `ctrl-dom-full` | same | ours: `@testing-library/{react,dom,user-event,jest-dom}` mapped to `packages/*/dist/*.cjs` |

## Why React Hook Form

The component-library suites (Base UI, Radix, React Aria) drive widgets through pointer and
keyboard events. React Hook Form drives *native form controls* through refs: it reads
`checked`/`value`/`files`/`selectedOptions`/`attributes` straight off the DOM, registers
uncontrolled inputs, and validates on `input`/`blur`/`submit`. It is also one of the most
installed React libraries. Jest 30 + pnpm + no build step (tests import `src/`).

## Run

```bash
node downstream/react-hook-form/run.ts --install          # first time: clone pinned commit + frozen install, smoke preset
node downstream/react-hook-form/run.ts --preset all       # the whole Web project (what the baseline tracks)
node downstream/react-hook-form/run.ts --files src/__tests__/useForm/register.test.tsx --modes ctrl-dom --grep 'disabled'
pnpm vitest run --config downstream/vitest.config.ts react-hook-form   # standalone repros
```

Other flags: `--workers N` (Jest `--maxWorkers`, same for every mode), `--rounds N` (interleave the
modes N times; report median wall/RSS and list tests that change status between rounds),
`--latest` (upstream `master` instead of the pin), `--shims react,dom,user-event,jest-dom` (ctrl-dom-full
subset, for bisecting), `--no-build`, `--no-report`.

## How it works

- `manifest.json` pins `ed9345ab9c199cb37afbb6ef73970cf697f4585d` (master, 2026-10-23). The runner
  mirrors it into gitignored `checkout/` (shallow fetch, detached) and refuses to run when tracked
  upstream files are modified.
- `--install` runs `pnpm@11.7.0` (upstream has no `packageManager` field; 11.7.0 is what its CI
  action installs) with `--frozen-lockfile --ignore-scripts`.
- Per mode it writes `checkout/.ctrl-dom-harness/<mode>.config.cjs` (removed afterwards), which
  `require`s upstream's `scripts/jest/jest.config.js`, picks the `Web` project (upstream's
  `TEST_ENV=web`; the `Server` project runs on `testEnvironment: node`) and overrides only:
  `testEnvironment` (ctrl-dom modes: `jest-environment.mjs`, a `.mjs` re-export of
  `packages/jest-environment/src` so upstream's SWC transform leaves our sources alone),
  `testEnvironmentOptions` (+ `nodeFetch: true`), `moduleNameMapper` (ctrl-dom: `@ctrl/dom(/internal)` to
  the environment's shims; ctrl-dom-full: Testing Library to our `.cjs` bundles, React to upstream's
  copy), the probe in front of `setupFilesAfterEnv`, reporters (`json-reporter.cjs`, cycle-safe) and
  a per-mode cache directory.
- Every mode runs on this process's Node (26), not the Node 22 upstream's CI uses.

## Guards (per test file; any failure makes the exit code 1)

`probe.cjs` runs first in every file and appends a receipt to `output/<mode>/environments.jsonl`:
jsdom mode runs jsdom; ctrl-dom modes run under @ctrl/dom-jest-environment with **one @ctrl/dom per worker**
(`require('@ctrl/dom') ===` the environment's instance); ctrl-dom-full resolves every
`@testing-library/*` to our bundles (stock elsewhere); **one React** (`renderHook` through the
Testing Library the tests import, with the React they import). The run also fails when a mode
reports more than one React path, when the jsdom baseline fails, or when a mode discovers a
different set of tests than jsdom.

## Output

- `output/<mode>/` (gitignored): Jest JSON, log, `summary.json`, records.
- `results/<date>-<preset>.md`: per-mode counts, wall, peak RSS (`/usr/bin/time -l`), tests that pass
  on jsdom but fail on ctrl-dom, failures by test file and error signature.
- `TRIAGE.md`: what still differs and why; `repros/` (run via `downstream/vitest.config.ts`).
