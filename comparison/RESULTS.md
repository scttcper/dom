# Comparison results

Generated 2026-10-23 by `pnpm compare` (comparison/report.ts) on Apple M4 Max, 14 cores, 36 GB, darwin arm64, Node 26.12.1. How each number is measured: [README.md](README.md).

## `vitest run`, 100 React test files

3 runs per contender, 4 workers, Vitest's default pool (a fresh worker per file): median [min–max] over runs, speedup vs jsdom in parentheses.

|  | jsdom 30.1.3 | happy-dom 21.0.4 | ctrl-dom 645af7a | ctrl-dom + its Testing Library 645af7a |
| --- | ---: | ---: | ---: | ---: |
| Wall time | 14.37 s [14.25 s–14.57 s] | 9.31 s (1.5×) [9.31 s–9.66 s] | 6.59 s (2.2×) [6.53 s–6.68 s] | **3.61 s** (4.0×) [3.54 s–3.65 s] |
| Environment setup per file (Vitest's mean) | 306 ms [305 ms–313 ms] | 148 ms (2.1×) [145 ms–151 ms] | 33.4 ms (9.2×) [33.1 ms–33.9 ms] | **22.6 ms** (14×) [22.6 ms–22.6 ms] |
| Worker RSS after a file (median) | 217 MB [216 MB–217 MB] | 128 MB [128 MB–128 MB] | 119 MB [119 MB–119 MB] | **109 MB** [109 MB–109 MB] |

## `vitest run --pool vmForks`, 100 React test files

The same files in Vitest's VM pool: 4 long-lived workers, a fresh vm context and environment per file. 3 runs per contender, median [min–max], speedup vs jsdom in parentheses.

|  | jsdom 30.1.3 | happy-dom 21.0.4 | ctrl-dom 645af7a | ctrl-dom + its Testing Library 645af7a |
| --- | ---: | ---: | ---: | ---: |
| Wall time | 2.06 s [2.04 s–2.16 s] | 1.82 s (1.1×) [1.80 s–1.84 s] | 1.42 s (1.4×) [1.42 s–1.46 s] | **1.19 s** (1.7×) [1.19 s–1.24 s] |
| Environment setup per file (Vitest's mean) | 15.5 ms [15.3 ms–17.5 ms] | 6.88 ms (2.3×) [6.82 ms–7.14 ms] | 2.68 ms (5.8×) [2.67 ms–2.74 ms] | **2.29 ms** (6.8×) [2.26 ms–2.99 ms] |
| Worker RSS after a file (median) | 306 MB [300 MB–310 MB] | 268 MB [268 MB–269 MB] | 250 MB [246 MB–256 MB] | **240 MB** [240 MB–240 MB] |

## `jest`, 100 React test files

The same tests as plain CommonJS (no transform), each DOM's Jest environment, 4 workers, after one untimed run (warm haste map). 3 runs per contender, median [min–max], speedup vs jest-environment-jsdom in parentheses.

|  | jest-environment-jsdom 30.5.2 (jsdom 26.1.0) | @happy-dom/jest-environment 21.0.4 | jest-environment-ctrl-dom 645af7a | jest-environment-ctrl-dom + its Testing Library 645af7a |
| --- | ---: | ---: | ---: | ---: |
| Wall time | 2.52 s [2.49 s–2.58 s] | 2.47 s (1.0×) [2.32 s–2.52 s] | 2.06 s (1.2×) [1.97 s–2.22 s] | **902 ms** (2.8×) [862 ms–963 ms] |
| Environment load per file (Jest's perfStats) | 10.5 ms [10.4 ms–11.3 ms] | 7.38 ms (1.4×) [7.12 ms–7.73 ms] | 3.60 ms (2.9×) [3.48 ms–3.92 ms] | **3.56 ms** (2.9×) [3.42 ms–3.61 ms] |
| Worker RSS after a file (median) | 296 MB [295 MB–297 MB] | 275 MB [270 MB–277 MB] | 263 MB [257 MB–266 MB] | **221 MB** [219 MB–221 MB] |

## Cold start

A fresh process per sample (10 each, interleaved): the environment's `setup()` (importing the DOM included), then the first test (import React and Testing Library, render, `getByRole`). Median [min–max].

|  | jsdom 30.1.3 | happy-dom 21.0.4 | ctrl-dom 645af7a | ctrl-dom + its Testing Library 645af7a |
| --- | ---: | ---: | ---: | ---: |
| Environment setup | 281 ms [277 ms–322 ms] | 135 ms (2.1×) [132 ms–150 ms] | 44.2 ms (6.4×) [42.8 ms–46.2 ms] | **34.0 ms** (8.3×) [33.6 ms–49.9 ms] |
| First test | 89.7 ms [82.9 ms–99.3 ms] | 56.7 ms (1.6×) [55.0 ms–62.7 ms] | 61.6 ms (1.5×) [56.3 ms–67.6 ms] | **21.4 ms** (4.2×) [20.6 ms–26.3 ms] |
| Total | 371 ms [362 ms–421 ms] | 191 ms (1.9×) [187 ms–209 ms] | 106 ms (3.5×) [99.3 ms–114 ms] | **55.5 ms** (6.7×) [54.2 ms–76.2 ms] |
| Heap after GC | 47 MB [47 MB–47 MB] | 26 MB [26 MB–26 MB] | 19 MB [19 MB–19 MB] | **14 MB** [14 MB–18 MB] |
| RSS | 222 MB [216 MB–223 MB] | 139 MB [137 MB–140 MB] | 128 MB [128 MB–131 MB] | **101 MB** [101 MB–127 MB] |

## Benchmarks: dom.bench.ts

Median time per iteration (Vitest bench, warm; ± relative margin of error at 95%), speedup vs jsdom in parentheses.

|  | jsdom 30.1.3 | happy-dom 21.0.4 | ctrl-dom 645af7a |
| --- | ---: | ---: | ---: |
| Parse a 220 KB page (body.innerHTML =) | 38.6 ms ±1.1% | 31.9 ms (1.2×) ±1.3% | **2.22 ms** (17×) ±3.7% |
| Serialize the page (body.innerHTML) | 1.24 ms ±1.2% | 1.80 ms (0.7×) ±1.1% | **539 µs** (2.3×) ±1.2% |
| Array.from(querySelectorAll('li')) | 153 µs ±0.3% | **6.04 µs** (25×) ±0.2% | 8.75 µs (18×) ±0.2% |
| Array.from(querySelectorAll('.card')) | 45.4 µs ±0.2% | **1.96 µs** (23×) ±0.2% | 2.71 µs (17×) ±0.2% |
| Array.from(querySelectorAll('[aria-label]')) | 1.43 ms ±0.7% | **4.29 µs** (333×) ±0.2% | 6.21 µs (230×) ±0.3% |
| Array.from(querySelectorAll('[class~="card"]')) | 5.57 ms ±1.2% | **1.96 µs** (2845×) ±0.2% | 2.75 µs (2025×) ±0.3% |
| Array.from(querySelectorAll(':nth-child(2n+1)')) | 2.47 ms ±0.8% | **29.6 µs** (83×) ±0.2% | 42.7 µs (58×) ±0.2% |
| Render 100 custom elements with shadow roots | 4.53 ms ±1.1% | 2.44 ms (1.9×) ±3.5% | **718 µs** (6.3×) ±6.0% |
| Build a form of 1,000 labelled inputs | 11.0 ms ±1.9% | 14.8 ms (0.7×) ±3.7% | **725 µs** (15×) ±33.4% |
| Dispatch 10 clicks through 30 ancestors (capture + bubble) | 156 µs ±0.3% | 90.7 µs (1.7×) ±0.2% | **27.5 µs** (5.7×) ±0.1% |
| getComputedStyle of 100 elements (display, visibility) | 78.0 µs ±1.0% | 21.6 µs (3.6×) ±0.1% | **8.29 µs** (9.4×) ±0.2% |
| getComputedStyle of 100 elements under a 1,200-rule CSS-in-JS sheet | 54.6 ms ±1.0% | 970 µs (56×) ±2.5% | **230 µs** (237×) ±0.5% |
| Mutate an attribute, then querySelectorAll('[aria-label]') | 1.41 ms ±0.7% | 746 µs (1.9×) ±3.8% | **60.5 µs** (23×) ±0.4% |

## Benchmarks: react.bench.tsx

Median time per iteration (Vitest bench, warm; ± relative margin of error at 95%), speedup vs jsdom in parentheses.

|  | jsdom 30.1.3 | happy-dom 21.0.4 | ctrl-dom 645af7a | ctrl-dom + its Testing Library 645af7a |
| --- | ---: | ---: | ---: | ---: |
| Render a 20-field form, 10 getByRole({ name }) queries | 10.7 ms ±1.0% | 3.80 ms (2.8×) ±1.6% | 1.06 ms (10×) ±1.9% | **228 µs** (47×) ±2.6% |
| user.type('hello world') into a controlled input | 19.0 ms ±0.9% | 18.3 ms (1.0×) ±1.2% | 1.18 ms (16×) ±1.7% | **677 µs** (28×) ±1.0% |
| user.click a button 10 times (state updates) | 47.1 ms ±0.5% | 45.6 ms (1.0×) ±0.4% | 1.81 ms (26×) ±1.6% | **1.15 ms** (41×) ±1.1% |
| Reverse a 500-row keyed list, then getAllByRole('listitem') | 95.7 ms ±1.0% | 49.5 ms (1.9×) ±1.9% | 6.89 ms (14×) ±3.6% | **5.28 ms** (18×) ±1.6% |
| getByText among 200 table rows | 2.46 ms ±0.9% | 461 µs (5.3×) ±1.0% | 260 µs (9.5×) ±0.8% | **27.6 µs** (89×) ±0.2% |
| Render a 40-field form under a 1,200-rule CSS-in-JS sheet, 5 getByRole queries | 78.0 ms ±0.6% | 87.3 ms (0.9×) ±1.7% | 1.67 ms (47×) ±2.8% | **834 µs** (93×) ±2.5% |
| findByRole after a 20 ms timer | 22.6 ms ±0.6% | 22.2 ms (1.0×) ±1.9% | **140 µs** (162×) ±1.8% | 142 µs (159×) ±1.8% |

Notes: the query rows consume the result (`Array.from`), as Testing Library does; happy-dom returns the same cached NodeList until the document changes, and the mutate-then-query row measures a query after a change. ctrl-dom's environment skips idle time on a virtual clock, so `findByRole` after a timer does not wait it out in real time. Contenders sharing a DOM (`sameDomAs`) run the DOM benchmarks once.
