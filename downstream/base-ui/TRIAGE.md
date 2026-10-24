# Base UI downstream triage

Suite: `mui/base-ui` @ `205831caa12125f8e81f1af02a013239b27d752a`, `@base-ui/react` project, full
suite (`--preset all`, 354 files, 10,777 tests, 1,578 skipped identically in every mode). Run:
2026-10-23, report `results/2026-10-23-all.md`.

| mode | passed | failed | skipped | wall | peak RSS |
| --- | --: | --: | --: | --: | --: |
| jsdom (baseline) | 9199 | 0 | 1578 | 81.5s | 506 MiB |
| rtd-dom | 9197 | 2 | 1578 | 58.8s | 394 MiB |
| rtd-full | 9197 | 2 | 1578 | 54.3s | 390 MiB |

Latest full run: 2026-10-23 (quiet machine), report `results/2026-10-23-all.md`. The first run
(119 failures per rtd mode, 9 clusters below) was fixed by the owning areas; every repro in
`repros/` now passes on both engines (`pnpm vitest run --config downstream/vitest.config.ts`).

## Remaining: upstream timing race (not a DOM bug)

`PopoverRoot.test.tsx` — "… focus management > with focusable elements between the trigger and
the popup > closes and moves focus before the trigger when tabbing backward from the focused
trigger" (detached-trigger variants) fails intermittently on @rtd/dom (≈1 in 3 single-file runs,
stock user-event too) and never on jsdom.

Cause, traced with focus-call stacks: the popup's initial focus is scheduled through Base UI's
test `requestAnimationFrame` shim (`test/setupVitest.ts:47`), i.e. a 0 ms Node `setTimeout`, which
Node fires no earlier than ~1 ms later. `await render()` resolves through React's `act`, which
uses `setImmediate`. If rendering takes under 1 ms of wall time, the `setImmediate` wins, the test
runs `trigger.focus()` first, and the late initial focus then pulls focus into the popup, so the
shift+Tab never reaches the element before the trigger. jsdom renders slowly enough that the timer
always fires inside `render()`. Removing the nested-document focus change does not affect it.

