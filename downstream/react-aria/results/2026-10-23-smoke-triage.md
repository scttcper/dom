# React Aria downstream: `smoke` (2026-10-23)

> **TRIAGE MODE (`--triage fake-raf,keep-globals,no-pointer-event,isolate`)**: rtd modes ran with jest-environment.mjs's triage shims (workarounds for jest-environment blockers already filed in TRIAGE.md). These are not compatibility results.

- upstream: https://github.com/adobe/react-spectrum @ `d5fb723a1c192e3a1a25c8cfdd4e26b900995307` (2026-10-23T05:09:37Z) — fix(usePress): only skip Enter default prevention on macOS for Control + Enter (#10820)
- pinned: `d5fb723a1c192e3a1a25c8cfdd4e26b900995307`
- filters: `packages/react-aria-components/test/Button.test.js`, `packages/react-aria-components/test/Checkbox.test.js`, `packages/react-aria-components/test/TextField.test.js`, `packages/react-aria-components/test/Select.test.js`, `packages/react-aria-components/test/ComboBox.test.js`, `packages/react-aria-components/test/Menu.test.tsx`, `packages/react-aria-components/test/Dialog.test.js`, `packages/react-aria-components/test/Tabs.test.js`
- node v26.12.1, Jest workers 4, STRICT_MODE=1 VIRT_ON=1, upstream versions: jest@30.4.2, jest-environment-jsdom@30.4.1, jsdom@26.1.0, @swc/jest@0.2.39, react@19.3.0, react-dom@19.3.0, @testing-library/react@16.3.2, @testing-library/dom@10.4.1, @testing-library/user-event@14.6.5, @testing-library/jest-dom@6.9.1
- rtd-full substitutes: @testing-library/react, @testing-library/dom, @testing-library/user-event, @testing-library/jest-dom (built bundles, packages/*/dist)

## Per-mode results

| mode | passed | failed | skipped | total | files | suite errors | exit | wall | peak RSS | env receipts | notes |
| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --- |
| rtd-dom | 357 | 9 | 0 | 366 | 8 | 0 | 1 | 2.7s | 424 MiB | 8 | 1 React |
| rtd-full | 355 | 11 | 0 | 366 | 8 | 0 | 1 | 2.8s | 464 MiB | 8 | 1 React |
| jsdom | 366 | 0 | 0 | 366 | 8 | 0 | 0 | 3.5s | 512 MiB | 8 | 1 React |

## rtd-dom

Compared with jsdom: **9 pass on jsdom but fail here**, 0 missing, 0 added, 0 newly skipped, 0 fail on jsdom but pass here.

### Pass on jsdom, fail here

<details><summary>9 tests</summary>

- `packages/react-aria-components/test/ComboBox.test.js :: ComboBox should support validation errors` — Error: expect(element).toHaveTextContent()
- `packages/react-aria-components/test/Dialog.test.js :: Dialog should not close Modal when DateRangePicker is dismissed by outside click` — TestingLibraryElementError: Found multiple elements with the role "dialog"
- `packages/react-aria-components/test/Select.test.js :: Select supports validation errors` — Error: An update to %s inside a test was not wrapped in act(...).
- `packages/react-aria-components/test/Select.test.js :: Select should not submit if required and selectedKey is null` — Error: expect(jest.fn()).toHaveBeenCalledTimes(expected)
- `packages/react-aria-components/test/Select.test.js :: Select should support multiple selection form integration with many items` — Error: expect(element).toHaveTextContent()
- `packages/react-aria-components/test/Checkbox.test.js :: CheckboxField should support required state` — Error: An update to %s inside a test was not wrapped in act(...).
- `packages/react-aria-components/test/TextField.test.js :: TextField Input supports validation errors` — Error: expect(element).toHaveTextContent()
- `packages/react-aria-components/test/TextField.test.js :: TextField TextArea supports validation errors` — Error: expect(element).toHaveTextContent()
- `packages/react-aria-components/test/Menu.test.tsx :: Menu Submenus should close all submenus if interacting outside root submenu` — Error: expect(element).toHaveAttribute("aria-hidden", "true") // element.getAttribute("aria-hidden") === "true"

</details>

### Failures by component

| component | failed |
| --- | --: |
| RAC/Select | 3 |
| RAC/TextField | 2 |
| RAC/ComboBox | 1 |
| RAC/Dialog | 1 |
| RAC/Checkbox | 1 |
| RAC/Menu | 1 |

### Failures by error signature

| count | signature | components | example |
| --: | --- | --- | --- |
| 4 | Error: expect(element).toHaveTextContent() | RAC/ComboBox, RAC/Select, RAC/TextField | `packages/react-aria-components/test/ComboBox.test.js :: ComboBox should support validation errors` |
| 2 | Error: An update to %s inside a test was not wrapped in act(...). | RAC/Select, RAC/Checkbox | `packages/react-aria-components/test/Select.test.js :: Select supports validation errors` |
| 1 | TestingLibraryElementError: Found multiple elements with the role "dialog" | RAC/Dialog | `packages/react-aria-components/test/Dialog.test.js :: Dialog should not close Modal when DateRangePicker is dismissed by outside click` |
| 1 | Error: expect(jest.fn()).toHaveBeenCalledTimes(expected) | RAC/Select | `packages/react-aria-components/test/Select.test.js :: Select should not submit if required and selectedKey is null` |
| 1 | Error: expect(element).toHaveAttribute("aria-hidden", "true") // element.getAttribute("aria-hidden") === "true" | RAC/Menu | `packages/react-aria-components/test/Menu.test.tsx :: Menu Submenus should close all submenus if interacting outside root submenu` |

## rtd-full

Compared with jsdom: **11 pass on jsdom but fail here**, 0 missing, 0 added, 0 newly skipped, 0 fail on jsdom but pass here.

### Pass on jsdom, fail here

<details><summary>11 tests</summary>

- `packages/react-aria-components/test/ComboBox.test.js :: ComboBox should support validation errors` — Error: expect(element).toHaveTextContent()
- `packages/react-aria-components/test/Dialog.test.js :: Dialog should not close Modal when DateRangePicker is dismissed by outside click` — TestingLibraryElementError: Found multiple elements with the role "dialog"
- `packages/react-aria-components/test/Select.test.js :: Select supports validation errors` — Error: An update to %s inside a test was not wrapped in act(...).
- `packages/react-aria-components/test/Select.test.js :: Select should not submit if required and selectedKey is null` — Error: expect(jest.fn()).toHaveBeenCalledTimes(expected)
- `packages/react-aria-components/test/Select.test.js :: Select should support multiple selection form integration with many items` — Error: expect(element).toHaveTextContent()
- `packages/react-aria-components/test/Checkbox.test.js :: Checkbox should support press state with keyboard` — Error: expect(jest.fn()).toHaveBeenCalledTimes(expected)
- `packages/react-aria-components/test/Checkbox.test.js :: CheckboxField should support press state with keyboard` — Error: expect(jest.fn()).toHaveBeenCalledTimes(expected)
- `packages/react-aria-components/test/Checkbox.test.js :: CheckboxField should support required state` — Error: An update to %s inside a test was not wrapped in act(...).
- `packages/react-aria-components/test/TextField.test.js :: TextField Input supports validation errors` — Error: expect(element).toHaveTextContent()
- `packages/react-aria-components/test/TextField.test.js :: TextField TextArea supports validation errors` — Error: expect(element).toHaveTextContent()
- `packages/react-aria-components/test/Menu.test.tsx :: Menu Submenus should close all submenus if interacting outside root submenu` — Error: expect(element).toHaveAttribute("aria-hidden", "true") // element.getAttribute("aria-hidden") === "true"

</details>

### Failures by component

| component | failed |
| --- | --: |
| RAC/Select | 3 |
| RAC/Checkbox | 3 |
| RAC/TextField | 2 |
| RAC/ComboBox | 1 |
| RAC/Dialog | 1 |
| RAC/Menu | 1 |

### Failures by error signature

| count | signature | components | example |
| --: | --- | --- | --- |
| 4 | Error: expect(element).toHaveTextContent() | RAC/ComboBox, RAC/Select, RAC/TextField | `packages/react-aria-components/test/ComboBox.test.js :: ComboBox should support validation errors` |
| 3 | Error: expect(jest.fn()).toHaveBeenCalledTimes(expected) | RAC/Select, RAC/Checkbox | `packages/react-aria-components/test/Select.test.js :: Select should not submit if required and selectedKey is null` |
| 2 | Error: An update to %s inside a test was not wrapped in act(...). | RAC/Select, RAC/Checkbox | `packages/react-aria-components/test/Select.test.js :: Select supports validation errors` |
| 1 | TestingLibraryElementError: Found multiple elements with the role "dialog" | RAC/Dialog | `packages/react-aria-components/test/Dialog.test.js :: Dialog should not close Modal when DateRangePicker is dismissed by outside click` |
| 1 | Error: expect(element).toHaveAttribute("aria-hidden", "true") // element.getAttribute("aria-hidden") === "true" | RAC/Menu | `packages/react-aria-components/test/Menu.test.tsx :: Menu Submenus should close all submenus if interacting outside root submenu` |

## jsdom

No failing tests.

Raw Jest JSON, logs and probe receipts: `downstream/react-aria/output/<mode>/` (gitignored).
