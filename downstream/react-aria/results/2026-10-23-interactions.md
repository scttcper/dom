# React Aria downstream: `interactions` (2026-10-23)

- upstream: https://github.com/adobe/react-spectrum @ `d5fb723a1c192e3a1a25c8cfdd4e26b900995307` (2026-10-23T05:09:37Z) — fix(usePress): only skip Enter default prevention on macOS for Control + Enter (#10820)
- pinned: `d5fb723a1c192e3a1a25c8cfdd4e26b900995307`
- filters: `packages/react-aria/test/interactions/`, `packages/react-aria/test/focus/`, `packages/react-aria/test/selection/`
- node v26.12.1, Jest workers 4, STRICT_MODE=1 VIRT_ON=1, upstream versions: jest@30.4.2, jest-environment-jsdom@30.4.1, jsdom@26.1.0, @swc/jest@0.2.39, react@19.3.0, react-dom@19.3.0, @testing-library/react@16.3.2, @testing-library/dom@10.4.1, @testing-library/user-event@14.6.5, @testing-library/jest-dom@6.9.1
- rtd-full substitutes: @testing-library/react, @testing-library/dom, @testing-library/user-event, @testing-library/jest-dom (built bundles, packages/*/dist)

## Per-mode results

| mode | passed | failed | skipped | total | files | suite errors | exit | wall | peak RSS | env receipts | notes |
| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --- |
| jsdom | 386 | 0 | 0 | 386 | 19 | 0 | 0 | 3.6s | 561 MiB | 19 | 1 React |
| rtd-dom | 365 | 21 | 0 | 386 | 19 | 0 | 1 | 3.7s | 550 MiB | 19 | 1 React |
| rtd-full | 365 | 21 | 0 | 386 | 19 | 0 | 1 | 2.4s | 319 MiB | 19 | 1 React |

## jsdom

No failing tests.

## rtd-dom

Compared with jsdom: **21 pass on jsdom but fail here**, 0 missing, 0 added, 0 newly skipped, 0 fail on jsdom but pass here.

### Pass on jsdom, fail here

<details><summary>21 tests</summary>

- `packages/react-aria/test/interactions/usePress.test.js :: usePress disable text-selection when pressed non related style changes during press down shouldn't overwrite user-select on press end (non-iOS)` — Error: expect(element).toHaveStyle()
- `packages/react-aria/test/interactions/usePress.test.js :: usePress disable text-selection when pressed changes to user-select during press down remain on press end (non-iOS)` — Error: expect(element).toHaveStyle()
- `packages/react-aria/test/interactions/useFocusVisible.test.js :: useFocusVisible returns negative isFocusVisible result after toggling browser tabs in Safari without prior keyboard navigation` — Error: An update to %s inside a test was not wrapped in act(...).
- `packages/react-aria/test/interactions/useFocusVisible.test.js :: useFocusVisible Setups global event listeners in a different window removes event listeners on beforeunload` — Error: expect(received).toBe(expected) // Object.is equality
- `packages/react-aria/test/interactions/useFocusVisible.test.js :: useFocusVisible Setups global event listeners in a different window removes event listeners using teardown function` — Error: expect(received).toBe(expected) // Object.is equality
- `packages/react-aria/test/interactions/useFocusVisible.test.js :: useFocusVisible Setups global event listeners in a different window returns negative isFocusVisible result after toggling browser tabs without prior keyboard navigation` — Error: expect(received).toBe(expected) // Object.is equality
- `packages/react-aria/test/interactions/useFocusVisible.test.js :: useFocusVisible Setups global event listeners in a different window returns negative isFocusVisible result after toggling browser window without prior keyboard navigation` — Error: expect(received).toBe(expected) // Object.is equality
- `packages/react-aria/test/interactions/useFocusVisible.test.js :: useFocusVisibleListener emits on modality change (non-text input)` — Error: expect(jest.fn()).toHaveBeenCalledTimes(expected)
- `packages/react-aria/test/interactions/useFocusVisible.test.js :: useFocusVisibleListener emits on modality change (text input)` — Error: expect(jest.fn()).toHaveBeenCalledTimes(expected)
- `packages/react-aria/test/selection/useSelectableCollection.test.js :: useSelectableCollection can navigate without replacing the selection in multiple selection selectOnFocus` — TypeError: Cannot assign to read only property 'props' of object '#<Object>'
- `packages/react-aria/test/focus/FocusScope.test.js :: FocusScope node to restore edge cases tracks node to restore if the node to restore was removed in another part of the tree` — Error: expect(received).not.toBe(expected) // Object.is equality
- `packages/react-aria/test/focus/FocusScope.test.js :: FocusScope with Shadow DOM should handle web component scenario with multiple nested portals and UNSAFE_PortalProvider` — TypeError: Cannot assign to read only property 'props' of object '#<Object>'
- `packages/react-aria/test/interactions/useMove.test.js :: useMove mouse events responds to mouse events` — Error: expect(received).toStrictEqual(expected) // deep equality
- `packages/react-aria/test/interactions/useMove.test.js :: useMove touch events responds to touch events` — Error: expect(received).toStrictEqual(expected) // deep equality
- `packages/react-aria/test/interactions/useMove.test.js :: useMove touch events ends with touchcancel` — Error: expect(received).toStrictEqual(expected) // deep equality
- `packages/react-aria/test/interactions/useMove.test.js :: useMove touch events ignores additional touches` — Error: expect(received).toStrictEqual(expected) // deep equality
- `packages/react-aria/test/interactions/useMove.test.js :: useMove user-select: none adds and removes user-select: none to the body (iOS)` — Error: expect(received).toBe(expected) // Object.is equality
- `packages/react-aria/test/interactions/useMove.test.js :: useMove doesn't bubble to useMove on parent elements` — Error: expect(received).toStrictEqual(expected) // deep equality
- `packages/react-aria/test/interactions/useInteractOutside.shadow.test.js :: useInteractOutside shadow DOM triggers when clicking outside the popover` — Error: expect(jest.fn()).toHaveBeenCalledTimes(expected)
- `packages/react-aria/test/interactions/useInteractOutside.shadow.test.js :: useInteractOutside shadow DOM triggers when clicking a button outside the shadow dom altogether` — Error: expect(jest.fn()).toHaveBeenCalledTimes(expected)
- `packages/react-aria/test/interactions/useInteractOutside.shadow.test.js :: useInteractOutside shadow DOM extended tests correctly identifies interaction with dynamically added external elements` — Error: expect(jest.fn()).toHaveBeenCalledTimes(expected)

</details>

### Failures by component

| component | failed |
| --- | --: |
| react-aria/interactions | 18 |
| react-aria/focus | 2 |
| react-aria/selection | 1 |

### Failures by error signature

| count | signature | components | example |
| --: | --- | --- | --- |
| 5 | Error: expect(received).toBe(expected) // Object.is equality | react-aria/interactions | `packages/react-aria/test/interactions/useFocusVisible.test.js :: useFocusVisible Setups global event listeners in a different window removes event listeners on beforeunload` |
| 5 | Error: expect(jest.fn()).toHaveBeenCalledTimes(expected) | react-aria/interactions | `packages/react-aria/test/interactions/useFocusVisible.test.js :: useFocusVisibleListener emits on modality change (non-text input)` |
| 5 | Error: expect(received).toStrictEqual(expected) // deep equality | react-aria/interactions | `packages/react-aria/test/interactions/useMove.test.js :: useMove mouse events responds to mouse events` |
| 2 | Error: expect(element).toHaveStyle() | react-aria/interactions | `packages/react-aria/test/interactions/usePress.test.js :: usePress disable text-selection when pressed non related style changes during press down shouldn't overwrite user-select on press end (non-iOS)` |
| 2 | TypeError: Cannot assign to read only property 'props' of object '#<Object>' | react-aria/selection, react-aria/focus | `packages/react-aria/test/selection/useSelectableCollection.test.js :: useSelectableCollection can navigate without replacing the selection in multiple selection selectOnFocus` |
| 1 | Error: An update to %s inside a test was not wrapped in act(...). | react-aria/interactions | `packages/react-aria/test/interactions/useFocusVisible.test.js :: useFocusVisible returns negative isFocusVisible result after toggling browser tabs in Safari without prior keyboard navigation` |
| 1 | Error: expect(received).not.toBe(expected) // Object.is equality | react-aria/focus | `packages/react-aria/test/focus/FocusScope.test.js :: FocusScope node to restore edge cases tracks node to restore if the node to restore was removed in another part of the tree` |

## rtd-full

Compared with jsdom: **21 pass on jsdom but fail here**, 0 missing, 0 added, 0 newly skipped, 0 fail on jsdom but pass here.

### Pass on jsdom, fail here

<details><summary>21 tests</summary>

- `packages/react-aria/test/interactions/useMove.test.js :: useMove mouse events responds to mouse events` — Error: expect(received).toStrictEqual(expected) // deep equality
- `packages/react-aria/test/interactions/useMove.test.js :: useMove touch events responds to touch events` — Error: expect(received).toStrictEqual(expected) // deep equality
- `packages/react-aria/test/interactions/useMove.test.js :: useMove touch events ends with touchcancel` — Error: expect(received).toStrictEqual(expected) // deep equality
- `packages/react-aria/test/interactions/useMove.test.js :: useMove touch events ignores additional touches` — Error: expect(received).toStrictEqual(expected) // deep equality
- `packages/react-aria/test/interactions/useMove.test.js :: useMove user-select: none adds and removes user-select: none to the body (iOS)` — Error: expect(received).toBe(expected) // Object.is equality
- `packages/react-aria/test/interactions/useMove.test.js :: useMove doesn't bubble to useMove on parent elements` — Error: expect(received).toStrictEqual(expected) // deep equality
- `packages/react-aria/test/selection/useSelectableCollection.test.js :: useSelectableCollection can navigate without replacing the selection in multiple selection selectOnFocus` — TypeError: Cannot assign to read only property 'props' of object '#<Object>'
- `packages/react-aria/test/focus/FocusScope.test.js :: FocusScope node to restore edge cases tracks node to restore if the node to restore was removed in another part of the tree` — Error: expect(received).not.toBe(expected) // Object.is equality
- `packages/react-aria/test/focus/FocusScope.test.js :: FocusScope with Shadow DOM should handle web component scenario with multiple nested portals and UNSAFE_PortalProvider` — TypeError: Cannot assign to read only property 'props' of object '#<Object>'
- `packages/react-aria/test/interactions/useInteractOutside.shadow.test.js :: useInteractOutside shadow DOM triggers when clicking outside the popover` — Error: expect(jest.fn()).toHaveBeenCalledTimes(expected)
- `packages/react-aria/test/interactions/useInteractOutside.shadow.test.js :: useInteractOutside shadow DOM triggers when clicking a button outside the shadow dom altogether` — Error: expect(jest.fn()).toHaveBeenCalledTimes(expected)
- `packages/react-aria/test/interactions/useInteractOutside.shadow.test.js :: useInteractOutside shadow DOM extended tests correctly identifies interaction with dynamically added external elements` — Error: expect(jest.fn()).toHaveBeenCalledTimes(expected)
- `packages/react-aria/test/interactions/usePress.test.js :: usePress disable text-selection when pressed non related style changes during press down shouldn't overwrite user-select on press end (non-iOS)` — Error: expect(element).toHaveStyle()
- `packages/react-aria/test/interactions/usePress.test.js :: usePress disable text-selection when pressed changes to user-select during press down remain on press end (non-iOS)` — Error: expect(element).toHaveStyle()
- `packages/react-aria/test/interactions/useFocusVisible.test.js :: useFocusVisible returns negative isFocusVisible result after toggling browser tabs in Safari without prior keyboard navigation` — Error: An update to %s inside a test was not wrapped in act(...).
- `packages/react-aria/test/interactions/useFocusVisible.test.js :: useFocusVisible Setups global event listeners in a different window removes event listeners on beforeunload` — Error: expect(received).toBe(expected) // Object.is equality
- `packages/react-aria/test/interactions/useFocusVisible.test.js :: useFocusVisible Setups global event listeners in a different window removes event listeners using teardown function` — Error: expect(received).toBe(expected) // Object.is equality
- `packages/react-aria/test/interactions/useFocusVisible.test.js :: useFocusVisible Setups global event listeners in a different window returns negative isFocusVisible result after toggling browser tabs without prior keyboard navigation` — Error: expect(received).toBe(expected) // Object.is equality
- `packages/react-aria/test/interactions/useFocusVisible.test.js :: useFocusVisible Setups global event listeners in a different window returns negative isFocusVisible result after toggling browser window without prior keyboard navigation` — Error: expect(received).toBe(expected) // Object.is equality
- `packages/react-aria/test/interactions/useFocusVisible.test.js :: useFocusVisibleListener emits on modality change (non-text input)` — Error: expect(jest.fn()).toHaveBeenCalledTimes(expected)
- `packages/react-aria/test/interactions/useFocusVisible.test.js :: useFocusVisibleListener emits on modality change (text input)` — Error: expect(jest.fn()).toHaveBeenCalledTimes(expected)

</details>

### Failures by component

| component | failed |
| --- | --: |
| react-aria/interactions | 18 |
| react-aria/focus | 2 |
| react-aria/selection | 1 |

### Failures by error signature

| count | signature | components | example |
| --: | --- | --- | --- |
| 5 | Error: expect(received).toStrictEqual(expected) // deep equality | react-aria/interactions | `packages/react-aria/test/interactions/useMove.test.js :: useMove mouse events responds to mouse events` |
| 5 | Error: expect(received).toBe(expected) // Object.is equality | react-aria/interactions | `packages/react-aria/test/interactions/useMove.test.js :: useMove user-select: none adds and removes user-select: none to the body (iOS)` |
| 5 | Error: expect(jest.fn()).toHaveBeenCalledTimes(expected) | react-aria/interactions | `packages/react-aria/test/interactions/useInteractOutside.shadow.test.js :: useInteractOutside shadow DOM triggers when clicking outside the popover` |
| 2 | TypeError: Cannot assign to read only property 'props' of object '#<Object>' | react-aria/selection, react-aria/focus | `packages/react-aria/test/selection/useSelectableCollection.test.js :: useSelectableCollection can navigate without replacing the selection in multiple selection selectOnFocus` |
| 2 | Error: expect(element).toHaveStyle() | react-aria/interactions | `packages/react-aria/test/interactions/usePress.test.js :: usePress disable text-selection when pressed non related style changes during press down shouldn't overwrite user-select on press end (non-iOS)` |
| 1 | Error: expect(received).not.toBe(expected) // Object.is equality | react-aria/focus | `packages/react-aria/test/focus/FocusScope.test.js :: FocusScope node to restore edge cases tracks node to restore if the node to restore was removed in another part of the tree` |
| 1 | Error: An update to %s inside a test was not wrapped in act(...). | react-aria/interactions | `packages/react-aria/test/interactions/useFocusVisible.test.js :: useFocusVisible returns negative isFocusVisible result after toggling browser tabs in Safari without prior keyboard navigation` |

Raw Jest JSON, logs and probe receipts: `downstream/react-aria/output/<mode>/` (gitignored).
