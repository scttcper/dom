# Bench results: 2026-10-23-baseline-competitors

- **date**: 2026-10-23T02:35:51.684Z
- **machine**: Apple M4 Max × 14, 36 GB, darwin 27.0.0
- **node**: v26.12.1
- **versions**: jsdom 30.1.3, happy-dom 21.0.4, react 19.3.1, react-dom 19.3.1, @testing-library/dom 10.4.2, @testing-library/react 16.3.3, @testing-library/user-event 14.6.8, @testing-library/jest-dom 7.0.1
- **samples**: 5 fresh processes per cell (configs interleaved)
- **duration**: 175 s

Each cell: median over fresh processes of the per-process median iteration time, in ms, with
[min–max across processes]. Memory: heap used after forced GC at the end of the sample
(fixture alive) / peak RSS, in MB. Lower is better.

## Summary

| Workload | jsdom | happy-dom |
| --- | ---: | ---: |
| Import the DOM library only (cold) | 274 [248–302]<br>35.4 / 185 MB | 140 [127–287]<br>21.3 / 136 MB |
| Environment startup: import DOM + create window + install globals | 291 [286–473]<br>40.0 / 201 MB | 144 [136–161]<br>21.8 / 138 MB |
| Cold first test: env + import React/testing-library + render + getByRole | 414 [407–706]<br>49.3 / 234 MB | 238 [227–687]<br>27.9 / 150 MB |
| Render form + 10 getByRole({name}) queries | 9.67 [9.46–9.96]<br>54.2 / 244 MB | 3.52 [3.41–3.60]<br>49.2 / 217 MB |
| Render form, fill 10 fields with user-event, submit | 170 [163–181]<br>54.7 / 258 MB | 139 [127–173]<br>32.5 / 224 MB |
| 20-field form: mount + 3 rerenders with queries | 25.8 [24.3–30.7]<br>54.1 / 263 MB | 10.2 [9.83–13.0]<br>55.6 / 230 MB |
| 100-field form: mount + 3 rerenders with queries | 107 [103–116]<br>54.6 / 267 MB | 58.9 [57.7–63.5]<br>83.7 / 268 MB |
| 1,000-row keyed list: reorder 200 + replace 100 | 11.0 [10.4–11.6]<br>55.6 / 418 MB | 12.3 [12.1–13.3]<br>51.6 / 471 MB |
| getByText / getByLabelText / getByTestId scans (200 rows, 30 queries) | 57.1 [56.0–60.8]<br>54.3 / 255 MB | 16.3 [15.8–17.0]<br>42.4 / 397 MB |
| findBy* + waitFor flows (async load, 5 async saves) | 14.5 [13.8–14.6]<br>53.5 / 239 MB | 11.5 [10.7–11.6]<br>31.4 / 162 MB |
| Mount/unmount churn of the 20-field form (memory slope) | 1.93 [1.84–1.97]<br>67.1 / 253 MB | 1.05 [1.03–1.05]<br>177 / 327 MB |
| Create 4,000 ordinary elements | 3.09 [2.90–3.20]<br>52.1 / 269 MB | 3.60 [3.33–3.73]<br>41.9 / 487 MB |
| Build 1,000 attributed rows (label + input) | 11.7 [11.3–11.7]<br>46.3 / 403 MB | 10.5 [10.4–11.0]<br>27.6 / 439 MB |
| Four revisions of four attributes on 1,000 elements | 7.35 [7.17–7.69]<br>51.6 / 251 MB | 12.9 [12.1–14.1]<br>40.2 / 412 MB |
| Deep-clone a 1,000-row subtree | 8.59 [7.10–8.94]<br>62.3 / 414 MB | 11.2 [10.6–11.8]<br>86.0 / 701 MB |
| innerHTML parse, 250 rows (500 elements) | 2.31 [2.20–2.39]<br>47.3 / 272 MB | 1.05 [0.932–1.08]<br>31.5 / 327 MB |
| Warm selector queries, 250 rows | 3.04 [2.97–3.11]<br>48.1 / 247 MB | 0.002 [0.002–0.002]<br>31.4 / 153 MB |
| Attribute mutation + selector queries, 250 rows | 3.98 [3.85–4.05]<br>48.2 / 246 MB | 1.70 [1.69–1.72]<br>69.7 / 291 MB |
| Event propagation, capture + bubble, 30 levels (10 dispatches) | 0.120 [0.119–0.123]<br>45.8 / 239 MB | 0.098 [0.096–0.105]<br>27.6 / 165 MB |
| MutationObserver streaming, 50 appends | 0.094 [0.092–0.098]<br>46.1 / 242 MB | 0.019 [0.017–0.024]<br>27.9 / 154 MB |

