# Sentry downstream: `components` (2026-10-26)

- upstream: https://github.com/getsentry/sentry @ `503ad2e4e2a208a87d768a3e91bcfb55a778e7ba` (2026-10-23T13:58:39Z) — fix(agents): Avoid repeated user turns during tool continuations (#128645)
- pinned: `503ad2e4e2a208a87d768a3e91bcfb55a778e7ba`
- selection: `static/app/components/`
- node v26.12.1, Jest workers 4 (same for every mode), runs per mode 1, CI=true (upstream's CI code paths), no forced GC
- upstream versions: jest@30.5.1, jsdom@30.1.1, react@19.3.0, react-dom@19.3.0, @swc/jest@0.2.39, @testing-library/react@16.3.2, @testing-library/dom@10.4.1, @testing-library/user-event@14.6.7, @testing-library/jest-dom@7.0.1, @sentry/jest-environment@8.1.0, @floating-ui/react-dom@2.1.9
- ctrl-dom-full substitutes: @testing-library/react, @testing-library/dom, @testing-library/user-event, @testing-library/jest-dom (packages/*/dist/*.cjs)
- ctrl-dom-nohacks is an **experiment**: ctrl-dom-full plus harness/nohacks.ts undoing upstream's getComputedStyle / Floating UI / matchMedia / IntersectionObserver hacks.

## Per-mode results

| mode | passed | failed | skipped | total | files | suite errors | exit | wall | CPU | peak tree RSS | peak process RSS | env setup / file (median, p95) | receipts | notes |
| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --- |
| jsdom | 6429 | 0 | 3 | 6432 | 653 | 0 | 0 | 52.8s | 226.3s | 8193 MiB | 2262 MiB | 6 ms, 7 ms | 653/653 | RTL: stock |
| ctrl-dom | 6429 | 0 | 3 | 6432 | 653 | 0 | 0 | 33.1s | 198.0s | 7840 MiB | 2419 MiB | 4 ms, 5 ms | 653/653 | 1 React; RTL: stock |
| ctrl-dom-full | 6429 | 0 | 3 | 6432 | 653 | 0 | 0 | 30.6s | 186.4s | 6965 MiB | 2089 MiB | 4 ms, 5 ms | 653/653 | 1 React |

## Jest worker memory across files

Sampled after each test file's environment teardown in every worker (no forced GC, so heap numbers include garbage). Slope = least-squares growth per file over each worker's files (first file excluded), median across workers. Upstream sets no `workerIdleMemoryLimit`.

| mode | workers | files/worker | heap after 1st file | heap after last file | heap growth/file | RSS growth/file | RSS after last file | max worker RSS |
| --- | --: | --: | --: | --: | --: | --: | --: | --: |
| jsdom | 4 | 168 | 270 MiB | 1137 MiB | 1.28 MiB | 2.58 MiB | 1709 MiB | 2256 MiB |
| ctrl-dom | 4 | 168 | 292 MiB | 1166 MiB | -0.19 MiB | 4.64 MiB | 1784 MiB | 2404 MiB |
| ctrl-dom-full | 4 | 170.5 | 174 MiB | 811 MiB | 0.91 MiB | 2.79 MiB | 1750 MiB | 2070 MiB |

## jsdom

No failing tests.

## ctrl-dom

Compared with jsdom: **0 pass on jsdom but fail here**, 0 missing (e.g. suite errors), 0 added, 0 fail on jsdom but pass here.

No failing tests.

## ctrl-dom-full

Compared with jsdom: **0 pass on jsdom but fail here**, 0 missing (e.g. suite errors), 0 added, 0 fail on jsdom but pass here.

No failing tests.

Raw Jest JSON, logs, worker samples and receipts: `downstream/sentry/output/components/<mode>/` (gitignored).
