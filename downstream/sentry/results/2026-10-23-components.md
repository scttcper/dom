# Sentry downstream: `components` (2026-10-23)

- upstream: https://github.com/getsentry/sentry @ `503ad2e4e2a208a87d768a3e91bcfb55a778e7ba` (2026-10-23T13:58:39Z) — fix(agents): Avoid repeated user turns during tool continuations (#128645)
- pinned: `503ad2e4e2a208a87d768a3e91bcfb55a778e7ba`
- selection: `static/app/components/`
- node v26.12.1, Jest workers 6 (same for every mode), runs per mode 2 (interleaved; timings are medians, counts from the last run), CI=true (upstream's CI code paths), no forced GC
- upstream versions: jest@30.5.1, jsdom@30.1.1, react@19.3.0, react-dom@19.3.0, @swc/jest@0.2.39, @testing-library/react@16.3.2, @testing-library/dom@10.4.1, @testing-library/user-event@14.6.7, @testing-library/jest-dom@7.0.1, @sentry/jest-environment@8.1.0, @floating-ui/react-dom@2.1.9
- rtd-full substitutes: @testing-library/react, @testing-library/dom, @testing-library/user-event, @testing-library/jest-dom (packages/*/dist/*.cjs)
- rtd-nohacks is an **experiment**: rtd-full plus harness/nohacks.ts undoing upstream's getComputedStyle / Floating UI / matchMedia / IntersectionObserver hacks.

## Per-mode results

| mode | passed | failed | skipped | total | files | suite errors | exit | wall | CPU | peak tree RSS | peak process RSS | env setup / file (median, p95) | receipts | notes |
| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --- |
| jsdom | 6429 | 0 | 3 | 6432 | 653 | 0 | 0 | 50.8s | 323.9s | 7242 MiB | 1578 MiB | 9 ms, 23 ms | 653/653 | RTL: stock |
| rtd-dom | 6427 | 2 | 3 | 6432 | 653 | 0 | 1 | 43.6s | 281.3s | 7630 MiB | 1709 MiB | 6 ms, 10 ms | 653/653 | 1 React; RTL: stock |
| rtd-full | 6427 | 2 | 3 | 6432 | 653 | 0 | 1 | 40.2s | 272.1s | 7155 MiB | 1517 MiB | 6 ms, 26 ms | 653/653 | 1 React |

<details><summary>individual runs</summary>

| mode | run | wall | CPU | peak tree RSS |
| --- | --: | --: | --: | --: |
| jsdom | 1 | 50.4s | 311.9s | 7010 MiB |
| rtd-dom | 1 | 40.5s | 256.6s | 7429 MiB |
| rtd-full | 1 | 35.1s | 246.3s | 7362 MiB |
| jsdom | 2 | 51.3s | 335.9s | 7473 MiB |
| rtd-dom | 2 | 46.7s | 306.0s | 7830 MiB |
| rtd-full | 2 | 45.2s | 297.9s | 6948 MiB |

</details>

## Jest worker memory across files

Sampled after each test file's environment teardown in every worker (no forced GC, so heap numbers include garbage). Slope = least-squares growth per file over each worker's files (first file excluded), median across workers. Upstream sets no `workerIdleMemoryLimit`.

| mode | workers | files/worker | heap after 1st file | heap after last file | heap growth/file | RSS growth/file | RSS after last file | max worker RSS |
| --- | --: | --: | --: | --: | --: | --: | --: | --: |
| jsdom | 6 | 124.5 | 293 MiB | 904 MiB | -1.13 MiB | 2.53 MiB | 1230 MiB | 1574 MiB |
| rtd-dom | 6 | 117 | 142 MiB | 655 MiB | 1.78 MiB | 5.38 MiB | 1358 MiB | 1611 MiB |
| rtd-full | 6 | 123 | 169 MiB | 897 MiB | 3.03 MiB | -0.03 MiB | 934 MiB | 1520 MiB |

## jsdom

No failing tests.

## rtd-dom

Compared with jsdom: **2 pass on jsdom but fail here**, 0 missing (e.g. suite errors), 0 added, 0 fail on jsdom but pass here.

<details><summary>pass on jsdom, fail here (2)</summary>

- `static/app/components/core/dropdownMenu/dropdownMenu.spec.tsx :: DropdownMenu navigates to link on meta key` — Error: expect(jest.fn()).toHaveBeenCalled()
- `static/app/components/commandPalette/ui/featureFlagCommandPaletteActions.spec.tsx :: FeatureFlagCommandPaletteActions clears stored overrides from the command palette` — Error: expect(jest.fn()).toHaveBeenCalledWith(...expected)

</details>

### Failures by area

| area | failed |
| --- | --: |
| app/components/core | 1 |
| app/components/commandPalette | 1 |

### Failures by error signature

| count | signature | areas | example |
| --: | --- | --- | --- |
| 1 | Error: expect(jest.fn()).toHaveBeenCalled() | app/components/core | `static/app/components/core/dropdownMenu/dropdownMenu.spec.tsx :: DropdownMenu navigates to link on meta key` |
| 1 | Error: expect(jest.fn()).toHaveBeenCalledWith(...expected) | app/components/commandPalette | `static/app/components/commandPalette/ui/featureFlagCommandPaletteActions.spec.tsx :: FeatureFlagCommandPaletteActions clears stored overrides from the command palette` |

## rtd-full

Compared with jsdom: **2 pass on jsdom but fail here**, 0 missing (e.g. suite errors), 0 added, 0 fail on jsdom but pass here.

<details><summary>pass on jsdom, fail here (2)</summary>

- `static/app/components/core/dropdownMenu/dropdownMenu.spec.tsx :: DropdownMenu navigates to link on meta key` — Error: expect(jest.fn()).toHaveBeenCalled()
- `static/app/components/commandPalette/ui/featureFlagCommandPaletteActions.spec.tsx :: FeatureFlagCommandPaletteActions clears stored overrides from the command palette` — Error: expect(jest.fn()).toHaveBeenCalledWith(...expected)

</details>

### Failures by area

| area | failed |
| --- | --: |
| app/components/core | 1 |
| app/components/commandPalette | 1 |

### Failures by error signature

| count | signature | areas | example |
| --: | --- | --- | --- |
| 1 | Error: expect(jest.fn()).toHaveBeenCalled() | app/components/core | `static/app/components/core/dropdownMenu/dropdownMenu.spec.tsx :: DropdownMenu navigates to link on meta key` |
| 1 | Error: expect(jest.fn()).toHaveBeenCalledWith(...expected) | app/components/commandPalette | `static/app/components/commandPalette/ui/featureFlagCommandPaletteActions.spec.tsx :: FeatureFlagCommandPaletteActions clears stored overrides from the command palette` |

Raw Jest JSON, logs, worker samples and receipts: `downstream/sentry/output/components/<mode>/` (gitignored).
