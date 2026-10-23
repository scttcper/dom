# React Aria downstream triage

Pinned `adobe/react-spectrum@d5fb723a` (2026-10-23), Jest 30.4.2, React 19.3.0, upstream
baseline `jest-environment-jsdom` 30.4.1 / jsdom **26.1.0**.

**Current** (`results/2026-10-23-all.md`, 3006 tests): rtd-dom 2996 passed, **1 failed**; rtd-full
2989 passed, **8 failed**, 7 of them from the user-event version pin (cluster 10). Started at rtd-dom 297 failed + 68 missing, rtd-full 266 + 92.

What is left:

| mode | tests | cause | status |
| --- | --: | --- | --- |
| both | 1 | `useOverlayPosition` "at top": bottom 518 vs 350 | parked: jsdom 26 quirk (offsetParent and computed transform/filter match jsdom 30) |
| rtd-full | 6 | Checkbox/Radio/Switch "press state with keyboard": `onPress` ×2 | user-event 14.6.5 vs 14.6.8 (cluster 10), not ours |
| rtd-full | 1 | Autocomplete async filtering "autofocus the first item when typing forward": `act()` warning | user-event 14.6.5 vs 14.6.8 (cluster 10), not ours |

Also seen once: `ariaHideOutside.test.js` failing to load in a full run ("Cannot read properties of
undefined (reading 'doc')" in `inHTMLDocument`); passes alone and in later full runs.

The sections below are the clusters from the first run, kept for the record; the table says where
each one went. Clusters 12-21 were found while burning down cluster 11.

Every cluster with a repro has a file in `repros/` (`pnpm vitest run --config
downstream/vitest.config.ts react-aria`); each repro passes on the oracle (jsdom, upstream's
jsdom 26, jest-environment-jsdom, or stock user-event) and fails on our stack.

| # | cluster | owner | tests | repro | status |
| --: | --- | --- | --: | --- | --- |
| 1 | `CSS` namespace is frozen (`CSS.supports = …` throws) | css | 63 (Sheet.test.js fails to load) | `repros/css-namespace-frozen.test.ts` | fixed (7c74ddf) |
| 2 | `PointerEvent` exposed; upstream tests assume jsdom 26 (none) | jest-environment | ~41–60 | `repros/window-pointerevent-exposed.test.ts` | fixed: absent by default, `testEnvironmentOptions.pointerEvent` opts in (3633af5) |
| 3 | `offsetParent` always null → overlay containing block resolves to the viewport | css | 54 | `repros/css-offsetparent-positioned-ancestor.test.ts` | fixed (7c74ddf) |
| 4 | rAF frame task wedged by a dropped fake timer; `jest.useFakeTimers()` doesn't fake rAF | window + jest-environment | ~38 (≈20 in smoke) | `repros/window-raf-frame-task-lost-with-fake-timers.test.ts` | fixed (cf0a3f9) |
| 5 | Interface prototypes shared across test files of a worker | jest-environment (+ window) | ~34–41, order dependent; 2 suite errors | `repros/jest-environment-prototype-state-shared-across-files.test.ts` | fixed (cf0a3f9) |
| 6 | Wrapper internals are enumerable own props (`_impl` …) | dom-core | 26 masked failures + Jest `--json` crash | `repros/dom-core-wrapper-internals-enumerable.test.ts` | fixed: symbol-keyed internals (513052f), Window/Document internals hidden from Jest's diff printer (f5b3a69) |
| 7 | `validationMessage` text differs from jsdom ("Constraints not satisfied") | html-forms | 19 | `repros/html-forms-validation-message-text.test.ts` | fixed (5a8c966) |
| 8 | Teardown deletes `window` → late React work kills the Jest worker | jest-environment | 1 file + whatever the crashed worker had queued (5–29) | `repros/jest-environment-teardown-removes-window.test.ts` | fixed (cf0a3f9) |
| 9 | iframe child window shares the parent's interface objects | window (+ html-elements) | 4 | `repros/window-iframe-shares-interface-objects.test.ts` | deviation (docs/deviations.md); the 4 tests pass since 87efa87 + 8c7dfa5 (clusters 15, 16) |
| 10 | rtd-full: keyboard Space press fires onPress twice; Autocomplete `act()` warning | user-event 14.6.5 vs 14.6.8 | 7 | `packages/user-event/test/react/press.test.tsx`, `packages/user-event/test/react/blur-change-act.test.tsx` | upstream version pin (not ours) |
| 11 | Unattributed (focus/selection in collections, dnd, act warnings, …) | — | ~120 | — | resolved into 12-20 and the fixes above |
| 12 | `inert` IDL attribute exposed: drag tests saw rows behind the drag (hide-outside used `inert`, jsdom has none) | html | Table/Tree/GridList DnD + masked failures | — | fixed (f5b3a69) |
| 13 | `AbortSignal.timeout` on Node's real-time timer: fake timers never abort it (`runAfterKeyboard`) | window | 5 | — | fixed (12fda74) |
| 14 | `screen.orientation` with a fixed angle hid rotation (keyboard "orientation changes") | window | 1 | — | fixed: removed like jsdom (12fda74) |
| 15 | Focus into an iframe fired focus at the `<iframe>` (virtual modality in useFocusVisible) | html | 4 | — | fixed (87efa87) |
| 16 | Events at the window reported the Window instance, not the global, as `target` | events | 1 (+ any `e.target === window` check) | — | fixed (8c7dfa5) |
| 17 | Computed `background` in long form (`toHaveStyle({background})`) | css | 4 | — | fixed (d8fd2a1) |
| 18 | `InputEvent.getTargetRanges` (native beforeinput path) / `hidden` returning "until-found" | events / html | 2 | — | fixed (99e97df) |
| 19 | Canceled `invalid` events let a required form submit; blocked submit focused the invalid control | html-forms | 2 | — | fixed (1750669) |
| 20 | `window.matchMedia` present, so mock-match-media never installed (`setMedia` did nothing) | environments | 3 | — | fixed: absent by default, `matchMedia: true` opts in (fe768ef) |
| 21 | rtd-full: user-event's fallback `PointerEvent` lost `pointerType`/`width`/`pressure` | user-event | 29 | `packages/user-event/test/event/fallback-constructors.test.ts` | fixed (c8832bb) |

## 1. css: the `CSS` namespace object is frozen

`packages/react-aria-components/test/Sheet.test.js` stubs `window.CSS.supports = () => true` at
module scope ("jsdom does not implement CSS.supports"). WebIDL namespace operations are writable,
configurable data properties; @rtd/dom freezes `CSS`, so the assignment throws `TypeError: Cannot
assign to read only property 'supports' of object '[object CSS]'` and the whole file (63 tests)
fails to load in both rtd modes.

## 2. window/events: `PointerEvent` exists (fixture assumption, not a bug)

React Aria feature-detects `typeof PointerEvent !== 'undefined'` (useInteractOutside, usePress,
useMove, …) and then listens for pointer events only. The upstream suite targets jsdom 26, which
has no `PointerEvent`: its "Mouse Events"/"Touch Events" variants fire only mouse/touch events and
the "Pointer Events" variant installs a fake `PointerEvent` (`installPointerEvent`). Examples:
useOverlay "should hide the overlay when clicking outside" (Mouse/Touch), RAC Menu "closes the
menu on click outside", useMove mouse/touch (`toStrictEqual`), useInteractOutside. `--triage
no-pointer-event` deletes the global and those pass. Keeping a spec-correct `PointerEvent` is the
right default (browsers and jsdom ≥ 27 have it); listed so the count is not mistaken for DOM bugs.
Decision for window/events: keep, and document in `docs/deviations.md` under "jsdom parity".

## 3. css: `HTMLElement.offsetParent` is always null

All 54 failures of `react-aria/test/overlays/calculatePosition.test.ts` (e.g. `position.right`
774 instead of 350). React Aria's `getContainingBlock(overlay)` uses `offsetParent`, else walks up
to the first ancestor whose computed `transform`/`filter`/`contain`/`willChange` makes it a
containing block, else the viewport. Browsers return the `position: relative` container as
`offsetParent`. jsdom 26 also returns null but reports `""` for those computed properties, so the
walk stops at the container by accident; we report `none` (correct) and fall through to the
1024px viewport. The CSSOM View `offsetParent` algorithm needs only computed `position`/`display`
and the tree (no layout), so implementing it gives browser behaviour and fixes the cluster.

## 4. window + jest-environment: requestAnimationFrame under Jest fake timers

RAC Menu "Expected the document.activeElement after closing the menu to be the menu trigger but
got [object HTMLBodyElement]" / "Expected focus to move to somewhere other than the body" (16 in
smoke), Popover/Tooltip/useTooltip timing, interactions. React Aria's FocusScope restores focus
in a rAF and tests flush it with `act(() => jest.runAllTimers())`.

- window: `Window.requestAnimationFrame` batches a frame's callbacks into one host timer
  (`_frameTask`, scheduled on the *current* global `setTimeout`). If that timer was scheduled on a
  fake clock that is then uninstalled (`jest.useRealTimers()`, `afterAll`), it never fires,
  `_frameTask` stays non-null and no rAF callback ever runs again in that window. Fix: don't let a
  lost host timer wedge later frames (re-arm when the host `setTimeout` changed, or one timer per
  request).
- jest-environment: under jest-environment-jsdom, `jest.useFakeTimers()` fakes rAF itself.
  jest-environment-node constructs its `ModernFakeTimers` inside `super()`, and
  `@sinonjs/fake-timers` `withGlobal(global)` snapshots which timer functions exist *then* —
  before `installGlobals` adds `requestAnimationFrame`. Proposed patch
  (`packages/jest-environment/src/index.ts`, after `installGlobals`):

  ```ts
  import { ModernFakeTimers } from "@jest/fake-timers";
  // jest-environment-node built its fake timers before the window existed; rebuild them so
  // jest.useFakeTimers() fakes requestAnimationFrame/cancelAnimationFrame/requestIdleCallback
  // like jest-environment-jsdom does.
  this.fakeTimersModern = new ModernFakeTimers({ config: config.projectConfig, global: this.global as never });
  ```

  (`@jest/fake-timers` becomes a dependency.) `--triage fake-raf` applies exactly this and fixes
  ~20 smoke / ~38 `all` tests. The window fix is still needed for Vitest and real-timer users.

## 5. jest-environment: interface prototypes are shared across test files of a worker

jest-environment-jsdom builds a new JSDOM — new interface objects and prototypes — per test file.
jest-environment-rtd loads @rtd/dom once per worker (singleton strategy) and every window reuses
the module's interfaces, so prototype patches leak into later files of the same worker. Examples:
`useLandmark.test.tsx` (41 tests, "Property `clientWidth` does not have access type get"; passes
alone — an earlier file spied on `HTMLElement.prototype.clientHeight` and only `mockReset()` it),
`DOMFunctions.test.tsx` / `ariaHideOutside.test.js` fail to load in some runs (shadow-dom-testing-
library patches `ShadowRoot.prototype.outerHTML` once, the next file's `ShadowRoot.prototype
.outerHTML == null` check calls that getter on the prototype). Results differ between rtd-dom and
rtd-full purely through worker scheduling. `--triage isolate` (Jest `workerIdleMemoryLimit: 1`:
recycle the worker after every file) removes it. Proposed fix: snapshot the own property
descriptors of every installed interface object and prototype at environment setup and restore
them in teardown (cheap: ~300 objects), or per-window interface objects (window owner).

## 6. dom-core: wrapper internals are enumerable own properties

`Object.keys(element)` is `['_listeners', '_impl', '_childNodes', …]` (jsdom: `[]`). Anything
that walks own enumerable keys reaches NodeImpl records (cyclic) and React's frozen objects:

- `jest --json` crashed after the run (`Converting circular structure to JSON … '_impl' …
  'node' closes the circle`) and wrote no report — the runner now uses a cycle-safe reporter
  (`json-reporter.cjs`);
- 26 tests (RAC Tree/Table/GridList, dnd, useSelectableCollection, useColorWheel) report
  `TypeError: Cannot assign to read only property 'type' | 'props' | 'cellProps' | 'style' of
  object '#<Object>'`, thrown while Jest formats a failed `expect(document.activeElement)
  .toBe(cell)`; the real failure (cluster 11 focus) is hidden.

Fix: non-enumerable internals (define once in the constructor with `enumerable: false`, or
private/symbol keys) while keeping hidden classes stable.

## 7. html-forms: `validationMessage` text

RAC TextField/SearchField/NumberField/ColorField/ComboBox/Select/RadioGroup/DateField/TimeField
"supports validation errors" expect jsdom's generic "Constraints not satisfied"; we return
Chrome's per-constraint text ("Please fill out this field.", "Please select one of these
options."). Both are UA-defined, but drop-in tests assert jsdom's string, and the difference is
not in `docs/deviations.md`. Decide: jsdom's string, or document it.

## 8. jest-environment: teardown deletes `window` from the test global

React's scheduler uses the global `setImmediate` (jest-environment-node exposes Node's; jsdom's
environment does not), so work left by a test file runs after teardown. Our teardown calls
installGlobals' uninstall, which deletes `window`/`document`/…; react-dom then throws
`ReferenceError: window is not defined` (`schedulerEvent = window.event`), the uncaught exception
kills the worker, and Jest reports "Jest worker encountered 4 child process exceptions, exceeding
retry limit" on whichever files that worker had queued (aria-modal-polyfill in the pinned run;
`--workers 1` makes the whole run die). Proposed patch (`teardown()`): close the window but do not
uninstall the globals (the vm context is discarded with the test file), or at least keep `window`,
`self` and `document` defined; alternatively drop Node's `setImmediate`/`clearImmediate` from the
global like jest-environment-jsdom. `--triage keep-globals` skips the uninstall and the crash is
gone.

## 9. window: iframe child window shares interface objects with its parent

useFocusVisible "Setups global event listeners in a different window" (4): React Aria patches
`iframe.contentWindow.HTMLElement.prototype.focus` and restores it on the iframe's
`beforeunload`; with shared interfaces the patch changes the parent's focus tracking ("Expected:
'example', Received: 'example-focusVisible'"). Each browsing context needs its own interface
objects.

## 10. user-event version pin (rtd-full only): Space press on Checkbox/Radio fires onPress twice

RAC Checkbox, CheckboxField, RadioGroup, RadioField "should support press state with keyboard":
`onPress` called 2× after `user.keyboard('[Space>]')` + `user.keyboard('[/Space]')`.

**Not a bug in our port.** react-spectrum pins `@testing-library/user-event` **14.6.5**; @rtd/user-event
tracks **14.6.8**. Upstream commit 71a5475 (testing-library/user-event#1325) changed the `click`
dispatched by a Space keyup from `pointerType: "undefined"` (`String(undefined)`) to `""`. React
Aria's `usePress` treats `detail === 0 && !pointerType` as a virtual click and presses again, so
stock 14.6.8 double-presses exactly like ours; the rtd-dom baseline passes only because it runs
14.6.5. `packages/user-event/test/react/press.test.tsx` runs a usePress-style component under both
our user-event and stock 14.6.8 and asserts the same event sequence and press count. We keep
14.6.8's behavior rather than reintroduce the old string.

Same pin, second symptom: RAC Autocomplete "async filtering performed outside the autocomplete
should properly filter and autofocus the first item when typing forward" fails on React's
"An update to ForwardRef(Input) inside a test was not wrapped in act(...)". During the test's
`await act(async () => jest.advanceTimersToNextTimer())`, the async list resolves and the commit's
passive effect (`useSelectableItem`) calls `dispatchVirtualBlur` on the input that `user.keyboard('F')`
typed into. user-event's capture `blur` listener (`prepareDocument`) sees a changed value and
dispatches `change`. In 14.6.8 that goes through `dispatchDOMEvent` → `wrapEvent` → RTL's
`eventWrapper`, a synchronous `act()`. It runs at act scope depth 0 inside the outer async act's
queue flush, so on exit it sets React's `actQueue` to null, and the updates the flush schedules
afterwards (the `focusout` handlers' `setFocused`) warn. The 14.6.5 package react-spectrum pins
ships mismatched builds: its ESM `prepareDocument` already uses `dispatchDOMEvent`, but the
CommonJS one Jest loads calls `el.dispatchEvent(new Event('change'))` with no `act()`, so the
queue survives. `packages/user-event/test/react/blur-change-act.test.tsx` reproduces it with a
small component and shows stock 14.6.8 + stock RTL emitting the same warning as ours.

Related (only with a `--shims` subset): substituting only `@testing-library/user-event` used to lose
`act()` wrapping (stock RTL configures stock `@testing-library/dom`). Fixed in 83eab21: when a React
act environment is active and @rtd/testing-library is unconfigured, user-event reads the project's
stock `@testing-library/dom` config (Checkbox + RadioGroup with `--shims user-event`: 68/54 → 115/7).

## 11. Unattributed (resolved)

The ~120 unattributed failures of the first run came down to clusters 12-21 plus the cluster 2
and 6 fixes; see the table at the top. Most were jsdom-parity gaps where @rtd/dom implemented a
newer spec feature that React Aria feature-detects (`inert`, `PointerEvent`, `screen.orientation`,
`getTargetRanges`, `matchMedia`) and the jsdom-written suite never exercised that path.
