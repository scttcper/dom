# Radix Primitives downstream: `interactions` (2026-10-23)

- upstream: https://github.com/radix-ui/primitives @ `eb3a2b7091293e27df8f9ba906632d8daa3d81a3` (2026-10-14T12:06:36-07:00) — add formatting step after changesets
- pinned: `eb3a2b7091293e27df8f9ba906632d8daa3d81a3`
- project: `unit`; filters: `packages/react/accordion/`, `packages/react/alert-dialog/`, `packages/react/checkbox/`, `packages/react/context-menu/`, `packages/react/dialog/`, `packages/react/dismissable-layer/`, `packages/react/dropdown-menu/`, `packages/react/focus-scope/`, `packages/react/form/`, `packages/react/hover-card/`, `packages/react/menubar/`, `packages/react/navigation-menu/`, `packages/react/one-time-password-field/`, `packages/react/password-toggle-field/`, `packages/react/popover/`, `packages/react/radio-group/`, `packages/react/select/`, `packages/react/slider/`, `packages/react/switch/`, `packages/react/tabs/`, `packages/react/toast/`, `packages/react/toggle-group/`, `packages/react/toolbar/`, `packages/react/tooltip/`
- node v26.12.1, workers 4, upstream versions: vitest@4.1.7, vite@7.3.3, react@19.3.0, react-dom@19.3.0, jsdom@29.1.1, @testing-library/react@16.3.2, @testing-library/dom@10.4.1, @testing-library/user-event@14.6.1, @testing-library/jest-dom@6.9.1, vitest-axe@1.0.0-pre.5, axe-core@4.11.4
- rtd environment: stock `vitest-environment-rtd` (default options, default userAgent); rtd-full substitutes: @testing-library/react, @testing-library/dom, @testing-library/user-event, @testing-library/jest-dom
- measurement: 3 round(s), modes interleaved; wall/peak RSS are medians (wall range in parentheses); 4 workers in every mode
- retry: 0 (upstream's retry: 1 overridden in every mode)
- guards: one React id per mode, single @rtd/dom instance (probe), rtd-full imports only our @testing-library/* — all OK

## Per-mode results

| mode | passed | failed | skipped | total | files | suite errors | exit | wall | peak RSS | env receipts | notes |
| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --- |
| jsdom | 767 | 0 | 4 | 771 | 24 | 0 | 0 | 6.5s (6.0s–7.5s) | 277 MiB | 24 | 1 React |
| rtd-dom | 763 | 4 | 4 | 771 | 24 | 0 | 1 | 4.8s (4.7s–5.1s) | 237 MiB | 24 | 1 React |
| rtd-full | 763 | 4 | 4 | 771 | 24 | 0 | 1 | 4.9s (4.5s–5.2s) | 273 MiB | 24 | 1 React; stock TL imports: 0 |

## jsdom

No failing tests.

## rtd-dom

Compared with jsdom: **4 pass on jsdom but fail here**, 0 missing, 0 added, 0 newly skipped, 0 fail on jsdom but pass here.

### Pass on jsdom, fail here

<details><summary>4 tests</summary>

- `packages/react/form/src/form.test.tsx :: Form given components used outside `Form.Field` (explicit wiring) should render a `Form.Message` outside `Form.Field` and toggle it based on validity` — TestingLibraryElementError: Unable to find an element with the text: Please enter your email address.. This could be because the text is broken up by multiple e
- `packages/react/form/src/form.test.tsx :: Form given components used outside `Form.Field` (explicit wiring) should describe the control via `aria-describedby` when a message matches` — TestingLibraryElementError: Unable to find an element with the text: Please enter your email address.. This could be because the text is broken up by multiple e
- `packages/react/form/src/form.test.tsx :: Form given components used outside `Form.Field` (explicit wiring) should normalize existing aria-describedby ids and append a matching message id` — TestingLibraryElementError: Unable to find an element with the text: Please enter your email address.. This could be because the text is broken up by multiple e
- `packages/react/form/src/form.test.tsx :: Form given components used outside `Form.Field` (explicit wiring) should expose validity through `Form.ValidityState` via `name`` — Error: expect(element).toHaveTextContent()

</details>

### Failures by component

| component | failed |
| --- | --: |
| form | 4 |

### Failures by error signature

| count | signature | components | example |
| --: | --- | --- | --- |
| 3 | TestingLibraryElementError: Unable to find an element with the text: Please enter your email address.. This could be because the text is broken up by multiple e | form | `packages/react/form/src/form.test.tsx :: Form given components used outside `Form.Field` (explicit wiring) should render a `Form.Message` outside `Form.Field` and toggle it based on validity` |
| 1 | Error: expect(element).toHaveTextContent() | form | `packages/react/form/src/form.test.tsx :: Form given components used outside `Form.Field` (explicit wiring) should expose validity through `Form.ValidityState` via `name`` |

## rtd-full

Compared with jsdom: **4 pass on jsdom but fail here**, 0 missing, 0 added, 0 newly skipped, 0 fail on jsdom but pass here.

### Pass on jsdom, fail here

<details><summary>4 tests</summary>

- `packages/react/form/src/form.test.tsx :: Form given components used outside `Form.Field` (explicit wiring) should render a `Form.Message` outside `Form.Field` and toggle it based on validity` — TestingLibraryElementError: Unable to find an element with the text: Please enter your email address.. This could be because the text is broken up by multiple e
- `packages/react/form/src/form.test.tsx :: Form given components used outside `Form.Field` (explicit wiring) should describe the control via `aria-describedby` when a message matches` — TestingLibraryElementError: Unable to find an element with the text: Please enter your email address.. This could be because the text is broken up by multiple e
- `packages/react/form/src/form.test.tsx :: Form given components used outside `Form.Field` (explicit wiring) should normalize existing aria-describedby ids and append a matching message id` — TestingLibraryElementError: Unable to find an element with the text: Please enter your email address.. This could be because the text is broken up by multiple e
- `packages/react/form/src/form.test.tsx :: Form given components used outside `Form.Field` (explicit wiring) should expose validity through `Form.ValidityState` via `name`` — Error: expect(element).toHaveTextContent()

</details>

### Failures by component

| component | failed |
| --- | --: |
| form | 4 |

### Failures by error signature

| count | signature | components | example |
| --: | --- | --- | --- |
| 3 | TestingLibraryElementError: Unable to find an element with the text: Please enter your email address.. This could be because the text is broken up by multiple e | form | `packages/react/form/src/form.test.tsx :: Form given components used outside `Form.Field` (explicit wiring) should render a `Form.Message` outside `Form.Field` and toggle it based on validity` |
| 1 | Error: expect(element).toHaveTextContent() | form | `packages/react/form/src/form.test.tsx :: Form given components used outside `Form.Field` (explicit wiring) should expose validity through `Form.ValidityState` via `name`` |

Raw Vitest JSON and logs: `downstream/radix/output/<mode>/` (gitignored).
