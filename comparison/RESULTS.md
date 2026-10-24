# Comparison results

Generated 2026-10-23 by `pnpm compare` (comparison/report.ts) on Apple M4 Max, 14 cores, 36 GB, darwin arm64, Node 26.12.1. How each number is measured: [README.md](README.md).

## `vitest run`, 100 React test files

3 runs per contender, 4 workers, Vitest's default pool (a fresh worker per file): median [min–max] over runs, speedup vs jsdom in parentheses.

|  | jsdom 30.1.3 | happy-dom 21.0.4 | ctrl-dom 0aadd30 | ctrl-dom + its Testing Library 0aadd30 |
| --- | ---: | ---: | ---: | ---: |
| Wall time | 14.16 s [14.02 s–14.20 s] | 9.12 s (1.6×) [9.08 s–9.17 s] | 6.43 s (2.2×) [6.32 s–6.60 s] | **3.64 s** (3.9×) [3.55 s–3.71 s] |
| Environment setup per file (Vitest's mean) | 303 ms [302 ms–306 ms] | 144 ms (2.1×) [142 ms–144 ms] | 32.8 ms (9.2×) [32.2 ms–32.9 ms] | **22.7 ms** (13×) [22.2 ms–23.0 ms] |
| Worker RSS after a file (median) | 216 MB [216 MB–217 MB] | 128 MB [128 MB–128 MB] | 119 MB [119 MB–119 MB] | **108 MB** [108 MB–109 MB] |

## `vitest run --pool vmForks`, 100 React test files

The same files in Vitest's VM pool: 4 long-lived workers, a fresh vm context and environment per file. 3 runs per contender, median [min–max], speedup vs jsdom in parentheses.

|  | jsdom 30.1.3 | happy-dom 21.0.4 | ctrl-dom 0aadd30 | ctrl-dom + its Testing Library 0aadd30 |
| --- | ---: | ---: | ---: | ---: |
| Wall time | 2.03 s [2.02 s–2.07 s] | 1.80 s (1.1×) [1.77 s–1.92 s] | 1.41 s (1.4×) [1.39 s–1.46 s] | **1.17 s** (1.7×) [1.15 s–1.18 s] |
| Environment setup per file (Vitest's mean) | 14.8 ms [14.6 ms–17.6 ms] | 6.53 ms (2.3×) [6.51 ms–7.26 ms] | 2.64 ms (5.6×) [2.63 ms–2.72 ms] | **2.27 ms** (6.5×) [2.25 ms–2.29 ms] |
| Worker RSS after a file (median) | 301 MB [300 MB–320 MB] | 268 MB [268 MB–268 MB] | 245 MB [244 MB–254 MB] | **235 MB** [235 MB–236 MB] |

## `jest`, 100 React test files

The same tests as plain CommonJS (no transform), each DOM's Jest environment, 4 workers, after one untimed run (warm haste map). 3 runs per contender, median [min–max], speedup vs jest-environment-jsdom in parentheses.

|  | jest-environment-jsdom 30.5.2 (jsdom 26.1.0) | @happy-dom/jest-environment 21.0.4 | jest-environment-ctrl-dom 0aadd30 | jest-environment-ctrl-dom + its Testing Library 0aadd30 |
| --- | ---: | ---: | ---: | ---: |
| Wall time | 2.39 s [2.36 s–2.45 s] | 2.30 s (1.0×) [2.29 s–2.35 s] | 1.90 s (1.3×) [1.89 s–1.93 s] | **851 ms** (2.8×) [847 ms–861 ms] |
| Environment load per file (Jest's perfStats) | 10.1 ms [9.95 ms–10.3 ms] | 7.35 ms (1.4×) [7.00 ms–8.65 ms] | **3.31 ms** (3.0×) [3.26 ms–3.57 ms] | 3.38 ms (3.0×) [3.30 ms–3.44 ms] |
| Worker RSS after a file (median) | 296 MB [294 MB–296 MB] | 269 MB [267 MB–272 MB] | 260 MB [257 MB–264 MB] | **215 MB** [214 MB–218 MB] |

## Cold start

A fresh process per sample (10 each, interleaved): the environment's `setup()` (importing the DOM included), then the first test (import React and Testing Library, render, `getByRole`). Median [min–max].

|  | jsdom 30.1.3 | happy-dom 21.0.4 | ctrl-dom 0aadd30 | ctrl-dom + its Testing Library 0aadd30 |
| --- | ---: | ---: | ---: | ---: |
| Environment setup | 288 ms [278 ms–320 ms] | 137 ms (2.1×) [132 ms–148 ms] | 42.8 ms (6.7×) [42.0 ms–49.4 ms] | **33.4 ms** (8.6×) [32.9 ms–36.1 ms] |
| First test | 90.2 ms [86.3 ms–98.8 ms] | 56.1 ms (1.6×) [51.3 ms–65.4 ms] | 62.9 ms (1.4×) [59.8 ms–69.1 ms] | **21.7 ms** (4.2×) [20.9 ms–22.9 ms] |
| Total | 383 ms [367 ms–417 ms] | 191 ms (2.0×) [188 ms–213 ms] | 106 ms (3.6×) [104 ms–114 ms] | **55.3 ms** (6.9×) [54.6 ms–57.0 ms] |
| Heap after GC | 47 MB [47 MB–47 MB] | 26 MB [26 MB–26 MB] | 19 MB [19 MB–19 MB] | **18 MB** [18 MB–18 MB] |
| RSS | 221 MB [218 MB–223 MB] | 137 MB [137 MB–140 MB] | 128 MB [127 MB–131 MB] | **122 MB** [121 MB–124 MB] |

## Benchmarks: dom.bench.ts

Median time per iteration (Vitest bench, warm; ± relative margin of error at 95%), speedup vs jsdom in parentheses.

|  | jsdom 30.1.3 | happy-dom 21.0.4 | ctrl-dom 0aadd30 |
| --- | ---: | ---: | ---: |
| Parse a 220 KB page (body.innerHTML =) | 38.9 ms ±1.6% | 33.0 ms (1.2×) ±0.9% | **2.15 ms** (18×) ±3.7% |
| Serialize the page (body.innerHTML) | 1.20 ms ±1.2% | 2.32 ms (0.5×) ±3.2% | **550 µs** (2.2×) ±1.4% |
| Array.from(querySelectorAll('li')) | 151 µs ±0.6% | **6.17 µs** (24×) ±0.4% | 8.79 µs (17×) ±0.6% |
| Array.from(querySelectorAll('.card')) | 44.0 µs ±0.3% | **1.96 µs** (22×) ±0.4% | 2.75 µs (16×) ±0.4% |
| Array.from(querySelectorAll('[aria-label]')) | 1.39 ms ±0.6% | **4.46 µs** (313×) ±0.5% | 6.21 µs (225×) ±0.3% |
| Array.from(querySelectorAll('[class~="card"]')) | 6.06 ms ±0.9% | **2.00 µs** (3031×) ±0.5% | 2.71 µs (2238×) ±0.2% |
| Array.from(querySelectorAll(':nth-child(2n+1)')) | 2.62 ms ±1.0% | **30.9 µs** (85×) ±0.6% | 42.9 µs (61×) ±0.3% |
| Render 100 custom elements with shadow roots | 4.65 ms ±1.7% | 2.62 ms (1.8×) ±3.9% | **731 µs** (6.4×) ±6.0% |
| Build a form of 1,000 labelled inputs | 11.2 ms ±1.9% | 16.1 ms (0.7×) ±4.4% | **729 µs** (15×) ±34.0% |
| Dispatch 10 clicks through 30 ancestors (capture + bubble) | 149 µs ±0.4% | 91.2 µs (1.6×) ±0.4% | **26.8 µs** (5.6×) ±0.1% |
| getComputedStyle of 100 elements (display, visibility) | 78.3 µs ±1.5% | 20.5 µs (3.8×) ±0.3% | **8.04 µs** (9.7×) ±0.1% |
| getComputedStyle of 100 elements under a 1,200-rule CSS-in-JS sheet | 58.8 ms ±1.0% | 964 µs (61×) ±2.4% | **229 µs** (257×) ±0.4% |
| Mutate an attribute, then querySelectorAll('[aria-label]') | 1.39 ms ±0.8% | 803 µs (1.7×) ±2.8% | **56.9 µs** (24×) ±0.2% |

## Benchmarks: react.bench.tsx

Median time per iteration (Vitest bench, warm; ± relative margin of error at 95%), speedup vs jsdom in parentheses.

|  | jsdom 30.1.3 | happy-dom 21.0.4 | ctrl-dom 0aadd30 | ctrl-dom + its Testing Library 0aadd30 |
| --- | ---: | ---: | ---: | ---: |
| Render a 20-field form, 10 getByRole({ name }) queries | 10.4 ms ±1.1% | 3.79 ms (2.7×) ±1.7% | 1.05 ms (9.9×) ±1.9% | **223 µs** (46×) ±2.5% |
| user.type('hello world') into a controlled input | 22.5 ms ±1.6% | 22.5 ms (1.0×) ±2.4% | 1.06 ms (21×) ±1.4% | **740 µs** (30×) ±1.2% |
| user.click a button 10 times (state updates) | 56.3 ms ±1.8% | 51.8 ms (1.1×) ±1.5% | 1.73 ms (33×) ±1.7% | **1.13 ms** (50×) ±1.3% |
| Reverse a 500-row keyed list, then getAllByRole('listitem') | 91.4 ms ±0.6% | 51.3 ms (1.8×) ±2.1% | 7.31 ms (13×) ±3.5% | **5.92 ms** (15×) ±3.3% |
| getByText among 200 table rows | 2.43 ms ±0.3% | 416 µs (5.8×) ±1.3% | 249 µs (9.7×) ±0.2% | **27.5 µs** (88×) ±0.2% |
| Render a 40-field form under a 1,200-rule CSS-in-JS sheet, 5 getByRole queries | 83.6 ms ±2.8% | 79.3 ms (1.1×) ±2.1% | 1.63 ms (51×) ±2.5% | **832 µs** (101×) ±2.3% |
| findByRole after a 20 ms timer | 24.3 ms ±1.3% | 23.7 ms (1.0×) ±0.8% | 151 µs (161×) ±2.0% | **126 µs** (192×) ±1.8% |

Notes: the query rows consume the result (`Array.from`), as Testing Library does; happy-dom returns the same cached NodeList until the document changes, and the mutate-then-query row measures a query after a change. ctrl-dom's environment skips idle time on a virtual clock, so `findByRole` after a timer does not wait it out in real time. Contenders sharing a DOM (`sameDomAs`) run the DOM benchmarks once.
