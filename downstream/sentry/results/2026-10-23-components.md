# Sentry downstream: `components` (2026-10-23)

- upstream: https://github.com/getsentry/sentry @ `503ad2e4e2a208a87d768a3e91bcfb55a778e7ba` (2026-10-23T13:58:39Z) — fix(agents): Avoid repeated user turns during tool continuations (#128645)
- pinned: `503ad2e4e2a208a87d768a3e91bcfb55a778e7ba`
- selection: `static/app/components/`
- node v26.12.1, Jest workers 6 (same for every mode), runs per mode 1, CI=true (upstream's CI code paths), no forced GC
- upstream versions: jest@30.5.1, jsdom@30.1.1, react@19.3.0, react-dom@19.3.0, @swc/jest@0.2.39, @testing-library/react@16.3.2, @testing-library/dom@10.4.1, @testing-library/user-event@14.6.7, @testing-library/jest-dom@7.0.1, @sentry/jest-environment@8.1.0, @floating-ui/react-dom@2.1.9
- rtd-full substitutes: @testing-library/react, @testing-library/dom, @testing-library/user-event, @testing-library/jest-dom (packages/*/dist/*.cjs)
- rtd-nohacks is an **experiment**: rtd-full plus harness/nohacks.ts undoing upstream's getComputedStyle / Floating UI / matchMedia / IntersectionObserver hacks.

## Per-mode results

| mode | passed | failed | skipped | total | files | suite errors | exit | wall | CPU | peak tree RSS | peak process RSS | env setup / file (median, p95) | receipts | notes |
| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --- |
| rtd-dom | 6426 | 3 | 3 | 6432 | 653 | 0 | 1 | 38.3s | 283.2s | 6688 MiB | 1425 MiB | 6 ms, 11 ms | 653/653 | 1 React; RTL: stock |
| rtd-full | 6426 | 3 | 3 | 6432 | 653 | 0 | 1 | 43.2s | 326.5s | 7976 MiB | 1880 MiB | 6 ms, 17 ms | 653/653 | 1 React |

## Jest worker memory across files

Sampled after each test file's environment teardown in every worker (no forced GC, so heap numbers include garbage). Slope = least-squares growth per file over each worker's files (first file excluded), median across workers. Upstream sets no `workerIdleMemoryLimit`.

| mode | workers | files/worker | heap after 1st file | heap after last file | heap growth/file | RSS growth/file | RSS after last file | max worker RSS |
| --- | --: | --: | --: | --: | --: | --: | --: | --: |
| rtd-dom | 6 | 117.5 | 219 MiB | 646 MiB | 1.24 MiB | 1.36 MiB | 888 MiB | 1414 MiB |
| rtd-full | 6 | 125.5 | 135 MiB | 556 MiB | 0.17 MiB | 0.69 MiB | 967 MiB | 1867 MiB |

## rtd-dom

### Failures by area

| area | failed |
| --- | --: |
| app/components/core | 1 |
| app/components/commandPalette | 1 |
| app/components/notificationActions | 1 |

### Failures by error signature

| count | signature | areas | example |
| --: | --- | --- | --- |
| 2 | Error: expect(jest.fn()).toHaveBeenCalledWith(...expected) | app/components/commandPalette, app/components/notificationActions | `static/app/components/commandPalette/ui/featureFlagCommandPaletteActions.spec.tsx :: FeatureFlagCommandPaletteActions clears stored overrides from the command palette` |
| 1 | Error: expect(jest.fn()).toHaveBeenCalled() | app/components/core | `static/app/components/core/dropdownMenu/dropdownMenu.spec.tsx :: DropdownMenu navigates to link on meta key` |

## rtd-full

### Failures by area

| area | failed |
| --- | --: |
| app/components/core | 2 |
| app/components/commandPalette | 1 |

### Failures by error signature

| count | signature | areas | example |
| --: | --- | --- | --- |
| 1 | Error: expect(jest.fn()).toHaveBeenCalled() | app/components/core | `static/app/components/core/dropdownMenu/dropdownMenu.spec.tsx :: DropdownMenu navigates to link on meta key` |
| 1 | Error: expect(jest.fn()).toHaveBeenCalledWith(...expected) | app/components/commandPalette | `static/app/components/commandPalette/ui/featureFlagCommandPaletteActions.spec.tsx :: FeatureFlagCommandPaletteActions clears stored overrides from the command palette` |
| 1 | TestingLibraryElementError: Unable to find an accessible element with the role "dialog" | app/components/core | `static/app/components/core/modal/index.spec.tsx :: GlobalModal does not close modal when pressing escape to close a select dropdown` |

Raw Jest JSON, logs, worker samples and receipts: `downstream/sentry/output/components/<mode>/` (gitignored).
