# TanStack Query downstream triage

Suite: `TanStack/query` @ `9e4253766f8015d1372bcd515f50103fd067a42d` (2026-10-23), the Vitest
projects of `packages/react-query`, `packages/react-query-persist-client` and
`packages/react-query-devtools` (26 files, 477 tests, `--preset all`). Vitest 4.1.11, jsdom 27.4.0,
React 19.2.4, stock `@testing-library/react` 16.3.2 / `dom` 10.4.1 / `jest-dom` 6.9.1 and
`@testing-library/react-render-stream` 2.0.2. Run: 2026-10-23, `--workers 3 --rounds 3` (modes
interleaved, medians, wall range in parentheses), report `results/2026-10-23-all.md`. No test
changed status between rounds.

| mode | passed | failed | skipped | wall | peak RSS |
| --- | --: | --: | --: | --: | --: |
| jsdom | 477 | 0 | 0 | 9.6s (9.0–14.2) | 243 MiB |
| ctrl-dom | 477 | 0 | 0 | 7.9s (7.6–10.9) | 239 MiB |
| ctrl-dom-full | 477 | 0 | 0 | 9.1s (8.6–10.5) | 300 MiB |

Shared machine (other agents running suites): wall moves by seconds run to run. ctrl-dom-full aliases
our Testing Library *sources* (`packages/*/src`), so each worker also pays Vite's transform of
them, which is where its extra wall and RSS go (same as the Radix runner).

Nothing differs from jsdom. What this suite covers that the component-library suites do not:
query/mutation state machines driven by `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync`,
React Suspense and transitions, error boundaries, `notifyManager` batching wrapped in `act`,
hydration/SSR helpers, persisters (async restore on fake timers), and the devtools panel mounting
into a `shadowDOMTarget`.

## Found while bringing it up

### Harness: a second React through react-dom (fixed in run.ts)

The first ctrl-dom-full run failed 48 tests in `react-query-persist-client` and `react-query-devtools`
("An update to Root inside a test was not wrapped in act(...)", empty `<body>`). Those packages
depend on `react` but not on `react-dom`, so Vite's `resolve.dedupe` found no react-dom from their
roots and our `@testing-library/react` source's `import "react-dom/client"` fell through to this
workspace's react-dom 19.3.1, whose natively loaded `require("react")` is a second React. The
existing guard only looked at `react` records. run.ts now pins `react-dom` in ctrl-dom-full to the
copy `react-query` resolves, and the guard also fails the run when react-dom resolves to more than
one copy or outside the checkout. Not a @ctrl/dom bug.

## Notes

- Type tests (`*.test-d.tsx`, `typecheck.enabled` upstream) and CI coverage are off in every mode:
  tsc never touches the DOM.
- `@testing-library/react-render-stream` (used by `useInfiniteQuery.test.tsx`) imports
  `@testing-library/react`/`dom` itself and jsdom 25 for its DOM snapshots; ctrl-dom-full inlines it so
  its Testing Library imports reach ours (the stock-import guard ignores the add-on itself).
