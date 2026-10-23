# Sentry downstream: `smoke-triage` (2026-10-23)

> **TRIAGE MODE (`--triage`)**: rtd modes ran with workarounds for blockers already filed in TRIAGE.md (navigator.platform "", writable navigator.clipboard) to look past them. These are not compatibility results.

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
| jsdom | 589 | 0 | 0 | 589 | 15 | 0 | 0 | 24.1s | 35.1s | 3214 MiB | 1048 MiB | 8 ms, 129 ms | 15/15 | RTL: stock |
| rtd-dom | 587 | 2 | 0 | 589 | 15 | 0 | 1 | 25.7s | 33.3s | 2853 MiB | 876 MiB | 8 ms, 105 ms | 15/15 | 1 React; RTL: stock |
| rtd-full | 586 | 3 | 0 | 589 | 15 | 0 | 1 | 22.5s | 32.0s | 2872 MiB | 908 MiB | 7 ms, 91 ms | 15/15 | 1 React |
| rtd-nohacks | 585 | 4 | 0 | 589 | 15 | 0 | 1 | 29.2s | 40.8s | 2881 MiB | 979 MiB | 7 ms, 104 ms | 15/15 | 1 React |

## Jest worker memory across files

Sampled after each test file's environment teardown in every worker (no forced GC, so heap numbers include garbage). Slope = least-squares growth per file over each worker's files (first file excluded), median across workers. Upstream sets no `workerIdleMemoryLimit`.

| mode | workers | files/worker | heap after 1st file | heap after last file | heap growth/file | RSS growth/file | RSS after last file | max worker RSS |
| --- | --: | --: | --: | --: | --: | --: | --: | --: |
| jsdom | 6 | 2 | 168 MiB | 225 MiB | 28.76 MiB | 32.02 MiB | 416 MiB | 1047 MiB |
| rtd-dom | 6 | 2 | 134 MiB | 184 MiB | 22.51 MiB | 25.90 MiB | 383 MiB | 872 MiB |
| rtd-full | 6 | 2 | 135 MiB | 177 MiB | 22.25 MiB | 25.99 MiB | 386 MiB | 907 MiB |
| rtd-nohacks | 6 | 2 | 118 MiB | 172 MiB | 20.47 MiB | 23.38 MiB | 369 MiB | 978 MiB |

## jsdom

No failing tests.

## rtd-dom

Compared with jsdom: **2 pass on jsdom but fail here**, 0 missing (e.g. suite errors), 0 added, 0 fail on jsdom but pass here.

<details><summary>pass on jsdom, fail here (2)</summary>

- `static/app/components/core/dropdownMenu/dropdownMenu.spec.tsx :: DropdownMenu navigates to link on meta key` — Error: expect(jest.fn()).toHaveBeenCalled()
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder mouse interactions can click and drag to select tokens` — Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true"

</details>

### Failures by area

| area | failed |
| --- | --: |
| app/components/core | 1 |
| app/components/searchQueryBuilder | 1 |

### Failures by error signature

| count | signature | areas | example |
| --: | --- | --- | --- |
| 1 | Error: expect(jest.fn()).toHaveBeenCalled() | app/components/core | `static/app/components/core/dropdownMenu/dropdownMenu.spec.tsx :: DropdownMenu navigates to link on meta key` |
| 1 | Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true" | app/components/searchQueryBuilder | `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder mouse interactions can click and drag to select tokens` |

## rtd-full

Compared with jsdom: **3 pass on jsdom but fail here**, 0 missing (e.g. suite errors), 0 added, 0 fail on jsdom but pass here.

<details><summary>pass on jsdom, fail here (3)</summary>

- `static/app/components/core/tabs/tabs.spec.tsx :: Tabs overflow activates an overflowing tab when selected from the menu` — TestingLibraryElementError: Unable to find an accessible element with the role "tab" and name "Attachments"
- `static/app/components/core/dropdownMenu/dropdownMenu.spec.tsx :: DropdownMenu navigates to link on meta key` — Error: expect(jest.fn()).toHaveBeenCalled()
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder mouse interactions can click and drag to select tokens` — Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true"

</details>

### Failures by area

| area | failed |
| --- | --: |
| app/components/core | 2 |
| app/components/searchQueryBuilder | 1 |

### Failures by error signature

| count | signature | areas | example |
| --: | --- | --- | --- |
| 1 | TestingLibraryElementError: Unable to find an accessible element with the role "tab" and name "Attachments" | app/components/core | `static/app/components/core/tabs/tabs.spec.tsx :: Tabs overflow activates an overflowing tab when selected from the menu` |
| 1 | Error: expect(jest.fn()).toHaveBeenCalled() | app/components/core | `static/app/components/core/dropdownMenu/dropdownMenu.spec.tsx :: DropdownMenu navigates to link on meta key` |
| 1 | Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true" | app/components/searchQueryBuilder | `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder mouse interactions can click and drag to select tokens` |

## rtd-nohacks

Compared with jsdom: **4 pass on jsdom but fail here**, 0 missing (e.g. suite errors), 0 added, 0 fail on jsdom but pass here.

<details><summary>pass on jsdom, fail here (4)</summary>

- `static/app/components/core/tabs/tabs.spec.tsx :: Tabs overflow activates an overflowing tab when selected from the menu` — TestingLibraryElementError: Unable to find an accessible element with the role "tab" and name "Attachments"
- `static/app/components/core/modal/index.spec.tsx :: GlobalModal does not close modal when pressing escape to close a select dropdown` — TestingLibraryElementError: Unable to find an accessible element with the role "dialog"
- `static/app/components/core/dropdownMenu/dropdownMenu.spec.tsx :: DropdownMenu navigates to link on meta key` — Error: expect(jest.fn()).toHaveBeenCalled()
- `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder mouse interactions can click and drag to select tokens` — Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true"

</details>

### Failures by area

| area | failed |
| --- | --: |
| app/components/core | 3 |
| app/components/searchQueryBuilder | 1 |

### Failures by error signature

| count | signature | areas | example |
| --: | --- | --- | --- |
| 1 | TestingLibraryElementError: Unable to find an accessible element with the role "tab" and name "Attachments" | app/components/core | `static/app/components/core/tabs/tabs.spec.tsx :: Tabs overflow activates an overflowing tab when selected from the menu` |
| 1 | TestingLibraryElementError: Unable to find an accessible element with the role "dialog" | app/components/core | `static/app/components/core/modal/index.spec.tsx :: GlobalModal does not close modal when pressing escape to close a select dropdown` |
| 1 | Error: expect(jest.fn()).toHaveBeenCalled() | app/components/core | `static/app/components/core/dropdownMenu/dropdownMenu.spec.tsx :: DropdownMenu navigates to link on meta key` |
| 1 | Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true" | app/components/searchQueryBuilder | `static/app/components/searchQueryBuilder/index.spec.tsx :: SearchQueryBuilder mouse interactions can click and drag to select tokens` |

Raw Jest JSON, logs, worker samples and receipts: `downstream/sentry/output/smoke-triage/<mode>/` (gitignored).
