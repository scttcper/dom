# Comparison results

Measured 2026-11-15 on 12th Gen Intel(R) Core(TM) i5-12600K, 16 cores, 63 GB, linux x64, Node 26.13.1 by `pnpm compare` (comparison/report.ts). How each number is measured: [README.md](README.md).

## `vitest run`, 100 React test files

3 runs per contender, 4 workers, Vitest's default pool (a fresh worker per file): median [min–max] over runs, speedup vs jsdom in parentheses.

|  | jsdom 31.0.1 | happy-dom 21.0.4 | ctrl-dom 6e7d333 | ctrl-dom + its Testing Library 6e7d333 |
| --- | ---: | ---: | ---: | ---: |
| Wall time | 12.98 s [12.90 s–13.22 s] | 9.35 s (1.4×) [8.95 s–9.87 s] | 6.97 s (1.9×) [6.92 s–7.18 s] | **5.13 s** (2.5×) [4.85 s–5.63 s] |
| Environment setup per file (Vitest's mean) | 256 ms [253 ms–256 ms] | 136 ms (1.9×) [134 ms–137 ms] | 53.1 ms (4.8×) [52.5 ms–54.9 ms] | **45.7 ms** (5.6×) [39.7 ms–48.6 ms] |
| Worker RSS after a file (median) | 154 MB [154 MB–154 MB] | 117 MB [117 MB–117 MB] | 117 MB [116 MB–117 MB] | **95 MB** [95 MB–95 MB] |

## `vitest run --pool vmForks`, 100 React test files

The same files in Vitest's VM pool: 4 long-lived workers, a fresh vm context and environment per file. 3 runs per contender, median [min–max], speedup vs jsdom in parentheses.

|  | jsdom 31.0.1 | happy-dom 21.0.4 | ctrl-dom 6e7d333 | ctrl-dom + its Testing Library 6e7d333 |
| --- | ---: | ---: | ---: | ---: |
| Wall time | 3.78 s [3.67 s–3.96 s] | 4.05 s (0.9×) [3.87 s–4.34 s] | 2.67 s (1.4×) [2.58 s–2.88 s] | **2.39 s** (1.6×) [2.17 s–2.49 s] |
| Environment setup per file (Vitest's mean) | 20.0 ms [19.6 ms–21.1 ms] | 10.3 ms (1.9×) [9.30 ms–11.9 ms] | 4.74 ms (4.2×) [3.42 ms–6.22 ms] | **4.11 ms** (4.9×) [2.75 ms–4.96 ms] |
| Worker RSS after a file (median) | 296 MB [296 MB–298 MB] | 252 MB [252 MB–253 MB] | **236 MB** [236 MB–237 MB] | 249 MB [244 MB–250 MB] |

## `jest`, 100 React test files

The same tests as plain CommonJS (no transform), each DOM's Jest environment, 4 workers, after one untimed run (warm haste map). 3 runs per contender, median [min–max], speedup vs jest-environment-jsdom in parentheses.

|  | jest-environment-jsdom 30.5.2 (jsdom 26.1.0) | @happy-dom/jest-environment 21.0.4 | @ctrl/dom-jest-environment 6e7d333 | @ctrl/dom-jest-environment + its Testing Library 6e7d333 |
| --- | ---: | ---: | ---: | ---: |
| Wall time | 2.46 s [2.44 s–2.75 s] | 2.36 s (1.0×) [2.29 s–2.53 s] | 1.65 s (1.5×) [1.55 s–1.70 s] | **992 ms** (2.5×) [955 ms–1.21 s] |
| Environment load per file (Jest's perfStats) | 12.6 ms [12.3 ms–13.7 ms] | 8.82 ms (1.4×) [8.16 ms–8.89 ms] | 5.71 ms (2.2×) [4.53 ms–6.01 ms] | **3.74 ms** (3.4×) [3.56 ms–4.74 ms] |
| Worker RSS after a file (median) | 279 MB [276 MB–280 MB] | 257 MB [251 MB–259 MB] | 227 MB [225 MB–231 MB] | **197 MB** [194 MB–200 MB] |

## Cold start

A fresh process per sample (10 each, interleaved): the environment's `setup()` (importing the DOM included), then the first test (import React and Testing Library, render, `getByRole`). Median [min–max].

|  | jsdom 31.0.1 | happy-dom 21.0.4 | ctrl-dom 6e7d333 | ctrl-dom + its Testing Library 6e7d333 |
| --- | ---: | ---: | ---: | ---: |
| Environment setup | 235 ms [232 ms–358 ms] | 134 ms (1.7×) [132 ms–254 ms] | **59.9 ms** (3.9×) [58.8 ms–289 ms] | 91.0 ms (2.6×) [49.6 ms–220 ms] |
| First test | 65.8 ms [61.6 ms–67.4 ms] | 46.5 ms (1.4×) [46.1 ms–46.7 ms] | 53.9 ms (1.2×) [53.1 ms–57.8 ms] | **22.6 ms** (2.9×) [22.0 ms–22.9 ms] |
| Total | 300 ms [297 ms–424 ms] | 181 ms (1.7×) [178 ms–300 ms] | 114 ms (2.6×) [113 ms–344 ms] | **114 ms** (2.6×) [72.3 ms–242 ms] |
| Heap after GC | 41 MB [41 MB–41 MB] | 26 MB [26 MB–26 MB] | 21 MB [21 MB–21 MB] | **16 MB** [16 MB–16 MB] |
| RSS | 166 MB [153 MB–167 MB] | 122 MB [121 MB–122 MB] | 113 MB [112 MB–113 MB] | **90 MB** [90 MB–91 MB] |

## Benchmarks: dom.bench.ts

Median time per iteration (Vitest bench, warm; ± relative margin of error at 95%), speedup vs jsdom in parentheses.

|  | jsdom 31.0.1 | happy-dom 21.0.4 | ctrl-dom 6e7d333 |
| --- | ---: | ---: | ---: |
| Parse a 220 KB page (body.innerHTML =) | 37.7 ms ±10.9% | 44.9 ms (0.8×) ±1.5% | **3.31 ms** (11×) ±10.2% |
| Serialize the page (body.innerHTML) | 1.24 ms ±0.4% | 2.15 ms (0.6×) ±0.8% | **672 µs** (1.8×) ±1.1% |
| Array.from(querySelectorAll('li')) | 129 µs ±0.1% | **7.74 µs** (17×) ±0.4% | 10.4 µs (12×) ±0.2% |
| Array.from(querySelectorAll('.card')) | 41.1 µs ±0.1% | **2.58 µs** (16×) ±0.3% | 3.46 µs (12×) ±0.2% |
| Array.from(querySelectorAll('[aria-label]')) | 786 µs ±0.2% | **5.65 µs** (139×) ±0.2% | 7.47 µs (105×) ±0.2% |
| Array.from(querySelectorAll('[class~="card"]')) | 1.52 ms ±0.2% | **2.59 µs** (589×) ±0.2% | 3.46 µs (440×) ±0.3% |
| Array.from(querySelectorAll(':nth-child(2n+1)')) | 1.46 ms ±0.2% | **35.7 µs** (41×) ±0.3% | 50.1 µs (29×) ±0.2% |
| Render 100 custom elements with shadow roots | 4.41 ms ±2.8% | 3.26 ms (1.4×) ±5.8% | **887 µs** (5.0×) ±7.8% |
| Build a form of 1,000 labelled inputs | 11.3 ms ±1.6% | 20.6 ms (0.5×) ±3.8% | **1.11 ms** (10×) ±31.2% |
| Dispatch 10 clicks through 30 ancestors (capture + bubble) | 200 µs ±0.2% | 111 µs (1.8×) ±0.2% | **18.1 µs** (11×) ±0.1% |
| getComputedStyle of 100 elements (display, visibility) | 81.7 µs ±0.2% | 21.1 µs (3.9×) ±0.7% | **8.00 µs** (10×) ±0.1% |
| getComputedStyle of 100 elements under a 1,200-rule CSS-in-JS sheet | 2.01 ms ±1.0% | 1.21 ms (1.7×) ±2.9% | **190 µs** (11×) ±0.3% |
| Mutate an attribute, then querySelectorAll('[aria-label]') | 747 µs ±0.3% | 963 µs (0.8×) ±3.4% | **74.7 µs** (10×) ±0.1% |

## Benchmarks: react.bench.tsx

Median time per iteration (Vitest bench, warm; ± relative margin of error at 95%), speedup vs jsdom in parentheses.

|  | jsdom 31.0.1 | happy-dom 21.0.4 | ctrl-dom 6e7d333 | ctrl-dom + its Testing Library 6e7d333 |
| --- | ---: | ---: | ---: | ---: |
| Render a 20-field form, 10 getByRole({ name }) queries | 5.63 ms ±0.8% | 4.97 ms (1.1×) ±2.5% | 1.35 ms (4.2×) ±1.4% | **263 µs** (21×) ±2.9% |
| user.type('hello world') into a controlled input | 40.0 ms ±1.9% | 34.9 ms (1.1×) ±1.6% | 1.11 ms (36×) ±2.2% | **511 µs** (78×) ±0.7% |
| user.click a button 10 times (state updates) | 76.8 ms ±1.4% | 63.2 ms (1.2×) ±0.7% | 1.03 ms (75×) ±2.7% | **361 µs** (213×) ±0.3% |
| Reverse a 500-row keyed list, then getAllByRole('listitem') | 32.5 ms ±7.7% | 58.6 ms (0.6×) ±6.1% | 9.11 ms (3.6×) ±1.9% | **7.53 ms** (4.3×) ±2.4% |
| getByText among 200 table rows | 2.04 ms ±0.2% | 576 µs (3.5×) ±0.6% | 366 µs (5.6×) ±0.2% | **13.2 µs** (155×) ±0.1% |
| Render a 40-field form under a 1,200-rule CSS-in-JS sheet, 5 getByRole queries | 8.53 ms ±11.8% | 95.0 ms (0.1×) ±6.6% | 2.02 ms (4.2×) ±2.8% | **1.06 ms** (8.0×) ±3.8% |
| findByRole after a 20 ms timer | 24.0 ms ±0.1% | 23.8 ms (1.0×) ±0.5% | 97.2 µs (247×) ±2.3% | **47.7 µs** (503×) ±1.3% |

Notes: the query rows consume the result (`Array.from`), as Testing Library does; happy-dom returns the same cached NodeList until the document changes, and the mutate-then-query row measures a query after a change. ctrl-dom's environment skips idle time on a virtual clock, so `findByRole` after a timer does not wait it out in real time. Contenders sharing a DOM (`sameDomAs`) run the DOM benchmarks once.
