# Sentry downstream: `components-gc` (2026-10-23)

- upstream: https://github.com/getsentry/sentry @ `503ad2e4e2a208a87d768a3e91bcfb55a778e7ba` (2026-10-23T13:58:39Z) — fix(agents): Avoid repeated user turns during tool continuations (#128645)
- pinned: `503ad2e4e2a208a87d768a3e91bcfb55a778e7ba`
- selection: `static/app/components/`
- node v26.12.1, Jest workers 6 (same for every mode), runs per mode 1, CI=true (upstream's CI code paths), **heap sampled after a forced GC per file (--gc; timings include the GCs)**
- upstream versions: jest@30.5.1, jsdom@30.1.1, react@19.3.0, react-dom@19.3.0, @swc/jest@0.2.39, @testing-library/react@16.3.2, @testing-library/dom@10.4.1, @testing-library/user-event@14.6.7, @testing-library/jest-dom@7.0.1, @sentry/jest-environment@8.1.0, @floating-ui/react-dom@2.1.9
- rtd-full substitutes: @testing-library/react, @testing-library/dom, @testing-library/user-event, @testing-library/jest-dom (packages/*/dist/*.cjs); **dist older than src for: testing-library, user-event**
- rtd-nohacks is an **experiment**: rtd-full plus harness/nohacks.ts undoing upstream's getComputedStyle / Floating UI / matchMedia / IntersectionObserver hacks.

## Per-mode results

| mode | passed | failed | skipped | total | files | suite errors | exit | wall | CPU | peak tree RSS | peak process RSS | env setup / file (median, p95) | receipts | notes |
| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --- |
| jsdom | 6429 | 0 | 3 | 6432 | 653 | 0 | 0 | 49.9s | 377.1s | 3933 MiB | 1051 MiB | 8 ms, 13 ms | 653/653 | RTL: stock |
| rtd-dom | 6425 | 4 | 3 | 6432 | 653 | 0 | 1 | 38.6s | 343.1s | 3555 MiB | 704 MiB | 6 ms, 11 ms | 653/653 | 1 React; RTL: stock |
| rtd-full | 6424 | 5 | 3 | 6432 | 653 | 0 | 1 | 39.2s | 358.3s | 4329 MiB | 1010 MiB | 6 ms, 24 ms | 653/653 | 1 React |

## Jest worker memory across files

Sampled after each test file's environment teardown in every worker (after a forced full GC). Slope = least-squares growth per file over each worker's files (first file excluded), median across workers. Upstream sets no `workerIdleMemoryLimit`.

| mode | workers | files/worker | heap after 1st file | heap after last file | heap growth/file | RSS growth/file | RSS after last file | max worker RSS |
| --- | --: | --: | --: | --: | --: | --: | --: | --: |
| jsdom | 6 | 117 | 133 MiB | 222 MiB | 0.25 MiB | 0.10 MiB | 528 MiB | 1047 MiB |
| rtd-dom | 6 | 121.5 | 87 MiB | 215 MiB | 0.29 MiB | -0.52 MiB | 487 MiB | 699 MiB |
| rtd-full | 6 | 132 | 85 MiB | 243 MiB | 0.43 MiB | 0.22 MiB | 568 MiB | 1010 MiB |

## jsdom

No failing tests.

## rtd-dom

Compared with jsdom: **4 pass on jsdom but fail here**, 0 missing (e.g. suite errors), 0 added, 0 fail on jsdom but pass here.

<details><summary>pass on jsdom, fail here (4)</summary>

- `static/app/components/ai/chat/collapsibleContent.spec.tsx :: CollapsibleContent fires onToggle with the new open state` — Error: expect(jest.fn()).toHaveBeenCalledWith(...expected)
- `static/app/components/core/dropdownMenu/dropdownMenu.spec.tsx :: DropdownMenu navigates to link on meta key` — Error: expect(jest.fn()).toHaveBeenCalled()
- `static/app/components/commandPalette/ui/featureFlagCommandPaletteActions.spec.tsx :: FeatureFlagCommandPaletteActions clears stored overrides from the command palette` — Error: expect(jest.fn()).toHaveBeenCalledWith(...expected)
- `static/app/components/events/autofix/v3/autofixCards.spec.tsx :: ArtifactCard CodeChangesCard collapses a long comment into a disclosure` — Error: expect(received).toHaveLength(expected)

</details>

### Failures by area

| area | failed |
| --- | --: |
| app/components/ai | 1 |
| app/components/core | 1 |
| app/components/commandPalette | 1 |
| app/components/events | 1 |

### Failures by error signature

| count | signature | areas | example |
| --: | --- | --- | --- |
| 2 | Error: expect(jest.fn()).toHaveBeenCalledWith(...expected) | app/components/ai, app/components/commandPalette | `static/app/components/ai/chat/collapsibleContent.spec.tsx :: CollapsibleContent fires onToggle with the new open state` |
| 1 | Error: expect(jest.fn()).toHaveBeenCalled() | app/components/core | `static/app/components/core/dropdownMenu/dropdownMenu.spec.tsx :: DropdownMenu navigates to link on meta key` |
| 1 | Error: expect(received).toHaveLength(expected) | app/components/events | `static/app/components/events/autofix/v3/autofixCards.spec.tsx :: ArtifactCard CodeChangesCard collapses a long comment into a disclosure` |

## rtd-full

Compared with jsdom: **5 pass on jsdom but fail here**, 0 missing (e.g. suite errors), 0 added, 0 fail on jsdom but pass here.

<details><summary>pass on jsdom, fail here (5)</summary>

- `static/app/components/ai/chat/collapsibleContent.spec.tsx :: CollapsibleContent fires onToggle with the new open state` — Error: expect(jest.fn()).toHaveBeenCalledWith(...expected)
- `static/app/components/core/dropdownMenu/dropdownMenu.spec.tsx :: DropdownMenu navigates to link on meta key` — Error: expect(jest.fn()).toHaveBeenCalled()
- `static/app/components/commandPalette/ui/featureFlagCommandPaletteActions.spec.tsx :: FeatureFlagCommandPaletteActions clears stored overrides from the command palette` — Error: expect(jest.fn()).toHaveBeenCalledWith(...expected)
- `static/app/components/notificationActions/notificationActionManager.spec.tsx :: Adds, deletes, and updates notification actions Adds an Opsgenie action` — Error: expect(jest.fn()).toHaveBeenCalledWith(...expected)
- `static/app/components/events/autofix/v3/autofixCards.spec.tsx :: ArtifactCard CodeChangesCard collapses a long comment into a disclosure` — Error: expect(received).toHaveLength(expected)

</details>

### Failures by area

| area | failed |
| --- | --: |
| app/components/ai | 1 |
| app/components/core | 1 |
| app/components/commandPalette | 1 |
| app/components/notificationActions | 1 |
| app/components/events | 1 |

### Failures by error signature

| count | signature | areas | example |
| --: | --- | --- | --- |
| 3 | Error: expect(jest.fn()).toHaveBeenCalledWith(...expected) | app/components/ai, app/components/commandPalette, app/components/notificationActions | `static/app/components/ai/chat/collapsibleContent.spec.tsx :: CollapsibleContent fires onToggle with the new open state` |
| 1 | Error: expect(jest.fn()).toHaveBeenCalled() | app/components/core | `static/app/components/core/dropdownMenu/dropdownMenu.spec.tsx :: DropdownMenu navigates to link on meta key` |
| 1 | Error: expect(received).toHaveLength(expected) | app/components/events | `static/app/components/events/autofix/v3/autofixCards.spec.tsx :: ArtifactCard CodeChangesCard collapses a long comment into a disclosure` |

Raw Jest JSON, logs, worker samples and receipts: `downstream/sentry/output/components-gc/<mode>/` (gitignored).
