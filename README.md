# react-testing-dom

The React Testing Library stack — `@testing-library/react`, `@testing-library/dom`,
`@testing-library/user-event`, `@testing-library/jest-dom`, `aria-query`,
`dom-accessibility-api` — reimplemented down to the DOM itself (replacing jsdom / happy-dom)
as one cohesive codebase built for one job: testing React components fast.

Everything is drop-in: same exports, same behavior, same error messages and `prettyDOM` output.
You can swap only the environment (stock Testing Library on `@rtd/dom`) or the whole stack.

## Use it

Vitest:

```ts
// vitest.config.ts
export default defineConfig({
  test: {
    environment: "rtd", // vitest-environment-rtd
  },
});
```

Whole stack (optional), with aliases so existing imports keep working:

```ts
resolve: {
  alias: {
    "@testing-library/react": "@rtd/react",
    "@testing-library/dom": "@rtd/testing-library",
    "@testing-library/user-event": "@rtd/user-event",
    "@testing-library/jest-dom": "@rtd/jest-dom",
  },
},
```

Jest: `testEnvironment: "jest-environment-rtd"` with the package's `jest-preset.cjs` (maps
`@rtd/dom` so test modules share the environment's instance).

## Packages

| Package | Replaces | |
| --- | --- | --- |
| `@rtd/dom` | jsdom / happy-dom | nodes, WHATWG HTML parser, selectors, CSS cascade + CSSOM, events, forms, window |
| `@rtd/aria` | aria-query + dom-accessibility-api | roles, accessible name/description, states, hidden |
| `@rtd/testing-library` | `@testing-library/dom` 10.4 | queries, `waitFor`, `fireEvent`, `prettyDOM`, suggestions |
| `@rtd/react` | `@testing-library/react` 16.3 | `render`, `renderHook`, `act`, cleanup |
| `@rtd/user-event` | `@testing-library/user-event` 14.6 | pointer/keyboard simulation |
| `@rtd/jest-dom` | `@testing-library/jest-dom` 7.0 | all 49 matchers, vitest + jest entries |
| `vitest-environment-rtd` / `jest-environment-rtd` | jsdom environments | |
| `@rtd/native` | — | scriptc-compiled accelerators and the scriptc compatibility gate |

## Compatibility

- Upstream test suites ported and passing on `@rtd/dom`: Testing Library DOM (1163), RTL (248),
  jest-dom (313), user-event (653 + 4 skipped), dom-accessibility-api + WPT accname (159/159).
- Spec suites: html5lib tokenizer 7050/7050 and tree construction 1793/1793; WPT selectors
  1319/1319; ~54k WPT dom subtests; WPT reflection (~47k checks); CSS tokenizer 288/288.
- Differential forms suite against jsdom (`tests/compat`): 701/701, with spec-pinned
  corrections where jsdom is wrong; React form scenarios pass in all three modes.
- Stock jest-dom on `@rtd/dom` (environment swap only): every non-skipped test passes.
- Real-world corpus: the unmodified Base UI test suite (`downstream/base-ui`, mui/base-ui
  `205831c`), with only the environment swapped (`rtd-dom`) or the whole Testing Library stack
  aliased to ours (`rtd-full`):

  | mode | passed / 9,199 | wall | peak RSS |
  | --- | ---: | ---: | ---: |
  | jsdom (upstream baseline) | 9,199 | 81.5 s | 506 MiB |
  | rtd-dom | 9,197 | 58.8 s | 394 MiB |
  | rtd-full | 9,197 | 54.3 s | 390 MiB |

  The 2 remaining failures are an upstream timing race that only appears when rendering takes
  under 1 ms (see `downstream/base-ui/TRIAGE.md`); everything else matches jsdom.

Intentional differences from the specs are listed in [docs/deviations.md](docs/deviations.md).

## Performance

Medians of fresh processes, Apple Silicon, vs jsdom 30 and happy-dom 21 (full tables in
`bench/results/` and each package's `bench/`):

| Workload | jsdom | happy-dom | rtd (full stack) |
| --- | ---: | ---: | ---: |
| Render form + 10 `getByRole` | 9.95 ms | 3.44 ms | **0.47 ms** |
| Fill 10 fields with user-event + submit | 163 ms | 131 ms | **30 ms** |
| 100-field form, mount + 3 rerenders + queries | 108 ms | 59 ms | **6.5 ms** |
| `getByRole('button', {name})`, 1000 elements | 10.6 ms | 0.69 ms | **0.028 ms** |
| `user.type(input, 'hello world')` | 21.2 ms | 22.7 ms | **0.49 ms** |
| `body.innerHTML` = 250-row table | 8.1 ms | 6.0 ms | **0.74 ms** |
| Build 10k elements | 44 ms | 56 ms | **3.2 ms** |
| Heap after GC (form workloads) | ~50 MB | ~45–110 MB | **~20 MB** |
| Import + window + globals (bundled) | 296 ms | 146 ms | **41 ms** |

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
pnpm bench                # vs jsdom / happy-dom
pnpm bench:suite          # 100-file Vitest suite under each environment
pnpm downstream:base-ui --preset all   # Base UI's own tests in jsdom / rtd-dom / rtd-full
pnpm scriptc:check
```

Read [CLAUDE.md](CLAUDE.md) for conventions (spec links in tests, performance rules).
