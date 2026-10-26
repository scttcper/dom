# Contributing

[CLAUDE.md](CLAUDE.md) has the conventions (spec links in tests, performance rules) and
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) how the pieces fit together.

## Commands

```bash
pnpm install
pnpm test                 # all packages + compat suites
pnpm typecheck
pnpm lint                 # oxlint (.oxlintrc.json)
pnpm fmt                  # oxfmt (.oxfmtrc.json); CI runs pnpm fmt:check
pnpm build                # dist/: ESM (+ CJS) bundles and .d.ts per package
pnpm test:pack            # pack, install into a fresh project, run Vitest/Jest/tsc against the tarballs
pnpm bench                # vs jsdom / happy-dom
pnpm bench:suite          # 100-file Vitest suite under each environment
pnpm bench:compare --base ../base --head .   # regression check between two clean checkouts
pnpm compare --readme     # the README's performance table (comparison/)
pnpm downstream:base-ui --preset all   # Base UI's own tests in jsdom / ctrl-dom / ctrl-dom-full
node downstream/track.ts  # compare the latest downstream runs with downstream/baseline.json
pnpm docs:compat          # regenerate docs/deviations.md's compat profile table
pnpm docs:spec            # regenerate docs/spec-coverage.md
node packages/sentry-tests/scripts/relay-check.ts   # @ctrl/sentry-tests' envelopes through Relay (Docker)
```

## Packages

Published, assembled by [scripts/release.ts](scripts/release.ts) from the workspace builds. Vitest
needs no package of its own: the `ctrlDom()` plugin loads the environment by path.

| Package | Replaces |
| --- | --- |
| `@ctrl/dom` | jsdom / happy-dom, plus the Testing Library stack under subpaths |
| `@ctrl/dom-jest-environment` | jest-environment-jsdom (`preset: "@ctrl/dom"` uses it) |

What each import is and where its source lives:

| Import | Source | Replaces | |
| --- | --- | --- | --- |
| `@ctrl/dom` | [packages/dom](packages/dom) | jsdom / happy-dom | nodes, WHATWG HTML parser, selectors, CSS cascade + CSSOM, events, forms, window |
| `@ctrl/dom/aria` | [packages/aria](packages/aria) | aria-query + dom-accessibility-api | roles, accessible name/description, states, hidden |
| `@ctrl/dom/testing-library` | [packages/testing-library](packages/testing-library) | `@testing-library/dom` 10.4 | queries, `waitFor`, `fireEvent`, `prettyDOM`, suggestions |
| `@ctrl/dom/react` | [packages/react](packages/react) | `@testing-library/react` 16.3 | `render`, `renderHook`, `act`, cleanup |
| `@ctrl/dom/user-event` | [packages/user-event](packages/user-event) | `@testing-library/user-event` 14.6 | pointer/keyboard simulation |
| `@ctrl/dom/jest-dom` | [packages/jest-dom](packages/jest-dom) | `@testing-library/jest-dom` 7.0 | all 49 matchers, vitest + jest entries |
| `@ctrl/dom/vitest-environment` | [packages/vitest-environment](packages/vitest-environment) | Vitest's jsdom environment | also the `ctrlDom()` plugin, `@ctrl/dom/vitest` |
| `ctrl-dom` (bin) | [packages/cli](packages/cli) | | `ctrl-dom debug <test file>`: one test run with an agent-readable report |
| `@ctrl/dom/register` | [packages/register](packages/register) | `@happy-dom/global-registrator` | DOM globals for `node --test` and `bun test` |
| `@ctrl/dom-jest-environment` | [packages/jest-environment](packages/jest-environment) | jest-environment-jsdom | |
| `@ctrl/sentry-tests` | [packages/sentry-tests](packages/sentry-tests) | @sentry/jest-environment | test runs in Sentry for Vitest and Jest, any DOM: traces, failing and flaky tests |

Inside the repository, code imports the published names. The root `package.json` is `@ctrl/dom`:
its `exports` send each subpath to a member's sources (`@ctrl/dom/react` → `packages/react/src`),
and every package that imports one depends on it with `"@ctrl/dom": "workspace:*"`. @ctrl/dom's
members have no name of their own; `packages/jest-environment` and `packages/sentry-tests` are
`@ctrl/dom-jest-environment` and `@ctrl/sentry-tests`, published as they are. A new subpath goes
in the member's `exports` and the root's. `packages/cli` adds no subpath: its `bin` and the
reporters it passes to the test runners ship in @ctrl/dom's `dist/cli/`.

## CI and releases

- `CI` (every push and pull request): typecheck, lint, format check, tests, build, and the
  packed-tarball checks (`pnpm test:pack`).
- `Benchmarks` (pull requests touching packages or bench): `bench/compare.ts` on clean checkouts
  of the PR's base and head; fails on a >10% regression in median time or allocation.
- `Downstream` (run by hand): the seven projects' own suites in
  [docs/compatibility.md](docs/compatibility.md#real-world-test-suites), compared with the pass
  counts and failing tests in `downstream/baseline.json`. Fixes show up as "fixed": update the
  baseline (`node downstream/track.ts --update`, then `--readme`) in the PR that makes them.
- `Release` (once `CI` passes on a push to main, without running the checks again; or by hand for
  one package or a dry run, which runs `CI` first): semantic-release
  with one version line per published package (`tools/release`). A package is released only when
  conventional commits since its last tag (`@ctrl/dom@1.2.0`, `@ctrl/dom-jest-environment@1.0.3`)
  touch the files it is built from: `feat` → minor; `fix`, `perf`, `deps` → patch; a breaking
  change → major; `ref`, `docs`, `test`, `chore`… release nothing. Publishing is npm trusted
  publishing (OIDC, with provenance): each package's trusted publisher on npmjs.com names this
  repository and `release.yml`. npm only allows that once a package exists, so each package's
  first version is published by hand.
