# React Aria downstream triage

Pinned `adobe/react-spectrum@d5fb723a` (2026-10-23), Jest 30.4.2, React 19.3.0, upstream
baseline `jest-environment-jsdom` 30.4.1 / jsdom **26.1.0**. Counts are from
`results/2026-10-23-all.md` (rtd-dom: 297 failed + 68 missing of 3006; rtd-full: 266 failed + 92
missing) and `results/2026-10-23-all-triage.md` (`--triage all`: rtd-dom 223 failed + 70 missing).
Tests are attributed to a cluster by signature and by the triage shim that makes them pass
(single-shim `all` runs on rtd-dom, passed vs 2632 without shims: `fake-raf` +38,
`no-pointer-event` +60, `isolate` +34, `keep-globals` restores the files lost to worker crashes).
Numbers move by a few tests between runs because two clusters (5, 8) are order dependent.

Every cluster with a repro has a file in `repros/` (`pnpm vitest run --config
downstream/vitest.config.ts react-aria`); each repro passes on the oracle (jsdom, upstream's
jsdom 26, jest-environment-jsdom, or stock user-event) and fails on our stack.

Sorted by failing-test count.

| # | cluster | owner | tests | repro |
| --: | --- | --- | --: | --- |
| 1 | `CSS` namespace is frozen (`CSS.supports = …` throws) | css | 63 (Sheet.test.js fails to load) | `repros/css-namespace-frozen.test.ts` |
| 2 | `PointerEvent` exposed; upstream tests assume jsdom 26 (none) | window/events — fixture assumption | ~41–60 | `repros/window-pointerevent-exposed.test.ts` |
| 3 | `offsetParent` always null → overlay containing block resolves to the viewport | css | 54 | `repros/css-offsetparent-positioned-ancestor.test.ts` |
| 4 | rAF frame task wedged by a dropped fake timer; `jest.useFakeTimers()` doesn't fake rAF | window + jest-environment | ~38 (≈20 in smoke) | `repros/window-raf-frame-task-lost-with-fake-timers.test.ts` |
| 5 | Interface prototypes shared across test files of a worker | jest-environment (+ window) | ~34–41, order dependent; 2 suite errors | `repros/jest-environment-prototype-state-shared-across-files.test.ts` |
| 6 | Wrapper internals are enumerable own props (`_impl` …) | dom-core | 26 masked failures + Jest `--json` crash | `repros/dom-core-wrapper-internals-enumerable.test.ts` |
| 7 | `validationMessage` text differs from jsdom ("Constraints not satisfied") | html-forms | 19 | `repros/html-forms-validation-message-text.test.ts` |
| 8 | Teardown deletes `window` → late React work kills the Jest worker | jest-environment | 1 file + whatever the crashed worker had queued (5–29) | `repros/jest-environment-teardown-removes-window.test.ts` |
| 9 | iframe child window shares the parent's interface objects | window (+ html-elements) | 4 | `repros/window-iframe-shares-interface-objects.test.ts` |
| 10 | rtd-full: keyboard Space press fires onPress twice | user-event | 4 (2 in smoke) | none yet (see below) |
| 11 | Unattributed (focus/selection in collections, dnd, act warnings, …) | needs investigation | ~120 | — |

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

## 10. user-event (rtd-full only): Space press on Checkbox/Radio fires onPress twice

RAC Checkbox, CheckboxField, RadioGroup, RadioField "should support press state with keyboard":
`onPress` called 2× after `user.keyboard('[Space>]')` + `user.keyboard('[/Space]')`. Bisected with
`--shims`: `react,dom,jest-dom` (stock user-event) passes, adding `user-event` fails. A plain-DOM
comparison of the event sequence (keydown/keyup/click order, `detail`, targets) on a labelled
checkbox is identical between stock and @rtd/user-event, so the difference involves React/act
interplay (each dispatch wrapped in `eventWrapper`); no standalone repro yet. Reproduce with:

```sh
node downstream/react-aria/run.ts --files packages/react-aria-components/test/Checkbox.test.js --modes rtd-full --grep "press state with keyboard"
```

Related (only with a `--shims` subset): substituting only `@testing-library/user-event` loses
`act()` wrapping entirely (54 Checkbox/RadioGroup failures, "not wrapped in act(...)"), because @rtd/user-event reads
`getConfig()` from `@rtd/testing-library` only, while stock @testing-library/react configures
stock `@testing-library/dom`. Mixing our user-event with stock RTL is therefore not drop-in.

## 11. Unattributed (needs investigation)

From `results/2026-10-23-all-triage.md` (rtd-dom, all shims applied):

- Collections keyboard focus/selection: RAC Tree/Table/GridList/ListBox `aria-selected`
  (17), "Current active element is not on any of the table rows" (4), "ActiveElement is not in
  the tree" (3), Tree `aria-expanded` (4), tab navigation into cells (behind cluster 6's masked
  messages). Likely one focus/tab-order or `selectionchange`/`focusin` difference; start with
  `Table.test.js keyboardNavigationBehavior='tab'`.
- dnd: drop indicator counts off by one (an extra root "Drop on" target, 14), "Cannot begin
  dragging while already dragging" (10, without triage), drop target attributes. React Aria
  installs DataTransfer/DragEvent mocks (`react-aria/test/dnd/mocks`) because jsdom 26 has
  neither; we expose both — possibly another fixture assumption like cluster 2.
- `act(...)` warnings (8): RAC Select/DatePicker/DateRangePicker/CheckboxGroup/Checkbox/Switch
  "supports validation errors"/"required state" — a state update after `invalid`/`reset` outside
  act (form validation events or our `requestSubmit`/`reset` timing).
- `ariaTableResizing` / RAC Table column widths `toStrictEqual` (8), `usePress` / ColorSwatch /
  useOverlayPosition `toHaveStyle` (4): computed style or width resolution differences.
- aria-modal-polyfill (5): the separator outside the modal is not hidden (`watchModals`
  MutationObserver path).
- runAfterKeyboard (5), useNumberField, useDisclosure, Autocomplete "multiple textbox" (2),
  Dialog "multiple dialog" (1), Table "Load more"/"Show Columns" text (3).
