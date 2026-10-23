# Vitest suite benchmark: 2026-10-23-suite-quiet-dist

- **date**: 2026-10-23T14:30:32.936Z
- **machine**: Apple M4 Max × 14, 36 GB, darwin 27.0.0
- **node**: v26.12.1
- **suite**: 100 generated React test files, `vitest run`, default pool; 3 fresh runs per environment, interleaved

Wall: whole `vitest run` process. Σ columns: Vitest's per-file diagnostics summed over files
(CPU time across workers, not wall). Worker memory: per-file RSS / heap at the end of each file
(median over files). Only runs where every file passed are timed.

| env | wall s | min–max | env setup Σ s | env/file ms | setup Σ s | import Σ s | tests Σ s | worker RSS MB | worker heap MB | runs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| jsdom | 8.48 | 8.15–8.71 | 58.9 | 589 | 13.5 | 8.39 | 11.0 | 218 | 74.0 | 3/3 |
| happy-dom | 5.31 | 5.29–5.73 | 28.4 | 284 | 15.2 | 6.83 | 3.72 | 128 | 32.7 | 3/3 |
| rtd | 5.79 | 5.72–6.07 | 21.1 | 211 | 23.7 | 7.70 | 3.80 | 156 | 40.5 | 3/3 |
| rtd-full | 4.54 | 4.52–4.65 | 21.7 | 217 | 8.01 | 11.1 | 2.53 | 147 | 32.5 | 3/3 |
| rtd-dist | 4.90 | 4.64–4.91 | 4.01 | 40.1 | 25.0 | 8.59 | 3.52 | 140 | 30.4 | 3/3 |
| rtd-full-dist | 2.58 | 2.55–2.80 | 4.17 | 41.7 | 2.49 | 3.83 | 3.02 | 127 | 26.8 | 3/3 |
