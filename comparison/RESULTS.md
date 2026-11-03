# Comparison results

Measured 2026-11-02 on Apple M4 Max, 14 cores, 36 GB, darwin arm64, Node 26.13.0 by `pnpm compare` (comparison/report.ts). How each number is measured: [README.md](README.md).

## `vitest run`, 100 React test files

3 runs per contender, 4 workers, Vitest's default pool (a fresh worker per file): median [min–max] over runs, speedup vs jsdom in parentheses.

|  | jsdom 30.1.3 | happy-dom 21.0.4 | ctrl-dom cbff411 | ctrl-dom + its Testing Library cbff411 |
| --- | ---: | ---: | ---: | ---: |
| Wall time | 14.36 s [14.04 s–14.37 s] | 9.20 s (1.6×) [9.15 s–9.21 s] | 6.64 s (2.2×) [6.63 s–6.72 s] | **3.65 s** (3.9×) [3.56 s–3.85 s] |
| Environment setup per file (Vitest's mean) | 307 ms [301 ms–311 ms] | 146 ms (2.1×) [142 ms–147 ms] | 32.6 ms (9.4×) [32.5 ms–32.9 ms] | **22.7 ms** (13×) [22.6 ms–23.7 ms] |
| Worker RSS after a file (median) | 217 MB [217 MB–217 MB] | 128 MB [128 MB–128 MB] | 125 MB [125 MB–126 MB] | **107 MB** [107 MB–107 MB] |

## `vitest run --pool vmForks`, 100 React test files

The same files in Vitest's VM pool: 4 long-lived workers, a fresh vm context and environment per file. 3 runs per contender, median [min–max], speedup vs jsdom in parentheses.

|  | jsdom 30.1.3 | happy-dom 21.0.4 | ctrl-dom cbff411 | ctrl-dom + its Testing Library cbff411 |
| --- | ---: | ---: | ---: | ---: |
| Wall time | 2.14 s [2.03 s–2.15 s] | 1.90 s (1.1×) [1.83 s–1.96 s] | 1.42 s (1.5×) [1.41 s–1.46 s] | **1.33 s** (1.6×) [1.29 s–1.37 s] |
| Environment setup per file (Vitest's mean) | 15.8 ms [15.8 ms–16.3 ms] | 6.87 ms (2.3×) [6.72 ms–7.67 ms] | 1.67 ms (9.5×) [1.65 ms–1.70 ms] | **1.45 ms** (11×) [1.36 ms–1.93 ms] |
| Worker RSS after a file (median) | 320 MB [301 MB–321 MB] | 269 MB [268 MB–269 MB] | **247 MB** [237 MB–247 MB] | 250 MB [237 MB–262 MB] |

## `jest`, 100 React test files

The same tests as plain CommonJS (no transform), each DOM's Jest environment, 4 workers, after one untimed run (warm haste map). 3 runs per contender, median [min–max], speedup vs jest-environment-jsdom in parentheses.

|  | jest-environment-jsdom 30.5.2 (jsdom 26.1.0) | @happy-dom/jest-environment 21.0.4 | @ctrl/dom-jest-environment cbff411 | @ctrl/dom-jest-environment + its Testing Library cbff411 |
| --- | ---: | ---: | ---: | ---: |
| Wall time | 2.52 s [2.45 s–2.60 s] | 2.35 s (1.1×) [2.35 s–2.37 s] | 1.92 s (1.3×) [1.91 s–2.00 s] | **881 ms** (2.9×) [846 ms–885 ms] |
| Environment load per file (Jest's perfStats) | 10.5 ms [10.4 ms–11.1 ms] | 7.87 ms (1.3×) [7.47 ms–7.88 ms] | 2.71 ms (3.9×) [2.70 ms–2.80 ms] | **2.67 ms** (3.9×) [2.64 ms–3.01 ms] |
| Worker RSS after a file (median) | 295 MB [293 MB–297 MB] | 275 MB [274 MB–275 MB] | 239 MB [234 MB–242 MB] | **202 MB** [195 MB–203 MB] |

## Cold start

A fresh process per sample (10 each, interleaved): the environment's `setup()` (importing the DOM included), then the first test (import React and Testing Library, render, `getByRole`). Median [min–max].

|  | jsdom 30.1.3 | happy-dom 21.0.4 | ctrl-dom cbff411 | ctrl-dom + its Testing Library cbff411 |
| --- | ---: | ---: | ---: | ---: |
| Environment setup | 287 ms [263 ms–325 ms] | 134 ms (2.1×) [123 ms–146 ms] | 42.7 ms (6.7×) [41.4 ms–44.5 ms] | **35.0 ms** (8.2×) [34.3 ms–48.8 ms] |
| First test | 88.5 ms [83.0 ms–102 ms] | 55.2 ms (1.6×) [51.2 ms–59.2 ms] | 61.9 ms (1.4×) [56.1 ms–70.9 ms] | **20.9 ms** (4.2×) [19.4 ms–23.2 ms] |
| Total | 379 ms [346 ms–417 ms] | 187 ms (2.0×) [178 ms–205 ms] | 105 ms (3.6×) [98.8 ms–115 ms] | **55.5 ms** (6.8×) [54.2 ms–70.9 ms] |
| Heap after GC | 47 MB [47 MB–47 MB] | 26 MB [26 MB–26 MB] | 21 MB [21 MB–21 MB] | **15 MB** [15 MB–15 MB] |
| RSS | 223 MB [207 MB–226 MB] | 139 MB [137 MB–143 MB] | 132 MB [131 MB–134 MB] | **100 MB** [99 MB–107 MB] |

## Benchmarks: dom.bench.ts

Median time per iteration (Vitest bench, warm; ± relative margin of error at 95%), speedup vs jsdom in parentheses.

|  | jsdom 30.1.3 | happy-dom 21.0.4 | ctrl-dom cbff411 |
| --- | ---: | ---: | ---: |
| Parse a 220 KB page (body.innerHTML =) | 40.9 ms ±1.2% | 32.2 ms (1.3×) ±1.2% | **2.25 ms** (18×) ±3.5% |
| Serialize the page (body.innerHTML) | 1.23 ms ±1.3% | 1.88 ms (0.7×) ±1.0% | **568 µs** (2.2×) ±1.3% |
| Array.from(querySelectorAll('li')) | 152 µs ±0.4% | **5.92 µs** (26×) ±0.2% | 8.67 µs (18×) ±0.5% |
| Array.from(querySelectorAll('.card')) | 45.2 µs ±0.3% | **1.96 µs** (23×) ±0.3% | 2.71 µs (17×) ±0.3% |
| Array.from(querySelectorAll('[aria-label]')) | 1.36 ms ±0.8% | **4.37 µs** (310×) ±0.4% | 6.08 µs (223×) ±0.2% |
| Array.from(querySelectorAll('[class~="card"]')) | 6.00 ms ±0.6% | **1.96 µs** (3065×) ±0.3% | 2.67 µs (2250×) ±0.2% |
| Array.from(querySelectorAll(':nth-child(2n+1)')) | 2.49 ms ±0.6% | **29.5 µs** (84×) ±0.2% | 42.3 µs (59×) ±0.2% |
| Render 100 custom elements with shadow roots | 4.77 ms ±1.8% | 2.55 ms (1.9×) ±5.1% | **694 µs** (6.9×) ±5.8% |
| Build a form of 1,000 labelled inputs | 11.6 ms ±2.4% | 15.4 ms (0.8×) ±3.8% | **806 µs** (14×) ±34.4% |
| Dispatch 10 clicks through 30 ancestors (capture + bubble) | 166 µs ±0.7% | 92.0 µs (1.8×) ±0.3% | **14.8 µs** (11×) ±0.2% |
| getComputedStyle of 100 elements (display, visibility) | 79.9 µs ±1.4% | 21.0 µs (3.8×) ±0.3% | **8.17 µs** (9.8×) ±0.1% |
| getComputedStyle of 100 elements under a 1,200-rule CSS-in-JS sheet | 57.7 ms ±1.4% | 963 µs (60×) ±2.5% | **138 µs** (419×) ±0.3% |
| Mutate an attribute, then querySelectorAll('[aria-label]') | 1.26 ms ±0.4% | 776 µs (1.6×) ±3.3% | **62.4 µs** (20×) ±0.2% |

## Benchmarks: react.bench.tsx

Median time per iteration (Vitest bench, warm; ± relative margin of error at 95%), speedup vs jsdom in parentheses.

|  | jsdom 30.1.3 | happy-dom 21.0.4 | ctrl-dom cbff411 | ctrl-dom + its Testing Library cbff411 |
| --- | ---: | ---: | ---: | ---: |
| Render a 20-field form, 10 getByRole({ name }) queries | 10.3 ms ±1.1% | 3.91 ms (2.6×) ±1.8% | 1.01 ms (10×) ±1.1% | **204 µs** (50×) ±2.2% |
| user.type('hello world') into a controlled input | 24.1 ms ±2.2% | 23.2 ms (1.0×) ±2.5% | 997 µs (24×) ±1.2% | **540 µs** (45×) ±0.9% |
| user.click a button 10 times (state updates) | 52.5 ms ±2.2% | 55.3 ms (0.9×) ±1.5% | 1.65 ms (32×) ±1.5% | **786 µs** (67×) ±0.9% |
| Reverse a 500-row keyed list, then getAllByRole('listitem') | 92.3 ms ±0.8% | 49.3 ms (1.9×) ±2.0% | 7.54 ms (12×) ±2.0% | **5.50 ms** (17×) ±1.7% |
| getByText among 200 table rows | 2.37 ms ±0.3% | 398 µs (6.0×) ±1.4% | 245 µs (9.7×) ±0.2% | **15.1 µs** (157×) ±0.4% |
| Render a 40-field form under a 1,200-rule CSS-in-JS sheet, 5 getByRole queries | 83.7 ms ±1.3% | 87.9 ms (1.0×) ±4.8% | 1.42 ms (59×) ±2.2% | **783 µs** (107×) ±3.1% |
| findByRole after a 20 ms timer | 24.3 ms ±2.4% | 24.1 ms (1.0×) ±0.9% | 131 µs (186×) ±1.4% | **117 µs** (207×) ±1.5% |

Notes: the query rows consume the result (`Array.from`), as Testing Library does; happy-dom returns the same cached NodeList until the document changes, and the mutate-then-query row measures a query after a change. ctrl-dom's environment skips idle time on a virtual clock, so `findByRole` after a timer does not wait it out in real time. Contenders sharing a DOM (`sameDomAs`) run the DOM benchmarks once.
