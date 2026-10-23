# Base UI downstream: `interactions` (2026-10-23)

- upstream: https://github.com/mui/base-ui @ `205831caa12125f8e81f1af02a013239b27d752a` (2026-10-22T16:29:21+01:00) — [menu][combobox][autocomplete] Handle Space and Left/Right based on input text (#5997)
- pinned: `205831caa12125f8e81f1af02a013239b27d752a`
- filters: `packages/react/src/button/`, `packages/react/src/checkbox/`, `packages/react/src/radio/`, `packages/react/src/switch/`, `packages/react/src/tabs/`, `packages/react/src/select/`, `packages/react/src/menu/`, `packages/react/src/dialog/`, `packages/react/src/combobox/`, `packages/react/src/field/`, `packages/react/src/form/`, `packages/react/src/number-field/`, `packages/react/src/slider/`
- node v26.12.1, workers 7, upstream versions: vitest@5.0.4, vite@8.3.4, react@19.3.0, react-dom@19.3.0, jsdom@27.4.0, @testing-library/react@16.3.3, @testing-library/dom@10.4.2, @testing-library/user-event@14.6.7, @testing-library/jest-dom@7.0.1, @mui/internal-test-utils@2.1.1-canary.3
- rtd-full substitutes: @testing-library/react, @testing-library/dom, @testing-library/user-event, @testing-library/jest-dom
- rtd modes run with userAgent containing "jsdom" (same headless branches as the baseline; see README).

## Per-mode results

| mode | passed | failed | skipped | total | files | suite errors | exit | wall | peak RSS | env receipts | notes |
| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --- |
| jsdom | 4830 | 0 | 722 | 5552 | 153 | 0 | 0 | 110.4s | 500 MiB | 153 | 1 React |
| rtd-dom | 4755 | 75 | 722 | 5552 | 153 | 0 | 1 | 119.1s | 540 MiB | 153 | installer: installGlobals; 1 React; our sources changed during the run |
| rtd-full | 4747 | 83 | 722 | 5552 | 153 | 0 | 1 | 108.8s | 595 MiB | 153 | installer: installGlobals; 1 React; our sources changed during the run |

## jsdom

No failing tests.

## rtd-dom

Compared with jsdom: **75 pass on jsdom but fail here**, 0 missing, 0 added, 0 newly skipped, 0 fail on jsdom but pass here.

### Pass on jsdom, fail here

<details><summary>75 tests</summary>

