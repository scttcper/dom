# Comparison results

Generated 2026-10-24 by `pnpm compare` (comparison/report.ts) on Apple M4 Max, 14 cores, 36 GB, darwin arm64, Node 26.12.1. How each number is measured: [README.md](README.md).

## `vitest run`, 100 React test files

3 runs per contender, 4 workers, Vitest's default pool (a fresh worker per file): median [min–max] over runs, speedup vs jsdom in parentheses.

|  | jsdom 30.1.3 | happy-dom 21.0.4 | ctrl-dom e9f3baf+changes | ctrl-dom + its Testing Library e9f3baf+changes |
| --- | ---: | ---: | ---: | ---: |
| Wall time | 13.94 s [13.75 s–14.52 s] | 9.08 s (1.5×) [8.66 s–9.61 s] | 7.54 s (1.8×) [7.37 s–7.66 s] | **4.36 s** (3.2×) [4.35 s–4.44 s] |
| Environment setup per file (Vitest's mean) | 301 ms [297 ms–314 ms] | 143 ms (2.1×) [135 ms–151 ms] | 23.9 ms (13×) [23.5 ms–24.0 ms] | **23.3 ms** (13×) [22.6 ms–23.7 ms] |
| Worker RSS after a file (median) | 217 MB [216 MB–217 MB] | 128 MB [127 MB–128 MB] | 139 MB [139 MB–139 MB] | **126 MB** [126 MB–127 MB] |

## Cold start

A fresh process per sample (10 each, interleaved): the environment's `setup()` (importing the DOM included), then the first test (import React and Testing Library, render, `getByRole`). Median [min–max].

|  | jsdom 30.1.3 | happy-dom 21.0.4 | ctrl-dom e9f3baf+changes | ctrl-dom + its Testing Library e9f3baf+changes |
| --- | ---: | ---: | ---: | ---: |
| Environment setup | 290 ms [273 ms–313 ms] | 141 ms (2.1×) [131 ms–157 ms] | **34.7 ms** (8.4×) [32.6 ms–51.4 ms] | 36.6 ms (7.9×) [32.6 ms–39.2 ms] |
| First test | 91.8 ms [86.6 ms–102 ms] | 56.9 ms (1.6×) [50.1 ms–63.6 ms] | 70.0 ms (1.3×) [66.3 ms–107 ms] | **22.2 ms** (4.1×) [19.5 ms–25.4 ms] |
| Total | 378 ms [363 ms–413 ms] | 198 ms (1.9×) [181 ms–218 ms] | 104 ms (3.6×) [99.0 ms–158 ms] | **58.8 ms** (6.4×) [52.1 ms–62.4 ms] |
| Heap after GC | 47 MB [47 MB–47 MB] | 26 MB [26 MB–26 MB] | 19 MB [19 MB–19 MB] | **18 MB** [18 MB–18 MB] |
| RSS | 222 MB [219 MB–224 MB] | 138 MB [137 MB–140 MB] | 128 MB [126 MB–130 MB] | **120 MB** [118 MB–122 MB] |

## Benchmarks: dom.bench.ts

Median time per iteration (Vitest bench, warm; ± relative margin of error at 95%), speedup vs jsdom in parentheses.

|  | jsdom 30.1.3 | happy-dom 21.0.4 | ctrl-dom e9f3baf+changes |
| --- | ---: | ---: | ---: |
| Parse a 220 KB page (body.innerHTML =) | 40.0 ms ±1.3% | 32.5 ms (1.2×) ±2.1% | **2.11 ms** (19×) ±3.8% |
| Serialize the page (body.innerHTML) | 1.22 ms ±1.4% | 1.84 ms (0.7×) ±1.3% | **558 µs** (2.2×) ±1.2% |
| querySelectorAll('li') | 67.9 µs ±0.3% | **0.04 µs** (1617×) ±0.3% | 3.37 µs (20×) ±0.3% |
| querySelectorAll('.card') | 19.9 µs ±0.2% | **0.04 µs** (474×) ±0.7% | 1.04 µs (19×) ±0.2% |
| querySelectorAll('[aria-label]') | 1.29 ms ±0.9% | **0.08 µs** (15511×) ±0.1% | 2.29 µs (562×) ±0.2% |
| querySelectorAll('[class~="card"]') | 5.32 ms ±0.7% | **0.08 µs** (64131×) ±0.1% | 1.04 µs (5108×) ±0.2% |
| querySelectorAll(':nth-child(2n+1)') | 1.91 ms ±0.7% | **0.08 µs** (23065×) ±0.1% | 16.3 µs (118×) ±0.4% |
| Render 100 custom elements with shadow roots | 4.54 ms ±1.7% | 2.69 ms (1.7×) ±4.9% | **640 µs** (7.1×) ±7.8% |
| Build a form of 1,000 labelled inputs | 10.8 ms ±1.9% | 15.2 ms (0.7×) ±3.4% | **742 µs** (15×) ±4.0% |
| Dispatch 10 clicks through 30 ancestors (capture + bubble) | 152 µs ±0.2% | 89.8 µs (1.7×) ±0.3% | **27.6 µs** (5.5×) ±0.4% |
| getComputedStyle of 100 elements (display, visibility) | 76.6 µs ±1.4% | 21.0 µs (3.6×) ±0.3% | **8.04 µs** (9.5×) ±0.3% |
| Mutate an attribute, then querySelectorAll('[aria-label]') | 1.37 ms ±0.5% | 752 µs (1.8×) ±3.0% | **60.3 µs** (23×) ±0.3% |

## Benchmarks: react.bench.tsx

Median time per iteration (Vitest bench, warm; ± relative margin of error at 95%), speedup vs jsdom in parentheses.

|  | jsdom 30.1.3 | happy-dom 21.0.4 | ctrl-dom e9f3baf+changes | ctrl-dom + its Testing Library e9f3baf+changes |
| --- | ---: | ---: | ---: | ---: |
| Render a 20-field form, 10 getByRole({ name }) queries | 11.0 ms ±1.0% | 3.84 ms (2.9×) ±1.6% | 1.11 ms (9.9×) ±2.5% | **232 µs** (48×) ±2.7% |
| user.type('hello world') into a controlled input | 22.8 ms ±1.7% | 21.4 ms (1.1×) ±2.3% | 1.14 ms (20×) ±1.8% | **640 µs** (36×) ±1.1% |
| user.click a button 10 times (state updates) | 57.9 ms ±1.7% | 53.0 ms (1.1×) ±1.4% | 1.61 ms (36×) ±1.1% | **1.09 ms** (53×) ±1.2% |
| Reverse a 500-row keyed list, then getAllByRole('listitem') | 94.1 ms ±0.6% | 48.4 ms (1.9×) ±2.5% | 7.34 ms (13×) ±3.5% | **5.64 ms** (17×) ±1.7% |
| getByText among 200 table rows | 2.58 ms ±1.2% | 404 µs (6.4×) ±0.9% | 351 µs (7.4×) ±0.3% | **25.6 µs** (101×) ±0.4% |
| findByRole after a 20 ms timer | 24.5 ms ±1.1% | 23.9 ms (1.0×) ±1.3% | 154 µs (159×) ±2.0% | **124 µs** (197×) ±2.0% |

Notes: happy-dom caches `querySelectorAll` results until the document changes, which is why the warm query rows are near zero for it; the mutate-then-query row measures a query after a change. ctrl-dom's environment skips idle time on a virtual clock, so `findByRole` after a timer does not wait it out in real time. Contenders sharing a DOM (`sameDomAs`) run the DOM benchmarks once.
