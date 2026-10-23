# Radix Primitives downstream corpus

Runs the unmodified upstream [`radix-ui/primitives`](https://github.com/radix-ui/primitives) Vitest
`unit` project (47 files, 1,143 tests: dialogs, menus, select, slider, toast, form, focus scope,
dismissable layer, `vitest-axe`/axe-core checks, …) on three stacks and compares each against the
jsdom baseline.

| mode | DOM | Testing Library |
| --- | --- | --- |
| `jsdom` | jsdom 29.1.1 (upstream config, unchanged) | stock, from upstream's lockfile |
| `rtd-dom` | `@rtd/dom` via the stock `vitest-environment-rtd` | stock, from upstream's lockfile |
| `rtd-full` | `@rtd/dom` via the stock `vitest-environment-rtd` | ours: `@testing-library/{react,dom,user-event,jest-dom}` (+ subpaths) aliased to `packages/*` |

## Why Radix

Checked 2026-10-23 with `gh api`:

- **Radix Primitives**: Vitest 4.1 + `environment: 'jsdom'` + stock `@testing-library/react|dom|user-event|jest-dom`, interaction-heavy, and component packages point `main` at `src/index.ts` (no build). Qualifies.
- Ariakit: now runs its DOM projects on **happy-dom** through its own `@ariakit/test` simulation layer, not stock Testing Library on jsdom. Does not qualify.
- Mantine and Headless UI: Jest. Chakra UI: Vitest + jsdom too, but the brief preferred Radix.

## Run

```bash
pnpm downstream:radix --install            # first time: clone pinned commit + frozen install
pnpm downstream:radix --preset smoke       # 6 files
pnpm downstream:radix --preset interactions # 24 interaction-heavy packages
pnpm downstream:radix --preset all         # the whole unit project
pnpm downstream:radix --files packages/react/form/ --modes rtd-dom --grep 'explicit wiring'
pnpm vitest run --config downstream/vitest.config.ts radix   # standalone repros
```

Other flags: `--workers N` (default 4 in every mode), `--rounds N` (interleave the modes N times;
report median wall/RSS and list tests that change status between rounds), `--latest` (upstream `main` instead of the pin), `--shims dom,react`
(rtd-full subset, for bisecting), `--upstream-retry`, `--no-report`.

## How it works

- `manifest.json` pins `eb3a2b7091293e27df8f9ba906632d8daa3d81a3` (main, 2026-10-14). The runner
  mirrors it into gitignored `checkout/` (shallow fetch, detached checkout) and refuses to run if
  tracked upstream files are modified.
- `--install` runs upstream's exact `pnpm@11.5.0` with `--frozen-lockfile --ignore-scripts`,
  filtered to the root, `packages/**` and `internal/**` (Storybook and the Next.js SSR app are not
  needed).
- A wrapper config is generated per mode in `checkout/.rtd-harness/` (deleted afterwards). It
  imports upstream's `vitest.config.mts`, picks the `unit` project and `mergeConfig`s in: the
  environment, the rtd-full aliases, `resolve.dedupe` for React/Vitest, and
  `test.server.deps.external` for `packages/(dom|vitest-environment)/src` so the environment and
  the test realm share ONE `@rtd/dom` instance.
- Vitest runs with this process's Node (26), not the checkout's `.nvmrc` (24).

## Differences from the Base UI runner

- **No environment adapter.** Upstream is on Vitest 4.1; the Environment contract our
  `vitest-environment-rtd` uses (`name`, `viteEnvironment`, `setup() -> { teardown }`) is the same
  in Vitest 4, so the stock environment is used with default options (default URL
  `http://localhost:3000/`, same as Vitest's jsdom environment).
- **Default userAgent.** Radix never branches on `navigator.userAgent` (checked: no `jsdom`/UA
  checks in packages, internal or the setup file), so the rtd modes keep @rtd/dom's default UA.
- **retry forced to 0** in every mode. Upstream sets `retry: 1`, which would hide intermittent
  failures on either engine; `--upstream-retry` restores it. The jsdom baseline passes with 0.

## Guards (every run, reported in the results header; any failure makes the exit code 1)

- one `react` module id per mode (resolution receipts plugin, `output/<mode>/resolutions.jsonl`);
- a setup-file probe per worker (`output/<mode>/environments.jsonl`): jsdom mode really is jsdom;
  rtd modes satisfy `document instanceof Document && Node === dom.Node && window === globalThis`
  against the `@rtd/dom` module the test realm imports (single instance);
- rtd-full: each aliased specifier imports the same module object as our package entry, and no
  `@testing-library/*` import resolved outside `packages/`;
- discovered test counts equal jsdom's; the jsdom baseline must exit 0.

## Output

- `output/<mode>/` (gitignored): Vitest JSON, log, `summary.json`, receipts.
- `results/<date>-<preset>.md`: per-mode counts, wall, peak RSS (`/usr/bin/time -l`), tests that
  pass on jsdom but fail on rtd, failures by component and error signature.
- `TRIAGE.md`: clusters with owners and repros (`repros/`, run via `downstream/vitest.config.ts`).
