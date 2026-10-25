# React Hook Form downstream triage

Suite: `react-hook-form/react-hook-form` @ `ed9345ab9c199cb37afbb6ef73970cf697f4585d`
(2026-10-23), Jest `Web` project (124 files, 1,729 tests, `--preset all`). Jest 30.4.2,
jest-fixed-jsdom 0.0.10 on jest-environment-jsdom 30 (jsdom 26.1.0), React 19.2.x, stock
`@testing-library/react` 16.3.2 / `jest-dom` 6.9.1. Run: 2026-10-23, `--workers 3 --rounds 3`
(modes interleaved, medians, wall range in parentheses), report `results/2026-10-23-all.md`.

| mode | passed | failed | skipped | wall | peak RSS |
| --- | --: | --: | --: | --: | --: |
| jsdom | 1729 | 0 | 0 | 8.6s (8.5–9.2) | 552 MiB |
| ctrl-dom | 1728 | 1 | 0 | 6.0s (5.3–6.0) | 526 MiB |
| ctrl-dom-full | 1728 | 1 | 0 | 3.5s (3.4–3.9) | 430 MiB |

Both remaining differences are intermittent and come from documented deviations (host classes,
React's scheduler on `setImmediate`); they are listed as `flaky` for the ctrl-dom modes in
`downstream/baseline.json`. Started at ctrl-dom 2 / ctrl-dom-full 3 failing.

| # | tests | modes | cause | owner | status |
| --: | --: | --- | --- | --- | --- |
| 1 | 2 | both | `'value' in el.attributes` was false: NamedNodeMap had no named properties | dom-core | **fixed** (repro `repros/namednodemap-named-properties.test.ts`) |
| 2 | 1 | both, intermittent | `File` is Node's: deep equality sees its `lastModified` | dom-core (host delegates, decision) | deviation |
| 3 | 1 | both, intermittent | React's scheduler runs on `setImmediate` under @ctrl/dom, `setTimeout` under jest-environment-jsdom | jest-environment (decision) | deviation |

## 1. NamedNodeMap named properties (fixed): 2 tests

- Tests: `src/__tests__/useForm/register.test.tsx` › "register disabled not throw errors with
  disabled input" and "work correctly with toggle disabled attribute and validation".
- Cause: react-hook-form's `getCheckboxValue` (src/logic) returns the checkbox's `value` only when
  `'value' in option.attributes`, otherwise `true`. That is a WebIDL named property on
  NamedNodeMap ([LegacyUnenumerableNamedProperties],
  https://dom.spec.whatwg.org/#interface-namednodemap). @ctrl/dom left them out (documented
  Proxy-free collections deviation), so a checked `<input type=checkbox value="test">` submitted
  `true`: validation never cleared and the form JSON was wrong. A real-app bug, not a test quirk.
- Fix: `packages/dom/src/collections/NamedNodeMap.ts`: each NamedNodeMap is a Proxy with the named
  getter, `in`, own-property descriptors (unenumerable) and own keys; indices stay prototype
  accessors. NamedNodeMap is off every hot path (React and our packages read AttrRecords /
  `getAttribute`); walking `attributes` costs ~520 ns for 3 attributes vs ~160 ns before and ~650 ns
  on jsdom. Tests: `packages/dom/test/collections/collections.test.ts` ("named properties: …"),
  the 5 WPT `attributes-namednodemap.html` subtests that were expected failures now pass,
  docs/deviations.md updated.

## 2. Host `File` in deep equality (deviation, intermittent): 1 test

- Test: `src/__tests__/useForm/getValues.test.tsx` › "getValues return defaultValues deep merge
  with form values" (failed in 3/3 rounds in each ctrl-dom mode, passed in 2 of 6 earlier ctrl-dom runs;
  never failed on jsdom).
- Cause: the test builds `new File([''], 'filename')` during render and again in the expectation
  and compares with `toEqual`. A File's `lastModified` defaults to the creation time
  (https://w3c.github.io/FileAPI/#dom-file-lastmodified), so the two differ whenever a millisecond
  boundary falls between them. On jsdom the window's `File` is jsdom's wrapper, whose state lives
  behind a non-enumerable impl symbol, so `toEqual` sees no own properties and always passes (even
  jest-fixed-jsdom keeps jsdom's File; it only swaps Blob/fetch/streams). @ctrl/dom exposes Node's
  `File` (window `HOST_DELEGATES`, packages/dom/src/window/Window.ts), whose state (`lastModified`
  included) is in own enumerable symbol properties, which Jest's equality compares.
- Status: deviation (Node's File/Blob work with Node's fetch, FormData and streams). The upstream
  test itself depends on timing.

## 3. React's scheduler on `setImmediate` (deviation, intermittent): 1 test

- Test: `src/__tests__/useFieldArray.test.tsx` › "not corrupt parent state when remove is called
  with values prop" (ctrl-dom: failed 2/6 and 2/8 isolated runs, 1/3 full-suite rounds; ctrl-dom-full
  1/3 rounds; jsdom: 0 failures in 15+ runs).
- Cause: the test is a regression test for an ordering race between a `values` prop update and
  `remove()`; the final state sometimes keeps a trailing empty row (`[{ name: 'Bob', … }, {}]`).
  jest-environment-jsdom has neither `setImmediate` nor `MessageChannel`, so React's scheduler
  falls back to `setTimeout(0)`; @ctrl/dom-jest-environment keeps Node's `setImmediate`
  (docs/deviations.md, "Window": React's scheduler already prefers it under Node), which runs
  React's work earlier relative to `waitFor`'s polling and the test's effects. Evidence: with
  `setImmediate` and `MessageChannel` deleted from the ctrl-dom global it passed 8/8. Not time skipping:
  `CTRL_DOM_TIME_SKIP=0` still failed 2/8.
- Status: deviation; a browser's scheduler runs on `MessageChannel`, which orders like
  `setImmediate`, so this is a latent race in the code under test.

## Notes

- jest-fixed-jsdom puts Node's `fetch`/`Request`/`Response`/`Blob`/streams on the jsdom global;
  the ctrl-dom modes use @ctrl/dom-jest-environment's equivalent, `testEnvironmentOptions.nodeFetch: true`.
- `Server` project (`*.server.test.tsx`, testEnvironment node) is not run: it never touches a DOM.
