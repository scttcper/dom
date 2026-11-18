# Comparison results

Measured 2026-11-17 on Apple M4 Max, 14 cores, 36 GB, darwin arm64, Node 26.13.1 by `pnpm compare` (comparison/report.ts). How each number is measured: [README.md](README.md).

## `vitest run`, 100 React test files

3 runs per contender, 4 workers, Vitest's default pool (a fresh worker per file): median [min–max] over runs, speedup vs jsdom in parentheses.

|  | jsdom 31.0.1 | happy-dom 21.0.4 | ctrl-dom c0ccc13 | ctrl-dom + its Testing Library c0ccc13 |
| --- | ---: | ---: | ---: | ---: |
| Wall time | 12.23 s [12.18 s–12.93 s] | 9.08 s (1.3×) [9.01 s–9.15 s] | 6.39 s (1.9×) [6.37 s–6.44 s] | **2.25 s** (5.4×) [2.20 s–2.34 s] |
| Environment setup per file (Vitest's mean) | 249 ms [249 ms–264 ms] | 141 ms (1.8×) [140 ms–141 ms] | 32.7 ms (7.6×) [32.5 ms–33.0 ms] | **4.64 ms** (54×) [4.61 ms–4.65 ms] |
| Worker RSS after a file (median) | 169 MB [169 MB–170 MB] | 125 MB [125 MB–125 MB] | 124 MB [120 MB–124 MB] | **107 MB** [107 MB–107 MB] |

## `vitest run --pool vmForks`, 100 React test files

The same files in Vitest's VM pool: 4 long-lived workers, a fresh vm context and environment per file. 3 runs per contender, median [min–max], speedup vs jsdom in parentheses.

|  | jsdom 31.0.1 | happy-dom 21.0.4 | ctrl-dom c0ccc13 | ctrl-dom + its Testing Library c0ccc13 |
| --- | ---: | ---: | ---: | ---: |
| Wall time | 1.97 s [1.97 s–2.01 s] | 1.88 s (1.1×) [1.86 s–1.92 s] | 1.43 s (1.4×) [1.42 s–1.46 s] | **1.28 s** (1.5×) [1.27 s–1.32 s] |
| Environment setup per file (Vitest's mean) | 13.7 ms [13.7 ms–13.7 ms] | 6.67 ms (2.1×) [6.66 ms–6.95 ms] | 1.72 ms (8.0×) [1.71 ms–1.75 ms] | **1.38 ms** (9.9×) [1.32 ms–1.89 ms] |
| Worker RSS after a file (median) | 291 MB [290 MB–294 MB] | 262 MB [261 MB–262 MB] | **232 MB** [231 MB–233 MB] | 233 MB [233 MB–261 MB] |

## `jest`, 100 React test files

The same tests as plain CommonJS (no transform), each DOM's Jest environment, 4 workers, after one untimed run (warm haste map). 3 runs per contender, median [min–max], speedup vs jest-environment-jsdom in parentheses.

|  | jest-environment-jsdom 30.5.2 (jsdom 26.1.0) | @happy-dom/jest-environment 21.0.4 | @ctrl/dom-jest-environment c0ccc13 | @ctrl/dom-jest-environment + its Testing Library c0ccc13 |
| --- | ---: | ---: | ---: | ---: |
| Wall time | 2.48 s [2.44 s–2.51 s] | 2.37 s (1.0×) [2.37 s–2.37 s] | 1.93 s (1.3×) [1.93 s–1.97 s] | **853 ms** (2.9×) [850 ms–861 ms] |
| Environment load per file (Jest's perfStats) | 10.2 ms [10.1 ms–10.3 ms] | 7.17 ms (1.4×) [7.09 ms–7.59 ms] | 2.67 ms (3.8×) [2.61 ms–2.70 ms] | **2.61 ms** (3.9×) [2.59 ms–2.65 ms] |
| Worker RSS after a file (median) | 294 MB [292 MB–294 MB] | 272 MB [271 MB–272 MB] | 240 MB [229 MB–244 MB] | **204 MB** [192 MB–205 MB] |

## Cold start

A fresh process per sample (10 each, interleaved): the environment's `setup()` (importing the DOM included), then the first test (import React and Testing Library, render, `getByRole`). Median [min–max].

|  | jsdom 31.0.1 | happy-dom 21.0.4 | ctrl-dom c0ccc13 | ctrl-dom + its Testing Library c0ccc13 |
| --- | ---: | ---: | ---: | ---: |
| Environment setup | 230 ms [228 ms–333 ms] | 132 ms (1.7×) [129 ms–136 ms] | 42.6 ms (5.4×) [41.9 ms–43.4 ms] | **34.0 ms** (6.8×) [33.1 ms–49.0 ms] |
| First test | 68.8 ms [65.6 ms–70.7 ms] | 55.6 ms (1.2×) [54.9 ms–57.6 ms] | 60.5 ms (1.1×) [58.8 ms–63.4 ms] | **20.2 ms** (3.4×) [18.9 ms–28.9 ms] |
| Total | 300 ms [296 ms–402 ms] | 188 ms (1.6×) [184 ms–194 ms] | 103 ms (2.9×) [101 ms–107 ms] | **53.7 ms** (5.6×) [53.0 ms–77.8 ms] |
| Heap after GC | 42 MB [42 MB–42 MB] | 26 MB [26 MB–26 MB] | 22 MB [22 MB–22 MB] | **16 MB** [16 MB–20 MB] |
| RSS | 181 MB [180 MB–185 MB] | 139 MB [137 MB–142 MB] | 129 MB [129 MB–130 MB] | **97 MB** [96 MB–126 MB] |

## Benchmarks: dom.bench.ts

Median time per iteration (Vitest bench, warm; ± relative margin of error at 95%), speedup vs jsdom in parentheses.

|  | jsdom 31.0.1 | happy-dom 21.0.4 | ctrl-dom c0ccc13 |
| --- | ---: | ---: | ---: |
| Parse a 220 KB page (body.innerHTML =) | 32.2 ms ±1.3% | 32.3 ms (1.0×) ±1.4% | **2.04 ms** (16×) ±3.8% |
| Serialize the page (body.innerHTML) | 1.16 ms ±1.4% | 1.85 ms (0.6×) ±1.4% | **536 µs** (2.2×) ±1.1% |
| Array.from(querySelectorAll('li')) | 97.7 µs ±0.4% | **6.21 µs** (16×) ±0.2% | 8.62 µs (11×) ±0.2% |
| Array.from(querySelectorAll('.card')) | 32.1 µs ±0.3% | **2.00 µs** (16×) ±0.2% | 2.71 µs (12×) ±0.1% |
| Array.from(querySelectorAll('[aria-label]')) | 758 µs ±0.9% | **4.58 µs** (165×) ±0.3% | 6.08 µs (125×) ±0.2% |
| Array.from(querySelectorAll('[class~="card"]')) | 1.39 ms ±0.7% | **2.04 µs** (681×) ±0.2% | 2.67 µs (521×) ±0.1% |
| Array.from(querySelectorAll(':nth-child(2n+1)')) | 1.32 ms ±1.1% | **30.4 µs** (43×) ±0.3% | 41.8 µs (32×) ±0.2% |
| Render 100 custom elements with shadow roots | 3.81 ms ±3.4% | 2.56 ms (1.5×) ±3.6% | **632 µs** (6.0×) ±5.6% |
| Build a form of 1,000 labelled inputs | 9.41 ms ±2.9% | 14.1 ms (0.7×) ±4.0% | **802 µs** (12×) ±34.2% |
| Dispatch 10 clicks through 30 ancestors (capture + bubble) | 155 µs ±0.5% | 92.0 µs (1.7×) ±0.3% | **14.8 µs** (10×) ±1.5% |
| getComputedStyle of 100 elements (display, visibility) | 64.4 µs ±0.5% | 21.1 µs (3.0×) ±0.2% | **8.13 µs** (7.9×) ±0.1% |
| getComputedStyle of 100 elements under a 1,200-rule CSS-in-JS sheet | 1.86 ms ±2.0% | 988 µs (1.9×) ±2.5% | **128 µs** (15×) ±0.2% |
| Mutate an attribute, then querySelectorAll('[aria-label]') | 713 µs ±1.4% | 771 µs (0.9×) ±3.0% | **61.6 µs** (12×) ±0.4% |

## Benchmarks: react.bench.tsx

Median time per iteration (Vitest bench, warm; ± relative margin of error at 95%), speedup vs jsdom in parentheses.

|  | jsdom 31.0.1 | happy-dom 21.0.4 | ctrl-dom c0ccc13 | ctrl-dom + its Testing Library c0ccc13 |
| --- | ---: | ---: | ---: | ---: |
| Render a 20-field form, 10 getByRole({ name }) queries | 4.05 ms ±0.8% | 4.26 ms (1.0×) ±2.0% | 995 µs (4.1×) ±0.9% | **206 µs** (20×) ±2.0% |
| user.type('hello world') into a controlled input | 23.0 ms ±2.2% | 25.3 ms (0.9×) ±2.8% | 981 µs (23×) ±1.3% | **316 µs** (73×) ±0.6% |
| user.click a button 10 times (state updates) | 55.6 ms ±1.9% | 55.4 ms (1.0×) ±1.0% | 1.55 ms (36×) ±1.3% | **255 µs** (218×) ±0.3% |
| Reverse a 500-row keyed list, then getAllByRole('listitem') | 25.5 ms ±1.5% | 50.0 ms (0.5×) ±1.7% | 6.75 ms (3.8×) ±1.7% | **5.29 ms** (4.8×) ±1.4% |
| getByText among 200 table rows | 1.42 ms ±0.5% | 401 µs (3.5×) ±0.8% | 257 µs (5.5×) ±0.1% | **14.6 µs** (97×) ±0.1% |
| Render a 40-field form under a 1,200-rule CSS-in-JS sheet, 5 getByRole queries | 6.99 ms ±2.1% | 85.4 ms (0.1×) ±3.6% | 1.37 ms (5.1×) ±2.0% | **746 µs** (9.4×) ±2.8% |
| findByRole after a 20 ms timer | 23.9 ms ±0.9% | 23.1 ms (1.0×) ±0.8% | 132 µs (181×) ±1.4% | **108 µs** (222×) ±0.6% |

Notes: the query rows consume the result (`Array.from`), as Testing Library does; happy-dom returns the same cached NodeList until the document changes, and the mutate-then-query row measures a query after a change. ctrl-dom's environment skips idle time on a virtual clock, so `findByRole` after a timer does not wait it out in real time. Contenders sharing a DOM (`sameDomAs`) run the DOM benchmarks once.