## Details

### Import the DOM library only (cold)

`startup/import`

| config | median ms | min–max | IQR | heap MB | peak RSS MB | vs jsdom | extra |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| jsdom | 274 | 248–302 | 266–280 | 35.4 | 185 | 1.00× |  |
| happy-dom | 140 | 127–287 | 139–207 | 21.3 | 136 | 0.51× |  |

### Environment startup: import DOM + create window + install globals

`startup/env`

| config | median ms | min–max | IQR | heap MB | peak RSS MB | vs jsdom | extra |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| jsdom | 291 | 286–473 | 288–293 | 40.0 | 201 | 1.00× | importMs=250, setupMs=39.6 |
| happy-dom | 144 | 136–161 | 139–154 | 21.8 | 138 | 0.50× | importMs=140, setupMs=4.09 |

### Cold first test: env + import React/testing-library + render + getByRole

`startup/first-render`

| config | median ms | min–max | IQR | heap MB | peak RSS MB | vs jsdom | extra |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| jsdom | 414 | 407–706 | 407–477 | 49.3 | 234 | 1.00× | importMs=249, setupMs=37.8, stackImportMs=85.8, renderQueryMs=45.4 |
| happy-dom | 238 | 227–687 | 233–348 | 27.9 | 150 | 0.57× | importMs=137, setupMs=4.04, stackImportMs=90.6, renderQueryMs=8.18 |

### Render form + 10 getByRole({name}) queries

`react/form-10-getByRole`

| config | median ms | min–max | IQR | heap MB | peak RSS MB | vs jsdom | extra |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| jsdom | 9.67 | 9.46–9.96 | 9.54–9.87 | 54.2 | 244 | 1.00× |  |
| happy-dom | 3.52 | 3.41–3.60 | 3.50–3.55 | 49.2 | 217 | 0.36× |  |

### Render form, fill 10 fields with user-event, submit

`react/fill-10-submit`

| config | median ms | min–max | IQR | heap MB | peak RSS MB | vs jsdom | extra |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| jsdom | 170 | 163–181 | 164–176 | 54.7 | 258 | 1.00× |  |
| happy-dom | 139 | 127–173 | 134–139 | 32.5 | 224 | 0.82× |  |

### 20-field form: mount + 3 rerenders with queries

`react/form-20-rerender`

| config | median ms | min–max | IQR | heap MB | peak RSS MB | vs jsdom | extra |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| jsdom | 25.8 | 24.3–30.7 | 25.7–27.1 | 54.1 | 263 | 1.00× |  |
| happy-dom | 10.2 | 9.83–13.0 | 9.93–11.3 | 55.6 | 230 | 0.40× |  |

### 100-field form: mount + 3 rerenders with queries

`react/form-100-rerender`

| config | median ms | min–max | IQR | heap MB | peak RSS MB | vs jsdom | extra |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| jsdom | 107 | 103–116 | 105–109 | 54.6 | 267 | 1.00× |  |
| happy-dom | 58.9 | 57.7–63.5 | 58.4–59.0 | 83.7 | 268 | 0.55× |  |

### 1,000-row keyed list: reorder 200 + replace 100

`react/keyed-list-1000`

| config | median ms | min–max | IQR | heap MB | peak RSS MB | vs jsdom | extra |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| jsdom | 11.0 | 10.4–11.6 | 10.4–11.4 | 55.6 | 418 | 1.00× |  |
| happy-dom | 12.3 | 12.1–13.3 | 12.3–12.8 | 51.6 | 471 | 1.12× |  |

### getByText / getByLabelText / getByTestId scans (200 rows, 30 queries)

`react/text-queries`

| config | median ms | min–max | IQR | heap MB | peak RSS MB | vs jsdom | extra |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| jsdom | 57.1 | 56.0–60.8 | 56.6–60.1 | 54.3 | 255 | 1.00× |  |
| happy-dom | 16.3 | 15.8–17.0 | 16.0–16.3 | 42.4 | 397 | 0.29× |  |

### findBy* + waitFor flows (async load, 5 async saves)

`react/findby-waitfor`

| config | median ms | min–max | IQR | heap MB | peak RSS MB | vs jsdom | extra |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| jsdom | 14.5 | 13.8–14.6 | 14.3–14.6 | 53.5 | 239 | 1.00× |  |
| happy-dom | 11.5 | 10.7–11.6 | 11.2–11.5 | 31.4 | 162 | 0.79× |  |

