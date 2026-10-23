# Vitest suite benchmark: 2026-10-23-suite-full

- **date**: 2026-10-23T02:52:46.802Z
- **machine**: Apple M4 Max × 14, 36 GB, darwin 27.0.0
- **node**: v26.12.1
- **suite**: 100 generated React test files, `vitest run`, default pool; 3 fresh runs per environment, interleaved

Wall: whole `vitest run` process. Σ columns: Vitest's per-file diagnostics summed over files
(CPU time across workers, not wall). Worker memory: per-file RSS / heap at the end of each file
(median over files). Only runs where every file passed are timed.

| env | wall s | min–max | env setup Σ s | env/file ms | setup Σ s | import Σ s | tests Σ s | worker RSS MB | worker heap MB | runs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| jsdom | 10.5 | 10.1–22.9 | 70.9 | 709 | 18.3 | 11.3 | 14.3 | 217 | 73.9 | 3/3 |
| happy-dom | 6.37 | 6.35–6.41 | 34.2 | 342 | 18.7 | 7.80 | 4.23 | 128 | 32.7 | 3/3 |
| rtd | 6.62 | 6.27–7.37 | 30.3 | 303 | 22.5 | 11.0 | 4.78 | 179 | 67.3 | 3/3 |
| rtd-full | 9.83 | 6.57–11.0 | 43.0 | 430 | 30.8 | 22.5 | 5.69 | 211 | 73.6 | 3/3 |
