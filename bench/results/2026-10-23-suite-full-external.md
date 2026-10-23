# Vitest suite benchmark: 2026-10-23-suite-full-external

- **date**: 2026-10-23T07:31:02.362Z
- **machine**: Apple M4 Max × 14, 36 GB, darwin 27.0.0
- **node**: v26.12.1
- **suite**: 100 generated React test files, `vitest run`, default pool; 3 fresh runs per environment, interleaved

Wall: whole `vitest run` process. Σ columns: Vitest's per-file diagnostics summed over files
(CPU time across workers, not wall). Worker memory: per-file RSS / heap at the end of each file
(median over files). Only runs where every file passed are timed.

| env | wall s | min–max | env setup Σ s | env/file ms | setup Σ s | import Σ s | tests Σ s | worker RSS MB | worker heap MB | runs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| jsdom | 15.8 | 13.6–18.4 | 106 | 1064 | 27.6 | 15.7 | 21.7 | 217 | 74.0 | 3/3 |
| happy-dom | 13.1 | 9.24–15.8 | 71.9 | 719 | 37.0 | 18.6 | 10.8 | 128 | 32.7 | 3/3 |
| rtd | 10.8 | 9.38–18.1 | 41.7 | 417 | 45.3 | 18.2 | 6.77 | 170 | 52.6 | 3/3 |
| rtd-full | 8.27 | 7.74–8.42 | 39.3 | 393 | 14.0 | 22.7 | 5.80 | 167 | 49.4 | 3/3 |
