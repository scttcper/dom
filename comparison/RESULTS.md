# Comparison results

Generated 2026-10-23 by `pnpm compare` (comparison/report.ts) on Apple M4 Max, 14 cores, 36 GB, darwin arm64, Node 26.12.1. How each number is measured: [README.md](README.md).

## `vitest run`, 100 React test files

3 runs per contender, 4 workers, Vitest's default pool (a fresh worker per file): median [min–max] over runs, speedup vs jsdom in parentheses.

|  | jsdom 30.1.3 | happy-dom 21.0.4 | ctrl-dom 1d276c5 | ctrl-dom + its Testing Library 1d276c5 |
| --- | ---: | ---: | ---: | ---: |
| Wall time | 13.59 s [13.46 s–14.35 s] | 8.93 s (1.5×) [8.81 s–9.26 s] | 6.13 s (2.2×) [6.08 s–6.48 s] | **3.49 s** (3.9×) [3.47 s–3.67 s] |
| Environment setup per file (Vitest's mean) | 290 ms [287 ms–305 ms] | 141 ms (2.1×) [139 ms–143 ms] | 31.4 ms (9.2×) [31.2 ms–32.5 ms] | **21.9 ms** (13×) [21.8 ms–22.3 ms] |
| Worker RSS after a file (median) | 217 MB [217 MB–217 MB] | 128 MB [127 MB–128 MB] | 119 MB [119 MB–119 MB] | **108 MB** [108 MB–108 MB] |

## `vitest run --pool vmForks`, 100 React test files

The same files in Vitest's VM pool: 4 long-lived workers, a fresh vm context and environment per file. 3 runs per contender, median [min–max], speedup vs jsdom in parentheses.

|  | jsdom 30.1.3 | happy-dom 21.0.4 | ctrl-dom 1d276c5 | ctrl-dom + its Testing Library 1d276c5 |
| --- | ---: | ---: | ---: | ---: |
| Wall time | 1.97 s [1.96 s–1.99 s] | 1.76 s (1.1×) [1.76 s–1.78 s] | 1.38 s (1.4×) [1.36 s–1.39 s] | **1.14 s** (1.7×) [1.13 s–1.15 s] |
| Environment setup per file (Vitest's mean) | 14.7 ms [14.3 ms–15.5 ms] | 6.50 ms (2.3×) [6.45 ms–6.52 ms] | 2.61 ms (5.6×) [2.60 ms–2.61 ms] | **2.23 ms** (6.6×) [2.20 ms–2.23 ms] |
| Worker RSS after a file (median) | 309 MB [303 MB–321 MB] | 268 MB [267 MB–269 MB] | 255 MB [246 MB–258 MB] | **236 MB** [235 MB–236 MB] |

## `jest`, 100 React test files

The same tests as plain CommonJS (no transform), each DOM's Jest environment, 4 workers, after one untimed run (warm haste map). 3 runs per contender, median [min–max], speedup vs jest-environment-jsdom in parentheses.

|  | jest-environment-jsdom 30.5.2 (jsdom 26.1.0) | @happy-dom/jest-environment 21.0.4 | jest-environment-ctrl-dom 1d276c5 | jest-environment-ctrl-dom + its Testing Library 1d276c5 |
| --- | ---: | ---: | ---: | ---: |
| Wall time | 2.43 s [2.40 s–2.44 s] | 2.29 s (1.1×) [2.26 s–2.38 s] | 1.89 s (1.3×) [1.86 s–1.95 s] | **853 ms** (2.8×) [839 ms–861 ms] |
| Environment load per file (Jest's perfStats) | 9.98 ms [9.82 ms–10.2 ms] | 7.28 ms (1.4×) [6.86 ms–7.28 ms] | 3.46 ms (2.9×) [3.34 ms–3.49 ms] | **3.37 ms** (3.0×) [3.32 ms–3.41 ms] |
| Worker RSS after a file (median) | 296 MB [296 MB–298 MB] | 271 MB [270 MB–274 MB] | 262 MB [261 MB–263 MB] | **224 MB** [212 MB–226 MB] |

## Cold start

A fresh process per sample (10 each, interleaved): the environment's `setup()` (importing the DOM included), then the first test (import React and Testing Library, render, `getByRole`). Median [min–max].

|  | jsdom 30.1.3 | happy-dom 21.0.4 | ctrl-dom 1d276c5 | ctrl-dom + its Testing Library 1d276c5 |
| --- | ---: | ---: | ---: | ---: |
| Environment setup | 279 ms [264 ms–321 ms] | 134 ms (2.1×) [129 ms–160 ms] | 43.2 ms (6.4×) [41.6 ms–44.4 ms] | **33.9 ms** (8.2×) [32.8 ms–47.8 ms] |
| First test | 90.1 ms [85.4 ms–99.0 ms] | 56.4 ms (1.6×) [50.3 ms–60.4 ms] | 64.1 ms (1.4×) [62.5 ms–70.5 ms] | **21.6 ms** (4.2×) [19.9 ms–23.4 ms] |
| Total | 368 ms [352 ms–420 ms] | 191 ms (1.9×) [179 ms–220 ms] | 107 ms (3.4×) [105 ms–115 ms] | **54.9 ms** (6.7×) [53.6 ms–71.3 ms] |
| Heap after GC | 47 MB [47 MB–47 MB] | 26 MB [26 MB–26 MB] | 19 MB [19 MB–19 MB] | **18 MB** [18 MB–18 MB] |
| RSS | 222 MB [220 MB–224 MB] | 138 MB [137 MB–141 MB] | 129 MB [128 MB–130 MB] | **122 MB** [121 MB–128 MB] |

## Benchmarks: dom.bench.ts

Median time per iteration (Vitest bench, warm; ± relative margin of error at 95%), speedup vs jsdom in parentheses.

|  | jsdom 30.1.3 | happy-dom 21.0.4 | ctrl-dom 1d276c5 |
| --- | ---: | ---: | ---: |
| Parse a 220 KB page (body.innerHTML =) | 38.3 ms ±0.9% | 32.4 ms (1.2×) ±1.0% | **2.10 ms** (18×) ±3.5% |
| Serialize the page (body.innerHTML) | 1.21 ms ±1.3% | 1.83 ms (0.7×) ±1.3% | **555 µs** (2.2×) ±1.3% |
| Array.from(querySelectorAll('li')) | 151 µs ±0.2% | **6.08 µs** (25×) ±0.3% | 8.79 µs (17×) ±0.4% |
| Array.from(querySelectorAll('.card')) | 45.3 µs ±0.3% | **2.00 µs** (23×) ±0.4% | 2.71 µs (17×) ±0.3% |
| Array.from(querySelectorAll('[aria-label]')) | 1.43 ms ±1.2% | **4.37 µs** (327×) ±0.5% | 6.17 µs (232×) ±0.3% |
| Array.from(querySelectorAll('[class~="card"]')) | 5.41 ms ±1.0% | **2.00 µs** (2706×) ±0.4% | 2.71 µs (1998×) ±0.3% |
| Array.from(querySelectorAll(':nth-child(2n+1)')) | 2.44 ms ±0.4% | **29.7 µs** (82×) ±0.4% | 45.0 µs (54×) ±0.3% |
| Render 100 custom elements with shadow roots | 4.77 ms ±1.8% | 2.67 ms (1.8×) ±4.4% | **742 µs** (6.4×) ±6.6% |
| Build a form of 1,000 labelled inputs | 11.4 ms ±2.1% | 15.5 ms (0.7×) ±3.3% | **760 µs** (15×) ±35.0% |
| Dispatch 10 clicks through 30 ancestors (capture + bubble) | 154 µs ±0.2% | 90.9 µs (1.7×) ±0.7% | **27.7 µs** (5.6×) ±0.3% |
| getComputedStyle of 100 elements (display, visibility) | 75.0 µs ±1.2% | 21.2 µs (3.5×) ±0.4% | **8.29 µs** (9.0×) ±0.3% |
| Mutate an attribute, then querySelectorAll('[aria-label]') | 1.34 ms ±0.5% | 754 µs (1.8×) ±3.0% | **58.9 µs** (23×) ±0.4% |

## Benchmarks: react.bench.tsx

Median time per iteration (Vitest bench, warm; ± relative margin of error at 95%), speedup vs jsdom in parentheses.

|  | jsdom 30.1.3 | happy-dom 21.0.4 | ctrl-dom 1d276c5 | ctrl-dom + its Testing Library 1d276c5 |
| --- | ---: | ---: | ---: | ---: |
| Render a 20-field form, 10 getByRole({ name }) queries | 10.9 ms ±1.3% | 4.10 ms (2.7×) ±1.7% | 1.04 ms (10×) ±2.0% | **220 µs** (50×) ±2.3% |
| user.type('hello world') into a controlled input | 22.9 ms ±3.0% | 22.9 ms (1.0×) ±2.9% | 1.03 ms (22×) ±1.4% | **636 µs** (36×) ±0.9% |
| user.click a button 10 times (state updates) | 58.7 ms ±2.3% | 51.2 ms (1.1×) ±1.8% | 1.61 ms (36×) ±1.0% | **1.01 ms** (58×) ±0.6% |
| Reverse a 500-row keyed list, then getAllByRole('listitem') | 96.9 ms ±0.9% | 50.4 ms (1.9×) ±1.8% | 7.47 ms (13×) ±3.3% | **5.22 ms** (19×) ±1.6% |
| getByText among 200 table rows | 2.51 ms ±0.7% | 413 µs (6.1×) ±0.9% | 275 µs (9.1×) ±0.2% | **25.3 µs** (99×) ±0.1% |
| findByRole after a 20 ms timer | 23.2 ms ±1.0% | 23.5 ms (1.0×) ±1.0% | 132 µs (176×) ±1.7% | **123 µs** (188×) ±2.3% |

Notes: the query rows consume the result (`Array.from`), as Testing Library does; happy-dom returns the same cached NodeList until the document changes, and the mutate-then-query row measures a query after a change. ctrl-dom's environment skips idle time on a virtual clock, so `findByRole` after a timer does not wait it out in real time. Contenders sharing a DOM (`sameDomAs`) run the DOM benchmarks once.
