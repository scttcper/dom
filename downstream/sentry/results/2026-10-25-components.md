# Sentry downstream: `components` (2026-10-25)

- upstream: https://github.com/getsentry/sentry @ `503ad2e4e2a208a87d768a3e91bcfb55a778e7ba` (2026-10-23T13:58:39Z) — fix(agents): Avoid repeated user turns during tool continuations (#128645)
- pinned: `503ad2e4e2a208a87d768a3e91bcfb55a778e7ba`
- selection: `static/app/components/`
- node v26.12.1, Jest workers 4 (same for every mode), runs per mode 3 (interleaved; timings are medians, counts from the last run), CI=true (upstream's CI code paths), no forced GC
- upstream versions: jest@30.5.1, jsdom@30.1.1, react@19.3.0, react-dom@19.3.0, @swc/jest@0.2.39, @testing-library/react@16.3.2, @testing-library/dom@10.4.1, @testing-library/user-event@14.6.7, @testing-library/jest-dom@7.0.1, @sentry/jest-environment@8.1.0, @floating-ui/react-dom@2.1.9
- ctrl-dom-full substitutes: @testing-library/react, @testing-library/dom, @testing-library/user-event, @testing-library/jest-dom (packages/*/dist/*.cjs)
- ctrl-dom-nohacks is an **experiment**: ctrl-dom-full plus harness/nohacks.ts undoing upstream's getComputedStyle / Floating UI / matchMedia / IntersectionObserver hacks.

## Per-mode results

| mode | passed | failed | skipped | total | files | suite errors | exit | wall | CPU | peak tree RSS | peak process RSS | env setup / file (median, p95) | receipts | notes |
| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --- |
| jsdom | 6429 | 0 | 3 | 6432 | 653 | 0 | 0 | 52.1s | 228.5s | 8520 MiB | 2409 MiB | 6 ms, 7 ms | 653/653 | RTL: stock |
| ctrl-dom | 6429 | 0 | 3 | 6432 | 653 | 0 | 0 | 33.8s | 202.1s | 7764 MiB | 2289 MiB | 4 ms, 5 ms | 653/653 | 1 React; RTL: stock |
| ctrl-dom-full | 6429 | 0 | 3 | 6432 | 653 | 0 | 0 | 31.4s | 190.5s | 6891 MiB | 2162 MiB | 4 ms, 5 ms | 653/653 | 1 React |

<details><summary>individual runs</summary>

| mode | run | wall | CPU | peak tree RSS |
| --- | --: | --: | --: | --: |
| jsdom | 1 | 52.4s | 227.8s | 8520 MiB |
| ctrl-dom | 1 | 33.8s | 203.6s | 7764 MiB |
| ctrl-dom-full | 1 | 31.4s | 190.5s | 6806 MiB |
| jsdom | 2 | 52.1s | 228.5s | 8869 MiB |
| ctrl-dom | 2 | 33.8s | 202.1s | 8622 MiB |
| ctrl-dom-full | 2 | 31.2s | 188.7s | 6891 MiB |
| jsdom | 3 | 51.9s | 229.3s | 8434 MiB |
| ctrl-dom | 3 | 33.4s | 200.6s | 6951 MiB |
| ctrl-dom-full | 3 | 31.7s | 192.1s | 7717 MiB |

</details>

## Jest worker memory across files

Sampled after each test file's environment teardown in every worker (no forced GC, so heap numbers include garbage). Slope = least-squares growth per file over each worker's files (first file excluded), median across workers. Upstream sets no `workerIdleMemoryLimit`.

| mode | workers | files/worker | heap after 1st file | heap after last file | heap growth/file | RSS growth/file | RSS after last file | max worker RSS |
| --- | --: | --: | --: | --: | --: | --: | --: | --: |
| jsdom | 4 | 168.5 | 309 MiB | 1058 MiB | 1.02 MiB | 3.96 MiB | 1651 MiB | 2225 MiB |
| ctrl-dom | 4 | 171 | 197 MiB | 842 MiB | -0.34 MiB | 3.25 MiB | 1546 MiB | 2270 MiB |
| ctrl-dom-full | 4 | 171 | 146 MiB | 983 MiB | -1.30 MiB | 1.56 MiB | 1712 MiB | 2309 MiB |

## jsdom

No failing tests.

## ctrl-dom

Compared with jsdom: **0 pass on jsdom but fail here**, 0 missing (e.g. suite errors), 0 added, 0 fail on jsdom but pass here.

No failing tests.

## ctrl-dom-full

Compared with jsdom: **0 pass on jsdom but fail here**, 0 missing (e.g. suite errors), 0 added, 0 fail on jsdom but pass here.

No failing tests.

Raw Jest JSON, logs, worker samples and receipts: `downstream/sentry/output/components/<mode>/` (gitignored).
