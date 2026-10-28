# Sentry downstream triage

Pinned getsentry/sentry `503ad2e4` (2026-10-23), Jest 30.5.1, jsdom 30.1.1, React 19.3.0,
RTL 16.3.2 / DTL 10.4.1 / user-event 14.6.7 / jest-dom 7.0.1. Repros live in `repros/` and run with
`pnpm vitest run --config downstream/vitest.config.ts sentry/` (each passes on jsdom and fails on
@ctrl/dom until fixed). Counts are failing tests that pass on jsdom, from the 2026-10-23 runs of
`components` (653 files, 6,432 tests) and `views` (9 areas, 1,818 tests) on the tree at that time
(`results/2026-10-23-{components,views}{,-triage}.md`); `--triage` runs apply the workarounds
marked "workaround" to see what is behind them.

Full suite with `--triage` (`results/2026-10-23-all-triage.md`): ctrl-dom 177 failures, ctrl-dom-full
404 (133 of them ctrl-dom-full-only, cluster 3); the as-is full-suite run hit a mid-edit @ctrl/dom and
was discarded.

Sorted by failing tests (components + views, the mode where they first appear):

| # | cluster | tests | mode | owner | repro |
| --: | --- | --: | --- | --- | --- |
| 1 | Interface isolation deletes lazily installed collection index getters: `el.children[0]`, `Array.from(el.children)` are `undefined` in every test file after the first in a worker | ~470 (256 + ~215) | ctrl-dom | jest-environment (`window/isolation.ts`) + dom-core (`collections/indexed.ts`) | `jest-environment-isolation-drops-index-getters.test.ts` |
| 2 | `navigator.clipboard` is a getter-only accessor: `Object.assign(navigator, {clipboard})` throws in strict mode (29 spec files use the idiom) | 133 (108 + 25) | ctrl-dom | window | `window-navigator-clipboard-assignable.test.ts` |
| 3 | @ctrl/dom/testing-library ignores a user-replaced `window.getComputedStyle` (Sentry: `el => el.style`), so elements hidden by Emotion stylesheet rules (`display: none` overflow tabs, `visibility: hidden` until measured, react-select inputs, collapsed breadcrumbs) are excluded from ByRole | ~91 (62 + 29) | ctrl-dom-full only | testing-library (+ aria / jest-dom equivalents) | `testing-library-honors-replaced-getcomputedstyle.test.ts` |
| 4 | `Node.prototype` has no `nodeName` accessor (TS `abstract get`): DOMPurify's `lookupGetter(Node.prototype, 'nodeName')` returns null → "String.prototype.toLowerCase called on null or undefined" in every sanitize (markdown, autofix, seer embeds) | 59 (56 + 3); **137 in the full suite** (dashboards, discover, explore, trustedTypes, ...) | ctrl-dom | dom-core | `dom-core-node-nodename-accessor-on-node-prototype.test.ts` |
| 5 | `navigator.platform` follows the host OS ("MacIntel" on macOS, jsdom: ""): React Aria `isMac()` turns every Ctrl shortcut / ctrl-click test into its Meta variant on a Mac, while Linux CI passes | ~12 | ctrl-dom | window | `window-navigator-platform-host-os.test.ts` |
| 6 | Window methods taken from an iframe and bound to the page global (rrweb `getImplementation`: `contentWindow.requestAnimationFrame.bind(window)`) crash: the ctrl-dom global is the host global, not a Window | 6 (3 + 3); 6 in the full suite | ctrl-dom | window | `window-methods-called-on-host-global.test.ts` |
| 7 | Native `fetch`/`Request`/`Response` exposed on the window (jsdom has none): jest-fetch-mock 4 uses them instead of cross-fetch, and its string routes never match relative URLs (`request.url` is absolute) | 5 | ctrl-dom | window (+ jest-environment option) | `window-fetch-primitives-exposed.test.ts` |
| 8 | `Element.getAnimations` exists (always `[]`), so React Aria's `useDisclosure` takes its animated path and sets `hidden="until-found"` a microtask later; synchronous `not.toBeVisible()` after `rerender` fails | 2–3 | ctrl-dom | html-elements (+ css) | `html-elements-getanimations-feature-probe.test.ts` |
| 9 | Tests assert jsdom's "Not implemented: navigation" console.error (DropdownMenu meta-key link, feature-flag override reload). @ctrl/dom never navigates | 2 | ctrl-dom | window | `html-elements-link-navigation-jsdom-diagnostic.test.ts`; **fixed (aeb8f19)**: the jsdom profiles report jsdom's "Not implemented" errors where jsdom does (docs/deviations.md), still without navigating |
| 10 | `element.style` keeps author color text (`#ff8700`, `currentColor`) instead of serializing the specified value (`rgb(255, 135, 0)`, `currentcolor`), also inside `color-mix()` | 1 | ctrl-dom | css | `css-inline-color-serialization.test.ts` |
| 11 | Unattributed: `conversationsQuery` embed renders its LoadingError (same API request is made on both engines; the block fails while rendering the response) | 3 | ctrl-dom | ? (needs a closer look) | — |
| 12 | Unattributed single: views `userDropdown` "shows admin link" (menuitemradio missing) | 1 | ctrl-dom | ? | — |
| 13 | views `passwordReset` "preserves the form when password validation fails": the success text's framer-motion fade-in stays at `opacity: 0`. An earlier test's frame, requested through the `requestAnimationFrame` framer-motion captured at import, ran on Jest's fake clock and was lost at `jest.useRealTimers()`; the frame loop, waiting for it, never requested another (jsdom's frames run on its own realm's timers, which the fakes do not replace) | 1 | ctrl-dom | window | **fixed (2026-10-28)**: frames on another realm's global run on the environment's clock (docs/deviations.md); packages/jest-environment/test/environment.test.ts |
| 14 | views `passwordReset` "counts down before navigating to sign-in": "An update to PasswordReset inside a test was not wrapped in act(...)". Under fake timers with `advanceTimers`, @ctrl/dom/user-event awaited upstream's `wait()` inside an async helper, a microtask turn more per wait, so the reset mutation's `onSuccess` landed after the call's `asyncWrapper` had restored the act environment | 1 | ctrl-dom-full only | user-event | **fixed (2026-10-28)**: it awaits the very promise upstream does; packages/user-event/test/react/fake-timers-settle.test.tsx (differential against 14.6.8) |
| 15 | views `automations/detail` "displays connected projects and monitors": `findByText('my-project')` sees the Connected Projects cell and the monitor row in one commit (jsdom commits the projects table first). With several timers due, the virtual clock runs one per turn and continues through `setImmediate`, so a React render queued before them runs between TanStack Query's `setTimeout(0)` notification flushes and shows both queries' data; Node runs every due timer before the check phase. Continuing through a MessageChannel (poll phase) instead passes it. Not DOM behavior (the HTML event loop orders timer and message tasks as it likes), so left as is | 1 | ctrl-dom, when it is a worker's first file (time skipping on or off) | window (clock) | — |

