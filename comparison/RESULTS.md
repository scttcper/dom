# Comparison results

Generated 2026-10-23 by `pnpm compare` (comparison/report.ts) on Apple M4 Max, 14 cores, 36 GB, darwin arm64, Node 26.12.1. How each number is measured: [README.md](README.md).

## `vitest run`, 100 React test files

3 runs per contender, 4 workers, Vitest's default pool (a fresh worker per file): median [min–max] over runs, speedup vs jsdom in parentheses.

|  | jsdom 30.1.3 | happy-dom 21.0.4 | ctrl-dom 06e7ba7 | ctrl-dom + its Testing Library 06e7ba7 |
| --- | ---: | ---: | ---: | ---: |
| Wall time | 13.34 s [13.32 s–13.48 s] | 8.63 s (1.5×) [8.55 s–8.74 s] | 6.08 s (2.2×) [6.07 s–6.14 s] | **3.49 s** (3.8×) [3.47 s–3.49 s] |
| Environment setup per file (Vitest's mean) | 285 ms [284 ms–288 ms] | 135 ms (2.1×) [131 ms–137 ms] | 31.4 ms (9.1×) [31.3 ms–31.4 ms] | **21.9 ms** (13×) [21.6 ms–22.0 ms] |
| Worker RSS after a file (median) | 217 MB [216 MB–217 MB] | 127 MB [127 MB–127 MB] | 119 MB [119 MB–119 MB] | **108 MB** [108 MB–108 MB] |

## `vitest run --pool vmForks`, 100 React test files

The same files in Vitest's VM pool: 4 long-lived workers, a fresh vm context and environment per file. 3 runs per contender, median [min–max], speedup vs jsdom in parentheses.

|  | jsdom 30.1.3 | happy-dom 21.0.4 | ctrl-dom 06e7ba7 | ctrl-dom + its Testing Library 06e7ba7 |
| --- | ---: | ---: | ---: | ---: |
| Wall time | 1.97 s [1.96 s–1.99 s] | 1.79 s (1.1×) [1.77 s–1.79 s] | 1.38 s (1.4×) [1.37 s–1.38 s] | **1.16 s** (1.7×) [1.15 s–1.16 s] |
| Environment setup per file (Vitest's mean) | 14.7 ms [14.4 ms–15.3 ms] | 6.45 ms (2.3×) [6.45 ms–6.57 ms] | 2.60 ms (5.6×) [2.59 ms–2.63 ms] | **2.28 ms** (6.4×) [2.21 ms–2.81 ms] |
| Worker RSS after a file (median) | 308 MB [302 MB–309 MB] | 268 MB [268 MB–268 MB] | 251 MB [247 MB–257 MB] | **235 MB** [235 MB–237 MB] |

## `jest`, 100 React test files

The same tests as plain CommonJS (no transform), each DOM's Jest environment, 4 workers, after one untimed run (warm haste map). 3 runs per contender, median [min–max], speedup vs jest-environment-jsdom in parentheses.

|  | jest-environment-jsdom 30.5.2 (jsdom 26.1.0) | @happy-dom/jest-environment 21.0.4 | jest-environment-ctrl-dom 06e7ba7 | jest-environment-ctrl-dom + its Testing Library 06e7ba7 |
| --- | ---: | ---: | ---: | ---: |
| Wall time | 2.46 s [2.44 s–2.47 s] | 2.33 s (1.1×) [2.23 s–2.40 s] | 1.88 s (1.3×) [1.87 s–1.90 s] | **853 ms** (2.9×) [847 ms–853 ms] |
| Environment load per file (Jest's perfStats) | 9.89 ms [9.87 ms–9.97 ms] | 6.95 ms (1.4×) [6.80 ms–7.36 ms] | **3.38 ms** (2.9×) [3.37 ms–3.40 ms] | 3.46 ms (2.9×) [3.36 ms–3.52 ms] |
| Worker RSS after a file (median) | 294 MB [293 MB–298 MB] | 272 MB [269 MB–274 MB] | 260 MB [258 MB–264 MB] | **215 MB** [213 MB–222 MB] |

## Cold start

A fresh process per sample (10 each, interleaved): the environment's `setup()` (importing the DOM included), then the first test (import React and Testing Library, render, `getByRole`). Median [min–max].

|  | jsdom 30.1.3 | happy-dom 21.0.4 | ctrl-dom 06e7ba7 | ctrl-dom + its Testing Library 06e7ba7 |
| --- | ---: | ---: | ---: | ---: |
| Environment setup | 270 ms [263 ms–286 ms] | 129 ms (2.1×) [118 ms–134 ms] | 41.4 ms (6.5×) [40.6 ms–47.2 ms] | **32.3 ms** (8.3×) [32.0 ms–46.5 ms] |
| First test | 82.3 ms [75.7 ms–88.5 ms] | 53.1 ms (1.5×) [47.7 ms–61.7 ms] | 60.7 ms (1.4×) [55.8 ms–65.1 ms] | **20.3 ms** (4.1×) [18.6 ms–24.8 ms] |
| Total | 355 ms [339 ms–364 ms] | 183 ms (1.9×) [173 ms–188 ms] | 102 ms (3.5×) [96.7 ms–112 ms] | **53.0 ms** (6.7×) [51.0 ms–71.2 ms] |
| Heap after GC | 47 MB [47 MB–47 MB] | 26 MB [26 MB–26 MB] | 19 MB [19 MB–19 MB] | **18 MB** [18 MB–18 MB] |
| RSS | 221 MB [218 MB–225 MB] | 137 MB [137 MB–139 MB] | 128 MB [127 MB–131 MB] | **121 MB** [121 MB–126 MB] |

## Benchmarks: dom.bench.ts

Median time per iteration (Vitest bench, warm; ± relative margin of error at 95%), speedup vs jsdom in parentheses.

|  | jsdom 30.1.3 | happy-dom 21.0.4 | ctrl-dom 06e7ba7 |
| --- | ---: | ---: | ---: |
| Parse a 220 KB page (body.innerHTML =) | 38.6 ms ±0.7% | 31.5 ms (1.2×) ±1.0% | **2.06 ms** (19×) ±3.5% |
| Serialize the page (body.innerHTML) | 1.17 ms ±0.9% | 1.59 ms (0.7×) ±0.6% | **545 µs** (2.1×) ±1.2% |
| Array.from(querySelectorAll('li')) | 147 µs ±0.2% | **6.04 µs** (24×) ±0.2% | 8.96 µs (16×) ±0.2% |
| Array.from(querySelectorAll('.card')) | 44.5 µs ±0.1% | **2.00 µs** (22×) ±0.2% | 2.67 µs (17×) ±0.1% |
| Array.from(querySelectorAll('[aria-label]')) | 1.36 ms ±0.2% | **4.38 µs** (311×) ±0.2% | 6.29 µs (217×) ±0.2% |
| Array.from(querySelectorAll('[class~="card"]')) | 5.21 ms ±0.2% | **1.96 µs** (2662×) ±0.2% | 2.75 µs (1896×) ±0.1% |
| Array.from(querySelectorAll(':nth-child(2n+1)')) | 2.40 ms ±0.2% | **29.0 µs** (83×) ±0.2% | 43.4 µs (55×) ±0.1% |
| Render 100 custom elements with shadow roots | 4.58 ms ±1.3% | 2.57 ms (1.8×) ±3.9% | **694 µs** (6.6×) ±5.1% |
| Build a form of 1,000 labelled inputs | 10.7 ms ±1.5% | 15.7 ms (0.7×) ±4.1% | **716 µs** (15×) ±33.6% |
| Dispatch 10 clicks through 30 ancestors (capture + bubble) | 150 µs ±0.1% | 87.7 µs (1.7×) ±0.1% | **27.4 µs** (5.5×) ±0.1% |
| getComputedStyle of 100 elements (display, visibility) | 73.5 µs ±1.1% | 20.5 µs (3.6×) ±0.1% | **8.08 µs** (9.1×) ±0.1% |
| Mutate an attribute, then querySelectorAll('[aria-label]') | 1.25 ms ±0.2% | 726 µs (1.7×) ±2.7% | **57.2 µs** (22×) ±0.2% |

## Benchmarks: react.bench.tsx

Median time per iteration (Vitest bench, warm; ± relative margin of error at 95%), speedup vs jsdom in parentheses.

|  | jsdom 30.1.3 | happy-dom 21.0.4 | ctrl-dom 06e7ba7 | ctrl-dom + its Testing Library 06e7ba7 |
| --- | ---: | ---: | ---: | ---: |
| Render a 20-field form, 10 getByRole({ name }) queries | 10.3 ms ±0.7% | 3.70 ms (2.8×) ±1.5% | 1.03 ms (10.0×) ±1.8% | **219 µs** (47×) ±2.1% |
| user.type('hello world') into a controlled input | 26.8 ms ±3.8% | 28.8 ms (0.9×) ±2.3% | 1.01 ms (27×) ±1.1% | **631 µs** (42×) ±0.8% |
| user.click a button 10 times (state updates) | 66.7 ms ±3.0% | 59.8 ms (1.1×) ±2.2% | 1.59 ms (42×) ±1.0% | **1.00 ms** (67×) ±0.6% |
| Reverse a 500-row keyed list, then getAllByRole('listitem') | 93.3 ms ±1.0% | 47.6 ms (2.0×) ±1.3% | 6.76 ms (14×) ±3.2% | **5.13 ms** (18×) ±1.4% |
| getByText among 200 table rows | 2.40 ms ±0.2% | 407 µs (5.9×) ±0.8% | 241 µs (10.0×) ±0.1% | **27.3 µs** (88×) ±0.1% |
| findByRole after a 20 ms timer | 26.8 ms ±1.5% | 25.0 ms (1.1×) ±0.8% | 130 µs (206×) ±1.7% | **121 µs** (222×) ±1.7% |

Notes: the query rows consume the result (`Array.from`), as Testing Library does; happy-dom returns the same cached NodeList until the document changes, and the mutate-then-query row measures a query after a change. ctrl-dom's environment skips idle time on a virtual clock, so `findByRole` after a timer does not wait it out in real time. Contenders sharing a DOM (`sameDomAs`) run the DOM benchmarks once.
