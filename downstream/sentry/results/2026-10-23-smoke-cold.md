# Sentry downstream: `smoke-cold` (2026-10-23)

- upstream: https://github.com/getsentry/sentry @ `503ad2e4e2a208a87d768a3e91bcfb55a778e7ba` (2026-10-23T13:58:39Z) — fix(agents): Avoid repeated user turns during tool continuations (#128645)
- pinned: `503ad2e4e2a208a87d768a3e91bcfb55a778e7ba`
- selection: `static/app/components/core/dropdownMenu/dropdownMenu.spec.tsx`, `static/app/components/core/compactSelect/compactSelect.spec.tsx`, `static/app/components/core/compactSelect/composite.spec.tsx`, `static/app/components/core/tabs/tabs.spec.tsx`, `static/app/components/core/modal/index.spec.tsx`, `static/app/components/core/overlayTrigger.spec.tsx`, `static/app/components/core/input/numberInput.spec.tsx`, `static/app/components/core/form/autoSaveForm.spec.tsx`, `static/app/components/forms/formField/index.spec.tsx`, `static/app/components/forms/controls/radioGroup.spec.tsx`, `static/app/components/forms/fields/sentryProjectSelectorField.spec.tsx`, `static/app/components/tables/dataGrid/index.spec.tsx`, `static/app/components/tables/simpleTable/index.spec.tsx`, `static/app/components/searchQueryBuilder/index.spec.tsx`, `static/app/components/timeRangeSelector/index.spec.tsx`
- node v26.12.1, Jest workers 6 (same for every mode), runs per mode 1, CI=true (upstream's CI code paths), no forced GC
- upstream versions: jest@30.5.1, jsdom@30.1.1, react@19.3.0, react-dom@19.3.0, @swc/jest@0.2.39, @testing-library/react@16.3.2, @testing-library/dom@10.4.1, @testing-library/user-event@14.6.7, @testing-library/jest-dom@7.0.1, @sentry/jest-environment@8.1.0, @floating-ui/react-dom@2.1.9
- rtd-full substitutes: @testing-library/react, @testing-library/dom, @testing-library/user-event, @testing-library/jest-dom (packages/*/dist/*.cjs)
- rtd-nohacks is an **experiment**: rtd-full plus harness/nohacks.ts undoing upstream's getComputedStyle / Floating UI / matchMedia / IntersectionObserver hacks.

## Per-mode results

| mode | passed | failed | skipped | total | files | suite errors | exit | wall | CPU | peak tree RSS | peak process RSS | env setup / file (median, p95) | receipts | notes |
| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --- |
| jsdom | 589 | 0 | 0 | 589 | 15 | 0 | 0 | 25.5s | 37.3s | 3315 MiB | 1051 MiB | 8 ms, 123 ms | 15/15 | RTL: stock |
| rtd-dom | 542 | 47 | 0 | 589 | 15 | 0 | 1 | 42.4s | 37.1s | 2698 MiB | 926 MiB | 7 ms, 118 ms | 15/15 | 1 React; RTL: stock |
| rtd-full | 541 | 48 | 0 | 589 | 15 | 0 | 1 | 39.1s | 38.0s | 2602 MiB | 854 MiB | 7 ms, 235 ms | 15/15 | 1 React; our packages changed during the run |
| rtd-nohacks | 541 | 48 | 0 | 589 | 15 | 0 | 1 | 45.1s | 45.6s | 2566 MiB | 686 MiB | 7 ms, 137 ms | 15/15 | 1 React |

## Jest worker memory across files

Sampled after each test file's environment teardown in every worker (no forced GC, so heap numbers include garbage). Slope = least-squares growth per file over each worker's files (first file excluded), median across workers. Upstream sets no `workerIdleMemoryLimit`.

| mode | workers | files/worker | heap after 1st file | heap after last file | heap growth/file | RSS growth/file | RSS after last file | max worker RSS |
| --- | --: | --: | --: | --: | --: | --: | --: | --: |
| jsdom | 6 | 2.5 | 153 MiB | 208 MiB | 31.25 MiB | 38.16 MiB | 421 MiB | 1041 MiB |
| rtd-dom | 6 | 2 | 135 MiB | 173 MiB | 26.93 MiB | 26.89 MiB | 393 MiB | 919 MiB |
| rtd-full | 6 | 2 | 122 MiB | 176 MiB | 25.86 MiB | 23.78 MiB | 389 MiB | 848 MiB |
| rtd-nohacks | 6 | 2 | 123 MiB | 169 MiB | 18.76 MiB | 25.34 MiB | 389 MiB | 680 MiB |

## jsdom

No failing tests.

## rtd-dom

Compared with jsdom: **47 pass on jsdom but fail here**, 0 missing (e.g. suite errors), 0 added, 0 fail on jsdom but pass here.

<details><summary>pass on jsdom, fail here (47)</summary>

- `static/app/components/core/dropdownMenu/dropdownMenu.spec.tsx :: DropdownMenu navigates to link on meta key` — Error: expect(jest.fn()).toHaveBeenCalled()
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder opens the command palette from an open suggestions menu with Ctrl+K` — Unable to find role="textbox" and name "Search commands"
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder opens the command palette from an open suggestions menu with Ctrl+Shift+P` — Unable to find role="textbox" and name "Search commands"
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder actions clears the query and reopens suggestions with Cmd+Backspace from an open token dropdown` — TestingLibraryElementError: Unable to find an accessible element with the role "combobox" and name "Add a search term"
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder actions clears the query and reopens suggestions with Cmd+Delete from an open token dropdown` — TestingLibraryElementError: Unable to find an accessible element with the role "combobox" and name "Add a search term"
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder actions deletes everything before the cursor with Ctrl+Backspace, keeping what is after` — Error: expect(element).toHaveValue(def)
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder actions deletes everything after the cursor with Ctrl+Delete, keeping what is before` — Error: expect(element).toHaveValue(abc)
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder actions clears the query with Ctrl+Backspace from an empty trailing input` — Error: expect(element).not.toBeInTheDocument()
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder mouse interactions can click and drag to select tokens` — Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true"
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions can remove a previous token by pressing backspace` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions can remove a subsequent token by pressing delete` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions can navigate between tokens with arrow keys` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions skips over tokens when navigating with ctrl+arrow keys` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions extends selection with shift+arrow keys` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions when focus is in a filter segment, backspace first focuses the filter then deletes it` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions has a single tab stop` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions converts pasted text into tokens` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions can remove parens with the keyboard` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions can remove logic ops with the keyboard` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions exits filter value when pressing escape` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions backspace focuses filter when input is empty` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions can select all and delete with ctrl+a` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions focus goes to first input after ctrl+a and arrow left` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions focus goes to last input after ctrl+a and arrow right` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions replaces selection when a key is pressed` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions replaces selection with pasted content with ctrl+v` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions can copy selection with ctrl-c` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions can cut selection with ctrl-x` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions wraps selected tokens in parentheses with ( key` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions wraps selected tokens in parentheses with ) key` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions wraps single selected token in parentheses` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions does not wrap when nothing is selected` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions wraps selected tokens correctly when existing parentheses are present` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions wraps selected tokens correctly when duplicate content appears earlier` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions places focus after the closing paren when wrapping` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions can undo wrapping with ctrl-z` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions can undo last action with ctrl-z` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions works with excess undo actions` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions selects the value when pressing enter after typing it in` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions filter key combobox goes to first item when pressing arrow down` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions filter key combobox goes to last item when pressing arrow up` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions filter key combobox goes to first item when pressing arrow down on the last item` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions filter key combobox goes to last item when pressing arrow up on the first item` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions filter key combobox goes to the last item after going from second up to first` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions filter key combobox goes to the first item after going from second last item up to first` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder filter types string keeps focus inside value when multi-selecting with ctrl+enter` — Unable to find role="button" and name "Edit value: firefox"
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder filter types string keeps focus inside value when multi-selecting with ctrl+click` — Unable to find role="button" and name "Edit value: firefox"

</details>

### Failures by area

| area | failed |
| --- | --: |
| app/components/searchQueryBuilder | 46 |
| app/components/core | 1 |

### Failures by error signature

| count | signature | areas | example |
| --: | --- | --- | --- |
| 36 | TypeError: Cannot set property clipboard of [object Object] which has only a getter | app/components/searchQueryBuilder | `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions can remove a previous token by pressing backspace` |
| 2 | Unable to find role="textbox" and name "Search commands" | app/components/searchQueryBuilder | `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder opens the command palette from an open suggestions menu with Ctrl+K` |
| 2 | TestingLibraryElementError: Unable to find an accessible element with the role "combobox" and name "Add a search term" | app/components/searchQueryBuilder | `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder actions clears the query and reopens suggestions with Cmd+Backspace from an open token dropdown` |
| 2 | Unable to find role="button" and name "Edit value: firefox" | app/components/searchQueryBuilder | `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder filter types string keeps focus inside value when multi-selecting with ctrl+enter` |
| 1 | Error: expect(jest.fn()).toHaveBeenCalled() | app/components/core | `static/app/components/core/dropdownMenu/dropdownMenu.spec.tsx :: DropdownMenu navigates to link on meta key` |
| 1 | Error: expect(element).toHaveValue(def) | app/components/searchQueryBuilder | `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder actions deletes everything before the cursor with Ctrl+Backspace, keeping what is after` |
| 1 | Error: expect(element).toHaveValue(abc) | app/components/searchQueryBuilder | `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder actions deletes everything after the cursor with Ctrl+Delete, keeping what is before` |
| 1 | Error: expect(element).not.toBeInTheDocument() | app/components/searchQueryBuilder | `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder actions clears the query with Ctrl+Backspace from an empty trailing input` |
| 1 | Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true" | app/components/searchQueryBuilder | `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder mouse interactions can click and drag to select tokens` |

## rtd-full

Compared with jsdom: **48 pass on jsdom but fail here**, 0 missing (e.g. suite errors), 0 added, 0 fail on jsdom but pass here.

<details><summary>pass on jsdom, fail here (48)</summary>

- `static/app/components/core/tabs/tabs.spec.tsx :: Tabs overflow activates an overflowing tab when selected from the menu` — TestingLibraryElementError: Unable to find an accessible element with the role "tab" and name "Attachments"
- `static/app/components/core/dropdownMenu/dropdownMenu.spec.tsx :: DropdownMenu navigates to link on meta key` — Error: expect(jest.fn()).toHaveBeenCalled()
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder opens the command palette from an open suggestions menu with Ctrl+K` — Unable to find role="textbox" and name "Search commands"
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder opens the command palette from an open suggestions menu with Ctrl+Shift+P` — Unable to find role="textbox" and name "Search commands"
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder actions clears the query and reopens suggestions with Cmd+Backspace from an open token dropdown` — TestingLibraryElementError: Unable to find an accessible element with the role "combobox" and name "Add a search term"
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder actions clears the query and reopens suggestions with Cmd+Delete from an open token dropdown` — TestingLibraryElementError: Unable to find an accessible element with the role "combobox" and name "Add a search term"
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder actions deletes everything before the cursor with Ctrl+Backspace, keeping what is after` — Error: expect(element).toHaveValue(def)
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder actions deletes everything after the cursor with Ctrl+Delete, keeping what is before` — Error: expect(element).toHaveValue(abc)
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder actions clears the query with Ctrl+Backspace from an empty trailing input` — Error: expect(element).not.toBeInTheDocument()
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder mouse interactions can click and drag to select tokens` — Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true"
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions can remove a previous token by pressing backspace` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions can remove a subsequent token by pressing delete` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions can navigate between tokens with arrow keys` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions skips over tokens when navigating with ctrl+arrow keys` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions extends selection with shift+arrow keys` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions when focus is in a filter segment, backspace first focuses the filter then deletes it` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions has a single tab stop` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions converts pasted text into tokens` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions can remove parens with the keyboard` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions can remove logic ops with the keyboard` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions exits filter value when pressing escape` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions backspace focuses filter when input is empty` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions can select all and delete with ctrl+a` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions focus goes to first input after ctrl+a and arrow left` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions focus goes to last input after ctrl+a and arrow right` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions replaces selection when a key is pressed` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions replaces selection with pasted content with ctrl+v` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions can copy selection with ctrl-c` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions can cut selection with ctrl-x` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions wraps selected tokens in parentheses with ( key` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions wraps selected tokens in parentheses with ) key` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions wraps single selected token in parentheses` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions does not wrap when nothing is selected` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions wraps selected tokens correctly when existing parentheses are present` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions wraps selected tokens correctly when duplicate content appears earlier` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions places focus after the closing paren when wrapping` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions can undo wrapping with ctrl-z` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions can undo last action with ctrl-z` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions works with excess undo actions` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions selects the value when pressing enter after typing it in` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions filter key combobox goes to first item when pressing arrow down` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions filter key combobox goes to last item when pressing arrow up` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions filter key combobox goes to first item when pressing arrow down on the last item` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions filter key combobox goes to last item when pressing arrow up on the first item` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions filter key combobox goes to the last item after going from second up to first` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions filter key combobox goes to the first item after going from second last item up to first` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder filter types string keeps focus inside value when multi-selecting with ctrl+enter` — Unable to find role="button" and name "Edit value: firefox"
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder filter types string keeps focus inside value when multi-selecting with ctrl+click` — Unable to find role="button" and name "Edit value: firefox"

</details>

### Failures by area

| area | failed |
| --- | --: |
| app/components/searchQueryBuilder | 46 |
| app/components/core | 2 |

### Failures by error signature

| count | signature | areas | example |
| --: | --- | --- | --- |
| 36 | TypeError: Cannot set property clipboard of [object Object] which has only a getter | app/components/searchQueryBuilder | `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions can remove a previous token by pressing backspace` |
| 2 | Unable to find role="textbox" and name "Search commands" | app/components/searchQueryBuilder | `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder opens the command palette from an open suggestions menu with Ctrl+K` |
| 2 | TestingLibraryElementError: Unable to find an accessible element with the role "combobox" and name "Add a search term" | app/components/searchQueryBuilder | `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder actions clears the query and reopens suggestions with Cmd+Backspace from an open token dropdown` |
| 2 | Unable to find role="button" and name "Edit value: firefox" | app/components/searchQueryBuilder | `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder filter types string keeps focus inside value when multi-selecting with ctrl+enter` |
| 1 | TestingLibraryElementError: Unable to find an accessible element with the role "tab" and name "Attachments" | app/components/core | `static/app/components/core/tabs/tabs.spec.tsx :: Tabs overflow activates an overflowing tab when selected from the menu` |
| 1 | Error: expect(jest.fn()).toHaveBeenCalled() | app/components/core | `static/app/components/core/dropdownMenu/dropdownMenu.spec.tsx :: DropdownMenu navigates to link on meta key` |
| 1 | Error: expect(element).toHaveValue(def) | app/components/searchQueryBuilder | `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder actions deletes everything before the cursor with Ctrl+Backspace, keeping what is after` |
| 1 | Error: expect(element).toHaveValue(abc) | app/components/searchQueryBuilder | `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder actions deletes everything after the cursor with Ctrl+Delete, keeping what is before` |
| 1 | Error: expect(element).not.toBeInTheDocument() | app/components/searchQueryBuilder | `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder actions clears the query with Ctrl+Backspace from an empty trailing input` |
| 1 | Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true" | app/components/searchQueryBuilder | `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder mouse interactions can click and drag to select tokens` |

## rtd-nohacks

Compared with jsdom: **48 pass on jsdom but fail here**, 0 missing (e.g. suite errors), 0 added, 0 fail on jsdom but pass here.

<details><summary>pass on jsdom, fail here (48)</summary>

- `static/app/components/core/tabs/tabs.spec.tsx :: Tabs overflow activates an overflowing tab when selected from the menu` — TestingLibraryElementError: Unable to find an accessible element with the role "tab" and name "Attachments"
- `static/app/components/core/dropdownMenu/dropdownMenu.spec.tsx :: DropdownMenu navigates to link on meta key` — Error: expect(jest.fn()).toHaveBeenCalled()
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder opens the command palette from an open suggestions menu with Ctrl+K` — Unable to find role="textbox" and name "Search commands"
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder opens the command palette from an open suggestions menu with Ctrl+Shift+P` — Unable to find role="textbox" and name "Search commands"
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder actions clears the query and reopens suggestions with Cmd+Backspace from an open token dropdown` — TestingLibraryElementError: Unable to find an accessible element with the role "combobox" and name "Add a search term"
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder actions clears the query and reopens suggestions with Cmd+Delete from an open token dropdown` — TestingLibraryElementError: Unable to find an accessible element with the role "combobox" and name "Add a search term"
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder actions deletes everything before the cursor with Ctrl+Backspace, keeping what is after` — Error: expect(element).toHaveValue(def)
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder actions deletes everything after the cursor with Ctrl+Delete, keeping what is before` — Error: expect(element).toHaveValue(abc)
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder actions clears the query with Ctrl+Backspace from an empty trailing input` — Error: expect(element).not.toBeInTheDocument()
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder mouse interactions can click and drag to select tokens` — Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true"
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions can remove a previous token by pressing backspace` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions can remove a subsequent token by pressing delete` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions can navigate between tokens with arrow keys` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions skips over tokens when navigating with ctrl+arrow keys` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions extends selection with shift+arrow keys` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions when focus is in a filter segment, backspace first focuses the filter then deletes it` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions has a single tab stop` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions converts pasted text into tokens` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions can remove parens with the keyboard` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions can remove logic ops with the keyboard` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions exits filter value when pressing escape` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions backspace focuses filter when input is empty` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions can select all and delete with ctrl+a` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions focus goes to first input after ctrl+a and arrow left` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions focus goes to last input after ctrl+a and arrow right` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions replaces selection when a key is pressed` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions replaces selection with pasted content with ctrl+v` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions can copy selection with ctrl-c` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions can cut selection with ctrl-x` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions wraps selected tokens in parentheses with ( key` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions wraps selected tokens in parentheses with ) key` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions wraps single selected token in parentheses` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions does not wrap when nothing is selected` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions wraps selected tokens correctly when existing parentheses are present` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions wraps selected tokens correctly when duplicate content appears earlier` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions places focus after the closing paren when wrapping` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions can undo wrapping with ctrl-z` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions can undo last action with ctrl-z` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions works with excess undo actions` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions selects the value when pressing enter after typing it in` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions filter key combobox goes to first item when pressing arrow down` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions filter key combobox goes to last item when pressing arrow up` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions filter key combobox goes to first item when pressing arrow down on the last item` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions filter key combobox goes to last item when pressing arrow up on the first item` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions filter key combobox goes to the last item after going from second up to first` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions filter key combobox goes to the first item after going from second last item up to first` — TypeError: Cannot set property clipboard of [object Object] which has only a getter
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder filter types string keeps focus inside value when multi-selecting with ctrl+enter` — Unable to find role="button" and name "Edit value: firefox"
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder filter types string keeps focus inside value when multi-selecting with ctrl+click` — Unable to find role="button" and name "Edit value: firefox"

</details>

### Failures by area

| area | failed |
| --- | --: |
| app/components/searchQueryBuilder | 46 |
| app/components/core | 2 |

### Failures by error signature

| count | signature | areas | example |
| --: | --- | --- | --- |
| 36 | TypeError: Cannot set property clipboard of [object Object] which has only a getter | app/components/searchQueryBuilder | `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder keyboard interactions can remove a previous token by pressing backspace` |
| 2 | Unable to find role="textbox" and name "Search commands" | app/components/searchQueryBuilder | `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder opens the command palette from an open suggestions menu with Ctrl+K` |
| 2 | TestingLibraryElementError: Unable to find an accessible element with the role "combobox" and name "Add a search term" | app/components/searchQueryBuilder | `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder actions clears the query and reopens suggestions with Cmd+Backspace from an open token dropdown` |
| 2 | Unable to find role="button" and name "Edit value: firefox" | app/components/searchQueryBuilder | `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder filter types string keeps focus inside value when multi-selecting with ctrl+enter` |
| 1 | TestingLibraryElementError: Unable to find an accessible element with the role "tab" and name "Attachments" | app/components/core | `static/app/components/core/tabs/tabs.spec.tsx :: Tabs overflow activates an overflowing tab when selected from the menu` |
| 1 | Error: expect(jest.fn()).toHaveBeenCalled() | app/components/core | `static/app/components/core/dropdownMenu/dropdownMenu.spec.tsx :: DropdownMenu navigates to link on meta key` |
| 1 | Error: expect(element).toHaveValue(def) | app/components/searchQueryBuilder | `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder actions deletes everything before the cursor with Ctrl+Backspace, keeping what is after` |
| 1 | Error: expect(element).toHaveValue(abc) | app/components/searchQueryBuilder | `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder actions deletes everything after the cursor with Ctrl+Delete, keeping what is before` |
| 1 | Error: expect(element).not.toBeInTheDocument() | app/components/searchQueryBuilder | `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder actions clears the query with Ctrl+Backspace from an empty trailing input` |
| 1 | Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true" | app/components/searchQueryBuilder | `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder mouse interactions can click and drag to select tokens` |

Raw Jest JSON, logs, worker samples and receipts: `downstream/sentry/output/smoke-cold/<mode>/` (gitignored).