Not failures, but blocking a fair comparison:

| cluster | effect | owner | repro |
| --- | --- | --- | --- |
| **Window timers survive `window.close()`**: `window.setTimeout`/`setInterval` are the host's, so long timers left by app code (TanStack Query GC timers, debounces, polling intervals) keep each finished test file's vm context and module graph alive | worker heap grows **7.2 MiB per test file** after a forced GC (jsdom 0.26 MiB); ~1 GiB retained per worker after ~120 files; with timers cleared (workaround) ctrl-dom grows 0.17 MiB/file and peak worker RSS drops from 1,695 MiB to 704 MiB (jsdom 1,084 MiB). Without a fix Sentry would need `workerIdleMemoryLimit` on ctrl-dom | window (timers) + jest-environment (teardown) | `window-timers-survive-close-leak.test.ts` |
| **Worker crashes after teardown** (`ReferenceError: window is not defined` from React's scheduler / TanStack notifyManager after uninstall) | 125+ worker deaths per components run, 21 files lost, ~130 workers spawned instead of 6 | jest-environment | **fixed in `cf0a3f9`** during this run (teardown keeps the closed window's globals, like jsdom) |

## Performance finding (jest-environment)

`@ctrl/dom-jest-environment` inherits jest-environment-node's contextified vm context around Jest's
GlobalProxy; jsdom 30 uses `vm.constants.DONT_CONTEXTIFY`. The `ctrl-dom-direct` experiment
(`harness/env-ctrl-dom.cjs`, swaps `vm.createContext` for the duration of the NodeEnvironment
constructor) passes the same tests and cuts components CPU from ~348 s to ~315 s (jsdom ~375 s).
Proposed: build the environment on a DONT_CONTEXTIFY context (as `~/gh/vibedom/downstream/sentry`
found for React element creation).

## Workarounds (`run.ts --triage`)

Applied only to ctrl-dom modes, in `harness/env-ctrl-dom.cjs`; reports are labelled `-triage`:

- `navigator.platform = ""` (cluster 5) via `testEnvironmentOptions.platform`;
- `navigator.clipboard` made an own writable data property per window (cluster 2);
- every lazily built index-getter table instantiated once, then the interface baseline taken
  (cluster 1);
- timers created through the file's global tracked and cleared at teardown (timer leak).

## ctrl-dom-nohacks (experiment) — what Sentry's jsdom hacks are hiding

Removing upstream's `getComputedStyle = el => el.style`, Floating UI mock, `matchMedia` stub and
`IntersectionObserver` class on top of ctrl-dom-full (triage): components +16, views +47 failures.

| signature | tests | why |
| --- | --: | --- |
| user-event "Unable to perform pointer interaction as the element has `pointer-events: none`" | 54 (10 + 44) | real cascade: overlays/menus are `pointer-events: none` until their (framer-motion) enter animation or positioning completes; with Sentry's hack user-event never sees author CSS. Test-side assumption, same in a browser. |
| `toHaveStyle()` | 5 | assertions written against inline-style-only `getComputedStyle` |
| `mql.addEventListener is not a function` | 2 | spec-local matchMedia stubs written for upstream's stub shape |

Every other test passes with our real implementations: `matchMedia` and `IntersectionObserver`
stubs are unnecessary on @ctrl/dom, Floating UI runs unmocked without failures, and the real
cascade costs no measurable time (see README "Status"). `getComputedStyle = el => el.style` is
still needed **for test compatibility** (not speed) by the ~60 tests above.

## Minor gaps seen while triaging (no Sentry test depends on them)

- `Document.getElementsByName` is not implemented (dom-core / html-elements).
- `GlobalModal does not close modal when pressing escape to close a select dropdown` is flaky on
  jsdom too (failed once in four jsdom runs). On @ctrl/dom it always passes alone and fails in
  about half the runs of the whole file (Escape reaches the modal instead of the open select), so
  the baseline lists it as flaky in every mode.
