# Comparison results

Measured 2026-11-21 on Apple M4 Max, 14 cores, 36 GB, darwin arm64, Node 26.13.1 by `pnpm compare` (comparison/report.ts). How each number is measured: [README.md](README.md).

## `vitest run`, 100 React test files

3 runs per contender, 4 workers, Vitest's default pool (a fresh worker per file): median [min–max] over runs, speedup vs jsdom in parentheses.

|  | jsdom 31.0.1 | happy-dom 21.0.4 | ctrl-dom 23e598b | ctrl-dom + its Testing Library 23e598b |
| --- | ---: | ---: | ---: | ---: |
| Wall time | 11.59 s [11.58 s–11.67 s] | 8.56 s (1.4×) [8.55 s–8.59 s] | 6.17 s (1.9×) [6.16 s–6.19 s] | **2.35 s** (4.9×) [2.24 s–2.38 s] |
| Environment setup per file (Vitest's mean) | 238 ms [237 ms–239 ms] | 134 ms (1.8×) [133 ms–135 ms] | 32.0 ms (7.4×) [32.0 ms–32.1 ms] | **4.76 ms** (50×) [4.75 ms–5.15 ms] |
| Worker RSS after a file (median) | 170 MB [170 MB–170 MB] | 128 MB [127 MB–128 MB] | 126 MB [124 MB–126 MB] | **111 MB** [110 MB–111 MB] |

## `vitest run --pool vmForks`, 100 React test files

The same files in Vitest's VM pool: 4 long-lived workers, a fresh vm context and environment per file. 3 runs per contender, median [min–max], speedup vs jsdom in parentheses.

|  | jsdom 31.0.1 | happy-dom 21.0.4 | ctrl-dom 23e598b | ctrl-dom + its Testing Library 23e598b |
| --- | ---: | ---: | ---: | ---: |
| Wall time | 1.85 s [1.85 s–1.89 s] | 1.78 s (1.0×) [1.78 s–1.78 s] | 1.35 s (1.4×) [1.35 s–1.35 s] | **1.22 s** (1.5×) [1.22 s–1.24 s] |
| Environment setup per file (Vitest's mean) | 12.9 ms [12.9 ms–13.0 ms] | 6.66 ms (1.9×) [6.55 ms–6.70 ms] | 1.73 ms (7.5×) [1.72 ms–1.73 ms] | **1.37 ms** (9.4×) [1.34 ms–1.91 ms] |
| Worker RSS after a file (median) | 311 MB [279 MB–313 MB] | 268 MB [268 MB–269 MB] | **247 MB** [231 MB–249 MB] | 258 MB [255 MB–260 MB] |

## `jest`, 100 React test files

The same tests as plain CommonJS (no transform), each DOM's Jest environment, 4 workers, after one untimed run (warm haste map). 3 runs per contender, median [min–max], speedup vs jest-environment-jsdom in parentheses.

|  | jest-environment-jsdom 30.5.2 (jsdom 26.1.0) | @happy-dom/jest-environment 21.0.4 | @ctrl/dom-jest-environment 23e598b | @ctrl/dom-jest-environment + its Testing Library 23e598b |
| --- | ---: | ---: | ---: | ---: |
| Wall time | 2.34 s [2.27 s–2.35 s] | 2.17 s (1.1×) [2.15 s–2.19 s] | 1.80 s (1.3×) [1.80 s–1.81 s] | **741 ms** (3.2×) [737 ms–825 ms] |
| Environment load per file (Jest's perfStats) | 9.93 ms [9.88 ms–10.2 ms] | 7.00 ms (1.4×) [6.99 ms–7.28 ms] | 2.65 ms (3.7×) [2.60 ms–2.66 ms] | **2.58 ms** (3.8×) [2.50 ms–2.60 ms] |
| Worker RSS after a file (median) | 298 MB [298 MB–298 MB] | 271 MB [271 MB–272 MB] | 236 MB [234 MB–237 MB] | **187 MB** [185 MB–190 MB] |

## Cold start

A fresh process per sample (10 each, interleaved): the environment's `setup()` (importing the DOM included), then the first test (import React and Testing Library, render, `getByRole`). Median [min–max].

|  | jsdom 31.0.1 | happy-dom 21.0.4 | ctrl-dom 23e598b | ctrl-dom + its Testing Library 23e598b |
| --- | ---: | ---: | ---: | ---: |
| Environment setup | 217 ms [212 ms–225 ms] | 126 ms (1.7×) [113 ms–131 ms] | 41.1 ms (5.3×) [40.7 ms–41.6 ms] | **33.1 ms** (6.5×) [32.6 ms–45.9 ms] |
| First test | 64.2 ms [59.8 ms–68.0 ms] | 51.0 ms (1.3×) [44.8 ms–53.0 ms] | 59.1 ms (1.1×) [58.3 ms–60.8 ms] | **19.3 ms** (3.3×) [17.3 ms–23.8 ms] |
| Total | 282 ms [272 ms–286 ms] | 178 ms (1.6×) [162 ms–179 ms] | 100.0 ms (2.8×) [99.3 ms–102 ms] | **52.4 ms** (5.4×) [50.6 ms–69.8 ms] |
| Heap after GC | 41 MB [41 MB–41 MB] | 26 MB [26 MB–26 MB] | 21 MB [21 MB–21 MB] | **16 MB** [16 MB–19 MB] |
| RSS | 184 MB [184 MB–187 MB] | 141 MB [140 MB–145 MB] | 132 MB [131 MB–132 MB] | **100 MB** [100 MB–127 MB] |

## Benchmarks: dom.bench.ts

Median time per iteration (Vitest bench, warm; ± relative margin of error at 95%), speedup vs jsdom in parentheses.

|  | jsdom 31.0.1 | happy-dom 21.0.4 | ctrl-dom 23e598b |
| --- | ---: | ---: | ---: |
| Parse a 220 KB page (body.innerHTML =) | 31.1 ms ±1.2% | 30.8 ms (1.0×) ±0.9% | **2.00 ms** (16×) ±3.4% |
| Serialize the page (body.innerHTML) | 1.11 ms ±0.5% | 1.58 ms (0.7×) ±0.6% | **534 µs** (2.1×) ±1.1% |
| Array.from(querySelectorAll('li')) | 108 µs ±0.2% | **5.92 µs** (18×) ±0.2% | 8.67 µs (12×) ±0.1% |
| Array.from(querySelectorAll('.card')) | 35.4 µs ±0.1% | **1.92 µs** (18×) ±0.2% | 2.71 µs (13×) ±0.1% |
| Array.from(querySelectorAll('[aria-label]')) | 788 µs ±0.3% | **4.17 µs** (189×) ±0.2% | 6.08 µs (129×) ±0.1% |
| Array.from(querySelectorAll('[class~="card"]')) | 1.21 ms ±0.2% | **1.92 µs** (631×) ±0.2% | 2.71 µs (447×) ±0.1% |
| Array.from(querySelectorAll(':nth-child(2n+1)')) | 1.13 ms ±0.2% | **29.2 µs** (39×) ±0.2% | 42.0 µs (27×) ±0.1% |
| Render 100 custom elements with shadow roots | 3.38 ms ±2.2% | 2.45 ms (1.4×) ±3.1% | **623 µs** (5.4×) ±5.0% |
| Build a form of 1,000 labelled inputs | 8.12 ms ±2.1% | 13.3 ms (0.6×) ±3.4% | **799 µs** (10×) ±36.2% |
| Dispatch 10 clicks through 30 ancestors (capture + bubble) | 148 µs ±0.1% | 90.2 µs (1.6×) ±0.1% | **14.7 µs** (10×) ±0.1% |
| getComputedStyle of 100 elements (display, visibility) | 61.4 µs ±0.1% | 21.4 µs (2.9×) ±0.1% | **8.00 µs** (7.7×) ±0.1% |
| getComputedStyle of 100 elements under a 1,200-rule CSS-in-JS sheet | 1.73 ms ±1.4% | 936 µs (1.8×) ±2.4% | **123 µs** (14×) ±0.2% |
| Mutate an attribute, then querySelectorAll('[aria-label]') | 630 µs ±0.2% | 718 µs (0.9×) ±2.7% | **65.8 µs** (9.6×) ±0.1% |

## Benchmarks: react.bench.tsx

Median time per iteration (Vitest bench, warm; ± relative margin of error at 95%), speedup vs jsdom in parentheses.

|  | jsdom 31.0.1 | happy-dom 21.0.4 | ctrl-dom 23e598b | ctrl-dom + its Testing Library 23e598b |
| --- | ---: | ---: | ---: | ---: |
| Render a 20-field form, 10 getByRole({ name }) queries | 4.55 ms ±1.0% | 3.69 ms (1.2×) ±1.4% | 798 µs (5.7×) ±0.9% | **182 µs** (25×) ±1.9% |
| user.type('hello world') into a controlled input | 22.9 ms ±2.4% | 25.1 ms (0.9×) ±2.9% | 960 µs (24×) ±1.2% | **285 µs** (80×) ±0.4% |
| user.click a button 10 times (state updates) | 53.2 ms ±1.2% | 53.2 ms (1.0×) ±1.5% | 1.55 ms (34×) ±1.2% | **249 µs** (213×) ±0.2% |
| Reverse a 500-row keyed list, then getAllByRole('listitem') | 29.0 ms ±1.6% | 46.1 ms (0.6×) ±1.6% | 5.99 ms (4.8×) ±1.4% | **4.46 ms** (6.5×) ±1.4% |
| getByText among 200 table rows | 1.65 ms ±0.5% | 383 µs (4.3×) ±0.4% | 244 µs (6.7×) ±0.1% | **14.7 µs** (112×) ±0.1% |
| Render a 40-field form under a 1,200-rule CSS-in-JS sheet, 5 getByRole queries | 7.10 ms ±1.5% | 76.0 ms (0.1×) ±1.7% | 1.28 ms (5.5×) ±1.8% | **689 µs** (10×) ±2.5% |
| findByRole after a 20 ms timer | 23.3 ms ±0.7% | 23.1 ms (1.0×) ±0.9% | 130 µs (178×) ±1.3% | **108 µs** (216×) ±0.5% |

Notes: the query rows consume the result (`Array.from`), as Testing Library does; happy-dom returns the same cached NodeList until the document changes, and the mutate-then-query row measures a query after a change. ctrl-dom's environment skips idle time on a virtual clock, so `findByRole` after a timer does not wait it out in real time. Contenders sharing a DOM (`sameDomAs`) run the DOM benchmarks once.