- `packages/react/src/combobox/empty/ComboboxEmpty.test.tsx :: <Combobox.Empty /> Base UI component API prop forwarding forwards custom props to the default element` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/empty/ComboboxEmpty.test.tsx :: <Combobox.Empty /> Base UI component API prop forwarding forwards custom props to the customized element defined with a function` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/empty/ComboboxEmpty.test.tsx :: <Combobox.Empty /> Base UI component API prop forwarding forwards custom props to the customized element defined using JSX` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/empty/ComboboxEmpty.test.tsx :: <Combobox.Empty /> Base UI component API prop forwarding forwards the custom `style` attribute defined on the component` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/empty/ComboboxEmpty.test.tsx :: <Combobox.Empty /> Base UI component API prop forwarding forwards the custom `style` attribute defined on the render element` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/empty/ComboboxEmpty.test.tsx :: <Combobox.Empty /> Base UI component API ref attaches the ref` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/empty/ComboboxEmpty.test.tsx :: <Combobox.Empty /> Base UI component API prop: render renders a customized root element with a function` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/empty/ComboboxEmpty.test.tsx :: <Combobox.Empty /> Base UI component API prop: render renders a customized root element with an element` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/empty/ComboboxEmpty.test.tsx :: <Combobox.Empty /> Base UI component API prop: render should pass the ref to the custom component` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/empty/ComboboxEmpty.test.tsx :: <Combobox.Empty /> Base UI component API prop: render should merge the rendering element ref with the custom component ref` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/empty/ComboboxEmpty.test.tsx :: <Combobox.Empty /> Base UI component API prop: render should merge the rendering element className with the custom component className` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/empty/ComboboxEmpty.test.tsx :: <Combobox.Empty /> Base UI component API prop: render should merge the rendering element resolved className with the custom component className` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/empty/ComboboxEmpty.test.tsx :: <Combobox.Empty /> Base UI component API prop: className should apply the className to the root element when passed as a string` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/empty/ComboboxEmpty.test.tsx :: <Combobox.Empty /> renders when there are no filtered items` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/empty/ComboboxEmpty.test.tsx :: <Combobox.Empty /> does not render when there are items` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/empty/ComboboxEmpty.test.tsx :: <Combobox.Empty /> renders when the search query matches no items` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/empty/ComboboxEmpty.test.tsx :: <Combobox.Empty /> does not render when the search query matches an item` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/empty/ComboboxEmpty.test.tsx :: <Combobox.Empty /> a11y removes the initial text mutation after the reset delay` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/empty/ComboboxEmpty.test.tsx :: <Combobox.Empty /> a11y updates the live region immediately when the empty content appears after mount` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/empty/ComboboxEmpty.test.tsx :: <Combobox.Empty /> a11y preserves a custom render prop on the visible element` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/root/ComboboxRoot.test.tsx :: <Combobox.Root /> keyboard interaction does not bubble Escape key when Empty component is present` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/root/ComboboxRoot.test.tsx :: <Combobox.Root /> prop: filteredItems resets external filteredItems when reopening after a selection` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/root/ComboboxRoot.test.tsx :: <Combobox.Root /> prop: autoHighlight asynchronous items highlights a candidate arriving after typing with items` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/root/ComboboxRoot.test.tsx :: <Combobox.Root /> prop: autoHighlight asynchronous items highlights a candidate arriving after typing with filteredItems` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/root/ComboboxRoot.test.tsx :: <Combobox.Root /> prop: autoHighlight asynchronous items waits for a controlled popup to open` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/root/ComboboxRoot.test.tsx :: <Combobox.Root /> prop: autoHighlight asynchronous items discards the request when a rejected typed open is followed by a controlled open` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/root/ComboboxRoot.test.tsx :: <Combobox.Root /> prop: autoHighlight asynchronous items discards the request when an ignored typed open is followed by another open` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/root/ComboboxRoot.test.tsx :: <Combobox.Root /> prop: autoHighlight asynchronous items discards the request when a rejected typed open is followed by opening with Trigger` — Error: Unable to find role="option" and name "N"
- `packages/react/src/combobox/root/ComboboxRoot.test.tsx :: <Combobox.Root /> prop: autoHighlight asynchronous items discards the request when a rejected typed open is followed by opening with ArrowDown` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/root/ComboboxRoot.test.tsx :: <Combobox.Root /> prop: autoHighlight asynchronous items discards the request when the controlled input is cleared` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/root/ComboboxRoot.test.tsx :: <Combobox.Root /> prop: autoHighlight asynchronous items does not reset keyboard navigation when candidates change` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/root/ComboboxRoot.test.tsx :: <Combobox.Root /> prop: autoHighlight asynchronous items discards the request when autoHighlight is disabled` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/root/ComboboxRoot.test.tsx :: <Combobox.Root /> prop: isItemEqualToValue keeps showing items after selecting in controlled input-inside-popup async load flow` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/status/ComboboxStatus.test.tsx :: <Combobox.Status /> Base UI component API prop forwarding forwards custom props to the default element` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/status/ComboboxStatus.test.tsx :: <Combobox.Status /> Base UI component API prop forwarding forwards custom props to the customized element defined with a function` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/status/ComboboxStatus.test.tsx :: <Combobox.Status /> Base UI component API prop forwarding forwards custom props to the customized element defined using JSX` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/status/ComboboxStatus.test.tsx :: <Combobox.Status /> Base UI component API prop forwarding forwards the custom `style` attribute defined on the component` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/status/ComboboxStatus.test.tsx :: <Combobox.Status /> Base UI component API prop forwarding forwards the custom `style` attribute defined on the render element` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/status/ComboboxStatus.test.tsx :: <Combobox.Status /> Base UI component API ref attaches the ref` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/status/ComboboxStatus.test.tsx :: <Combobox.Status /> Base UI component API prop: render renders a customized root element with a function` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/status/ComboboxStatus.test.tsx :: <Combobox.Status /> Base UI component API prop: render renders a customized root element with an element` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/status/ComboboxStatus.test.tsx :: <Combobox.Status /> Base UI component API prop: render should pass the ref to the custom component` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/status/ComboboxStatus.test.tsx :: <Combobox.Status /> Base UI component API prop: render should merge the rendering element ref with the custom component ref` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/status/ComboboxStatus.test.tsx :: <Combobox.Status /> Base UI component API prop: render should merge the rendering element className with the custom component className` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/status/ComboboxStatus.test.tsx :: <Combobox.Status /> Base UI component API prop: render should merge the rendering element resolved className with the custom component className` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/status/ComboboxStatus.test.tsx :: <Combobox.Status /> Base UI component API prop: className should apply the className to the root element when passed as a string` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/status/ComboboxStatus.test.tsx :: <Combobox.Status /> renders only when open` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/status/ComboboxStatus.test.tsx :: <Combobox.Status /> a11y removes the initial text mutation after the reset delay` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/status/ComboboxStatus.test.tsx :: <Combobox.Status /> a11y updates content immediately after the live region has mounted` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/status/ComboboxStatus.test.tsx :: <Combobox.Status /> a11y preserves a custom render prop on the visible element` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/status/ComboboxStatus.test.tsx :: <Combobox.Status /> a11y restores the marker before unmounting during the reset delay` — ReferenceError: NodeFilter is not defined
- `packages/react/src/field/root/FieldRoot.test.tsx :: <Field.Root /> custom validity ownership keeps other native errors deferred while a message set outside the field survives` — AssertionError: expected [ Array(N) ] to deeply equal [ 'external error' ]
- `packages/react/src/field/root/FieldRoot.test.tsx :: <Field.Root /> custom validity ownership does not adopt a native message as the message it displaced` — AssertionError: expected 'Please include an \'@\' in the email …' to be 'custom error' // Object.is equality
- `packages/react/src/field/validity/FieldValidity.test.tsx :: <Field.Validity /> surfaces valueMissing immediately after a stale custom error in onBlur mode` — AssertionError: expected true to be false // Object.is equality
- `packages/react/src/menu/filter-root/MenuFilterParts.test.tsx :: Menu filter parts conformance Base UI component API prop forwarding forwards custom props to the default element [4]` — ReferenceError: NodeFilter is not defined
- `packages/react/src/menu/filter-root/MenuFilterParts.test.tsx :: Menu filter parts conformance Base UI component API prop forwarding forwards custom props to the customized element defined with a function [4]` — ReferenceError: NodeFilter is not defined
- `packages/react/src/menu/filter-root/MenuFilterParts.test.tsx :: Menu filter parts conformance Base UI component API prop forwarding forwards custom props to the customized element defined using JSX [4]` — ReferenceError: NodeFilter is not defined
- `packages/react/src/menu/filter-root/MenuFilterParts.test.tsx :: Menu filter parts conformance Base UI component API prop forwarding forwards the custom `style` attribute defined on the component [4]` — ReferenceError: NodeFilter is not defined
- `packages/react/src/menu/filter-root/MenuFilterParts.test.tsx :: Menu filter parts conformance Base UI component API prop forwarding forwards the custom `style` attribute defined on the render element [4]` — ReferenceError: NodeFilter is not defined
- `packages/react/src/menu/filter-root/MenuFilterParts.test.tsx :: Menu filter parts conformance Base UI component API ref attaches the ref [4]` — ReferenceError: NodeFilter is not defined
- `packages/react/src/menu/filter-root/MenuFilterParts.test.tsx :: Menu filter parts conformance Base UI component API prop: render renders a customized root element with a function [4]` — ReferenceError: NodeFilter is not defined
- `packages/react/src/menu/filter-root/MenuFilterParts.test.tsx :: Menu filter parts conformance Base UI component API prop: render renders a customized root element with an element [4]` — ReferenceError: NodeFilter is not defined
- `packages/react/src/menu/filter-root/MenuFilterParts.test.tsx :: Menu filter parts conformance Base UI component API prop: render should pass the ref to the custom component [4]` — ReferenceError: NodeFilter is not defined
- `packages/react/src/menu/filter-root/MenuFilterParts.test.tsx :: Menu filter parts conformance Base UI component API prop: render should merge the rendering element ref with the custom component ref [4]` — ReferenceError: NodeFilter is not defined
- `packages/react/src/menu/filter-root/MenuFilterParts.test.tsx :: Menu filter parts conformance Base UI component API prop: render should merge the rendering element className with the custom component className [4]` — ReferenceError: NodeFilter is not defined
- `packages/react/src/menu/filter-root/MenuFilterParts.test.tsx :: Menu filter parts conformance Base UI component API prop: render should merge the rendering element resolved className with the custom component className [4]` — ReferenceError: NodeFilter is not defined
- `packages/react/src/menu/filter-root/MenuFilterParts.test.tsx :: Menu filter parts conformance Base UI component API prop: className should apply the className to the root element when passed as a string [4]` — ReferenceError: NodeFilter is not defined
- `packages/react/src/menu/filter-root/MenuFilterRoot.initialHighlight.test.tsx :: filterable menu initial highlight clears the initial highlight when typing and permits an empty result` — ReferenceError: NodeFilter is not defined
- `packages/react/src/menu/filter-root/MenuFilterRoot.scoping.test.tsx :: <Menu.FilterProvider><Menu.Root/></Menu.FilterProvider> filters items by text and shows the empty state` — ReferenceError: NodeFilter is not defined
- `packages/react/src/menu/filter-root/MenuFilterRoot.test.tsx :: <Menu.FilterProvider><Menu.Root/></Menu.FilterProvider> filtering supports a detached trigger in a filterable menu` — ReferenceError: NodeFilter is not defined
- `packages/react/src/menu/filter-root/MenuFilterRoot.test.tsx :: <Menu.FilterProvider><Menu.Root/></Menu.FilterProvider> renders Empty when no items are registered at all` — ReferenceError: NodeFilter is not defined
- `packages/react/src/menu/filter-root/MenuFilterRoot.test.tsx :: <Menu.FilterProvider><Menu.Root/></Menu.FilterProvider> removes Empty once the query matches again` — ReferenceError: NodeFilter is not defined
- `packages/react/src/menu/filter-root/MenuFilterRoot.test.tsx :: <Menu.FilterProvider><Menu.Root/></Menu.FilterProvider> server-side rendering shows the empty state after hydration when no items are rendered` — ReferenceError: NodeFilter is not defined
- `packages/react/src/number-field/utils/getViewportRect.test.ts :: getViewportRect falls back to the document element without a visual viewport` — AssertionError: expected EventTarget{ _listeners: null, …(N) } to be undefined // Object.is equality
- `packages/react/src/tabs/list/TabsList.test.tsx :: <Tabs.List /> roving focus after tab removal moves the tab stop off a hidden successor when the highlighted tab is removed` — AssertionError: expected [ -N, +N, -N ] to deeply equal [ +N, -N, -N ]

</details>

### Failures by component

| component | failed |
| --- | --: |
| combobox | 51 |
| menu | 19 |
| field | 3 |
| number-field | 1 |
| tabs | 1 |

### Failures by error signature

| count | signature | components | example |
| --: | --- | --- | --- |
| 69 | ReferenceError: NodeFilter is not defined | combobox, menu | `packages/react/src/combobox/empty/ComboboxEmpty.test.tsx :: <Combobox.Empty /> Base UI component API prop forwarding forwards custom props to the default element` |
| 1 | Error: Unable to find role="option" and name "N" | combobox | `packages/react/src/combobox/root/ComboboxRoot.test.tsx :: <Combobox.Root /> prop: autoHighlight asynchronous items discards the request when a rejected typed open is followed by opening with Trigger` |
| 1 | AssertionError: expected [ Array(N) ] to deeply equal [ 'external error' ] | field | `packages/react/src/field/root/FieldRoot.test.tsx :: <Field.Root /> custom validity ownership keeps other native errors deferred while a message set outside the field survives` |
| 1 | AssertionError: expected 'Please include an \'@\' in the email …' to be 'custom error' // Object.is equality | field | `packages/react/src/field/root/FieldRoot.test.tsx :: <Field.Root /> custom validity ownership does not adopt a native message as the message it displaced` |
| 1 | AssertionError: expected true to be false // Object.is equality | field | `packages/react/src/field/validity/FieldValidity.test.tsx :: <Field.Validity /> surfaces valueMissing immediately after a stale custom error in onBlur mode` |
| 1 | AssertionError: expected EventTarget{ _listeners: null, …(N) } to be undefined // Object.is equality | number-field | `packages/react/src/number-field/utils/getViewportRect.test.ts :: getViewportRect falls back to the document element without a visual viewport` |
| 1 | AssertionError: expected [ -N, +N, -N ] to deeply equal [ +N, -N, -N ] | tabs | `packages/react/src/tabs/list/TabsList.test.tsx :: <Tabs.List /> roving focus after tab removal moves the tab stop off a hidden successor when the highlighted tab is removed` |

## rtd-full

Compared with jsdom: **83 pass on jsdom but fail here**, 0 missing, 0 added, 0 newly skipped, 0 fail on jsdom but pass here.

### Pass on jsdom, fail here

<details><summary>83 tests</summary>

- `packages/react/src/combobox/empty/ComboboxEmpty.test.tsx :: <Combobox.Empty /> Base UI component API prop forwarding forwards custom props to the default element` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/empty/ComboboxEmpty.test.tsx :: <Combobox.Empty /> Base UI component API prop forwarding forwards custom props to the customized element defined with a function` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/empty/ComboboxEmpty.test.tsx :: <Combobox.Empty /> Base UI component API prop forwarding forwards custom props to the customized element defined using JSX` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/empty/ComboboxEmpty.test.tsx :: <Combobox.Empty /> Base UI component API prop forwarding forwards the custom `style` attribute defined on the component` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/empty/ComboboxEmpty.test.tsx :: <Combobox.Empty /> Base UI component API prop forwarding forwards the custom `style` attribute defined on the render element` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/empty/ComboboxEmpty.test.tsx :: <Combobox.Empty /> Base UI component API ref attaches the ref` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/empty/ComboboxEmpty.test.tsx :: <Combobox.Empty /> Base UI component API prop: render renders a customized root element with a function` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/empty/ComboboxEmpty.test.tsx :: <Combobox.Empty /> Base UI component API prop: render renders a customized root element with an element` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/empty/ComboboxEmpty.test.tsx :: <Combobox.Empty /> Base UI component API prop: render should pass the ref to the custom component` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/empty/ComboboxEmpty.test.tsx :: <Combobox.Empty /> Base UI component API prop: render should merge the rendering element ref with the custom component ref` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/empty/ComboboxEmpty.test.tsx :: <Combobox.Empty /> Base UI component API prop: render should merge the rendering element className with the custom component className` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/empty/ComboboxEmpty.test.tsx :: <Combobox.Empty /> Base UI component API prop: render should merge the rendering element resolved className with the custom component className` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/empty/ComboboxEmpty.test.tsx :: <Combobox.Empty /> Base UI component API prop: className should apply the className to the root element when passed as a string` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/empty/ComboboxEmpty.test.tsx :: <Combobox.Empty /> renders when there are no filtered items` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/empty/ComboboxEmpty.test.tsx :: <Combobox.Empty /> does not render when there are items` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/empty/ComboboxEmpty.test.tsx :: <Combobox.Empty /> renders when the search query matches no items` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/empty/ComboboxEmpty.test.tsx :: <Combobox.Empty /> does not render when the search query matches an item` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/empty/ComboboxEmpty.test.tsx :: <Combobox.Empty /> a11y removes the initial text mutation after the reset delay` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/empty/ComboboxEmpty.test.tsx :: <Combobox.Empty /> a11y updates the live region immediately when the empty content appears after mount` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/empty/ComboboxEmpty.test.tsx :: <Combobox.Empty /> a11y preserves a custom render prop on the visible element` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/items/createItems.test.tsx :: Combobox.createItems integration uses derived labels for closed trigger typeahead` — Error: expect(element).toHaveTextContent()
- `packages/react/src/combobox/root/ComboboxRoot.test.tsx :: <Combobox.Root /> keyboard interaction does not bubble Escape key when Empty component is present` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/root/ComboboxRoot.test.tsx :: <Combobox.Root /> prop: filteredItems resets external filteredItems when reopening after a selection` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/root/ComboboxRoot.test.tsx :: <Combobox.Root /> prop: autoHighlight asynchronous items highlights a candidate arriving after typing with items` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/root/ComboboxRoot.test.tsx :: <Combobox.Root /> prop: autoHighlight asynchronous items highlights a candidate arriving after typing with filteredItems` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/root/ComboboxRoot.test.tsx :: <Combobox.Root /> prop: autoHighlight asynchronous items waits for a controlled popup to open` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/root/ComboboxRoot.test.tsx :: <Combobox.Root /> prop: autoHighlight asynchronous items discards the request when a rejected typed open is followed by a controlled open` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/root/ComboboxRoot.test.tsx :: <Combobox.Root /> prop: autoHighlight asynchronous items discards the request when an ignored typed open is followed by another open` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/root/ComboboxRoot.test.tsx :: <Combobox.Root /> prop: autoHighlight asynchronous items discards the request when a rejected typed open is followed by opening with Trigger` — Error: Unable to find role="option" and name "N"
- `packages/react/src/combobox/root/ComboboxRoot.test.tsx :: <Combobox.Root /> prop: autoHighlight asynchronous items discards the request when a rejected typed open is followed by opening with ArrowDown` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/root/ComboboxRoot.test.tsx :: <Combobox.Root /> prop: autoHighlight asynchronous items discards the request when the controlled input is cleared` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/root/ComboboxRoot.test.tsx :: <Combobox.Root /> prop: autoHighlight asynchronous items does not reset keyboard navigation when candidates change` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/root/ComboboxRoot.test.tsx :: <Combobox.Root /> prop: autoHighlight asynchronous items discards the request when autoHighlight is disabled` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/root/ComboboxRoot.test.tsx :: <Combobox.Root /> prop: isItemEqualToValue keeps showing items after selecting in controlled input-inside-popup async load flow` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/status/ComboboxStatus.test.tsx :: <Combobox.Status /> Base UI component API prop forwarding forwards custom props to the default element` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/status/ComboboxStatus.test.tsx :: <Combobox.Status /> Base UI component API prop forwarding forwards custom props to the customized element defined with a function` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/status/ComboboxStatus.test.tsx :: <Combobox.Status /> Base UI component API prop forwarding forwards custom props to the customized element defined using JSX` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/status/ComboboxStatus.test.tsx :: <Combobox.Status /> Base UI component API prop forwarding forwards the custom `style` attribute defined on the component` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/status/ComboboxStatus.test.tsx :: <Combobox.Status /> Base UI component API prop forwarding forwards the custom `style` attribute defined on the render element` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/status/ComboboxStatus.test.tsx :: <Combobox.Status /> Base UI component API ref attaches the ref` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/status/ComboboxStatus.test.tsx :: <Combobox.Status /> Base UI component API prop: render renders a customized root element with a function` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/status/ComboboxStatus.test.tsx :: <Combobox.Status /> Base UI component API prop: render renders a customized root element with an element` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/status/ComboboxStatus.test.tsx :: <Combobox.Status /> Base UI component API prop: render should pass the ref to the custom component` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/status/ComboboxStatus.test.tsx :: <Combobox.Status /> Base UI component API prop: render should merge the rendering element ref with the custom component ref` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/status/ComboboxStatus.test.tsx :: <Combobox.Status /> Base UI component API prop: render should merge the rendering element className with the custom component className` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/status/ComboboxStatus.test.tsx :: <Combobox.Status /> Base UI component API prop: render should merge the rendering element resolved className with the custom component className` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/status/ComboboxStatus.test.tsx :: <Combobox.Status /> Base UI component API prop: className should apply the className to the root element when passed as a string` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/status/ComboboxStatus.test.tsx :: <Combobox.Status /> renders only when open` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/status/ComboboxStatus.test.tsx :: <Combobox.Status /> a11y removes the initial text mutation after the reset delay` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/status/ComboboxStatus.test.tsx :: <Combobox.Status /> a11y updates content immediately after the live region has mounted` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/status/ComboboxStatus.test.tsx :: <Combobox.Status /> a11y preserves a custom render prop on the visible element` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/status/ComboboxStatus.test.tsx :: <Combobox.Status /> a11y restores the marker before unmounting during the reset delay` — ReferenceError: NodeFilter is not defined
- `packages/react/src/combobox/trigger/ComboboxTrigger.test.tsx :: <Combobox.Trigger /> typeahead selects item when typing on focused trigger (input inside popup)` — Error: expect(element).toHaveTextContent()
- `packages/react/src/field/root/FieldRoot.test.tsx :: <Field.Root /> custom validity ownership keeps other native errors deferred while a message set outside the field survives` — AssertionError: expected [ Array(N) ] to deeply equal [ 'external error' ]
- `packages/react/src/field/root/FieldRoot.test.tsx :: <Field.Root /> custom validity ownership does not adopt a native message as the message it displaced` — AssertionError: expected 'Please include an \'@\' in the email …' to be 'custom error' // Object.is equality
- `packages/react/src/field/validity/FieldValidity.test.tsx :: <Field.Validity /> surfaces valueMissing immediately after a stale custom error in onBlur mode` — AssertionError: expected true to be false // Object.is equality
- `packages/react/src/menu/filter-root/MenuFilterParts.test.tsx :: Menu filter parts conformance Base UI component API prop forwarding forwards custom props to the default element [4]` — ReferenceError: NodeFilter is not defined
- `packages/react/src/menu/filter-root/MenuFilterParts.test.tsx :: Menu filter parts conformance Base UI component API prop forwarding forwards custom props to the customized element defined with a function [4]` — ReferenceError: NodeFilter is not defined
- `packages/react/src/menu/filter-root/MenuFilterParts.test.tsx :: Menu filter parts conformance Base UI component API prop forwarding forwards custom props to the customized element defined using JSX [4]` — ReferenceError: NodeFilter is not defined
- `packages/react/src/menu/filter-root/MenuFilterParts.test.tsx :: Menu filter parts conformance Base UI component API prop forwarding forwards the custom `style` attribute defined on the component [4]` — ReferenceError: NodeFilter is not defined
- `packages/react/src/menu/filter-root/MenuFilterParts.test.tsx :: Menu filter parts conformance Base UI component API prop forwarding forwards the custom `style` attribute defined on the render element [4]` — ReferenceError: NodeFilter is not defined
- `packages/react/src/menu/filter-root/MenuFilterParts.test.tsx :: Menu filter parts conformance Base UI component API ref attaches the ref [4]` — ReferenceError: NodeFilter is not defined
- `packages/react/src/menu/filter-root/MenuFilterParts.test.tsx :: Menu filter parts conformance Base UI component API prop: render renders a customized root element with a function [4]` — ReferenceError: NodeFilter is not defined
- `packages/react/src/menu/filter-root/MenuFilterParts.test.tsx :: Menu filter parts conformance Base UI component API prop: render renders a customized root element with an element [4]` — ReferenceError: NodeFilter is not defined
- `packages/react/src/menu/filter-root/MenuFilterParts.test.tsx :: Menu filter parts conformance Base UI component API prop: render should pass the ref to the custom component [4]` — ReferenceError: NodeFilter is not defined
- `packages/react/src/menu/filter-root/MenuFilterParts.test.tsx :: Menu filter parts conformance Base UI component API prop: render should merge the rendering element ref with the custom component ref [4]` — ReferenceError: NodeFilter is not defined
- `packages/react/src/menu/filter-root/MenuFilterParts.test.tsx :: Menu filter parts conformance Base UI component API prop: render should merge the rendering element className with the custom component className [4]` — ReferenceError: NodeFilter is not defined
- `packages/react/src/menu/filter-root/MenuFilterParts.test.tsx :: Menu filter parts conformance Base UI component API prop: render should merge the rendering element resolved className with the custom component className [4]` — ReferenceError: NodeFilter is not defined
- `packages/react/src/menu/filter-root/MenuFilterParts.test.tsx :: Menu filter parts conformance Base UI component API prop: className should apply the className to the root element when passed as a string [4]` — ReferenceError: NodeFilter is not defined
- `packages/react/src/menu/filter-root/MenuFilterRoot.initialHighlight.test.tsx :: filterable menu initial highlight clears the initial highlight when typing and permits an empty result` — ReferenceError: NodeFilter is not defined
- `packages/react/src/menu/filter-root/MenuFilterRoot.scoping.test.tsx :: <Menu.FilterProvider><Menu.Root/></Menu.FilterProvider> filters items by text and shows the empty state` — ReferenceError: NodeFilter is not defined
- `packages/react/src/menu/filter-root/MenuFilterRoot.test.tsx :: <Menu.FilterProvider><Menu.Root/></Menu.FilterProvider> filtering supports a detached trigger in a filterable menu` — ReferenceError: NodeFilter is not defined
- `packages/react/src/menu/filter-root/MenuFilterRoot.test.tsx :: <Menu.FilterProvider><Menu.Root/></Menu.FilterProvider> renders Empty when no items are registered at all` — ReferenceError: NodeFilter is not defined
- `packages/react/src/menu/filter-root/MenuFilterRoot.test.tsx :: <Menu.FilterProvider><Menu.Root/></Menu.FilterProvider> removes Empty once the query matches again` — ReferenceError: NodeFilter is not defined
- `packages/react/src/menu/filter-root/MenuFilterRoot.test.tsx :: <Menu.FilterProvider><Menu.Root/></Menu.FilterProvider> server-side rendering shows the empty state after hydration when no items are rendered` — ReferenceError: NodeFilter is not defined
- `packages/react/src/number-field/utils/getViewportRect.test.ts :: getViewportRect falls back to the document element without a visual viewport` — AssertionError: expected EventTarget{ _listeners: null, …(N) } to be undefined // Object.is equality
- `packages/react/src/select/root/SelectRoot.test.tsx :: <Select.Root /> typeahead starts a new search after focus leaves the select` — AssertionError: expected '' to be 'banana' // Object.is equality
- `packages/react/src/select/root/SelectRoot.test.tsx :: <Select.Root /> typeahead skips disabled items and commits the next match via typeahead on a closed trigger` — AssertionError: expected '' to be 'avocado' // Object.is equality
- `packages/react/src/select/root/SelectRoot.test.tsx :: <Select.Root /> typeahead commits typeahead on a closed trigger when items are provided` — AssertionError: expected '' to be 'Cherry' // Object.is equality
- `packages/react/src/select/root/SelectRoot.test.tsx :: <Select.Root /> typeahead does not let a disabled double-letter item block rapid cycling among enabled matches` — AssertionError: expected '' to be 'apple' // Object.is equality
- `packages/react/src/select/root/SelectRoot.test.tsx :: <Select.Root /> typeahead starts from the first match after value reset (closed)` — AssertionError: expected '' to be 'a1' // Object.is equality
- `packages/react/src/select/root/SelectRoot.test.tsx :: <Select.Root /> typeahead does not jump matches after a closed-state value reset` — AssertionError: expected 'car' to be 'cat' // Object.is equality
- `packages/react/src/tabs/list/TabsList.test.tsx :: <Tabs.List /> roving focus after tab removal moves the tab stop off a hidden successor when the highlighted tab is removed` — AssertionError: expected [ -N, +N, -N ] to deeply equal [ +N, -N, -N ]

