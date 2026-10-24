# ctrl-dom

`@ctrl/dom` is the DOM for testing React components: a drop-in replacement for jsdom and
happy-dom, several times faster with a fraction of the memory, with `@testing-library/react`,
`@testing-library/dom`, `@testing-library/user-event`, `@testing-library/jest-dom`, `aria-query`
and `dom-accessibility-api` reimplemented on top of it as one cohesive codebase.

Everything is drop-in: same exports, same behavior, same error messages and `prettyDOM` output.
Swap only the DOM (stock Testing Library on `@ctrl/dom`) or the whole stack.

## Use it

Not published yet. `pnpm build` assembles the publishable packages under `release/`, and
`pnpm test:pack` installs their tarballs into a fresh project and runs every setup below.

Vitest (>= 5), whole stack: the environment plus your `@testing-library/*` imports routed to
`@ctrl/dom`, with only `@ctrl/dom` installed:

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
import { ctrlDom } from "@ctrl/dom/vitest";

export default defineConfig({ plugins: [ctrlDom()], test: { pool: "vmThreads" } });
```

Vitest, DOM only (`pnpm add -D @ctrl/dom vitest-environment-ctrl-dom`):

```ts
export default defineConfig({ test: { environment: "ctrl-dom" } });
```

Jest (>= 30) (`pnpm add -D @ctrl/dom jest-environment-ctrl-dom`):

```js
// jest.config.js
module.exports = {
  preset: "@ctrl/dom", // whole stack: @testing-library/* routed to @ctrl/dom's CommonJS builds
  setupFilesAfterEnv: ["@ctrl/dom/jest-dom"],
  // testEnvironment: "ctrl-dom", // DOM only, stock @testing-library/*
};
```

Or import `@ctrl/dom/react`, `@ctrl/dom/user-event`, `@ctrl/dom/jest-dom` (`/vitest`,
`/jest-globals`), `@ctrl/dom/testing-library` and `@ctrl/dom/aria` directly. Packages need
Node >= 26; TypeScript users need `lib: ["dom"]` as with upstream. The published README
([publish/ctrl-dom/README.md](publish/ctrl-dom/README.md)) documents options and presets.

## Packages

Published (assembled by [scripts/release.ts](scripts/release.ts) from the workspace builds):

| Package | Replaces |
| --- | --- |
| `@ctrl/dom` | jsdom / happy-dom, plus the Testing Library stack under subpaths |
| `jest-environment-ctrl-dom` | jest-environment-jsdom (`testEnvironment: "ctrl-dom"`) |
| `vitest-environment-ctrl-dom` | `environment: "ctrl-dom"` (re-exports `@ctrl/dom/vitest-environment`) |

Workspace packages (internal names; each is one subpath of `@ctrl/dom` or one environment):

| Workspace package | Published as | Replaces | |
| --- | --- | --- | --- |
| `@rtd/dom` | `@ctrl/dom` | jsdom / happy-dom | nodes, WHATWG HTML parser, selectors, CSS cascade + CSSOM, events, forms, window |
| `@rtd/aria` | `@ctrl/dom/aria` | aria-query + dom-accessibility-api | roles, accessible name/description, states, hidden |
| `@rtd/testing-library` | `@ctrl/dom/testing-library` | `@testing-library/dom` 10.4 | queries, `waitFor`, `fireEvent`, `prettyDOM`, suggestions |
| `@rtd/react` | `@ctrl/dom/react` | `@testing-library/react` 16.3 | `render`, `renderHook`, `act`, cleanup |
| `@rtd/user-event` | `@ctrl/dom/user-event` | `@testing-library/user-event` 14.6 | pointer/keyboard simulation |
| `@rtd/jest-dom` | `@ctrl/dom/jest-dom` | `@testing-library/jest-dom` 7.0 | all 49 matchers, vitest + jest entries |
| `vitest-environment-rtd` | `@ctrl/dom/vitest-environment` | Vitest's jsdom environment | |
| `jest-environment-rtd` | `jest-environment-ctrl-dom` | jest-environment-jsdom | |
| `@rtd/native` | — | — | scriptc-compiled accelerators and the scriptc compatibility gate |

## Compatibility

- Upstream test suites ported and passing on `@ctrl/dom`: Testing Library DOM (1163), RTL (248),
  jest-dom (313), user-event (653 + 4 skipped), dom-accessibility-api + WPT accname (159/159).
- Spec suites: html5lib tokenizer 7050/7050 and tree construction 1793/1793; WPT selectors
  1319/1319; ~54k WPT dom subtests; WPT reflection (~47k checks); CSS tokenizer 288/288.
- Differential forms suite against jsdom (`tests/compat`): 701/701, with spec-pinned
  corrections where jsdom is wrong; React form scenarios pass in all three modes.
- Stock jest-dom on `@ctrl/dom` (environment swap only): every non-skipped test passes.
- Real-world corpus: the unmodified Base UI test suite (`downstream/base-ui`, mui/base-ui
  `205831c`), with only the environment swapped (`rtd-dom`) or the whole Testing Library stack
  aliased to ours (`rtd-full`; the downstream runners' mode names use the workspace name):

  | mode | passed / 9,199 | wall | peak RSS |
  | --- | ---: | ---: | ---: |
  | jsdom (upstream baseline) | 9,199 | 81.5 s | 506 MiB |
  | rtd-dom | 9,197 | 58.8 s | 394 MiB |
  | rtd-full | 9,197 | 54.3 s | 390 MiB |

  The 2 remaining failures are an upstream timing race that only appears when rendering takes
  under 1 ms (see `downstream/base-ui/TRIAGE.md`); everything else matches jsdom.

Intentional differences from the specs are listed in [docs/deviations.md](docs/deviations.md).

## Performance

The DOMs component suites run on, measured the same way under Vitest: a 100-file suite, then
Vitest benchmarks of what component tests do (`pnpm compare`; methods and every number in
[comparison/](comparison/README.md)).

<!-- comparison:start (generated by `pnpm compare --readme`, comparison/report.ts) -->
|  | jsdom 30.1.3 | happy-dom 21.0.4 | ctrl-dom 0aadd30 | ctrl-dom + its Testing Library 0aadd30 |
| --- | ---: | ---: | ---: | ---: |
| `vitest run`, 100 React test files | 14.16 s | 9.12 s | 6.43 s | **3.64 s** |
| … with `--pool vmForks` | 2.03 s | 1.80 s | 1.41 s | **1.17 s** |
| `jest`, the same 100 files² | 2.39 s | 2.30 s | 1.90 s | **851 ms** |
| Environment setup per test file | 303 ms | 144 ms | 32.8 ms | **22.7 ms** |
| Worker memory (RSS) | 216 MB | 128 MB | 119 MB | **108 MB** |
| Render a 20-field form + 10 `getByRole` | 10.4 ms | 3.79 ms | 1.05 ms | **223 µs** |
| `user.type('hello world')` | 22.5 ms | 22.5 ms | 1.06 ms | **740 µs** |
| `user.click` × 10 | 56.3 ms | 51.8 ms | 1.73 ms | **1.13 ms** |
| `findByRole` after a 20 ms timer¹ | 24.3 ms | 23.7 ms | 151 µs | **126 µs** |
| Parse a 220 KB page | 38.9 ms | 33.0 ms | **2.15 ms** | 〃 |
| Mutate, then `querySelectorAll` | 1.39 ms | 803 µs | **56.9 µs** | 〃 |
| `getComputedStyle` × 100 | 78.3 µs | 20.5 µs | **8.04 µs** | 〃 |
| Styled form + 5 `getByRole`, 1,200-rule CSS-in-JS sheet | 83.6 ms | 79.3 ms | 1.63 ms | **832 µs** |
| `getComputedStyle` × 100, same sheet | 58.8 ms | 964 µs | **229 µs** | 〃 |

<sub>Medians, 2026-10-23, Apple M4 Max, 14 cores, 36 GB, darwin arm64, Node 26.12.1. Suites: 100 files, 3 runs each, 4 workers; other rows: Vitest bench, time per iteration. ¹ ctrl-dom skips idle time on a virtual clock instead of waiting it out. ² Each DOM's Jest environment: jest-environment-jsdom 30.5.2 (jsdom 26.1.0), @happy-dom/jest-environment 21.0.4, jest-environment-ctrl-dom. 〃 same DOM as the column before. Everything measured, and how: [comparison/](comparison/README.md) ([full results](comparison/RESULTS.md)).</sub>
<!-- comparison:end -->

The per-package harness with allocation and GC per iteration, bundle vs source and the CI
regression check is `bench/` (`pnpm bench`).

## How it is fast

One monomorphic internal record (`NodeImpl`) behind every node keeps V8 on fast paths;
Testing Library queries walk those records directly, compute roles with integer switches, and
check visibility through a cached CSS fast path instead of `getComputedStyle` per element;
interface objects are shared across windows; every subsystem is lazy. See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

scriptc: pure algorithmic modules (HTML tokenizer/tree builder, CSS and selector parsers) are
written in scriptc's compiled subset and verified by `pnpm scriptc:check` (100% static). A
Node-API native build exists, but measured native code loses to V8's JIT on these workloads
once warm (the per-call boundary and string copies dominate), so nothing ships native by
default — see [packages/native/RESULTS.md](packages/native/RESULTS.md).

## Develop

```bash
pnpm install
pnpm test                 # all packages + compat suites
pnpm typecheck
pnpm build               # dist/: ESM (+ CJS) bundles and .d.ts per package
pnpm test:pack           # pack, install into a fresh project, run Vitest/Jest/tsc against the tarballs
pnpm bench                # vs jsdom / happy-dom
pnpm bench:suite          # 100-file Vitest suite under each environment
pnpm bench:compare --base ../base --head .   # regression check between two clean checkouts
pnpm downstream:base-ui --preset all   # Base UI's own tests in jsdom / rtd-dom / rtd-full
node downstream/track.ts  # compare the latest downstream runs with downstream/baseline.json
pnpm docs:compat          # regenerate docs/deviations.md's compat profile table
pnpm scriptc:check
```

Read [CLAUDE.md](CLAUDE.md) for conventions (spec links in tests, performance rules).

### CI and releases

- `CI` (every push and pull request): typecheck, lint, tests, build, and the packed-tarball
  checks (`pnpm test:pack`).
- `Benchmarks` (pull requests touching packages or bench): `bench/compare.ts` on clean checkouts
  of the PR's base and head; fails on a >10% regression in median time or allocation.
- `Downstream` (run by hand): Base UI, Radix, React Aria and Sentry's own suites, compared with
  the pass counts and failing tests in `downstream/baseline.json`. Fixes show up as "fixed":
  update the baseline (`node downstream/track.ts --update`) in the PR that makes them.
- `Release` (every push to main, or by hand for one package or a dry run): semantic-release
  with one version line per published package (`tools/release`). A package is released only when
  conventional commits since its last tag (`@ctrl/dom@1.2.0`, `jest-environment-ctrl-dom@1.0.3`)
  touch the files it is built from: `feat` → minor; `fix`, `perf`, `deps` → patch; a breaking
  change → major; `ref`, `docs`, `test`, `chore`… release nothing. Publishing is npm trusted
  publishing (OIDC, with provenance): each package's trusted publisher on npmjs.com names this
  repository and `release.yml`. npm only allows that once a package exists, so each package's
  first version is published by hand.
