# React Router downstream triage

Suite: `remix-run/react-router` @ `bb7c1f021363e96745dd3cfc5d2431e9b80ffe61` (2026-10-23), the
Jest project of `packages/react-router` (119 files, 2,584 tests of which 15 skipped in every mode,
`--preset all`; 3 files excluded in every mode, see below). Jest 30.4 in native ESM mode
(`--experimental-vm-modules`, babel-jest), jest-environment-jsdom 30 (jsdom 26.1.0), React 19,
stock `@testing-library/react` / `user-event` / `jest-dom`. Run: 2026-10-23, `--workers 3
--rounds 3` (modes interleaved, medians, wall range in parentheses), report
`results/2026-10-23-all.md`.

| mode | passed | failed | skipped | wall | peak RSS |
| --- | --: | --: | --: | --: | --: |
| jsdom | 2569 | 0 | 15 | 24.9s (24.2–26.0) | 1039 MiB |
| ctrl-dom | 2565 | 4 | 15 | 16.6s (16.5–19.7) | 1026 MiB |
| ctrl-dom-full | 2565 | 4 | 15 | 13.7s (13.3–15.7) | 1008 MiB |

Started at ctrl-dom 6 / ctrl-dom-full 10 failing plus 10 files (273 tests) failing to load in ctrl-dom-full.

| # | tests | modes | cause | owner | status |
| --: | --: | --- | --- | --- | --- |
| 1 | 2 | both | image button submitted `name.x=0&name.y=0` instead of the click's coordinate | html-forms | **fixed** (repro `repros/image-button-selected-coordinate.test.ts`) |
| 2 | 4 | both | `AbortSignal` is Node's: deep equality of a `Request` sees its abort listeners | dom-core (host delegates, decision) | deviation |
| 3 | 1 | ctrl-dom-full, intermittent | `defer` "freezes the UI for aborted deferreds" waits on a real 50 ms `setTimeout` | upstream timing | flaky |
| 4 | 4 + 10 files | ctrl-dom-full | harness: `.cjs` targets for ESM imports; workspace shims throw in `@jest-environment node` files | downstream runner | fixed in run.ts |

## 1. Image button selected coordinate (fixed): 2 tests

- Tests: `__tests__/dom/data-browser-router-test.tsx` › "Router: <DataBrowserRouter>" and
  "<DataHashRouter>" › "useSubmit/Form FormData › includes the correct submitter value(s) in tree
  order".
- Symptom: `fireEvent.click(imageInput, { clientX: 1, clientY: 2 })` submitted
  `tasks.x=0&tasks.y=0`; expected `tasks.x=1&tasks.y=2`.
- Cause: an image button's activation behavior selects the coordinate the user clicked
  (https://html.spec.whatwg.org/#image-button-state-(type=image)), and constructing the entry list
  appends `name.x`/`name.y` from it (https://html.spec.whatwg.org/#constructing-the-form-data-set
  step 5.2). jsdom uses the click's `offsetX`/`offsetY` (which mirror clientX/Y without layout).
  @ctrl/dom always appended 0,0 (and returned "0,0" for `method=dialog`).
- Fix: `HTMLInputElement._activationBehavior` records the activating MouseEvent's
  offsetX/offsetY in a side table (`selectedCoordinates`, form-submission.ts: image buttons are
  rare, so inputs carry no extra field); the entry list and the dialog return value read it.
  Tests: `packages/dom/test/html/forms/form.test.ts`.

## 2. Host `AbortSignal` in deep equality (deviation): 4 tests

- Tests: `__tests__/router/router-test.ts` › "a router › data loading (new) › sends proper
  arguments to loaders"; `__tests__/router/fetchers-test.ts` › "fetchers › fetcher states ›
  loader fetch", "loader submission fetch", "fetcher removal › uses current page matches and URL
  when reloading routes after submissions".
- Symptom: `expect(loaderSpy).toHaveBeenCalledWith({ request: new Request(...), … })` fails on the
  Request's signal: received `Symbol(kEvents): Map { "abort" => … }`, expected `undefined`.
- Cause: upstream's setup installs undici's `Request`; undici gives each Request its own
  `new AbortController()` from the global it runs in (the test realm) and the router adds
  `abort` listeners to `request.signal`. Under jest-environment-jsdom that controller is jsdom's,
  whose state sits behind a non-enumerable impl symbol, so Jest's equality sees no own properties
  on either side. @ctrl/dom exposes Node's `AbortController`/`AbortSignal` (docs/deviations.md,
  "Window": they stay Node's so they work with Node APIs), which keep listeners in own enumerable
  symbol properties, so the listener lists are compared.
- Status: deviation. Same family as react-hook-form's host `File` (its TRIAGE.md, cluster 2):
  host classes carry own symbol-keyed state that `toEqual` / `toHaveBeenCalledWith` compare.

## 3. Real-timer race (flaky): 1 test

- Test: `__tests__/data-memory-router-test.tsx` › "createMemoryRouter › defer › freezes the UI
  for aborted deferreds": failed in 1 of 3 ctrl-dom-full full-suite rounds; passed 6/6 isolated runs in
  every mode (and every jsdom run). It waits on `await new Promise((r) => setTimeout(r, 50))`
  between steps, so it depends on scheduling under load. Listed as `flaky` for ctrl-dom-full in
  `downstream/baseline.json`.

## 4. Harness issues found on the way (fixed in run.ts)

- **ESM imports of `.cjs` bundles.** Mapping `@testing-library/user-event` to our `.cjs` bundle
  (as the CommonJS Jest runners do) made `import user from '@testing-library/user-event'` return
  the whole `module.exports` (`user.click is not a function`, 4 tests), because ESM default-imports
  of CommonJS ignore `exports.default`. Published `@ctrl/dom` resolves the ESM bundle for
  `import`; `resolver.cjs` now does the same (ESM bundle for the "import" condition, `.cjs` for
  `require`).
- **`@jest-environment node` files.** 10 files (server runtime, SSR, `data-router-no-dom`,
  273 tests) opt out of the DOM with a docblock but still load `@testing-library/jest-dom` from
  `setupFilesAfterEnv`. Our jest-dom imports `@ctrl/dom/internal`, and @ctrl/dom-jest-environment's
  workspace shims throw without the environment. The runner now maps `@ctrl/dom(/internal)` to the
  published package's bridges (`release/ctrl-dom/dist/bridge`), which return the environment's DOM
  when there is one and load it otherwise, so these files behave as with stock jest-dom (and with
  published `@ctrl/dom`). The other Jest runners still use the shims: a `@jest-environment node`
  file there would fail to load the same way.

## Excluded files (every mode)

`__tests__/rsc/server-test.ts`, `__tests__/rsc/server-function-redirect-test.ts`,
`__tests__/dom/dom-export-test.tsx`: they import the package's own build output
(`react-router/dom`, `react-router/internal/react-server-client` resolve to `dist/`), which the
runner does not build. They fail to load on jsdom too.