</details>

### Failures by component

| component | failed |
| --- | --: |
| combobox | 53 |
| menu | 19 |
| select | 6 |
| field | 3 |
| number-field | 1 |
| tabs | 1 |

### Failures by error signature

| count | signature | components | example |
| --: | --- | --- | --- |
| 69 | ReferenceError: NodeFilter is not defined | combobox, menu | `packages/react/src/combobox/empty/ComboboxEmpty.test.tsx :: <Combobox.Empty /> Base UI component API prop forwarding forwards custom props to the default element` |
| 2 | Error: expect(element).toHaveTextContent() | combobox | `packages/react/src/combobox/items/createItems.test.tsx :: Combobox.createItems integration uses derived labels for closed trigger typeahead` |
| 1 | Error: Unable to find role="option" and name "N" | combobox | `packages/react/src/combobox/root/ComboboxRoot.test.tsx :: <Combobox.Root /> prop: autoHighlight asynchronous items discards the request when a rejected typed open is followed by opening with Trigger` |
| 1 | AssertionError: expected [ Array(N) ] to deeply equal [ 'external error' ] | field | `packages/react/src/field/root/FieldRoot.test.tsx :: <Field.Root /> custom validity ownership keeps other native errors deferred while a message set outside the field survives` |
| 1 | AssertionError: expected 'Please include an \'@\' in the email …' to be 'custom error' // Object.is equality | field | `packages/react/src/field/root/FieldRoot.test.tsx :: <Field.Root /> custom validity ownership does not adopt a native message as the message it displaced` |
| 1 | AssertionError: expected true to be false // Object.is equality | field | `packages/react/src/field/validity/FieldValidity.test.tsx :: <Field.Validity /> surfaces valueMissing immediately after a stale custom error in onBlur mode` |
| 1 | AssertionError: expected EventTarget{ _listeners: null, …(N) } to be undefined // Object.is equality | number-field | `packages/react/src/number-field/utils/getViewportRect.test.ts :: getViewportRect falls back to the document element without a visual viewport` |
| 1 | AssertionError: expected '' to be 'banana' // Object.is equality | select | `packages/react/src/select/root/SelectRoot.test.tsx :: <Select.Root /> typeahead starts a new search after focus leaves the select` |
| 1 | AssertionError: expected '' to be 'avocado' // Object.is equality | select | `packages/react/src/select/root/SelectRoot.test.tsx :: <Select.Root /> typeahead skips disabled items and commits the next match via typeahead on a closed trigger` |
| 1 | AssertionError: expected '' to be 'Cherry' // Object.is equality | select | `packages/react/src/select/root/SelectRoot.test.tsx :: <Select.Root /> typeahead commits typeahead on a closed trigger when items are provided` |
| 1 | AssertionError: expected '' to be 'apple' // Object.is equality | select | `packages/react/src/select/root/SelectRoot.test.tsx :: <Select.Root /> typeahead does not let a disabled double-letter item block rapid cycling among enabled matches` |
| 1 | AssertionError: expected '' to be 'a1' // Object.is equality | select | `packages/react/src/select/root/SelectRoot.test.tsx :: <Select.Root /> typeahead starts from the first match after value reset (closed)` |
| 1 | AssertionError: expected 'car' to be 'cat' // Object.is equality | select | `packages/react/src/select/root/SelectRoot.test.tsx :: <Select.Root /> typeahead does not jump matches after a closed-state value reset` |
| 1 | AssertionError: expected [ -N, +N, -N ] to deeply equal [ +N, -N, -N ] | tabs | `packages/react/src/tabs/list/TabsList.test.tsx :: <Tabs.List /> roving focus after tab removal moves the tab stop off a hidden successor when the highlighted tab is removed` |

Raw Vitest JSON and logs: `downstream/base-ui/output/<mode>/` (gitignored).
