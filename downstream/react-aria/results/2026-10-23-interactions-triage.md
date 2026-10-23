# React Aria downstream: `interactions` (2026-10-23)

> **TRIAGE MODE (`--triage fake-raf,keep-globals,no-pointer-event,isolate`)**: rtd modes ran with jest-environment.mjs's triage shims (workarounds for jest-environment blockers already filed in TRIAGE.md). These are not compatibility results.

- upstream: https://github.com/adobe/react-spectrum @ `d5fb723a1c192e3a1a25c8cfdd4e26b900995307` (2026-10-23T05:09:37Z) — fix(usePress): only skip Enter default prevention on macOS for Control + Enter (#10820)
- pinned: `d5fb723a1c192e3a1a25c8cfdd4e26b900995307`
- filters: `packages/react-aria/test/interactions/`, `packages/react-aria/test/focus/`, `packages/react-aria/test/selection/`
- node v26.12.1, Jest workers 4, STRICT_MODE=1 VIRT_ON=1, upstream versions: jest@30.4.2, jest-environment-jsdom@30.4.1, jsdom@26.1.0, @swc/jest@0.2.39, react@19.3.0, react-dom@19.3.0, @testing-library/react@16.3.2, @testing-library/dom@10.4.1, @testing-library/user-event@14.6.5, @testing-library/jest-dom@6.9.1
- rtd-full substitutes: @testing-library/react, @testing-library/dom, @testing-library/user-event, @testing-library/jest-dom (built bundles, packages/*/dist)

## Per-mode results

| mode | passed | failed | skipped | total | files | suite errors | exit | wall | peak RSS | env receipts | notes |
| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --- |
| rtd-dom | 378 | 8 | 0 | 386 | 19 | 0 | 1 | 1.9s | 322 MiB | 19 | 1 React |
| rtd-full | 378 | 8 | 0 | 386 | 19 | 0 | 1 | 1.7s | 307 MiB | 19 | 1 React |
| jsdom | 386 | 0 | 0 | 386 | 19 | 0 | 0 | 3.8s | 555 MiB | 19 | 1 React |

## rtd-dom

Compared with jsdom: **8 pass on jsdom but fail here**, 0 missing, 0 added, 0 newly skipped, 0 fail on jsdom but pass here.

### Pass on jsdom, fail here

<details><summary>8 tests</summary>

- `packages/react-aria/test/selection/useSelectableCollection.test.js :: useSelectableCollection can navigate without replacing the selection in multiple selection selectOnFocus` — TypeError: Cannot assign to read only property 'props' of object '#<Object>'
- `packages/react-aria/test/interactions/useFocusVisible.test.js :: useFocusVisible returns negative isFocusVisible result after toggling browser tabs in Safari without prior keyboard navigation` — Error: An update to %s inside a test was not wrapped in act(...).
- `packages/react-aria/test/interactions/useFocusVisible.test.js :: useFocusVisible Setups global event listeners in a different window removes event listeners on beforeunload` — Error: expect(received).toBe(expected) // Object.is equality
- `packages/react-aria/test/interactions/useFocusVisible.test.js :: useFocusVisible Setups global event listeners in a different window removes event listeners using teardown function` — Error: expect(received).toBe(expected) // Object.is equality
- `packages/react-aria/test/interactions/useFocusVisible.test.js :: useFocusVisible Setups global event listeners in a different window returns negative isFocusVisible result after toggling browser tabs without prior keyboard navigation` — Error: expect(received).toBe(expected) // Object.is equality
- `packages/react-aria/test/interactions/useFocusVisible.test.js :: useFocusVisible Setups global event listeners in a different window returns negative isFocusVisible result after toggling browser window without prior keyboard navigation` — Error: expect(received).toBe(expected) // Object.is equality
- `packages/react-aria/test/interactions/usePress.test.js :: usePress disable text-selection when pressed non related style changes during press down shouldn't overwrite user-select on press end (non-iOS)` — Error: expect(element).toHaveStyle()
- `packages/react-aria/test/interactions/usePress.test.js :: usePress disable text-selection when pressed changes to user-select during press down remain on press end (non-iOS)` — Error: expect(element).toHaveStyle()

</details>

### Failures by component

| component | failed |
| --- | --: |
| react-aria/interactions | 7 |
| react-aria/selection | 1 |

### Failures by error signature

| count | signature | components | example |
| --: | --- | --- | --- |
| 4 | Error: expect(received).toBe(expected) // Object.is equality | react-aria/interactions | `packages/react-aria/test/interactions/useFocusVisible.test.js :: useFocusVisible Setups global event listeners in a different window removes event listeners on beforeunload` |
| 2 | Error: expect(element).toHaveStyle() | react-aria/interactions | `packages/react-aria/test/interactions/usePress.test.js :: usePress disable text-selection when pressed non related style changes during press down shouldn't overwrite user-select on press end (non-iOS)` |
| 1 | TypeError: Cannot assign to read only property 'props' of object '#<Object>' | react-aria/selection | `packages/react-aria/test/selection/useSelectableCollection.test.js :: useSelectableCollection can navigate without replacing the selection in multiple selection selectOnFocus` |
| 1 | Error: An update to %s inside a test was not wrapped in act(...). | react-aria/interactions | `packages/react-aria/test/interactions/useFocusVisible.test.js :: useFocusVisible returns negative isFocusVisible result after toggling browser tabs in Safari without prior keyboard navigation` |

## rtd-full

Compared with jsdom: **8 pass on jsdom but fail here**, 0 missing, 0 added, 0 newly skipped, 0 fail on jsdom but pass here.

### Pass on jsdom, fail here

<details><summary>8 tests</summary>

- `packages/react-aria/test/selection/useSelectableCollection.test.js :: useSelectableCollection can navigate without replacing the selection in multiple selection selectOnFocus` — TypeError: Cannot assign to read only property 'props' of object '#<Object>'
- `packages/react-aria/test/interactions/useFocusVisible.test.js :: useFocusVisible returns negative isFocusVisible result after toggling browser tabs in Safari without prior keyboard navigation` — Error: An update to %s inside a test was not wrapped in act(...).
- `packages/react-aria/test/interactions/useFocusVisible.test.js :: useFocusVisible Setups global event listeners in a different window removes event listeners on beforeunload` — Error: expect(received).toBe(expected) // Object.is equality
- `packages/react-aria/test/interactions/useFocusVisible.test.js :: useFocusVisible Setups global event listeners in a different window removes event listeners using teardown function` — Error: expect(received).toBe(expected) // Object.is equality
- `packages/react-aria/test/interactions/useFocusVisible.test.js :: useFocusVisible Setups global event listeners in a different window returns negative isFocusVisible result after toggling browser tabs without prior keyboard navigation` — Error: expect(received).toBe(expected) // Object.is equality
- `packages/react-aria/test/interactions/useFocusVisible.test.js :: useFocusVisible Setups global event listeners in a different window returns negative isFocusVisible result after toggling browser window without prior keyboard navigation` — Error: expect(received).toBe(expected) // Object.is equality
- `packages/react-aria/test/interactions/usePress.test.js :: usePress disable text-selection when pressed non related style changes during press down shouldn't overwrite user-select on press end (non-iOS)` — Error: expect(element).toHaveStyle()
- `packages/react-aria/test/interactions/usePress.test.js :: usePress disable text-selection when pressed changes to user-select during press down remain on press end (non-iOS)` — Error: expect(element).toHaveStyle()

</details>

### Failures by component

| component | failed |
| --- | --: |
| react-aria/interactions | 7 |
| react-aria/selection | 1 |

### Failures by error signature

| count | signature | components | example |
| --: | --- | --- | --- |
| 4 | Error: expect(received).toBe(expected) // Object.is equality | react-aria/interactions | `packages/react-aria/test/interactions/useFocusVisible.test.js :: useFocusVisible Setups global event listeners in a different window removes event listeners on beforeunload` |
| 2 | Error: expect(element).toHaveStyle() | react-aria/interactions | `packages/react-aria/test/interactions/usePress.test.js :: usePress disable text-selection when pressed non related style changes during press down shouldn't overwrite user-select on press end (non-iOS)` |
| 1 | TypeError: Cannot assign to read only property 'props' of object '#<Object>' | react-aria/selection | `packages/react-aria/test/selection/useSelectableCollection.test.js :: useSelectableCollection can navigate without replacing the selection in multiple selection selectOnFocus` |
| 1 | Error: An update to %s inside a test was not wrapped in act(...). | react-aria/interactions | `packages/react-aria/test/interactions/useFocusVisible.test.js :: useFocusVisible returns negative isFocusVisible result after toggling browser tabs in Safari without prior keyboard navigation` |

## jsdom

No failing tests.

Raw Jest JSON, logs and probe receipts: `downstream/react-aria/output/<mode>/` (gitignored).
