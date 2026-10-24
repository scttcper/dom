# Comparison results

Generated 2026-10-23 by `pnpm compare` (comparison/report.ts) on Apple M4 Max, 14 cores, 36 GB, darwin arm64, Node 26.12.1. How each number is measured: [README.md](README.md).

## `vitest run`, 100 React test files

3 runs per contender, 4 workers, Vitest's default pool (a fresh worker per file): median [min–max] over runs, speedup vs jsdom in parentheses.

|  | jsdom 30.1.3 | happy-dom 21.0.4 | ctrl-dom d991aa5 | ctrl-dom + its Testing Library d991aa5 |
| --- | ---: | ---: | ---: | ---: |
| Wall time | 13.32 s [13.31 s–13.81 s] | 8.73 s (1.5×) [8.51 s–8.83 s] | 6.07 s (2.2×) [6.03 s–6.18 s] | **3.47 s** (3.8×) [3.45 s–3.57 s] |
| Environment setup per file (Vitest's mean) | 284 ms [284 ms–293 ms] | 135 ms (2.1×) [132 ms–138 ms] | 31.2 ms (9.1×) [30.9 ms–31.7 ms] | **21.5 ms** (13×) [21.4 ms–21.8 ms] |
| Worker RSS after a file (median) | 216 MB [216 MB–217 MB] | 127 MB [127 MB–128 MB] | 119 MB [119 MB–119 MB] | **108 MB** [108 MB–108 MB] |

## Cold start

A fresh process per sample (10 each, interleaved): the environment's `setup()` (importing the DOM included), then the first test (import React and Testing Library, render, `getByRole`). Median [min–max].

|  | jsdom 30.1.3 | happy-dom 21.0.4 | ctrl-dom d991aa5 | ctrl-dom + its Testing Library d991aa5 |
| --- | ---: | ---: | ---: | ---: |
| Environment setup | 273 ms [263 ms–308 ms] | 132 ms (2.1×) [123 ms–147 ms] | 43.2 ms (6.3×) [41.5 ms–46.5 ms] | **33.5 ms** (8.2×) [32.4 ms–46.0 ms] |
| First test | 88.5 ms [82.6 ms–103 ms] | 54.7 ms (1.6×) [46.8 ms–64.3 ms] | 61.8 ms (1.4×) [52.3 ms–65.2 ms] | **21.7 ms** (4.1×) [19.7 ms–23.5 ms] |
| Total | 362 ms [346 ms–411 ms] | 188 ms (1.9×) [170 ms–211 ms] | 105 ms (3.5×) [95.2 ms–110 ms] | **55.2 ms** (6.6×) [53.4 ms–67.7 ms] |
| Heap after GC | 47 MB [47 MB–47 MB] | 26 MB [26 MB–26 MB] | 19 MB [19 MB–19 MB] | **18 MB** [18 MB–18 MB] |
| RSS | 222 MB [220 MB–224 MB] | 137 MB [136 MB–140 MB] | 128 MB [126 MB–130 MB] | **120 MB** [118 MB–122 MB] |

## Benchmarks: dom.bench.ts

Median time per iteration (Vitest bench, warm; ± relative margin of error at 95%), speedup vs jsdom in parentheses.

|  | jsdom 30.1.3 | happy-dom 21.0.4 | ctrl-dom d991aa5 |
| --- | ---: | ---: | ---: |
| Parse a 220 KB page (body.innerHTML =) | 38.2 ms ±0.8% | 32.3 ms (1.2×) ±1.2% | **2.08 ms** (18×) ±4.0% |
| Serialize the page (body.innerHTML) | 1.14 ms ±1.2% | 1.87 ms (0.6×) ±1.4% | **542 µs** (2.1×) ±1.1% |
| querySelectorAll('li') | 68.4 µs ±0.3% | **0.04 µs** (1629×) ±0.1% | 3.33 µs (21×) ±0.2% |
| querySelectorAll('.card') | 20.0 µs ±0.2% | **0.08 µs** (241×) ±0.1% | 1.08 µs (18×) ±0.4% |
| querySelectorAll('[aria-label]') | 1.28 ms ±0.4% | **0.08 µs** (15392×) ±0.1% | 2.29 µs (557×) ±0.1% |
| querySelectorAll('[class~="card"]') | 5.50 ms ±0.3% | **0.08 µs** (66319×) ±0.1% | 1.08 µs (5083×) ±0.2% |
| querySelectorAll(':nth-child(2n+1)') | 1.90 ms ±0.3% | **0.08 µs** (22868×) ±0.1% | 16.3 µs (116×) ±0.2% |
| Render 100 custom elements with shadow roots | 4.56 ms ±1.2% | 2.56 ms (1.8×) ±4.6% | **705 µs** (6.5×) ±6.1% |
| Build a form of 1,000 labelled inputs | 11.1 ms ±1.7% | 15.7 ms (0.7×) ±3.5% | **738 µs** (15×) ±31.2% |
| Dispatch 10 clicks through 30 ancestors (capture + bubble) | 148 µs ±0.2% | 88.0 µs (1.7×) ±0.6% | **27.7 µs** (5.4×) ±0.1% |
| getComputedStyle of 100 elements (display, visibility) | 75.8 µs ±1.1% | 20.1 µs (3.8×) ±0.2% | **8.71 µs** (8.7×) ±0.1% |
| Mutate an attribute, then querySelectorAll('[aria-label]') | 1.32 ms ±0.5% | 739 µs (1.8×) ±3.1% | **59.4 µs** (22×) ±0.2% |

## Benchmarks: react.bench.tsx

Median time per iteration (Vitest bench, warm; ± relative margin of error at 95%), speedup vs jsdom in parentheses.

|  | jsdom 30.1.3 | happy-dom 21.0.4 | ctrl-dom d991aa5 | ctrl-dom + its Testing Library d991aa5 |
| --- | ---: | ---: | ---: | ---: |
| Render a 20-field form, 10 getByRole({ name }) queries | 10.5 ms ±0.8% | 3.77 ms (2.8×) ±1.5% | 1.05 ms (10.0×) ±1.9% | **222 µs** (47×) ±2.2% |
| user.type('hello world') into a controlled input | 24.3 ms ±2.1% | 25.0 ms (1.0×) ±2.4% | 1.02 ms (24×) ±1.4% | **649 µs** (37×) ±1.0% |
| user.click a button 10 times (state updates) | 62.5 ms ±2.2% | 56.6 ms (1.1×) ±1.7% | 1.60 ms (39×) ±1.1% | **1.01 ms** (62×) ±0.6% |
| Reverse a 500-row keyed list, then getAllByRole('listitem') | 94.6 ms ±0.8% | 48.7 ms (1.9×) ±1.2% | 7.02 ms (13×) ±3.3% | **5.25 ms** (18×) ±1.6% |
| getByText among 200 table rows | 2.47 ms ±0.5% | 393 µs (6.3×) ±0.8% | 344 µs (7.2×) ±0.2% | **25.5 µs** (97×) ±0.2% |
| findByRole after a 20 ms timer | 25.0 ms ±1.0% | 24.3 ms (1.0×) ±1.0% | **134 µs** (186×) ±1.8% | 140 µs (179×) ±1.8% |

Notes: happy-dom caches `querySelectorAll` results until the document changes, which is why the warm query rows are near zero for it; the mutate-then-query row measures a query after a change. ctrl-dom's environment skips idle time on a virtual clock, so `findByRole` after a timer does not wait it out in real time. Contenders sharing a DOM (`sameDomAs`) run the DOM benchmarks once.
