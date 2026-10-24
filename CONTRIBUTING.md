# Contributing

[CLAUDE.md](CLAUDE.md) has the conventions (spec links in tests, performance rules) and
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) how the pieces fit together.

## Commands

```bash
pnpm install
pnpm test                 # all packages + compat suites
pnpm typecheck
pnpm build                # dist/: ESM (+ CJS) bundles and .d.ts per package
pnpm test:pack            # pack, install into a fresh project, run Vitest/Jest/tsc against the tarballs
pnpm bench                # vs jsdom / happy-dom
pnpm bench:suite          # 100-file Vitest suite under each environment
pnpm bench:compare --base ../base --head .   # regression check between two clean checkouts
pnpm compare --readme     # the README's performance table (comparison/)
pnpm downstream:base-ui --preset all   # Base UI's own tests in jsdom / rtd-dom / rtd-full
node downstream/track.ts  # compare the latest downstream runs with downstream/baseline.json
pnpm docs:compat          # regenerate docs/deviations.md's compat profile table
pnpm docs:spec            # regenerate docs/spec-coverage.md
```

## Packages

Published, assembled by [scripts/release.ts](scripts/release.ts) from the workspace builds:

| Package | Replaces |
| --- | --- |
| `@ctrl/dom` | jsdom / happy-dom, plus the Testing Library stack under subpaths |
| `jest-environment-ctrl-dom` | jest-environment-jsdom (`testEnvironment: "ctrl-dom"`) |
| `vitest-environment-ctrl-dom` | `environment: "ctrl-dom"` (re-exports `@ctrl/dom/vitest-environment`) |

What each import is and where its source lives:

| Import | Source | Replaces | |
| --- | --- | --- | --- |
| `@ctrl/dom` | [packages/dom](packages/dom) | jsdom / happy-dom | nodes, WHATWG HTML parser, selectors, CSS cascade + CSSOM, events, forms, window |
| `@ctrl/dom/aria` | [packages/aria](packages/aria) | aria-query + dom-accessibility-api | roles, accessible name/description, states, hidden |
| `@ctrl/dom/testing-library` | [packages/testing-library](packages/testing-library) | `@testing-library/dom` 10.4 | queries, `waitFor`, `fireEvent`, `prettyDOM`, suggestions |
| `@ctrl/dom/react` | [packages/react](packages/react) | `@testing-library/react` 16.3 | `render`, `renderHook`, `act`, cleanup |
| `@ctrl/dom/user-event` | [packages/user-event](packages/user-event) | `@testing-library/user-event` 14.6 | pointer/keyboard simulation |
| `@ctrl/dom/jest-dom` | [packages/jest-dom](packages/jest-dom) | `@testing-library/jest-dom` 7.0 | all 49 matchers, vitest + jest entries |
| `@ctrl/dom/vitest-environment` | [packages/vitest-environment](packages/vitest-environment) | Vitest's jsdom environment | |
| `@ctrl/dom/register` | [packages/register](packages/register) | `@happy-dom/global-registrator` | DOM globals for `node --test` and `bun test` |
| `jest-environment-ctrl-dom` | [packages/jest-environment](packages/jest-environment) | jest-environment-jsdom | |

Inside the repository each directory under `packages/` is a workspace package named after it
(`packages/react` is `@rtd/react`, the environments are `vitest-environment-rtd` and
`jest-environment-rtd`), and code imports those names. `pnpm build` renames them to the
published ones, and no `@rtd/` name ships.

## CI and releases

- `CI` (every push and pull request): typecheck, lint, tests, build, and the packed-tarball
  checks (`pnpm test:pack`).
- `Benchmarks` (pull requests touching packages or bench): `bench/compare.ts` on clean checkouts
  of the PR's base and head; fails on a >10% regression in median time or allocation.
- `Downstream` (run by hand): the seven projects' own suites in
  [docs/compatibility.md](docs/compatibility.md#real-world-test-suites), compared with the pass
  counts and failing tests in `downstream/baseline.json`. Fixes show up as "fixed": update the
  baseline (`node downstream/track.ts --update`, then `--readme`) in the PR that makes them.
- `Release` (every push to main, or by hand for one package or a dry run): semantic-release
  with one version line per published package (`tools/release`). A package is released only when
  conventional commits since its last tag (`@ctrl/dom@1.2.0`, `jest-environment-ctrl-dom@1.0.3`)
  touch the files it is built from: `feat` → minor; `fix`, `perf`, `deps` → patch; a breaking
  change → major; `ref`, `docs`, `test`, `chore`… release nothing. Publishing is npm trusted
  publishing (OIDC, with provenance): each package's trusted publisher on npmjs.com names this
  repository and `release.yml`. npm only allows that once a package exists, so each package's
  first version is published by hand.