### Mount/unmount churn of the 20-field form (memory slope)

`react/mount-unmount-churn`

| config | median ms | min–max | IQR | heap MB | peak RSS MB | vs jsdom | extra |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| jsdom | 1.93 | 1.84–1.97 | 1.88–1.95 | 67.1 | 253 | 1.00× | heapSlopeKBPerMount=71.3 |
| happy-dom | 1.05 | 1.03–1.05 | 1.03–1.05 | 177 | 327 | 0.54× | heapSlopeKBPerMount=686 |

### Create 4,000 ordinary elements

`dom/create-4k`

| config | median ms | min–max | IQR | heap MB | peak RSS MB | vs jsdom | extra |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| jsdom | 3.09 | 2.90–3.20 | 3.03–3.12 | 52.1 | 269 | 1.00× |  |
| happy-dom | 3.60 | 3.33–3.73 | 3.51–3.64 | 41.9 | 487 | 1.17× |  |

### Build 1,000 attributed rows (label + input)

`dom/build-1000-rows`

| config | median ms | min–max | IQR | heap MB | peak RSS MB | vs jsdom | extra |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| jsdom | 11.7 | 11.3–11.7 | 11.6–11.7 | 46.3 | 403 | 1.00× |  |
| happy-dom | 10.5 | 10.4–11.0 | 10.5–10.7 | 27.6 | 439 | 0.90× |  |

### Four revisions of four attributes on 1,000 elements

`dom/attr-revisions`

| config | median ms | min–max | IQR | heap MB | peak RSS MB | vs jsdom | extra |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| jsdom | 7.35 | 7.17–7.69 | 7.34–7.39 | 51.6 | 251 | 1.00× |  |
| happy-dom | 12.9 | 12.1–14.1 | 12.5–13.1 | 40.2 | 412 | 1.76× |  |

### Deep-clone a 1,000-row subtree

`dom/deep-clone`

| config | median ms | min–max | IQR | heap MB | peak RSS MB | vs jsdom | extra |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| jsdom | 8.59 | 7.10–8.94 | 8.42–8.79 | 62.3 | 414 | 1.00× |  |
| happy-dom | 11.2 | 10.6–11.8 | 11.1–11.7 | 86.0 | 701 | 1.31× |  |

### innerHTML parse, 250 rows (500 elements)

`dom/innerhtml-250`

| config | median ms | min–max | IQR | heap MB | peak RSS MB | vs jsdom | extra |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| jsdom | 2.31 | 2.20–2.39 | 2.27–2.33 | 47.3 | 272 | 1.00× |  |
| happy-dom | 1.05 | 0.932–1.08 | 0.951–1.07 | 31.5 | 327 | 0.45× |  |

### Warm selector queries, 250 rows

`dom/selector-warm`

| config | median ms | min–max | IQR | heap MB | peak RSS MB | vs jsdom | extra |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| jsdom | 3.04 | 2.97–3.11 | 3.03–3.05 | 48.1 | 247 | 1.00× |  |
| happy-dom | 0.002 | 0.002–0.002 | 0.002–0.002 | 31.4 | 153 | 0.00× |  |

### Attribute mutation + selector queries, 250 rows

`dom/mutation-query`

| config | median ms | min–max | IQR | heap MB | peak RSS MB | vs jsdom | extra |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| jsdom | 3.98 | 3.85–4.05 | 3.91–4.03 | 48.2 | 246 | 1.00× |  |
| happy-dom | 1.70 | 1.69–1.72 | 1.69–1.70 | 69.7 | 291 | 0.43× |  |

### Event propagation, capture + bubble, 30 levels (10 dispatches)

`dom/event-propagation-30`

| config | median ms | min–max | IQR | heap MB | peak RSS MB | vs jsdom | extra |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| jsdom | 0.120 | 0.119–0.123 | 0.119–0.121 | 45.8 | 239 | 1.00× |  |
| happy-dom | 0.098 | 0.096–0.105 | 0.098–0.101 | 27.6 | 165 | 0.81× |  |

### MutationObserver streaming, 50 appends

`dom/mutation-observer-50`

| config | median ms | min–max | IQR | heap MB | peak RSS MB | vs jsdom | extra |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| jsdom | 0.094 | 0.092–0.098 | 0.093–0.096 | 46.1 | 242 | 1.00× |  |
| happy-dom | 0.019 | 0.017–0.024 | 0.017–0.022 | 27.9 | 154 | 0.20× |  |

