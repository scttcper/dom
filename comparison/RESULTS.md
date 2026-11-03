# Comparison results

Measured 2026-11-02 on Apple M4 Max, 14 cores, 36 GB, darwin arm64, Node 26.13.0 by `pnpm compare` (comparison/report.ts). How each number is measured: [README.md](README.md).

## `vitest run`, 100 React test files

3 runs per contender, 4 workers, Vitest's default pool (a fresh worker per file): median [min–max] over runs, speedup vs jsdom in parentheses.

|  | jsdom 30.1.3 | happy-dom 21.0.4 | ctrl-dom 4aa8a45 | ctrl-dom + its Testing Library 4aa8a45 |
| --- | ---: | ---: | ---: | ---: |
| Wall time | 13.93 s [13.77 s–14.13 s] | 9.07 s (1.5×) [9.00 s–9.22 s] | 6.36 s (2.2×) [6.26 s–6.37 s] | **3.60 s** (3.9×) [3.52 s–3.60 s] |
| Environment setup per file (Vitest's mean) | 296 ms [296 ms–305 ms] | 147 ms (2.0×) [142 ms–149 ms] | 31.1 ms (9.5×) [31.0 ms–31.5 ms] | **22.3 ms** (13×) [22.2 ms–22.5 ms] |
| Worker RSS after a file (median) | 216 MB [216 MB–217 MB] | 128 MB [127 MB–128 MB] | 126 MB [126 MB–126 MB] | **106 MB** [106 MB–107 MB] |

## `vitest run --pool vmForks`, 100 React test files

The same files in Vitest's VM pool: 4 long-lived workers, a fresh vm context and environment per file. 3 runs per contender, median [min–max], speedup vs jsdom in parentheses.

|  | jsdom 30.1.3 | happy-dom 21.0.4 | ctrl-dom 4aa8a45 | ctrl-dom + its Testing Library 4aa8a45 |
| --- | ---: | ---: | ---: | ---: |
| Wall time | 2.07 s [2.06 s–2.11 s] | 1.87 s (1.1×) [1.86 s–1.97 s] | 1.40 s (1.5×) [1.39 s–1.44 s] | **1.27 s** (1.6×) [1.21 s–1.27 s] |
| Environment setup per file (Vitest's mean) | 15.5 ms [14.7 ms–15.7 ms] | 6.92 ms (2.2×) [6.82 ms–7.96 ms] | 1.69 ms (9.2×) [1.66 ms–1.72 ms] | **1.37 ms** (11×) [1.35 ms–1.88 ms] |
| Worker RSS after a file (median) | 309 MB [302 MB–309 MB] | 268 MB [268 MB–269 MB] | **246 MB** [246 MB–247 MB] | 253 MB [249 MB–263 MB] |

## `jest`, 100 React test files

The same tests as plain CommonJS (no transform), each DOM's Jest environment, 4 workers, after one untimed run (warm haste map). 3 runs per contender, median [min–max], speedup vs jest-environment-jsdom in parentheses.

|  | jest-environment-jsdom 30.5.2 (jsdom 26.1.0) | @happy-dom/jest-environment 21.0.4 | @ctrl/dom-jest-environment 4aa8a45 | @ctrl/dom-jest-environment + its Testing Library 4aa8a45 |
| --- | ---: | ---: | ---: | ---: |
| Wall time | 2.53 s [2.39 s–2.55 s] | 2.31 s (1.1×) [2.28 s–2.47 s] | 1.93 s (1.3×) [1.89 s–1.96 s] | **864 ms** (2.9×) [854 ms–876 ms] |
| Environment load per file (Jest's perfStats) | 10.2 ms [9.98 ms–10.8 ms] | 7.38 ms (1.4×) [7.36 ms–7.41 ms] | **2.64 ms** (3.9×) [2.61 ms–2.66 ms] | 2.73 ms (3.7×) [2.67 ms–2.80 ms] |
| Worker RSS after a file (median) | 294 MB [293 MB–300 MB] | 273 MB [269 MB–274 MB] | 243 MB [238 MB–243 MB] | **202 MB** [202 MB–202 MB] |

## Cold start

A fresh process per sample (10 each, interleaved): the environment's `setup()` (importing the DOM included), then the first test (import React and Testing Library, render, `getByRole`). Median [min–max].

|  | jsdom 30.1.3 | happy-dom 21.0.4 | ctrl-dom 4aa8a45 | ctrl-dom + its Testing Library 4aa8a45 |
| --- | ---: | ---: | ---: | ---: |
| Environment setup | 273 ms [259 ms–394 ms] | 131 ms (2.1×) [122 ms–147 ms] | 41.8 ms (6.5×) [40.8 ms–45.6 ms] | **34.6 ms** (7.9×) [32.4 ms–46.1 ms] |
| First test | 84.4 ms [77.8 ms–90.8 ms] | 53.5 ms (1.6×) [46.6 ms–63.4 ms] | 60.5 ms (1.4×) [56.7 ms–67.3 ms] | **21.0 ms** (4.0×) [19.9 ms–28.3 ms] |
| Total | 355 ms [337 ms–479 ms] | 186 ms (1.9×) [169 ms–211 ms] | 102 ms (3.5×) [100 ms–113 ms] | **55.5 ms** (6.4×) [52.8 ms–74.4 ms] |
| Heap after GC | 47 MB [47 MB–47 MB] | 26 MB [26 MB–26 MB] | 21 MB [21 MB–21 MB] | **15 MB** [15 MB–19 MB] |
| RSS | 222 MB [207 MB–225 MB] | 139 MB [137 MB–142 MB] | 132 MB [130 MB–134 MB] | **100 MB** [99 MB–128 MB] |

## Benchmarks: dom.bench.ts

Median time per iteration (Vitest bench, warm; ± relative margin of error at 95%), speedup vs jsdom in parentheses.

|  | jsdom 30.1.3 | happy-dom 21.0.4 | ctrl-dom 4aa8a45 |
| --- | ---: | ---: | ---: |
| Parse a 220 KB page (body.innerHTML =) | 36.5 ms ±1.0% | 31.7 ms (1.2×) ±1.4% | **2.18 ms** (17×) ±3.6% |
| Serialize the page (body.innerHTML) | 1.13 ms ±1.0% | 1.59 ms (0.7×) ±1.0% | **561 µs** (2.0×) ±1.1% |
| Array.from(querySelectorAll('li')) | 148 µs ±0.2% | **6.29 µs** (24×) ±0.2% | 8.67 µs (17×) ±0.2% |
| Array.from(querySelectorAll('.card')) | 44.9 µs ±0.2% | **2.08 µs** (22×) ±0.2% | 2.75 µs (16×) ±0.2% |
| Array.from(querySelectorAll('[aria-label]')) | 1.34 ms ±0.3% | **4.58 µs** (292×) ±0.3% | 6.25 µs (214×) ±0.2% |
| Array.from(querySelectorAll('[class~="card"]')) | 5.26 ms ±0.3% | **2.04 µs** (2577×) ±0.3% | 2.71 µs (1942×) ±0.2% |
| Array.from(querySelectorAll(':nth-child(2n+1)')) | 2.35 ms ±0.3% | **30.0 µs** (78×) ±0.2% | 42.0 µs (56×) ±0.2% |
| Render 100 custom elements with shadow roots | 4.34 ms ±1.3% | 2.49 ms (1.7×) ±3.6% | **689 µs** (6.3×) ±6.3% |
| Build a form of 1,000 labelled inputs | 10.9 ms ±1.6% | 13.6 ms (0.8×) ±3.7% | **811 µs** (13×) ±34.5% |
| Dispatch 10 clicks through 30 ancestors (capture + bubble) | 163 µs ±0.2% | 91.9 µs (1.8×) ±0.2% | **26.0 µs** (6.3×) ±0.1% |
| getComputedStyle of 100 elements (display, visibility) | 78.8 µs ±1.3% | 20.9 µs (3.8×) ±0.1% | **7.83 µs** (10×) ±0.1% |
| getComputedStyle of 100 elements under a 1,200-rule CSS-in-JS sheet | 52.8 ms ±0.3% | 964 µs (55×) ±2.4% | **136 µs** (389×) ±0.2% |
| Mutate an attribute, then querySelectorAll('[aria-label]') | 1.28 ms ±0.3% | 764 µs (1.7×) ±2.8% | **57.8 µs** (22×) ±0.2% |

## Benchmarks: react.bench.tsx

Median time per iteration (Vitest bench, warm; ± relative margin of error at 95%), speedup vs jsdom in parentheses.

|  | jsdom 30.1.3 | happy-dom 21.0.4 | ctrl-dom 4aa8a45 | ctrl-dom + its Testing Library 4aa8a45 |
| --- | ---: | ---: | ---: | ---: |
| Render a 20-field form, 10 getByRole({ name }) queries | 10.1 ms ±1.0% | 3.69 ms (2.7×) ±1.7% | 1.00 ms (10×) ±1.2% | **209 µs** (48×) ±2.3% |
| user.type('hello world') into a controlled input | 23.8 ms ±1.6% | 21.7 ms (1.1×) ±2.4% | 995 µs (24×) ±1.3% | **562 µs** (42×) ±0.9% |
| user.click a button 10 times (state updates) | 54.5 ms ±2.1% | 54.4 ms (1.0×) ±1.2% | 1.55 ms (35×) ±1.0% | **793 µs** (69×) ±0.6% |
| Reverse a 500-row keyed list, then getAllByRole('listitem') | 89.1 ms ±0.5% | 47.1 ms (1.9×) ±2.1% | 6.61 ms (13×) ±1.2% | **5.13 ms** (17×) ±1.4% |
| getByText among 200 table rows | 2.39 ms ±0.3% | 398 µs (6.0×) ±1.2% | 243 µs (9.8×) ±0.2% | **17.2 µs** (138×) ±0.4% |
| Render a 40-field form under a 1,200-rule CSS-in-JS sheet, 5 getByRole queries | 74.4 ms ±0.5% | 83.4 ms (0.9×) ±1.9% | 1.37 ms (54×) ±2.2% | **823 µs** (90×) ±3.3% |
| findByRole after a 20 ms timer | 24.0 ms ±1.2% | 24.0 ms (1.0×) ±0.7% | **128 µs** (187×) ±1.6% | 137 µs (175×) ±3.7% |

Notes: the query rows consume the result (`Array.from`), as Testing Library does; happy-dom returns the same cached NodeList until the document changes, and the mutate-then-query row measures a query after a change. ctrl-dom's environment skips idle time on a virtual clock, so `findByRole` after a timer does not wait it out in real time. Contenders sharing a DOM (`sameDomAs`) run the DOM benchmarks once.