Making @rtd/dom deterministic here would mean making it slower, so it is left as a known
environment-speed race. Upstream fix: wait one timer tick (or for the popup's initial focus)
before `trigger.focus()` in that test.

## Resolved clusters (first full run)


| # | cluster | owner | rtd-dom | rtd-full | repro |
| --: | --- | --- | --: | --: | --- |
| 1 | `NodeFilter` not exposed on window | window | 74 | 74 | `repros/window-nodefilter-global.test.ts` |
| 2 | Assigned `scrollTop`/`scrollLeft` dropped without layout | css | 19 | 13 | `repros/css-scroll-offsets-without-layout.test.ts` |
| 3 | `checkVisibility()` true for `display:none` / `[hidden]` | css | 7 | 7 | `repros/css-checkvisibility-display-none.test.ts` |
| 4 | `img.complete` true for a never-fetched `src` | html-elements | 6 | 6 | `repros/html-elements-img-complete-without-fetch.test.ts` |
| 5 | user-event `yieldBetweenActions` skips the post-action timeout | user-event | 0 | 6 | `repros/user-event-yield-heuristic-skips-timeout.test.ts` |
| 6 | `validationMessage` precedence: custom error must win | html-forms | 4 | 4 | `repros/html-forms-custom-validity-message-precedence.test.ts` |
| 7 | `window.visualViewport` exists (jsdom has none): fixture assumption | window (decision) | 4 | 4 | `repros/window-visualviewport-jsdom-parity.test.ts` |
| 8 | `<iframe>` has no nested browsing context (documented deviation) | html-elements + window (decision) | 3 | 3 | `repros/html-elements-iframe-browsing-context.test.ts` |
| 9 | `TouchEvent` rejects touch-like init objects | events (decision) | 2 | 2 | `repros/events-touchevent-plain-touch-init.test.ts` |

### 1. `NodeFilter` not exposed on window (window): 74 tests

- Symptom: `ReferenceError: NodeFilter is not defined` from
  `internals/useInitialLiveRegionTextMutation.ts` (`document.createTreeWalker(el, NodeFilter.SHOW_TEXT)`).
  It hits every combobox/menu/filter-dropdown popup that mounts a live region. A thrown passive
  effect also explains the one combobox `findByRole('option', { name: '32' })` timeout in the same
  describe block (counted here).
- Cause: `src/index.ts` exports `NodeFilter` (an object with constants). `window/interfaces.ts`
  only exposes exports that are functions or listed in `NAMESPACE_EXPORTS` (`["CSS"]`).
- Fix: add `NodeFilter` to `NAMESPACE_EXPORTS` (it is a legacy callback interface object).
- Spec: https://dom.spec.whatwg.org/#interface-nodefilter, https://webidl.spec.whatwg.org/#legacy-callback-interface-object

### 2. Scroll offsets without layout (css): 19 / 13 tests

- Symptom: scroll-area `[data-scrolling]` never set; drawer "scrolls instead of swiping" /
  "dismisses from a bottom-edge scroll container" fail. Tests use
  `fireEvent.scroll(viewport, { target: { scrollTop: 1 } })` or `el.scrollTop = 40` after mocking
  `scrollHeight`/`clientHeight`. jsdom stores the value. @rtd/dom reads back 0.
- In rtd-full, 2 of the 13 show up as `element.getAnimations is not a function`. The scroll-end
  path in `ScrollAreaViewport.tsx` is reached in a different order. jsdom also lacks
  `getAnimations`, so that error is a side effect, not a separate cluster. In rtd-dom, 8 of the 19
  show up as "Found multiple elements by [data-testid=viewport]" after the first failure in a file.
- Fix: keep assigned offsets (clamped at 0) when there is no box, as jsdom does, and record it in
  `docs/deviations.md`. `fireEvent.scroll({ target: { scrollTop } })` is a very common Testing
  Library idiom.
- Spec: https://drafts.csswg.org/cssom-view/#dom-element-scrolltop

### 3. `checkVisibility()` on hidden elements (css): 7 tests

- Symptom: roving tabindex / list navigation / typeahead land on `hidden` or `display:none`
  items (TabsList "hidden successor", CompositeRoot "cannot hold the tab stop", useListNavigation
  and useTypeahead "hidden" tests, listIndex). Base UI's `isElementVisible` prefers
  `element.checkVisibility()` when it exists (`internals/composite/listIndex.ts:566`). jsdom has no
  `checkVisibility`, so the baseline uses `getComputedStyle`. @rtd/dom's `checkVisibility()` returns
  `true` even though `getComputedStyle(el).display === "none"`.
- Spec: https://drafts.csswg.org/cssom-view/#dom-element-checkvisibility (step 1: no box -> false)

### 4. `img.complete` for never-fetched images (html-elements): 6 tests

- Symptom: Avatar.Image `keepMounted` tests expect the status sequence `['loading', ...]` but get
  `['error', ...]` / no `data-loading`. Base UI derives the initial status from `img.complete`.
- Cause: the deviation "`<img>` never fetches: `complete` is true" (docs/deviations.md). jsdom
  reports `false` (the request never completes), and tests are written against that.
- Fix: report `complete === false` for an `<img>` with a non-empty `src` that never loads (still
  no events). This also matches the spec better: the request is neither "completely available" nor
  "broken".
- Spec: https://html.spec.whatwg.org/#dom-img-complete

### 5. user-event yield heuristic (user-event): 6 tests, rtd-full only

- Symptom: Select closed-trigger typeahead (`expected '' to be 'Cherry'`) and
  `Combobox.createItems` closed-trigger typeahead fail intermittently and depend on test order. A
  test passes alone and fails after the previous typeahead test. With `--shims react,dom,jest-dom`
  (stock user-event inlined against our Testing Library) they pass, which isolates
  `@rtd/user-event`.
- Cause: `utils/misc/wait.ts` `yieldBetweenActions()` (deviation "user-event `delay: 0`") waits for
  a real timeout only when the number of active Timeout resources across the whole process grew
  during the action. Otherwise it yields with `setImmediate`. When a handler clears one timer and
  schedules a `setTimeout(cb, 0)` (Base UI's test setup turns rAF into `setTimeout(cb, 0)`; its
  typeahead restarts a reset timer), the count stays the same, so `await user.keyboard()` resolves
  before the callback runs. The repro fails in 33 of 50 iterations on ours and 0 of 50 on stock
  user-event 14.6.8.
- Fix: base the heuristic on the creation of timers rather than a net count (for example,
  instrument `setTimeout` while the action runs), or always do upstream's `wait()` when any 0 ms
  timer was created.

### 6. `validationMessage` precedence (html-forms): 4 tests

- Symptom: Field.Root "custom validity ownership" (2), Field.Validity "surfaces valueMissing
  immediately after a stale custom error", Autocomplete "Field prop: validationMode=onSubmit".
  Base UI reads `validationMessage` back to decide whether it owns the current custom error.
- Cause: with both a custom error and a native failure (typeMismatch / valueMissing), @rtd/dom
  returns the native localized message. jsdom and Chromium return the custom message.
- Spec: https://html.spec.whatwg.org/#dom-cva-validationmessage

### 7. `visualViewport` (window, decision): 4 tests

- `getViewportRect` "falls back to the document element without a visual viewport"
  (`expect(window.visualViewport).toBe(undefined)`, jsdom-only test) and 3 NavigationMenu
  `prop: side` tests. With a 1024x768 visual viewport, Floating UI flips zero-sized popups
  differently than it does against jsdom's 0x0 documentElement. This is a jsdom fixture
  assumption, not a spec bug (vibedom found the same). Options: omit `visualViewport` by default
  for jsdom parity, or accept and document it.

### 8. iframe browsing context (html-elements + window, decision): 3 tests

- FloatingFocusManager "JSDOM-only coverage iframe focus navigation" (2) and ToastViewport
  "rebinds owner-document listeners" (`Expected iframe window and document.`). This is a documented
  deviation (no `contentWindow`/`contentDocument`). A minimal about:blank child window would fix
  it.

### 9. `TouchEvent` init conversion (events, decision): 2 tests

- useDismiss touch tests: `fireEvent.touchStart(el, { touches: [{ clientX, clientY }] })` throws
  "Failed to convert value to 'Touch'". jsdom has no `Touch` interface and passes the plain objects
  through. Suggest accepting touch-like objects (documented compat deviation), because Testing
  Library users commonly write this.

## Fixed during this run (repros kept as regression guards, now passing)

| cluster | owner | impact when found | repro |
| --- | --- | --- | --- |
| HTML element interface objects (`HTMLIFrameElement` etc.) missing from window. react-dom's commit phase throws `Right-hand side of 'instanceof' is not an object` | html-elements | 607/608 smoke tests failed in both rtd modes | `repros/html-elements-interface-objects.test.ts` |
| `Node` constants (`ELEMENT_NODE`, ...) only static, not on `Node.prototype`. Stock dom-accessibility-api computes every accessible name as `""` | dom-core | smoke: 134 rtd-dom failures (stock getByRole name matching), 9 rtd-full (`toHaveAccessibleName` from @mui/internal-test-utils) | `repros/dom-core-node-constants-on-prototype.test.ts` |

## Observations (not failures)

- No differences in failures between rtd-dom and rtd-full apart from cluster 5: our Testing
  Library, React, and jest-dom shims are behaviorally equivalent to the stock packages on this
  suite.
- Harness check: one React instance (resolution receipts), one `@rtd/dom` instance per worker
  (`globalThis.Node === (await import('@rtd/dom')).Node`), and every `@testing-library/*`
  specifier (including those imported by `@mui/internal-test-utils`) resolved to our packages in
  rtd-full.
- rtd-full wall time was 176s against 278s for jsdom on the full suite, with the same worker
  count. The machine was shared with other agents, so treat this as a diagnostic, not a
  benchmark.
