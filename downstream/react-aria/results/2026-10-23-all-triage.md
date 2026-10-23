# React Aria downstream: `all` (2026-10-23)

> **TRIAGE MODE (`--triage fake-raf,keep-globals,no-pointer-event,isolate`)**: rtd modes ran with jest-environment.mjs's triage shims (workarounds for jest-environment blockers already filed in TRIAGE.md). These are not compatibility results.

- upstream: https://github.com/adobe/react-spectrum @ `d5fb723a1c192e3a1a25c8cfdd4e26b900995307` (2026-10-23T05:09:37Z) — fix(usePress): only skip Enter default prevention on macOS for Control + Enter (#10820)
- pinned: `d5fb723a1c192e3a1a25c8cfdd4e26b900995307`
- filters: `packages/react-aria/test/`, `packages/react-aria-components/test/`
- node v26.12.1, Jest workers 4, STRICT_MODE=1 VIRT_ON=1, upstream versions: jest@30.4.2, jest-environment-jsdom@30.4.1, jsdom@26.1.0, @swc/jest@0.2.39, react@19.3.0, react-dom@19.3.0, @testing-library/react@16.3.2, @testing-library/dom@10.4.1, @testing-library/user-event@14.6.5, @testing-library/jest-dom@6.9.1
- rtd-full substitutes: @testing-library/react, @testing-library/dom, @testing-library/user-event, @testing-library/jest-dom (built bundles, packages/*/dist)

## Per-mode results

| mode | passed | failed | skipped | total | files | suite errors | exit | wall | peak RSS | env receipts | notes |
| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --- |
| rtd-dom | 2704 | 223 | 9 | 2936 | 152 | 2 | 1 | 12.4s | 861 MiB | 152 | 1 React |
| rtd-full | 2685 | 249 | 9 | 2943 | 152 | 1 | 1 | 11.7s | 867 MiB | 152 | 1 React |
| jsdom | 2997 | 0 | 9 | 3006 | 152 | 0 | 0 | 14.6s | 984 MiB | 152 | 1 React |

## rtd-dom

### Suite errors (file failed to load)

- `packages/react-aria-components/test/Sheet.test.js`: TypeError: Cannot assign to read only property 'supports' of object '[object CSS]'
- `packages/react-aria/test/utils/DOMFunctions.test.tsx`: TypeError: Cannot read properties of undefined (reading 'doc')

Compared with jsdom: **223 pass on jsdom but fail here**, 70 missing, 0 added, 0 newly skipped, 0 fail on jsdom but pass here.

### Pass on jsdom, fail here

<details><summary>223 tests</summary>

- `packages/react-aria-components/test/Menu.test.tsx :: Menu Submenus should close all submenus if interacting outside root submenu` — Error: expect(element).toHaveAttribute("aria-hidden", "true") // element.getAttribute("aria-hidden") === "true"
- `packages/react-aria-components/test/Autocomplete.test.tsx :: Autocomplete should be able to tab inside a focus scope that contains` — TestingLibraryElementError: Found multiple elements with the role "textbox"
- `packages/react-aria-components/test/Autocomplete.test.tsx :: Autocomplete should be able to tab inside a focus scope that contains with buttons after the autocomplete` — TestingLibraryElementError: Found multiple elements with the role "textbox"
- `packages/react-aria-components/test/Select.test.js :: Select supports validation errors` — Error: An update to %s inside a test was not wrapped in act(...).
- `packages/react-aria-components/test/Select.test.js :: Select should not submit if required and selectedKey is null` — Error: expect(jest.fn()).toHaveBeenCalledTimes(expected)
- `packages/react-aria-components/test/Select.test.js :: Select should support multiple selection form integration with many items` — Error: expect(element).toHaveTextContent()
- `packages/react-aria/test/table/ariaTableResizing.test.tsx :: Aria Table Resizing resizing table will not affect pixel widths` — Error: expect(received).toStrictEqual(expected) // deep equality
- `packages/react-aria/test/table/ariaTableResizing.test.tsx :: Aria Table Resizing resizing table will resize all percent columns` — Error: expect(received).toStrictEqual(expected) // deep equality
- `packages/react-aria/test/table/ariaTableResizing.test.tsx :: Aria Table Resizing resizing table will resize all fr columns` — Error: expect(received).toStrictEqual(expected) // deep equality
- `packages/react-aria/test/table/ariaTableResizing.test.tsx :: Aria Table Resizing resizing table will resize all fr columns only after percent columns` — Error: expect(received).toStrictEqual(expected) // deep equality
- `packages/react-aria-components/test/ComboBox.test.js :: ComboBox should support validation errors` — Error: expect(element).toHaveTextContent()
- `packages/react-aria-components/test/GridList.test.js :: GridList selectionBehavior="replace" keyboard should perform selection with single selection` — Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true"
- `packages/react-aria-components/test/GridList.test.js :: GridList selectionBehavior="replace" keyboard should perform toggle selection in highlight mode when using modifier keys` — Error: expect(jest.fn()).toHaveBeenCalledTimes(expected)
- `packages/react-aria-components/test/GridList.test.js :: GridList drag and drop should render drop indicators` — Error: expect(received).toHaveLength(expected)
- `packages/react-aria-components/test/GridList.test.js :: GridList drag and drop should not skip drop positions before/after a disabled item` — Error: expect(element).toHaveAttribute("aria-label", "Insert between Cat and Dog") // element.getAttribute("aria-label") === "Insert between Cat and Dog"
- `packages/react-aria-components/test/GridList.test.js :: GridList drag and drop should support dropping on rows` — Error: expect(received).toHaveLength(expected)
- `packages/react-aria-components/test/GridList.test.js :: GridList drag and drop should support dropping on the root` — Error: expect(received).toHaveLength(expected)
- `packages/react-aria-components/test/GridList.test.js :: GridList drag and drop should support dropping with horizontal arrow keys when orientation is horizontal` — Error: expect(element).toHaveAttribute("data-drop-target", "true") // element.getAttribute("data-drop-target") === "true"
- `packages/react-aria-components/test/GridList.test.js :: GridList links mouse should support links with selectionMode="none"` — Error: expect(jest.fn()).toHaveBeenCalledTimes(expected)
- `packages/react-aria-components/test/GridList.test.js :: GridList links mouse should support links with selectionBehavior="toggle" selectionMode="single"` — Error: expect(jest.fn()).toHaveBeenCalledTimes(expected)
- `packages/react-aria-components/test/GridList.test.js :: GridList links mouse should support links with selectionBehavior="toggle" selectionMode="multiple"` — Error: expect(jest.fn()).toHaveBeenCalledTimes(expected)
- `packages/react-aria-components/test/GridList.test.js :: GridList links mouse should support links with selectionBehavior="replace" selectionMode="single"` — Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true"
- `packages/react-aria-components/test/GridList.test.js :: GridList links mouse should support links with selectionBehavior="replace" selectionMode="multiple"` — Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true"
- `packages/react-aria-components/test/GridList.test.js :: GridList links mouse should work with RouterProvider` — Error: expect(jest.fn()).toHaveBeenCalledWith(...expected)
- `packages/react-aria-components/test/GridList.test.js :: GridList links keyboard should support links with selectionMode="none"` — Error: expect(jest.fn()).toHaveBeenCalledTimes(expected)
- `packages/react-aria-components/test/Tree.test.tsx :: Tree drag and drop should render drop indicators` — Error: expect(received).toHaveLength(expected)
- `packages/react-aria-components/test/Tree.test.tsx :: Tree drag and drop should not skip drop positions before/after a disabled item` — Error: expect(element).toHaveAttribute("aria-label", "Insert between Cat and Dog") // element.getAttribute("aria-label") === "Insert between Cat and Dog"
- `packages/react-aria-components/test/Tree.test.tsx :: Tree drag and drop should support dropping on items` — Error: expect(received).toHaveLength(expected)
- `packages/react-aria-components/test/Tree.test.tsx :: Tree drag and drop should support dropping on the root` — Error: expect(received).toHaveLength(expected)
- `packages/react-aria-components/test/Tree.test.tsx :: Tree drag and drop should automatically focus the newly added dropped item` — Error: expect(received).toHaveLength(expected)
- `packages/react-aria-components/test/Tree.test.tsx :: Tree drag and drop should allow selection even when drag and drop is disabled` — Error: expect(element).toHaveAttribute("data-selected", "true") // element.getAttribute("data-selected") === "true"
- `packages/react-aria-components/test/Tree.test.tsx :: Tree drag and drop should select the parent and all its children when dropped` — Error: expect(received).toHaveLength(expected)
- `packages/react-aria-components/test/Tree.test.tsx :: Tree drag and drop should focus the parent row when dropped on if it isnt expanded` — Error: expect(received).toHaveLength(expected)
- `packages/react-aria-components/test/Tree.test.tsx :: Tree drag and drop should focus the dropped row when dropped on a parent that is expanded` — Error: expect(received).toHaveLength(expected)
- `packages/react-aria-components/test/Tree.test.tsx :: Tree press events should support press events on items when using mouse` — Error: expect(jest.fn()).toHaveBeenCalledTimes(expected)
- `packages/react-aria-components/test/Tree.test.tsx :: Tree press events should support press events on items when using keyboard` — Error: ActiveElement is not in the gridlist
- `packages/react-aria-components/test/Tree.test.tsx :: Tree tab navigation and textfields should not navigate rows when arrow keys are pressed while a text input child has focus` — TypeError: Cannot assign to read only property 'type' of object '#<Object>'
- `packages/react-aria-components/test/Tree.test.tsx :: Tree tab navigation and textfields should not trigger typeahead when typing in a text input child` — TypeError: Cannot assign to read only property 'type' of object '#<Object>'
- `packages/react-aria-components/test/Tree.test.tsx :: Tree tab navigation and textfields should not trigger selection when pressing Space in a text input child of a leaf row` — TypeError: Cannot assign to read only property 'type' of object '#<Object>'
- `packages/react-aria-components/test/Tree.test.tsx :: Tree tab navigation and textfields should allow typing space in the text input child of a parent row` — TypeError: Cannot assign to read only property 'type' of object '#<Object>'
- `packages/react-aria-components/test/Tree.test.tsx :: Tree focusMode and allowsArrowNavigation focusMode="child" auto-focuses first child when item receives focus` — TypeError: Cannot assign to read only property 'type' of object '#<Object>'
- `packages/react-aria-components/test/Tree.test.tsx :: Tree focusMode and allowsArrowNavigation allowsArrowNavigation allows arrow key navigation when focused on child` — TypeError: Cannot assign to read only property 'type' of object '#<Object>'
- `packages/react-aria-components/test/Tree.test.tsx :: Tree focusMode and allowsArrowNavigation focusMode="child" with default arrow navigation ArrowDown from child navigates to first child of next item` — TypeError: Cannot assign to read only property 'props' of object '#<Object>'
- `packages/react-aria-components/test/Tree.test.tsx :: Tree focusMode and allowsArrowNavigation focusMode="child" with default arrow navigation ArrowUp from child navigates to first child of previous item` — TypeError: Cannot assign to read only property 'props' of object '#<Object>'
- `packages/react-aria-components/test/Tree.test.tsx :: Tree focusMode and allowsArrowNavigation focusMode="row" (default) with tab navigation Tab into tree focuses row, Tab from row enters child, Shift+Tab returns to row` — TypeError: Cannot assign to read only property 'props' of object '#<Object>'
- `packages/react-aria-components/test/Tree.test.tsx :: Tree focusMode and allowsArrowNavigation focusMode="row" (default) with tab navigation ArrowRight expands collapsed parent item in tab mode` — TypeError: Cannot assign to read only property 'type' of object '#<Object>'
- `packages/react-aria-components/test/Tree.test.tsx :: rac-staticAriaTree interaction - mouse should have the expected attributes on the rows` — Error: expect(element).toHaveAttribute("aria-expanded", "true") // element.getAttribute("aria-expanded") === "true"
- `packages/react-aria-components/test/Tree.test.tsx :: rac-staticAriaTree interaction - keyboard should have the expected attributes on the rows` — Error: ActiveElement is not in the tree
- `packages/react-aria-components/test/Tree.test.tsx :: rac-staticAriaTree interaction - touch should have the expected attributes on the rows` — Error: expect(element).toHaveAttribute("aria-expanded", "true") // element.getAttribute("aria-expanded") === "true"
- `packages/react-aria-components/test/Tree.test.tsx :: rac-staticAriaTree single selection interaction - mouse can select items` — Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true"
- `packages/react-aria-components/test/Tree.test.tsx :: rac-staticAriaTree single selection interaction - keyboard can select items` — Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true"
- `packages/react-aria-components/test/Tree.test.tsx :: rac-staticAriaTree single selection interaction - touch can select items` — Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true"
- `packages/react-aria-components/test/Tree.test.tsx :: rac-controlled-dynamicAriaTree interaction - mouse should have the expected attributes on the rows` — Error: expect(element).toHaveAttribute("aria-expanded", "true") // element.getAttribute("aria-expanded") === "true"
- `packages/react-aria-components/test/Tree.test.tsx :: rac-controlled-dynamicAriaTree interaction - keyboard should have the expected attributes on the rows` — Error: ActiveElement is not in the tree
- `packages/react-aria-components/test/Tree.test.tsx :: rac-controlled-dynamicAriaTree interaction - touch should have the expected attributes on the rows` — Error: expect(element).toHaveAttribute("aria-expanded", "true") // element.getAttribute("aria-expanded") === "true"
- `packages/react-aria-components/test/Tree.test.tsx :: rac-controlled-dynamicAriaTree single selection interaction - mouse can select items` — Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true"
- `packages/react-aria-components/test/Tree.test.tsx :: rac-controlled-dynamicAriaTree single selection interaction - keyboard can select items` — Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true"
- `packages/react-aria-components/test/Tree.test.tsx :: rac-controlled-dynamicAriaTree single selection interaction - touch can select items` — Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true"
- `packages/react-aria-components/test/ListBox.test.js :: ListBox selectionBehavior="replace" keyboard should perform selection with single selection` — Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true"
- `packages/react-aria-components/test/ListBox.test.js :: ListBox selectionBehavior="replace" keyboard should perform toggle selection in highlight mode when using modifier keys` — Error: expect(jest.fn()).toHaveBeenCalledTimes(expected)
- `packages/react-aria-components/test/Treeble.test.js :: Treeble should support drag and drop` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria-components/test/Treeble.test.js :: Treeble should properly walk through nested levels of drop positioning` — Error: expect(element).toHaveAttribute("aria-label", "Insert after Budget") // element.getAttribute("aria-label") === "Insert after Budget"
- `packages/react-aria/test/interactions/usePress.test.js :: usePress disable text-selection when pressed non related style changes during press down shouldn't overwrite user-select on press end (non-iOS)` — Error: expect(element).toHaveStyle()
- `packages/react-aria/test/interactions/usePress.test.js :: usePress disable text-selection when pressed changes to user-select during press down remain on press end (non-iOS)` — Error: expect(element).toHaveStyle()
- `packages/react-aria-components/test/Table.test.js :: Table drag and drop should render drop indicators` — Error: expect(received).toHaveLength(expected)
- `packages/react-aria-components/test/Table.test.js :: Table drag and drop should not skip drop positions before/after a disabled item` — Error: expect(element).toHaveAttribute("aria-label", "Insert between Games and Program Files") // element.getAttribute("aria-label") === "Insert between Games and Program Files"
- `packages/react-aria-components/test/Table.test.js :: Table drag and drop should support dropping on rows` — Error: expect(received).toHaveLength(expected)
- `packages/react-aria-components/test/Table.test.js :: Table drag and drop should support dropping on the root` — Error: expect(received).toHaveLength(expected)
- `packages/react-aria-components/test/Table.test.js :: Table column resizing Resizing resizing table will not affect pixel widths` — Error: expect(received).toStrictEqual(expected) // deep equality
- `packages/react-aria-components/test/Table.test.js :: Table column resizing Resizing resizing table will resize all percent columns` — Error: expect(received).toStrictEqual(expected) // deep equality
- `packages/react-aria-components/test/Table.test.js :: Table column resizing Resizing resizing table will resize all fr columns` — Error: expect(received).toStrictEqual(expected) // deep equality
- `packages/react-aria-components/test/Table.test.js :: Table column resizing Resizing resizing table will resize all fr columns only after percent columns` — Error: expect(received).toStrictEqual(expected) // deep equality
- `packages/react-aria-components/test/Table.test.js :: Table load more spinner should not crash when dragging over the loader` — Error: expect(received).toHaveLength(expected)
- `packages/react-aria-components/test/Table.test.js :: Table with pointer events should show checkboxes on long press` — Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true"
- `packages/react-aria-components/test/Table.test.js :: Table contexts should not propagate the checkbox context from selection into other cells` — TestingLibraryElementError: Found multiple elements with the role "checkbox"
- `packages/react-aria-components/test/Table.test.js :: Table Suspense should support React Suspense without transitions` — Error: expect(received).toHaveLength(expected)
- `packages/react-aria-components/test/Table.test.js :: Table Suspense should support React Suspense with transitions` — Error: expect(element).toHaveTextContent()
- `packages/react-aria-components/test/Table.test.js :: Table Suspense should not render excessively in React Suspense with transitions` — Error: expect(jest.fn()).toHaveBeenCalledTimes(expected)
- `packages/react-aria-components/test/Table.test.js :: Table selectionBehavior="replace" mouse should perform selection with single selection` — Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true"
- `packages/react-aria-components/test/Table.test.js :: Table selectionBehavior="replace" mouse should perform toggle selection in highlight mode when using modifier keys` — Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true"
- `packages/react-aria-components/test/Table.test.js :: Table selectionBehavior="replace" mouse should perform replace selection in highlight mode when not using modifier keys` — Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true"
- `packages/react-aria-components/test/Table.test.js :: Table selectionBehavior="replace" keyboard should perform selection with single selection` — Error: Current active element is not on any of the table rows
- `packages/react-aria-components/test/Table.test.js :: Table selectionBehavior="replace" keyboard should perform toggle selection in highlight mode when using modifier keys` — Error: Current active element is not on any of the table rows
- `packages/react-aria-components/test/Table.test.js :: Table selectionBehavior="replace" keyboard should perform replace selection in highlight mode when not using modifier keys` — Error: Current active element is not on any of the table rows
- `packages/react-aria-components/test/Table.test.js :: Table selectionBehavior="replace" touch should perform selection with single selection` — Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true"
- `packages/react-aria-components/test/Table.test.js :: Table selectionBehavior="replace" touch should perform toggle selection in highlight mode when using modifier keys` — Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true"
- `packages/react-aria-components/test/Table.test.js :: Table selectionBehavior="replace" touch should perform replace selection in highlight mode when not using modifier keys` — Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true"
- `packages/react-aria-components/test/Table.test.js :: Table shouldSelectOnPressUp should select an item on pressing down when shouldSelectOnPressUp is not provided` — Error: expect(jest.fn()).toHaveBeenCalledTimes(expected)
- `packages/react-aria-components/test/Table.test.js :: Table shouldSelectOnPressUp should select an item on pressing down when shouldSelectOnPressUp is false` — Error: expect(jest.fn()).toHaveBeenCalledTimes(expected)
- `packages/react-aria-components/test/Table.test.js :: Table shouldSelectOnPressUp should select an item on pressing up when shouldSelectOnPressUp is true` — Error: expect(jest.fn()).toHaveBeenCalledTimes(expected)
- `packages/react-aria-components/test/Table.test.js :: Table supports removing a column and adding it back static` — Error: expect(element).toHaveTextContent()
- `packages/react-aria-components/test/Table.test.js :: Table supports removing a column and adding it back dynamic` — Error: expect(element).toHaveTextContent()
- `packages/react-aria-components/test/Table.test.js :: Table press events should support press events on items when using mouse` — Error: expect(jest.fn()).toHaveBeenCalledTimes(expected)
- `packages/react-aria-components/test/Table.test.js :: Table press events should support press events on items when using keyboard` — Error: Current active element is not on any of the table rows
- `packages/react-aria-components/test/Table.test.js :: Table should support table footer` — TypeError: Cannot assign to read only property 'type' of object '#<Object>'
- `packages/react-aria-components/test/Table.test.js :: Table should support table footer with virtualizer` — TypeError: Cannot assign to read only property 'type' of object '#<Object>'
- `packages/react-aria-components/test/Table.test.js :: Table should support multiple table bodies` — TypeError: Cannot assign to read only property 'type' of object '#<Object>'
- `packages/react-aria-components/test/Table.test.js :: Table keyboardNavigationBehavior='tab' and textfields in row Tab from a focused cell moves focus to the first tabbable child` — TypeError: Cannot assign to read only property 'type' of object '#<Object>'
- `packages/react-aria-components/test/Table.test.js :: Table keyboardNavigationBehavior='tab' and textfields in row Tab from a cell with no tabbable children or from the last child in a cell exits the table` — TypeError: Cannot assign to read only property 'type' of object '#<Object>'
- `packages/react-aria-components/test/Table.test.js :: Table keyboardNavigationBehavior='tab' and textfields in row Shift+Tab from a child returns focus to the cell` — TypeError: Cannot assign to read only property 'type' of object '#<Object>'
- `packages/react-aria-components/test/Table.test.js :: Table keyboardNavigationBehavior='tab' and textfields in row should not navigate to next cell when arrow keys are pressed while a text input child has focus` — TypeError: Cannot assign to read only property 'type' of object '#<Object>'
- `packages/react-aria-components/test/Table.test.js :: Table keyboardNavigationBehavior='tab' and textfields in row should not trigger typeahead when typing in a text input child` — TypeError: Cannot assign to read only property 'type' of object '#<Object>'
- `packages/react-aria-components/test/Table.test.js :: Table keyboardNavigationBehavior='tab' and textfields in row should not trigger selection when pressing Space or Enter in a text input child` — TypeError: Cannot assign to read only property 'type' of object '#<Object>'
- `packages/react-aria-components/test/Table.test.js :: Table keyboardNavigationBehavior='tab' and textfields in row should not trigger selection when clicking on a tabbable child element` — TypeError: Cannot assign to read only property 'props' of object '#<Object>'
- `packages/react-aria-components/test/Table.test.js :: Table keyboardNavigationBehavior='tab' and textfields in row should still trigger selection when clicking on a row with no tabbable children ` — Error: expect(jest.fn()).toHaveBeenCalledTimes(expected)
- `packages/react-aria-components/test/Table.test.js :: Table keyboardNavigationBehavior='tab' and textfields in row focusMode='child' arrow navigating to a focusMode="child" cell focuses the child directly` — TypeError: Cannot assign to read only property 'actionCellProps' of object '#<Object>'
- `packages/react-aria-components/test/Table.test.js :: Table keyboardNavigationBehavior='tab' and textfields in row focusMode='child' allowsArrowNavigation allows arrow key row navigation when focused on child` — TypeError: Cannot assign to read only property 'type' of object '#<Object>'
- `packages/react-aria-components/test/Table.test.js :: Table keyboardNavigationBehavior='tab' and textfields in row focusMode='child' Shift+Tab from a focusMode="child" child skips the cell and does not return to it` — TypeError: Cannot assign to read only property 'type' of object '#<Object>'
- `packages/react-aria-components/test/Table.test.js :: Table cells with focusable children in arrow navigation mode default focusMode: ArrowRight crosses from last child to first child of next cell, ArrowLeft reverses` — TypeError: Cannot assign to read only property 'props' of object '#<Object>'
- `packages/react-aria-components/test/Table.test.js :: Table cells with focusable children in arrow navigation mode focusMode='cell' arrow navigation with focusMode="cell": cell element stays focused on navigate, arrows enter/exit children within cell` — TypeError: Cannot assign to read only property 'cellProps' of object '#<Object>'
- `packages/react-aria-components/test/Dialog.test.js :: Dialog should not close Modal when DateRangePicker is dismissed by outside click` — TestingLibraryElementError: Found multiple elements with the role "dialog"
- `packages/react-aria-components/test/DateRangePicker.test.js :: DateRangePicker supports validation errors` — Error: An update to %s inside a test was not wrapped in act(...).
- `packages/react-aria/test/interactions/useFocusVisible.test.js :: useFocusVisible returns negative isFocusVisible result after toggling browser tabs in Safari without prior keyboard navigation` — Error: An update to %s inside a test was not wrapped in act(...).
- `packages/react-aria/test/interactions/useFocusVisible.test.js :: useFocusVisible Setups global event listeners in a different window removes event listeners on beforeunload` — Error: expect(received).toBe(expected) // Object.is equality
- `packages/react-aria/test/interactions/useFocusVisible.test.js :: useFocusVisible Setups global event listeners in a different window removes event listeners using teardown function` — Error: expect(received).toBe(expected) // Object.is equality
- `packages/react-aria/test/interactions/useFocusVisible.test.js :: useFocusVisible Setups global event listeners in a different window returns negative isFocusVisible result after toggling browser tabs without prior keyboard navigation` — Error: expect(received).toBe(expected) // Object.is equality
- `packages/react-aria/test/interactions/useFocusVisible.test.js :: useFocusVisible Setups global event listeners in a different window returns negative isFocusVisible result after toggling browser window without prior keyboard navigation` — Error: expect(received).toBe(expected) // Object.is equality
- `packages/react-aria-components/test/RadioGroup.test.js :: RadioGroup supports validation errors` — Error: expect(element).toHaveTextContent()
- `packages/react-aria-components/test/RadioGroup.test.js :: RadioGroup supports validation errors when last radio is disabled` — Error: expect(element).toHaveTextContent()
- `packages/react-aria-components/test/RadioGroup.test.js :: RadioField supports validation errors` — Error: expect(element).toHaveTextContent()
- `packages/react-aria-components/test/RadioGroup.test.js :: RadioField supports validation errors when last radio is disabled` — Error: expect(element).toHaveTextContent()
- `packages/react-aria/test/selection/useSelectableCollection.test.js :: useSelectableCollection can navigate without replacing the selection in multiple selection selectOnFocus` — TypeError: Cannot assign to read only property 'props' of object '#<Object>'
- `packages/react-aria-components/test/DatePicker.test.js :: DatePicker supports validation errors` — Error: An update to %s inside a test was not wrapped in act(...).
- `packages/react-aria-components/test/NumberField.test.js :: NumberField supports validation errors` — Error: expect(element).toHaveTextContent()
- `packages/react-aria-components/test/NumberField.test.js :: NumberField should not change the edited input value when value snapping is disabled` — Error: expect(element).toHaveTextContent()
- `packages/react-aria-components/test/DateField.test.js :: DateField supports validation errors` — Error: expect(received).toContain(expected) // indexOf
- `packages/react-aria/test/dnd/useDroppableCollection.test.js :: useDroppableCollection keyboard should perform basic drag and drop` — Error: expect(received).toHaveLength(expected)
- `packages/react-aria/test/dnd/useDroppableCollection.test.js :: useDroppableCollection keyboard should support arrow key navigation` — Error: expect(received).toHaveLength(expected)
- `packages/react-aria/test/dnd/useDroppableCollection.test.js :: useDroppableCollection keyboard supports Home and End` — Error: expect(received).toHaveLength(expected)
- `packages/react-aria/test/dnd/useDroppableCollection.test.js :: useDroppableCollection keyboard supports PageUp and PageDown` — Error: expect(received).toHaveLength(expected)
- `packages/react-aria/test/dnd/useDroppableCollection.test.js :: useDroppableCollection keyboard should skip invalid targets with PageUp and PageDown` — Error: expect(received).toHaveLength(expected)
- `packages/react-aria/test/dnd/useDroppableCollection.test.js :: useDroppableCollection keyboard should skip invalid targets at edges with PageUp and PageDown` — Error: expect(received).toHaveLength(expected)
- `packages/react-aria/test/dnd/useDroppableCollection.test.js :: useDroppableCollection screen reader should perform basic drag and drop` — Error: expect(received).toHaveLength(expected)
- `packages/react-aria/test/dnd/useDroppableCollection.test.js :: useDroppableCollection screen reader should add descriptions to each item` — Error: expect(received).toHaveLength(expected)
- `packages/react-aria/test/dnd/useDroppableCollection.test.js :: useDroppableCollection screen reader should show insertion indicators` — Error: expect(received).toHaveLength(expected)
- `packages/react-aria/test/dnd/useDroppableCollection.test.js :: useDroppableCollection screen reader should hide items that do not accept the drop` — Error: expect(element).toHaveAttribute("aria-hidden", "true") // element.getAttribute("aria-hidden") === "true"
- `packages/react-aria/test/dnd/useDraggableCollection.test.js :: useDraggableCollection screen reader should work with a listbox without a drag button` — Error: expect(element).toHaveTextContent()
- `packages/react-aria/test/dnd/useDraggableCollection.test.js :: useDraggableCollection screen reader should support row actions` — Error: expect(element).not.toHaveAttribute("aria-describedby") // element.hasAttribute("aria-describedby")
- `packages/react-aria/test/dnd/dnd.test.js :: useDrag and useDrop native drag and drop drop operations should update drop operation if modifier key is pressed and browser does not update effectAllowed` — Error: expect(received).toBe(expected) // Object.is equality
- `packages/react-aria/test/dnd/dnd.test.js :: useDrag and useDrop native drag and drop drop operations should handle when browser does not set effectAllowed properly` — Error: expect(received).toBe(expected) // Object.is equality
- `packages/react-aria/test/dnd/dnd.test.js :: useDrag and useDrop keyboard drop operations should hide drop targets where getDropOperation returns "cancel"` — Error: expect(element).toHaveAttribute("aria-hidden", "true") // element.getAttribute("aria-hidden") === "true"
- `packages/react-aria/test/dnd/dnd.test.js :: useDrag and useDrop screen reader should hide all non drop target elements from screen readers while dragging` — TypeError: Cannot assign to read only property 'props' of object '#<Object>'
- `packages/react-aria/test/dnd/dnd.test.js :: useDrag and useDrop screen reader should handle when a non drop target element is added` — Error: expect(received).toThrow()
- `packages/react-aria/test/dnd/dnd.test.js :: useDrag and useDrop screen reader should use touch specific aria descriptions when available` — Error: expect(element).toHaveTextContent()
- `packages/react-aria-components/test/CheckboxGroup.test.js :: CheckboxGroup with CheckboxField should support validation errors` — Error: An update to %s inside a test was not wrapped in act(...).
- `packages/react-aria-components/test/CheckboxGroup.test.js :: CheckboxGroup with Checkbox should support validation errors` — Error: An update to %s inside a test was not wrapped in act(...).
- `packages/react-aria-components/test/Checkbox.test.js :: CheckboxField should support required state` — Error: An update to %s inside a test was not wrapped in act(...).
- `packages/react-aria-components/test/Switch.test.js :: SwitchField should support required state` — Error: An update to %s inside a test was not wrapped in act(...).
- `packages/react-aria-components/test/TextField.test.js :: TextField Input supports validation errors` — Error: expect(element).toHaveTextContent()
- `packages/react-aria-components/test/TextField.test.js :: TextField TextArea supports validation errors` — Error: expect(element).toHaveTextContent()
- `packages/react-aria-components/test/ColorField.test.js :: ColorField supports validation errors` — Error: expect(element).toHaveTextContent()
- `packages/react-aria-components/test/TimeField.test.js :: TimeField supports validation errors` — Error: expect(received).toContain(expected) // indexOf
- `packages/react-aria-components/test/Form.test.js :: Form shows focus-visible when a form library moves focus to the first invalid field on submit` — Error: expect(element).not.toHaveAttribute("data-focus-visible") // element.hasAttribute("data-focus-visible")
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = left no viewport offset Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = left no viewport offset Should calculate the correct position when provider does not start at top of screen` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = left viewport offset before Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = left viewport offset before Should calculate the correct position when provider does not start at top of screen` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = left viewport offset after Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = left main axis offset Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = left cross axis offset positive Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = left cross axis offset negative Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = left minimum overlay arrow offset Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = left top no viewport offset Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = left top no viewport offset Should calculate the correct position when provider does not start at top of screen` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = left top viewport offset before Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = left top viewport offset before Should calculate the correct position when provider does not start at top of screen` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = left top viewport offset after Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = left top main axis offset Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = left top cross axis offset positive Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = left top cross axis offset negative Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = left top minimum overlay arrow offset Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = left bottom no viewport offset Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = left bottom no viewport offset Should calculate the correct position when provider does not start at top of screen` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = left bottom viewport offset before Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = left bottom viewport offset before Should calculate the correct position when provider does not start at top of screen` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = left bottom viewport offset after Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = left bottom main axis offset Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = left bottom cross axis offset positive Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = left bottom cross axis offset negative Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = left bottom minimum overlay arrow offset Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = top no viewport offset Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = top no viewport offset Should calculate the correct position when provider does not start at top of screen` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = top viewport offset before Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = top viewport offset before Should calculate the correct position when provider does not start at top of screen` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = top viewport offset after Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = top main axis offset Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = top cross axis offset positive Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = top cross axis offset negative Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = top minimum overlay arrow offset Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = top left no viewport offset Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = top left no viewport offset Should calculate the correct position when provider does not start at top of screen` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = top left viewport offset before Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = top left viewport offset before Should calculate the correct position when provider does not start at top of screen` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = top left viewport offset after Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = top left main axis offset Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = top left cross axis offset positive Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = top left cross axis offset negative Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = top left minimum overlay arrow offset Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = top right no viewport offset Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = top right no viewport offset Should calculate the correct position when provider does not start at top of screen` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = top right viewport offset before Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = top right viewport offset before Should calculate the correct position when provider does not start at top of screen` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = top right viewport offset after Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = top right main axis offset Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = top right cross axis offset positive Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = top right cross axis offset negative Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = top right minimum overlay arrow offset Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria-components/test/SearchField.test.js :: SearchField supports validation errors` — Error: expect(element).toHaveTextContent()
- `packages/react-aria/test/utils/keyboard.test.ts :: keyboard isKeyboardOpen supports orientation changes` — Error: expect(received).toBe(expected) // Object.is equality
- `packages/react-aria/test/overlays/useOverlayPosition.test.tsx :: useOverlayPosition should position the overlay relative to the trigger at top` — Error: expect(element).toHaveStyle()
- `packages/react-aria-components/test/ColorSwatch.test.js :: ColorSwatch should support render props` — Error: expect(element).toHaveStyle()
- `packages/react-aria/test/numberfield/useNumberField.test.ts :: useNumberField hook should return numberFieldProps all events are merged into the input element` — Error: expect(jest.fn()).toHaveBeenCalled()
- `packages/react-aria/test/utils/runAfterKeyboard.test.ts :: runAfterKeyboard runAfterKeyboard guarantees a flush when the keyboard did not open in time` — Error: expect(jest.fn()).toHaveBeenCalledWith(...expected)
- `packages/react-aria/test/utils/runAfterKeyboard.test.ts :: runAfterKeyboard runAfterKeyboardTransition flushes on resize end when the keyboard is closing` — Error: expect(jest.fn()).toHaveBeenCalledWith(...expected)
- `packages/react-aria/test/utils/runAfterKeyboard.test.ts :: runAfterKeyboard runAfterKeyboardTransition flushes on animation finish when the keyboard is opening` — Error: expect(jest.fn()).toHaveBeenCalledWith(...expected)
- `packages/react-aria/test/utils/runAfterKeyboard.test.ts :: runAfterKeyboard runAfterKeyboardTransition guarantees a flush when the keyboard did not open in time` — Error: expect(jest.fn()).toHaveBeenCalledWith(...expected)
- `packages/react-aria/test/utils/runAfterKeyboard.test.ts :: runAfterKeyboard runAfterKeyboardTransition guarantees a flush when the keyboard did not close in time` — Error: expect(jest.fn()).toHaveBeenCalledWith(...expected)
- `packages/react-aria/test/disclosure/useDisclosure.test.ts :: useDisclosure should keep panel hidden when toggling disabled state` — Error: expect(received).toBe(expected) // Object.is equality
- `packages/react-aria/test/aria-modal-polyfill/index.test.tsx :: watchModals should hide everything except the modal` — Error: expect(received).toBeNull()
- `packages/react-aria/test/aria-modal-polyfill/index.test.tsx :: watchModals should handle nested modals` — Error: expect(received).toBeNull()
- `packages/react-aria/test/aria-modal-polyfill/index.test.tsx :: watchModals should hide around Menus` — Error: expect(received).toBeNull()
- `packages/react-aria/test/aria-modal-polyfill/index.test.tsx :: watchModals should hide around Tray` — Error: expect(received).toBeNull()
- `packages/react-aria/test/aria-modal-polyfill/index.test.tsx :: watchModals should hide around Popover` — Error: expect(received).toBeNull()

</details>

<details><summary>missing vs jsdom (70)</summary>

- `packages/react-aria-components/test/Sheet.test.js :: Sheet renders an accessible modal dialog with default class names and attributes`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet uses swipe direction top for position top with swipeDirection undefined`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet uses swipe direction bottom for position bottom with swipeDirection undefined`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet uses swipe direction left for position left with swipeDirection undefined`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet uses swipe direction right for position right with swipeDirection undefined`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet uses swipe direction vertical for position center with swipeDirection undefined`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet uses swipe direction horizontal for position center with swipeDirection horizontal`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet uses swipe direction vertical for position bottom with swipeDirection vertical`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet resolves position start and swipeDirection undefined in en-US`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet resolves position end and swipeDirection undefined in en-US`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet resolves position start and swipeDirection undefined in ar-AE`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet resolves position end and swipeDirection undefined in ar-AE`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet resolves position left and swipeDirection undefined in ar-AE`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet resolves position center and swipeDirection start in en-US`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet resolves position center and swipeDirection end in ar-AE`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet passes sheet render props to className, style, and children functions`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet supports custom class names on SheetContent`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet closes on Escape and restores focus to the trigger`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet defers hiding outside content and focusing the dialog until the enter animation completes`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet enter scroll skips the part where the sheet is still off screen past the end edge`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet enter scroll skips the part where the sheet is still off screen past the start edge`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet enter scroll does not skip when the sheet is already partly on screen`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet enter scroll ignores the scrollend from the jump and waits for the enter scroll to finish`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet closes via the close function passed to SheetContent children`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet closes when interacting outside the sheet by default`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet does not close when interacting outside a non-dismissable sheet`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet supports controlled open state`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet visibility observes the sheet content visibility`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet visibility marks the sheet as expanded only when fully visible`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet visibility closes when the sheet is swiped out of view`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet visibility calls onOpenChange when a controlled sheet without a trigger is swiped out of view`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet visibility closes an uncontrolled sheet without a trigger when swiped out of view`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet visibility calls the overlay onOpenChange when a controlled sheet inside a trigger is swiped out of view`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet visibility does not close before the sheet has become visible`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet snap points renders a snap marker for each snap point with the first as the initial position`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet snap points anchors snap markers to the leading edge for top sheets`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet snap points anchors snap markers to the leading edge for left sheets`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet snap points anchors snap markers to the leading edge for right sheets`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet snap points does not render snap markers without snap points`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet snap points measures the sheet when non-dismissable to clamp swiping to the smallest snap point`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet stacking does not hide a nested sheet while it is entering`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet stacking tracks the stack index and descendants of nested sheets`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet stacking animates parent sheets along the view timelines of their descendants`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet stacking closes only the topmost sheet on Escape`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet overscroll padding extends bottom sheets beyond the viewport edge`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet overscroll padding extends top sheets beyond the viewport edge`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet overscroll padding extends left sheets beyond the viewport edge`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet overscroll padding extends right sheets beyond the viewport edge`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet overscroll padding does not add padding when the sheet is not swiped toward its edge`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet swipe animations binds swipe animations to the view timeline when swiping bottom`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet swipe animations binds swipe animations to the view timeline when swiping right`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet swipe animations binds swipe animations to the view timeline when swiping top`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet swipe animations binds swipe animations to the view timeline when swiping left`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet swipe animations binds swipe animations to the view timeline when swiping vertical`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet swipe animations binds swipe animations to the view timeline when swiping horizontal`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet swipe animations limits swipe animations to the given snap point range`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet swipe animations does not add animations by default`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet view timelines names the view timeline on SheetContent by stack index`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet view timelines uses a y axis view timeline for bottom sheets`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet view timelines uses a y axis view timeline for top sheets`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet view timelines uses a x axis view timeline for left sheets`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet view timelines uses a x axis view timeline for right sheets`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet view timelines uses a y axis view timeline for center sheets`
- `packages/react-aria/test/utils/DOMFunctions.test.tsx :: nodeContains with shadow DOM can tell if a node is contained even if it is within a shadow DOM`
- `packages/react-aria/test/utils/DOMFunctions.test.tsx :: nodeContains with shadow DOM can tell if slotted light DOM content is contained by a node inside the shadow root`
- `packages/react-aria/test/utils/DOMFunctions.test.tsx :: nodeContains with shadow DOM does not throw when the other node is a non-Node event target (e.g. window)`
- `packages/react-aria/test/utils/DOMFunctions.test.tsx :: getPropagationTargets with shadow DOM can just get the global window`
- `packages/react-aria/test/utils/DOMFunctions.test.tsx :: getPropagationTargets with shadow DOM can get the propagation targets from a shadow root`
- `packages/react-aria/test/utils/DOMFunctions.test.tsx :: getPropagationTargets with shadow DOM can get the propagation targets for multiple nested shadow roots`
- `packages/react-aria/test/utils/DOMFunctions.test.tsx :: getPropagationTargets with shadow DOM does not return propagation targets when given a null destination`

</details>

### Failures by component

| component | failed |
| --- | --: |
| react-aria/overlays | 55 |
| RAC/Table | 46 |
| RAC/Tree | 33 |
| react-aria/dnd | 18 |
| RAC/GridList | 14 |
| react-aria/interactions | 7 |
| react-aria/utils | 6 |
| react-aria/aria-modal-polyfill | 5 |
| react-aria/table | 4 |
| RAC/RadioGroup | 4 |
| RAC/Select | 3 |
| RAC/Autocomplete | 2 |
| RAC/ListBox | 2 |
| RAC/Treeble | 2 |
| RAC/NumberField | 2 |
| RAC/CheckboxGroup | 2 |
| RAC/TextField | 2 |
| RAC/Menu | 1 |
| RAC/ComboBox | 1 |
| RAC/Dialog | 1 |
| RAC/DateRangePicker | 1 |
| react-aria/selection | 1 |
| RAC/DatePicker | 1 |
| RAC/DateField | 1 |
| RAC/Checkbox | 1 |
| RAC/Switch | 1 |
| RAC/ColorField | 1 |
| RAC/TimeField | 1 |
| RAC/Form | 1 |
| RAC/SearchField | 1 |
| RAC/ColorSwatch | 1 |
| react-aria/numberfield | 1 |
| react-aria/disclosure | 1 |

### Failures by error signature

| count | signature | components | example |
| --: | --- | --- | --- |
| 55 | Error: expect(received).toEqual(expected) // deep equality | RAC/Treeble, react-aria/overlays | `packages/react-aria-components/test/Treeble.test.js :: Treeble should support drag and drop` |
| 24 | Error: expect(received).toHaveLength(expected) | RAC/GridList, RAC/Tree, RAC/Table, react-aria/dnd | `packages/react-aria-components/test/GridList.test.js :: GridList drag and drop should render drop indicators` |
| 18 | TypeError: Cannot assign to read only property 'type' of object '#<Object>' | RAC/Tree, RAC/Table | `packages/react-aria-components/test/Tree.test.tsx :: Tree tab navigation and textfields should not navigate rows when arrow keys are pressed while a text input child has focus` |
| 17 | Error: expect(element).toHaveTextContent() | RAC/Select, RAC/ComboBox, RAC/Table, RAC/RadioGroup, RAC/NumberField, react-aria/dnd, RAC/TextField, RAC/ColorField, … | `packages/react-aria-components/test/Select.test.js :: Select should support multiple selection form integration with many items` |
| 17 | Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true" | RAC/GridList, RAC/Tree, RAC/ListBox, RAC/Table | `packages/react-aria-components/test/GridList.test.js :: GridList selectionBehavior="replace" keyboard should perform selection with single selection` |
| 14 | Error: expect(jest.fn()).toHaveBeenCalledTimes(expected) | RAC/Select, RAC/GridList, RAC/Tree, RAC/ListBox, RAC/Table | `packages/react-aria-components/test/Select.test.js :: Select should not submit if required and selectedKey is null` |
| 8 | Error: An update to %s inside a test was not wrapped in act(...). | RAC/Select, RAC/DateRangePicker, react-aria/interactions, RAC/DatePicker, RAC/CheckboxGroup, RAC/Checkbox, RAC/Switch | `packages/react-aria-components/test/Select.test.js :: Select supports validation errors` |
| 8 | Error: expect(received).toStrictEqual(expected) // deep equality | react-aria/table, RAC/Table | `packages/react-aria/test/table/ariaTableResizing.test.tsx :: Aria Table Resizing resizing table will not affect pixel widths` |
| 8 | Error: expect(received).toBe(expected) // Object.is equality | react-aria/interactions, react-aria/dnd, react-aria/utils, react-aria/disclosure | `packages/react-aria/test/interactions/useFocusVisible.test.js :: useFocusVisible Setups global event listeners in a different window removes event listeners on beforeunload` |
| 7 | TypeError: Cannot assign to read only property 'props' of object '#<Object>' | RAC/Tree, RAC/Table, react-aria/selection, react-aria/dnd | `packages/react-aria-components/test/Tree.test.tsx :: Tree focusMode and allowsArrowNavigation focusMode="child" with default arrow navigation ArrowDown from child navigates to first child of next item` |
| 6 | Error: expect(jest.fn()).toHaveBeenCalledWith(...expected) | RAC/GridList, react-aria/utils | `packages/react-aria-components/test/GridList.test.js :: GridList links mouse should work with RouterProvider` |
| 5 | Error: expect(received).toBeNull() | react-aria/aria-modal-polyfill | `packages/react-aria/test/aria-modal-polyfill/index.test.tsx :: watchModals should hide everything except the modal` |
| 4 | Error: expect(element).toHaveAttribute("aria-expanded", "true") // element.getAttribute("aria-expanded") === "true" | RAC/Tree | `packages/react-aria-components/test/Tree.test.tsx :: rac-staticAriaTree interaction - mouse should have the expected attributes on the rows` |
| 4 | Error: expect(element).toHaveStyle() | react-aria/interactions, react-aria/overlays, RAC/ColorSwatch | `packages/react-aria/test/interactions/usePress.test.js :: usePress disable text-selection when pressed non related style changes during press down shouldn't overwrite user-select on press end (non-iOS)` |
| 4 | Error: Current active element is not on any of the table rows | RAC/Table | `packages/react-aria-components/test/Table.test.js :: Table selectionBehavior="replace" keyboard should perform selection with single selection` |
| 3 | Error: expect(element).toHaveAttribute("aria-hidden", "true") // element.getAttribute("aria-hidden") === "true" | RAC/Menu, react-aria/dnd | `packages/react-aria-components/test/Menu.test.tsx :: Menu Submenus should close all submenus if interacting outside root submenu` |
| 2 | TestingLibraryElementError: Found multiple elements with the role "textbox" | RAC/Autocomplete | `packages/react-aria-components/test/Autocomplete.test.tsx :: Autocomplete should be able to tab inside a focus scope that contains` |
| 2 | Error: expect(element).toHaveAttribute("aria-label", "Insert between Cat and Dog") // element.getAttribute("aria-label") === "Insert between Cat and Dog" | RAC/GridList, RAC/Tree | `packages/react-aria-components/test/GridList.test.js :: GridList drag and drop should not skip drop positions before/after a disabled item` |
| 2 | Error: ActiveElement is not in the tree | RAC/Tree | `packages/react-aria-components/test/Tree.test.tsx :: rac-staticAriaTree interaction - keyboard should have the expected attributes on the rows` |
| 2 | Error: expect(received).toContain(expected) // indexOf | RAC/DateField, RAC/TimeField | `packages/react-aria-components/test/DateField.test.js :: DateField supports validation errors` |
| 1 | Error: expect(element).toHaveAttribute("data-drop-target", "true") // element.getAttribute("data-drop-target") === "true" | RAC/GridList | `packages/react-aria-components/test/GridList.test.js :: GridList drag and drop should support dropping with horizontal arrow keys when orientation is horizontal` |
| 1 | Error: expect(element).toHaveAttribute("data-selected", "true") // element.getAttribute("data-selected") === "true" | RAC/Tree | `packages/react-aria-components/test/Tree.test.tsx :: Tree drag and drop should allow selection even when drag and drop is disabled` |
| 1 | Error: ActiveElement is not in the gridlist | RAC/Tree | `packages/react-aria-components/test/Tree.test.tsx :: Tree press events should support press events on items when using keyboard` |
| 1 | Error: expect(element).toHaveAttribute("aria-label", "Insert after Budget") // element.getAttribute("aria-label") === "Insert after Budget" | RAC/Treeble | `packages/react-aria-components/test/Treeble.test.js :: Treeble should properly walk through nested levels of drop positioning` |
| 1 | Error: expect(element).toHaveAttribute("aria-label", "Insert between Games and Program Files") // element.getAttribute("aria-label") === "Insert between Games and Program Files" | RAC/Table | `packages/react-aria-components/test/Table.test.js :: Table drag and drop should not skip drop positions before/after a disabled item` |
| 1 | TestingLibraryElementError: Found multiple elements with the role "checkbox" | RAC/Table | `packages/react-aria-components/test/Table.test.js :: Table contexts should not propagate the checkbox context from selection into other cells` |
| 1 | TypeError: Cannot assign to read only property 'actionCellProps' of object '#<Object>' | RAC/Table | `packages/react-aria-components/test/Table.test.js :: Table keyboardNavigationBehavior='tab' and textfields in row focusMode='child' arrow navigating to a focusMode="child" cell focuses the child directly` |
| 1 | TypeError: Cannot assign to read only property 'cellProps' of object '#<Object>' | RAC/Table | `packages/react-aria-components/test/Table.test.js :: Table cells with focusable children in arrow navigation mode focusMode='cell' arrow navigation with focusMode="cell": cell element stays focused on navigate, arrows enter/exit children within cell` |
| 1 | TestingLibraryElementError: Found multiple elements with the role "dialog" | RAC/Dialog | `packages/react-aria-components/test/Dialog.test.js :: Dialog should not close Modal when DateRangePicker is dismissed by outside click` |
| 1 | Error: expect(element).not.toHaveAttribute("aria-describedby") // element.hasAttribute("aria-describedby") | react-aria/dnd | `packages/react-aria/test/dnd/useDraggableCollection.test.js :: useDraggableCollection screen reader should support row actions` |
| 1 | Error: expect(received).toThrow() | react-aria/dnd | `packages/react-aria/test/dnd/dnd.test.js :: useDrag and useDrop screen reader should handle when a non drop target element is added` |
| 1 | Error: expect(element).not.toHaveAttribute("data-focus-visible") // element.hasAttribute("data-focus-visible") | RAC/Form | `packages/react-aria-components/test/Form.test.js :: Form shows focus-visible when a form library moves focus to the first invalid field on submit` |
| 1 | Error: expect(jest.fn()).toHaveBeenCalled() | react-aria/numberfield | `packages/react-aria/test/numberfield/useNumberField.test.ts :: useNumberField hook should return numberFieldProps all events are merged into the input element` |

## rtd-full

### Suite errors (file failed to load)

- `packages/react-aria-components/test/Sheet.test.js`: TypeError: Cannot assign to read only property 'supports' of object '[object CSS]'

Compared with jsdom: **249 pass on jsdom but fail here**, 63 missing, 0 added, 0 newly skipped, 0 fail on jsdom but pass here.

### Pass on jsdom, fail here

<details><summary>249 tests</summary>

- `packages/react-aria-components/test/Menu.test.tsx :: Menu Submenus should close all submenus if interacting outside root submenu` — Error: expect(element).toHaveAttribute("aria-hidden", "true") // element.getAttribute("aria-hidden") === "true"
- `packages/react-aria-components/test/Autocomplete.test.tsx :: Autocomplete should be able to tab inside a focus scope that contains` — TestingLibraryElementError: Found multiple elements with the role "textbox"
- `packages/react-aria-components/test/Autocomplete.test.tsx :: Autocomplete should be able to tab inside a focus scope that contains with buttons after the autocomplete` — TestingLibraryElementError: Found multiple elements with the role "textbox"
- `packages/react-aria-components/test/Autocomplete.test.tsx :: rac-dynamic-menu AriaAutocomplete async filtering performed outside the autocomplete should properly filter and autofocus the first item when typing forward` — Error: An update to %s inside a test was not wrapped in act(...).
- `packages/react-aria-components/test/Select.test.js :: Select supports validation errors` — Error: An update to %s inside a test was not wrapped in act(...).
- `packages/react-aria-components/test/Select.test.js :: Select should not submit if required and selectedKey is null` — Error: expect(jest.fn()).toHaveBeenCalledTimes(expected)
- `packages/react-aria-components/test/Select.test.js :: Select should support multiple selection form integration with many items` — Error: expect(element).toHaveTextContent()
- `packages/react-aria/test/table/ariaTableResizing.test.tsx :: Aria Table Resizing resizing table will not affect pixel widths` — Error: expect(received).toStrictEqual(expected) // deep equality
- `packages/react-aria/test/table/ariaTableResizing.test.tsx :: Aria Table Resizing resizing table will resize all percent columns` — Error: expect(received).toStrictEqual(expected) // deep equality
- `packages/react-aria/test/table/ariaTableResizing.test.tsx :: Aria Table Resizing resizing table will resize all fr columns` — Error: expect(received).toStrictEqual(expected) // deep equality
- `packages/react-aria/test/table/ariaTableResizing.test.tsx :: Aria Table Resizing resizing table will resize all fr columns only after percent columns` — Error: expect(received).toStrictEqual(expected) // deep equality
- `packages/react-aria-components/test/ComboBox.test.js :: ComboBox should support validation errors` — Error: expect(element).toHaveTextContent()
- `packages/react-aria-components/test/GridList.test.js :: GridList selectionBehavior="replace" mouse should perform selection with single selection` — Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true"
- `packages/react-aria-components/test/GridList.test.js :: GridList selectionBehavior="replace" mouse should perform toggle selection in highlight mode when using modifier keys` — Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true"
- `packages/react-aria-components/test/GridList.test.js :: GridList selectionBehavior="replace" mouse should perform replace selection in highlight mode when not using modifier keys` — Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true"
- `packages/react-aria-components/test/GridList.test.js :: GridList selectionBehavior="replace" keyboard should perform selection with single selection` — Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true"
- `packages/react-aria-components/test/GridList.test.js :: GridList selectionBehavior="replace" keyboard should perform toggle selection in highlight mode when using modifier keys` — Error: expect(jest.fn()).toHaveBeenCalledTimes(expected)
- `packages/react-aria-components/test/GridList.test.js :: GridList selectionBehavior="replace" touch should perform selection with single selection` — Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true"
- `packages/react-aria-components/test/GridList.test.js :: GridList selectionBehavior="replace" touch should perform toggle selection in highlight mode when using modifier keys` — Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true"
- `packages/react-aria-components/test/GridList.test.js :: GridList selectionBehavior="replace" touch should perform replace selection in highlight mode when not using modifier keys` — Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true"
- `packages/react-aria-components/test/GridList.test.js :: GridList drag and drop should render drop indicators` — Error: expect(received).toHaveLength(expected)
- `packages/react-aria-components/test/GridList.test.js :: GridList drag and drop should not skip drop positions before/after a disabled item` — Error: expect(element).toHaveAttribute("aria-label", "Insert between Cat and Dog") // element.getAttribute("aria-label") === "Insert between Cat and Dog"
- `packages/react-aria-components/test/GridList.test.js :: GridList drag and drop should support dropping on rows` — Error: expect(received).toHaveLength(expected)
- `packages/react-aria-components/test/GridList.test.js :: GridList drag and drop should support dropping on the root` — Error: expect(received).toHaveLength(expected)
- `packages/react-aria-components/test/GridList.test.js :: GridList drag and drop should support dropping with horizontal arrow keys when orientation is horizontal` — Error: expect(element).toHaveAttribute("data-drop-target", "true") // element.getAttribute("data-drop-target") === "true"
- `packages/react-aria-components/test/GridList.test.js :: GridList links mouse should support links with selectionMode="none"` — Error: expect(jest.fn()).toHaveBeenCalledTimes(expected)
- `packages/react-aria-components/test/GridList.test.js :: GridList links mouse should support links with selectionBehavior="toggle" selectionMode="single"` — Error: expect(jest.fn()).toHaveBeenCalledTimes(expected)
- `packages/react-aria-components/test/GridList.test.js :: GridList links mouse should support links with selectionBehavior="toggle" selectionMode="multiple"` — Error: expect(jest.fn()).toHaveBeenCalledTimes(expected)
- `packages/react-aria-components/test/GridList.test.js :: GridList links mouse should support links with selectionBehavior="replace" selectionMode="single"` — Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true"
- `packages/react-aria-components/test/GridList.test.js :: GridList links mouse should support links with selectionBehavior="replace" selectionMode="multiple"` — Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true"
- `packages/react-aria-components/test/GridList.test.js :: GridList links mouse should work with RouterProvider` — Error: expect(jest.fn()).toHaveBeenCalledWith(...expected)
- `packages/react-aria-components/test/GridList.test.js :: GridList links keyboard should support links with selectionMode="none"` — Error: expect(jest.fn()).toHaveBeenCalledTimes(expected)
- `packages/react-aria-components/test/ListBox.test.js :: ListBox selectionBehavior="replace" mouse should perform selection with single selection` — Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true"
- `packages/react-aria-components/test/ListBox.test.js :: ListBox selectionBehavior="replace" mouse should perform toggle selection in highlight mode when using modifier keys` — Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true"
- `packages/react-aria-components/test/ListBox.test.js :: ListBox selectionBehavior="replace" mouse should perform replace selection in highlight mode when not using modifier keys` — Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true"
- `packages/react-aria-components/test/ListBox.test.js :: ListBox selectionBehavior="replace" keyboard should perform selection with single selection` — Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true"
- `packages/react-aria-components/test/ListBox.test.js :: ListBox selectionBehavior="replace" keyboard should perform toggle selection in highlight mode when using modifier keys` — Error: expect(jest.fn()).toHaveBeenCalledTimes(expected)
- `packages/react-aria-components/test/ListBox.test.js :: ListBox selectionBehavior="replace" touch should perform selection with single selection` — Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true"
- `packages/react-aria-components/test/ListBox.test.js :: ListBox selectionBehavior="replace" touch should perform toggle selection in highlight mode when using modifier keys` — Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true"
- `packages/react-aria-components/test/ListBox.test.js :: ListBox selectionBehavior="replace" touch should perform replace selection in highlight mode when not using modifier keys` — Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true"
- `packages/react-aria-components/test/ListBox.test.js :: ListBox with pointer events should trigger selection on long press if both onAction and selection exist (touch only)` — Error: expect(jest.fn()).toHaveBeenCalledTimes(expected)
- `packages/react-aria-components/test/NumberField.test.js :: NumberField supports validation errors` — Error: expect(element).toHaveTextContent()
- `packages/react-aria-components/test/NumberField.test.js :: NumberField should not change the edited input value when value snapping is disabled` — Error: expect(element).toHaveTextContent()
- `packages/react-aria-components/test/Tree.test.tsx :: Tree drag and drop should render drop indicators` — Error: expect(received).toHaveLength(expected)
- `packages/react-aria-components/test/Tree.test.tsx :: Tree drag and drop should not skip drop positions before/after a disabled item` — Error: expect(element).toHaveAttribute("aria-label", "Insert between Cat and Dog") // element.getAttribute("aria-label") === "Insert between Cat and Dog"
- `packages/react-aria-components/test/Tree.test.tsx :: Tree drag and drop should support dropping on items` — Error: expect(received).toHaveLength(expected)
- `packages/react-aria-components/test/Tree.test.tsx :: Tree drag and drop should support dropping on the root` — Error: expect(received).toHaveLength(expected)
- `packages/react-aria-components/test/Tree.test.tsx :: Tree drag and drop should automatically focus the newly added dropped item` — Error: expect(received).toHaveLength(expected)
- `packages/react-aria-components/test/Tree.test.tsx :: Tree drag and drop should allow selection even when drag and drop is disabled` — Error: expect(element).toHaveAttribute("data-selected", "true") // element.getAttribute("data-selected") === "true"
- `packages/react-aria-components/test/Tree.test.tsx :: Tree drag and drop should select the parent and all its children when dropped` — Error: expect(received).toHaveLength(expected)
- `packages/react-aria-components/test/Tree.test.tsx :: Tree drag and drop should focus the parent row when dropped on if it isnt expanded` — Error: expect(received).toHaveLength(expected)
- `packages/react-aria-components/test/Tree.test.tsx :: Tree drag and drop should focus the dropped row when dropped on a parent that is expanded` — Error: expect(received).toHaveLength(expected)
- `packages/react-aria-components/test/Tree.test.tsx :: Tree press events should support press events on items when using mouse` — Error: expect(jest.fn()).toHaveBeenCalledTimes(expected)
- `packages/react-aria-components/test/Tree.test.tsx :: Tree press events should support press events on items when using keyboard` — Error: ActiveElement is not in the gridlist
- `packages/react-aria-components/test/Tree.test.tsx :: Tree tab navigation and textfields should not navigate rows when arrow keys are pressed while a text input child has focus` — TypeError: Cannot assign to read only property 'type' of object '#<Object>'
- `packages/react-aria-components/test/Tree.test.tsx :: Tree tab navigation and textfields should not trigger typeahead when typing in a text input child` — TypeError: Cannot assign to read only property 'type' of object '#<Object>'
- `packages/react-aria-components/test/Tree.test.tsx :: Tree tab navigation and textfields should not trigger selection when pressing Space in a text input child of a leaf row` — TypeError: Cannot assign to read only property 'type' of object '#<Object>'
- `packages/react-aria-components/test/Tree.test.tsx :: Tree tab navigation and textfields should allow typing space in the text input child of a parent row` — TypeError: Cannot assign to read only property 'type' of object '#<Object>'
- `packages/react-aria-components/test/Tree.test.tsx :: Tree focusMode and allowsArrowNavigation focusMode="child" auto-focuses first child when item receives focus` — TypeError: Cannot assign to read only property 'type' of object '#<Object>'
- `packages/react-aria-components/test/Tree.test.tsx :: Tree focusMode and allowsArrowNavigation allowsArrowNavigation allows arrow key navigation when focused on child` — TypeError: Cannot assign to read only property 'type' of object '#<Object>'
- `packages/react-aria-components/test/Tree.test.tsx :: Tree focusMode and allowsArrowNavigation focusMode="child" with default arrow navigation ArrowDown from child navigates to first child of next item` — TypeError: Cannot assign to read only property 'props' of object '#<Object>'
- `packages/react-aria-components/test/Tree.test.tsx :: Tree focusMode and allowsArrowNavigation focusMode="child" with default arrow navigation ArrowUp from child navigates to first child of previous item` — TypeError: Cannot assign to read only property 'props' of object '#<Object>'
- `packages/react-aria-components/test/Tree.test.tsx :: Tree focusMode and allowsArrowNavigation focusMode="row" (default) with tab navigation Tab into tree focuses row, Tab from row enters child, Shift+Tab returns to row` — TypeError: Cannot assign to read only property 'props' of object '#<Object>'
- `packages/react-aria-components/test/Tree.test.tsx :: Tree focusMode and allowsArrowNavigation focusMode="row" (default) with tab navigation ArrowRight expands collapsed parent item in tab mode` — TypeError: Cannot assign to read only property 'type' of object '#<Object>'
- `packages/react-aria-components/test/Tree.test.tsx :: rac-staticAriaTree interaction - mouse should have the expected attributes on the rows` — Error: expect(element).toHaveAttribute("aria-expanded", "true") // element.getAttribute("aria-expanded") === "true"
- `packages/react-aria-components/test/Tree.test.tsx :: rac-staticAriaTree interaction - keyboard should have the expected attributes on the rows` — Error: ActiveElement is not in the tree
- `packages/react-aria-components/test/Tree.test.tsx :: rac-staticAriaTree interaction - touch should have the expected attributes on the rows` — Error: expect(element).toHaveAttribute("aria-expanded", "true") // element.getAttribute("aria-expanded") === "true"
- `packages/react-aria-components/test/Tree.test.tsx :: rac-staticAriaTree single selection interaction - mouse can select items` — Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true"
- `packages/react-aria-components/test/Tree.test.tsx :: rac-staticAriaTree single selection interaction - keyboard can select items` — Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true"
- `packages/react-aria-components/test/Tree.test.tsx :: rac-staticAriaTree single selection interaction - touch can select items` — Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true"
- `packages/react-aria-components/test/Tree.test.tsx :: rac-controlled-dynamicAriaTree interaction - mouse should have the expected attributes on the rows` — Error: expect(element).toHaveAttribute("aria-expanded", "true") // element.getAttribute("aria-expanded") === "true"
- `packages/react-aria-components/test/Tree.test.tsx :: rac-controlled-dynamicAriaTree interaction - keyboard should have the expected attributes on the rows` — Error: ActiveElement is not in the tree
- `packages/react-aria-components/test/Tree.test.tsx :: rac-controlled-dynamicAriaTree interaction - touch should have the expected attributes on the rows` — Error: expect(element).toHaveAttribute("aria-expanded", "true") // element.getAttribute("aria-expanded") === "true"
- `packages/react-aria-components/test/Tree.test.tsx :: rac-controlled-dynamicAriaTree single selection interaction - mouse can select items` — Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true"
- `packages/react-aria-components/test/Tree.test.tsx :: rac-controlled-dynamicAriaTree single selection interaction - keyboard can select items` — Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true"
- `packages/react-aria-components/test/Tree.test.tsx :: rac-controlled-dynamicAriaTree single selection interaction - touch can select items` — Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true"
- `packages/react-aria/test/interactions/usePress.test.js :: usePress disable text-selection when pressed non related style changes during press down shouldn't overwrite user-select on press end (non-iOS)` — Error: expect(element).toHaveStyle()
- `packages/react-aria/test/interactions/usePress.test.js :: usePress disable text-selection when pressed changes to user-select during press down remain on press end (non-iOS)` — Error: expect(element).toHaveStyle()
- `packages/react-aria-components/test/Treeble.test.js :: Treeble should support drag and drop` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria-components/test/Treeble.test.js :: Treeble should properly walk through nested levels of drop positioning` — Error: expect(element).toHaveAttribute("aria-label", "Insert after Budget") // element.getAttribute("aria-label") === "Insert after Budget"
- `packages/react-aria-components/test/Table.test.js :: Table drag and drop should render drop indicators` — Error: expect(received).toHaveLength(expected)
- `packages/react-aria-components/test/Table.test.js :: Table drag and drop should not skip drop positions before/after a disabled item` — Error: expect(element).toHaveAttribute("aria-label", "Insert between Games and Program Files") // element.getAttribute("aria-label") === "Insert between Games and Program Files"
- `packages/react-aria-components/test/Table.test.js :: Table drag and drop should support dropping on rows` — Error: expect(received).toHaveLength(expected)
- `packages/react-aria-components/test/Table.test.js :: Table drag and drop should support dropping on the root` — Error: expect(received).toHaveLength(expected)
- `packages/react-aria-components/test/Table.test.js :: Table column resizing Resizing resizing table will not affect pixel widths` — Error: expect(received).toStrictEqual(expected) // deep equality
- `packages/react-aria-components/test/Table.test.js :: Table column resizing Resizing resizing table will resize all percent columns` — Error: expect(received).toStrictEqual(expected) // deep equality
- `packages/react-aria-components/test/Table.test.js :: Table column resizing Resizing resizing table will resize all fr columns` — Error: expect(received).toStrictEqual(expected) // deep equality
- `packages/react-aria-components/test/Table.test.js :: Table column resizing Resizing resizing table will resize all fr columns only after percent columns` — Error: expect(received).toStrictEqual(expected) // deep equality
- `packages/react-aria-components/test/Table.test.js :: Table load more spinner should not crash when dragging over the loader` — Error: expect(received).toHaveLength(expected)
- `packages/react-aria-components/test/Table.test.js :: Table with pointer events should show checkboxes on long press` — Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true"
- `packages/react-aria-components/test/Table.test.js :: Table contexts should not propagate the checkbox context from selection into other cells` — TestingLibraryElementError: Found multiple elements with the role "checkbox"
- `packages/react-aria-components/test/Table.test.js :: Table Suspense should support React Suspense without transitions` — Error: expect(received).toHaveLength(expected)
- `packages/react-aria-components/test/Table.test.js :: Table Suspense should support React Suspense with transitions` — Error: expect(element).toHaveTextContent()
- `packages/react-aria-components/test/Table.test.js :: Table Suspense should not render excessively in React Suspense with transitions` — Error: expect(jest.fn()).toHaveBeenCalledTimes(expected)
- `packages/react-aria-components/test/Table.test.js :: Table selectionBehavior="replace" mouse should perform selection with single selection` — Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true"
- `packages/react-aria-components/test/Table.test.js :: Table selectionBehavior="replace" mouse should perform toggle selection in highlight mode when using modifier keys` — Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true"
- `packages/react-aria-components/test/Table.test.js :: Table selectionBehavior="replace" mouse should perform replace selection in highlight mode when not using modifier keys` — Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true"
- `packages/react-aria-components/test/Table.test.js :: Table selectionBehavior="replace" keyboard should perform selection with single selection` — Error: Current active element is not on any of the table rows
- `packages/react-aria-components/test/Table.test.js :: Table selectionBehavior="replace" keyboard should perform toggle selection in highlight mode when using modifier keys` — Error: Current active element is not on any of the table rows
- `packages/react-aria-components/test/Table.test.js :: Table selectionBehavior="replace" keyboard should perform replace selection in highlight mode when not using modifier keys` — Error: Current active element is not on any of the table rows
- `packages/react-aria-components/test/Table.test.js :: Table selectionBehavior="replace" touch should perform selection with single selection` — Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true"
- `packages/react-aria-components/test/Table.test.js :: Table selectionBehavior="replace" touch should perform toggle selection in highlight mode when using modifier keys` — Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true"
- `packages/react-aria-components/test/Table.test.js :: Table selectionBehavior="replace" touch should perform replace selection in highlight mode when not using modifier keys` — Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true"
- `packages/react-aria-components/test/Table.test.js :: Table shouldSelectOnPressUp should select an item on pressing down when shouldSelectOnPressUp is not provided` — Error: expect(jest.fn()).toHaveBeenCalledTimes(expected)
- `packages/react-aria-components/test/Table.test.js :: Table shouldSelectOnPressUp should select an item on pressing down when shouldSelectOnPressUp is false` — Error: expect(jest.fn()).toHaveBeenCalledTimes(expected)
- `packages/react-aria-components/test/Table.test.js :: Table shouldSelectOnPressUp should select an item on pressing up when shouldSelectOnPressUp is true` — Error: expect(jest.fn()).toHaveBeenCalledTimes(expected)
- `packages/react-aria-components/test/Table.test.js :: Table supports removing a column and adding it back static` — Error: expect(element).toHaveTextContent()
- `packages/react-aria-components/test/Table.test.js :: Table supports removing a column and adding it back dynamic` — Error: expect(element).toHaveTextContent()
- `packages/react-aria-components/test/Table.test.js :: Table press events should support press events on items when using mouse` — Error: expect(jest.fn()).toHaveBeenCalledTimes(expected)
- `packages/react-aria-components/test/Table.test.js :: Table press events should support press events on items when using keyboard` — Error: Current active element is not on any of the table rows
- `packages/react-aria-components/test/Table.test.js :: Table should support table footer` — TypeError: Cannot assign to read only property 'type' of object '#<Object>'
- `packages/react-aria-components/test/Table.test.js :: Table should support table footer with virtualizer` — TypeError: Cannot assign to read only property 'type' of object '#<Object>'
- `packages/react-aria-components/test/Table.test.js :: Table should support multiple table bodies` — TypeError: Cannot assign to read only property 'type' of object '#<Object>'
- `packages/react-aria-components/test/Table.test.js :: Table keyboardNavigationBehavior='tab' and textfields in row Tab from a focused cell moves focus to the first tabbable child` — TypeError: Cannot assign to read only property 'type' of object '#<Object>'
- `packages/react-aria-components/test/Table.test.js :: Table keyboardNavigationBehavior='tab' and textfields in row Tab from a cell with no tabbable children or from the last child in a cell exits the table` — TypeError: Cannot assign to read only property 'type' of object '#<Object>'
- `packages/react-aria-components/test/Table.test.js :: Table keyboardNavigationBehavior='tab' and textfields in row Shift+Tab from a child returns focus to the cell` — TypeError: Cannot assign to read only property 'type' of object '#<Object>'
- `packages/react-aria-components/test/Table.test.js :: Table keyboardNavigationBehavior='tab' and textfields in row should not navigate to next cell when arrow keys are pressed while a text input child has focus` — TypeError: Cannot assign to read only property 'type' of object '#<Object>'
- `packages/react-aria-components/test/Table.test.js :: Table keyboardNavigationBehavior='tab' and textfields in row should not trigger typeahead when typing in a text input child` — TypeError: Cannot assign to read only property 'type' of object '#<Object>'
- `packages/react-aria-components/test/Table.test.js :: Table keyboardNavigationBehavior='tab' and textfields in row should not trigger selection when pressing Space or Enter in a text input child` — TypeError: Cannot assign to read only property 'type' of object '#<Object>'
- `packages/react-aria-components/test/Table.test.js :: Table keyboardNavigationBehavior='tab' and textfields in row should not trigger selection when clicking on a tabbable child element` — TypeError: Cannot assign to read only property 'props' of object '#<Object>'
- `packages/react-aria-components/test/Table.test.js :: Table keyboardNavigationBehavior='tab' and textfields in row should still trigger selection when clicking on a row with no tabbable children ` — Error: expect(jest.fn()).toHaveBeenCalledTimes(expected)
- `packages/react-aria-components/test/Table.test.js :: Table keyboardNavigationBehavior='tab' and textfields in row focusMode='child' arrow navigating to a focusMode="child" cell focuses the child directly` — TypeError: Cannot assign to read only property 'actionCellProps' of object '#<Object>'
- `packages/react-aria-components/test/Table.test.js :: Table keyboardNavigationBehavior='tab' and textfields in row focusMode='child' allowsArrowNavigation allows arrow key row navigation when focused on child` — TypeError: Cannot assign to read only property 'type' of object '#<Object>'
- `packages/react-aria-components/test/Table.test.js :: Table keyboardNavigationBehavior='tab' and textfields in row focusMode='child' Shift+Tab from a focusMode="child" child skips the cell and does not return to it` — TypeError: Cannot assign to read only property 'type' of object '#<Object>'
- `packages/react-aria-components/test/Table.test.js :: Table cells with focusable children in arrow navigation mode default focusMode: ArrowRight crosses from last child to first child of next cell, ArrowLeft reverses` — TypeError: Cannot assign to read only property 'props' of object '#<Object>'
- `packages/react-aria-components/test/Table.test.js :: Table cells with focusable children in arrow navigation mode focusMode='cell' arrow navigation with focusMode="cell": cell element stays focused on navigate, arrows enter/exit children within cell` — TypeError: Cannot assign to read only property 'cellProps' of object '#<Object>'
- `packages/react-aria-components/test/DateRangePicker.test.js :: DateRangePicker supports validation errors` — Error: An update to %s inside a test was not wrapped in act(...).
- `packages/react-aria-components/test/Dialog.test.js :: Dialog should not close Modal when DateRangePicker is dismissed by outside click` — TestingLibraryElementError: Found multiple elements with the role "dialog"
- `packages/react-aria/test/interactions/useFocusVisible.test.js :: useFocusVisible returns negative isFocusVisible result after toggling browser tabs in Safari without prior keyboard navigation` — Error: An update to %s inside a test was not wrapped in act(...).
- `packages/react-aria/test/interactions/useFocusVisible.test.js :: useFocusVisible Setups global event listeners in a different window removes event listeners on beforeunload` — Error: expect(received).toBe(expected) // Object.is equality
- `packages/react-aria/test/interactions/useFocusVisible.test.js :: useFocusVisible Setups global event listeners in a different window removes event listeners using teardown function` — Error: expect(received).toBe(expected) // Object.is equality
- `packages/react-aria/test/interactions/useFocusVisible.test.js :: useFocusVisible Setups global event listeners in a different window returns negative isFocusVisible result after toggling browser tabs without prior keyboard navigation` — Error: expect(received).toBe(expected) // Object.is equality
- `packages/react-aria/test/interactions/useFocusVisible.test.js :: useFocusVisible Setups global event listeners in a different window returns negative isFocusVisible result after toggling browser window without prior keyboard navigation` — Error: expect(received).toBe(expected) // Object.is equality
- `packages/react-aria/test/selection/useSelectableCollection.test.js :: useSelectableCollection can navigate without replacing the selection in multiple selection selectOnFocus` — TypeError: Cannot assign to read only property 'props' of object '#<Object>'
- `packages/react-aria-components/test/RadioGroup.test.js :: RadioGroup should support press state with keyboard` — Error: expect(jest.fn()).toHaveBeenCalledTimes(expected)
- `packages/react-aria-components/test/RadioGroup.test.js :: RadioGroup supports validation errors` — Error: expect(element).toHaveTextContent()
- `packages/react-aria-components/test/RadioGroup.test.js :: RadioGroup supports validation errors when last radio is disabled` — Error: expect(element).toHaveTextContent()
- `packages/react-aria-components/test/RadioGroup.test.js :: RadioField should support press state with keyboard` — Error: expect(jest.fn()).toHaveBeenCalledTimes(expected)
- `packages/react-aria-components/test/RadioGroup.test.js :: RadioField supports validation errors` — Error: expect(element).toHaveTextContent()
- `packages/react-aria-components/test/RadioGroup.test.js :: RadioField supports validation errors when last radio is disabled` — Error: expect(element).toHaveTextContent()
- `packages/react-aria-components/test/DatePicker.test.js :: DatePicker supports validation errors` — Error: An update to %s inside a test was not wrapped in act(...).
- `packages/react-aria/test/dnd/useDraggableCollection.test.js :: useDraggableCollection screen reader should work with a listbox without a drag button` — Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true"
- `packages/react-aria/test/dnd/useDraggableCollection.test.js :: useDraggableCollection screen reader should support row actions` — Error: expect(element).not.toHaveAttribute("aria-describedby") // element.hasAttribute("aria-describedby")
- `packages/react-aria/test/dnd/useDroppableCollection.test.js :: useDroppableCollection keyboard should perform basic drag and drop` — Error: expect(received).toHaveLength(expected)
- `packages/react-aria/test/dnd/useDroppableCollection.test.js :: useDroppableCollection keyboard should support arrow key navigation` — Error: expect(received).toHaveLength(expected)
- `packages/react-aria/test/dnd/useDroppableCollection.test.js :: useDroppableCollection keyboard supports Home and End` — Error: expect(received).toHaveLength(expected)
- `packages/react-aria/test/dnd/useDroppableCollection.test.js :: useDroppableCollection keyboard supports PageUp and PageDown` — Error: expect(received).toHaveLength(expected)
- `packages/react-aria/test/dnd/useDroppableCollection.test.js :: useDroppableCollection keyboard should skip invalid targets with PageUp and PageDown` — Error: expect(received).toHaveLength(expected)
- `packages/react-aria/test/dnd/useDroppableCollection.test.js :: useDroppableCollection keyboard should skip invalid targets at edges with PageUp and PageDown` — Error: expect(received).toHaveLength(expected)
- `packages/react-aria/test/dnd/useDroppableCollection.test.js :: useDroppableCollection screen reader should perform basic drag and drop` — Error: expect(received).toHaveLength(expected)
- `packages/react-aria/test/dnd/useDroppableCollection.test.js :: useDroppableCollection screen reader should add descriptions to each item` — Error: expect(received).toHaveLength(expected)
- `packages/react-aria/test/dnd/useDroppableCollection.test.js :: useDroppableCollection screen reader should show insertion indicators` — Error: expect(received).toHaveLength(expected)
- `packages/react-aria/test/dnd/useDroppableCollection.test.js :: useDroppableCollection screen reader should hide items that do not accept the drop` — Error: expect(element).toHaveAttribute("aria-hidden", "true") // element.getAttribute("aria-hidden") === "true"
- `packages/react-aria/test/dnd/dnd.test.js :: useDrag and useDrop native drag and drop drop operations should update drop operation if modifier key is pressed and browser does not update effectAllowed` — Error: expect(received).toBe(expected) // Object.is equality
- `packages/react-aria/test/dnd/dnd.test.js :: useDrag and useDrop native drag and drop drop operations should handle when browser does not set effectAllowed properly` — Error: expect(received).toBe(expected) // Object.is equality
- `packages/react-aria/test/dnd/dnd.test.js :: useDrag and useDrop keyboard drop operations should hide drop targets where getDropOperation returns "cancel"` — Error: expect(element).toHaveAttribute("aria-hidden", "true") // element.getAttribute("aria-hidden") === "true"
- `packages/react-aria/test/dnd/dnd.test.js :: useDrag and useDrop screen reader should allow navigating with only focus events` — Error: expect(element).toHaveTextContent()
- `packages/react-aria/test/dnd/dnd.test.js :: useDrag and useDrop screen reader should hide all non drop target elements from screen readers while dragging` — TypeError: Cannot assign to read only property 'props' of object '#<Object>'
- `packages/react-aria/test/dnd/dnd.test.js :: useDrag and useDrop screen reader should handle when a non drop target element is added` — Error: expect(received).toThrow()
- `packages/react-aria/test/dnd/dnd.test.js :: useDrag and useDrop screen reader should restore focus to the current drop target when focusing a non drop target element` — TypeError: Cannot assign to read only property 'ref' of object '#<Object>'
- `packages/react-aria/test/dnd/dnd.test.js :: useDrag and useDrop screen reader should restore focus to the drag target when focusing a non drop target element and there is no current drop target` — TypeError: Cannot assign to read only property 'ref' of object '#<Object>'
- `packages/react-aria/test/dnd/dnd.test.js :: useDrag and useDrop screen reader should restore focus to the current drop target when blurring all elements` — TypeError: Cannot assign to read only property 'ref' of object '#<Object>'
- `packages/react-aria/test/dnd/dnd.test.js :: useDrag and useDrop screen reader should restore focus to the drag target when blurring all elements and there is no current drop target` — TypeError: Cannot assign to read only property 'ref' of object '#<Object>'
- `packages/react-aria/test/dnd/dnd.test.js :: useDrag and useDrop screen reader should ignore clicks not from screen readers during dragging` — Error: expect(element).toHaveAttribute("data-dragging", "true") // element.getAttribute("data-dragging") === "true"
- `packages/react-aria/test/dnd/dnd.test.js :: useDrag and useDrop screen reader should use touch specific aria descriptions when available` — Error: expect(element).toHaveTextContent()
- `packages/react-aria-components/test/DateField.test.js :: DateField supports validation errors` — Error: expect(received).toContain(expected) // indexOf
- `packages/react-aria-components/test/Checkbox.test.js :: Checkbox should support press state with keyboard` — Error: expect(jest.fn()).toHaveBeenCalledTimes(expected)
- `packages/react-aria-components/test/Checkbox.test.js :: CheckboxField should support press state with keyboard` — Error: expect(jest.fn()).toHaveBeenCalledTimes(expected)
- `packages/react-aria-components/test/Checkbox.test.js :: CheckboxField should support required state` — Error: An update to %s inside a test was not wrapped in act(...).
- `packages/react-aria-components/test/CheckboxGroup.test.js :: CheckboxGroup with CheckboxField should support validation errors` — Error: An update to %s inside a test was not wrapped in act(...).
- `packages/react-aria-components/test/CheckboxGroup.test.js :: CheckboxGroup with Checkbox should support validation errors` — Error: An update to %s inside a test was not wrapped in act(...).
- `packages/react-aria-components/test/Switch.test.js :: Switch should support press state with keyboard` — Error: expect(jest.fn()).toHaveBeenCalledTimes(expected)
- `packages/react-aria-components/test/Switch.test.js :: SwitchField should support press state with keyboard` — Error: expect(jest.fn()).toHaveBeenCalledTimes(expected)
- `packages/react-aria-components/test/Switch.test.js :: SwitchField should support required state` — Error: An update to %s inside a test was not wrapped in act(...).
- `packages/react-aria-components/test/TextField.test.js :: TextField Input supports validation errors` — Error: expect(element).toHaveTextContent()
- `packages/react-aria-components/test/TextField.test.js :: TextField TextArea supports validation errors` — Error: expect(element).toHaveTextContent()
- `packages/react-aria-components/test/TimeField.test.js :: TimeField supports validation errors` — Error: expect(received).toContain(expected) // indexOf
- `packages/react-aria-components/test/Form.test.js :: Form shows focus-visible when a form library moves focus to the first invalid field on submit` — Error: expect(element).not.toHaveAttribute("data-focus-visible") // element.hasAttribute("data-focus-visible")
- `packages/react-aria-components/test/ColorField.test.js :: ColorField supports validation errors` — Error: expect(element).toHaveTextContent()
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = left no viewport offset Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = left no viewport offset Should calculate the correct position when provider does not start at top of screen` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = left viewport offset before Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = left viewport offset before Should calculate the correct position when provider does not start at top of screen` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = left viewport offset after Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = left main axis offset Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = left cross axis offset positive Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = left cross axis offset negative Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = left minimum overlay arrow offset Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = left top no viewport offset Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = left top no viewport offset Should calculate the correct position when provider does not start at top of screen` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = left top viewport offset before Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = left top viewport offset before Should calculate the correct position when provider does not start at top of screen` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = left top viewport offset after Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = left top main axis offset Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = left top cross axis offset positive Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = left top cross axis offset negative Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = left top minimum overlay arrow offset Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = left bottom no viewport offset Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = left bottom no viewport offset Should calculate the correct position when provider does not start at top of screen` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = left bottom viewport offset before Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = left bottom viewport offset before Should calculate the correct position when provider does not start at top of screen` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = left bottom viewport offset after Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = left bottom main axis offset Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = left bottom cross axis offset positive Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = left bottom cross axis offset negative Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = left bottom minimum overlay arrow offset Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = top no viewport offset Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = top no viewport offset Should calculate the correct position when provider does not start at top of screen` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = top viewport offset before Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = top viewport offset before Should calculate the correct position when provider does not start at top of screen` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = top viewport offset after Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = top main axis offset Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = top cross axis offset positive Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = top cross axis offset negative Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = top minimum overlay arrow offset Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = top left no viewport offset Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = top left no viewport offset Should calculate the correct position when provider does not start at top of screen` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = top left viewport offset before Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = top left viewport offset before Should calculate the correct position when provider does not start at top of screen` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = top left viewport offset after Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = top left main axis offset Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = top left cross axis offset positive Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = top left cross axis offset negative Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = top left minimum overlay arrow offset Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = top right no viewport offset Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = top right no viewport offset Should calculate the correct position when provider does not start at top of screen` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = top right viewport offset before Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = top right viewport offset before Should calculate the correct position when provider does not start at top of screen` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = top right viewport offset after Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = top right main axis offset Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = top right cross axis offset positive Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = top right cross axis offset negative Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/overlays/calculatePosition.test.ts :: calculatePosition placement = top right minimum overlay arrow offset Should calculate the correct position` — Error: expect(received).toEqual(expected) // deep equality
- `packages/react-aria/test/numberfield/useNumberField.test.ts :: useNumberField hook should return numberFieldProps all events are merged into the input element` — Error: expect(jest.fn()).toHaveBeenCalled()
- `packages/react-aria-components/test/SearchField.test.js :: SearchField supports validation errors` — Error: expect(element).toHaveTextContent()
- `packages/react-aria/test/utils/runAfterKeyboard.test.ts :: runAfterKeyboard runAfterKeyboard guarantees a flush when the keyboard did not open in time` — Error: expect(jest.fn()).toHaveBeenCalledWith(...expected)
- `packages/react-aria/test/utils/runAfterKeyboard.test.ts :: runAfterKeyboard runAfterKeyboardTransition flushes on resize end when the keyboard is closing` — Error: expect(jest.fn()).toHaveBeenCalledWith(...expected)
- `packages/react-aria/test/utils/runAfterKeyboard.test.ts :: runAfterKeyboard runAfterKeyboardTransition flushes on animation finish when the keyboard is opening` — Error: expect(jest.fn()).toHaveBeenCalledWith(...expected)
- `packages/react-aria/test/utils/runAfterKeyboard.test.ts :: runAfterKeyboard runAfterKeyboardTransition guarantees a flush when the keyboard did not open in time` — Error: expect(jest.fn()).toHaveBeenCalledWith(...expected)
- `packages/react-aria/test/utils/runAfterKeyboard.test.ts :: runAfterKeyboard runAfterKeyboardTransition guarantees a flush when the keyboard did not close in time` — Error: expect(jest.fn()).toHaveBeenCalledWith(...expected)
- `packages/react-aria/test/overlays/useOverlayPosition.test.tsx :: useOverlayPosition should position the overlay relative to the trigger at top` — Error: expect(element).toHaveStyle()
- `packages/react-aria-components/test/ColorSwatch.test.js :: ColorSwatch should support render props` — Error: expect(element).toHaveStyle()
- `packages/react-aria/test/utils/keyboard.test.ts :: keyboard isKeyboardOpen supports orientation changes` — Error: expect(received).toBe(expected) // Object.is equality
- `packages/react-aria/test/disclosure/useDisclosure.test.ts :: useDisclosure should keep panel hidden when toggling disabled state` — Error: expect(received).toBe(expected) // Object.is equality
- `packages/react-aria/test/aria-modal-polyfill/index.test.tsx :: watchModals should hide everything except the modal` — Error: expect(received).toBeNull()
- `packages/react-aria/test/aria-modal-polyfill/index.test.tsx :: watchModals should handle nested modals` — Error: expect(received).toBeNull()
- `packages/react-aria/test/aria-modal-polyfill/index.test.tsx :: watchModals should hide around Menus` — Error: expect(received).toBeNull()
- `packages/react-aria/test/aria-modal-polyfill/index.test.tsx :: watchModals should hide around Tray` — Error: expect(received).toBeNull()
- `packages/react-aria/test/aria-modal-polyfill/index.test.tsx :: watchModals should hide around Popover` — Error: expect(received).toBeNull()

</details>

<details><summary>missing vs jsdom (63)</summary>

- `packages/react-aria-components/test/Sheet.test.js :: Sheet renders an accessible modal dialog with default class names and attributes`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet uses swipe direction top for position top with swipeDirection undefined`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet uses swipe direction bottom for position bottom with swipeDirection undefined`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet uses swipe direction left for position left with swipeDirection undefined`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet uses swipe direction right for position right with swipeDirection undefined`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet uses swipe direction vertical for position center with swipeDirection undefined`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet uses swipe direction horizontal for position center with swipeDirection horizontal`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet uses swipe direction vertical for position bottom with swipeDirection vertical`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet resolves position start and swipeDirection undefined in en-US`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet resolves position end and swipeDirection undefined in en-US`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet resolves position start and swipeDirection undefined in ar-AE`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet resolves position end and swipeDirection undefined in ar-AE`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet resolves position left and swipeDirection undefined in ar-AE`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet resolves position center and swipeDirection start in en-US`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet resolves position center and swipeDirection end in ar-AE`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet passes sheet render props to className, style, and children functions`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet supports custom class names on SheetContent`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet closes on Escape and restores focus to the trigger`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet defers hiding outside content and focusing the dialog until the enter animation completes`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet enter scroll skips the part where the sheet is still off screen past the end edge`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet enter scroll skips the part where the sheet is still off screen past the start edge`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet enter scroll does not skip when the sheet is already partly on screen`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet enter scroll ignores the scrollend from the jump and waits for the enter scroll to finish`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet closes via the close function passed to SheetContent children`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet closes when interacting outside the sheet by default`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet does not close when interacting outside a non-dismissable sheet`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet supports controlled open state`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet visibility observes the sheet content visibility`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet visibility marks the sheet as expanded only when fully visible`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet visibility closes when the sheet is swiped out of view`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet visibility calls onOpenChange when a controlled sheet without a trigger is swiped out of view`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet visibility closes an uncontrolled sheet without a trigger when swiped out of view`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet visibility calls the overlay onOpenChange when a controlled sheet inside a trigger is swiped out of view`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet visibility does not close before the sheet has become visible`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet snap points renders a snap marker for each snap point with the first as the initial position`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet snap points anchors snap markers to the leading edge for top sheets`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet snap points anchors snap markers to the leading edge for left sheets`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet snap points anchors snap markers to the leading edge for right sheets`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet snap points does not render snap markers without snap points`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet snap points measures the sheet when non-dismissable to clamp swiping to the smallest snap point`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet stacking does not hide a nested sheet while it is entering`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet stacking tracks the stack index and descendants of nested sheets`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet stacking animates parent sheets along the view timelines of their descendants`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet stacking closes only the topmost sheet on Escape`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet overscroll padding extends bottom sheets beyond the viewport edge`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet overscroll padding extends top sheets beyond the viewport edge`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet overscroll padding extends left sheets beyond the viewport edge`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet overscroll padding extends right sheets beyond the viewport edge`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet overscroll padding does not add padding when the sheet is not swiped toward its edge`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet swipe animations binds swipe animations to the view timeline when swiping bottom`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet swipe animations binds swipe animations to the view timeline when swiping right`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet swipe animations binds swipe animations to the view timeline when swiping top`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet swipe animations binds swipe animations to the view timeline when swiping left`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet swipe animations binds swipe animations to the view timeline when swiping vertical`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet swipe animations binds swipe animations to the view timeline when swiping horizontal`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet swipe animations limits swipe animations to the given snap point range`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet swipe animations does not add animations by default`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet view timelines names the view timeline on SheetContent by stack index`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet view timelines uses a y axis view timeline for bottom sheets`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet view timelines uses a y axis view timeline for top sheets`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet view timelines uses a x axis view timeline for left sheets`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet view timelines uses a x axis view timeline for right sheets`
- `packages/react-aria-components/test/Sheet.test.js :: Sheet view timelines uses a y axis view timeline for center sheets`

</details>

### Failures by component

| component | failed |
| --- | --: |
| react-aria/overlays | 55 |
| RAC/Table | 46 |
| RAC/Tree | 33 |
| react-aria/dnd | 24 |
| RAC/GridList | 20 |
| RAC/ListBox | 9 |
| react-aria/interactions | 7 |
| RAC/RadioGroup | 6 |
| react-aria/utils | 6 |
| react-aria/aria-modal-polyfill | 5 |
| react-aria/table | 4 |
| RAC/Autocomplete | 3 |
| RAC/Select | 3 |
| RAC/Checkbox | 3 |
| RAC/Switch | 3 |
| RAC/NumberField | 2 |
| RAC/Treeble | 2 |
| RAC/CheckboxGroup | 2 |
| RAC/TextField | 2 |
| RAC/Menu | 1 |
| RAC/ComboBox | 1 |
| RAC/DateRangePicker | 1 |
| RAC/Dialog | 1 |
| react-aria/selection | 1 |
| RAC/DatePicker | 1 |
| RAC/DateField | 1 |
| RAC/TimeField | 1 |
| RAC/Form | 1 |
| RAC/ColorField | 1 |
| react-aria/numberfield | 1 |
| RAC/SearchField | 1 |
| RAC/ColorSwatch | 1 |
| react-aria/disclosure | 1 |

### Failures by error signature

| count | signature | components | example |
| --: | --- | --- | --- |
| 55 | Error: expect(received).toEqual(expected) // deep equality | RAC/Treeble, react-aria/overlays | `packages/react-aria-components/test/Treeble.test.js :: Treeble should support drag and drop` |
| 30 | Error: expect(element).toHaveAttribute("aria-selected", "true") // element.getAttribute("aria-selected") === "true" | RAC/GridList, RAC/ListBox, RAC/Tree, RAC/Table, react-aria/dnd | `packages/react-aria-components/test/GridList.test.js :: GridList selectionBehavior="replace" mouse should perform selection with single selection` |
| 24 | Error: expect(received).toHaveLength(expected) | RAC/GridList, RAC/Tree, RAC/Table, react-aria/dnd | `packages/react-aria-components/test/GridList.test.js :: GridList drag and drop should render drop indicators` |
| 21 | Error: expect(jest.fn()).toHaveBeenCalledTimes(expected) | RAC/Select, RAC/GridList, RAC/ListBox, RAC/Tree, RAC/Table, RAC/RadioGroup, RAC/Checkbox, RAC/Switch | `packages/react-aria-components/test/Select.test.js :: Select should not submit if required and selectedKey is null` |
| 18 | TypeError: Cannot assign to read only property 'type' of object '#<Object>' | RAC/Tree, RAC/Table | `packages/react-aria-components/test/Tree.test.tsx :: Tree tab navigation and textfields should not navigate rows when arrow keys are pressed while a text input child has focus` |
| 17 | Error: expect(element).toHaveTextContent() | RAC/Select, RAC/ComboBox, RAC/NumberField, RAC/Table, RAC/RadioGroup, react-aria/dnd, RAC/TextField, RAC/ColorField, … | `packages/react-aria-components/test/Select.test.js :: Select should support multiple selection form integration with many items` |
| 9 | Error: An update to %s inside a test was not wrapped in act(...). | RAC/Autocomplete, RAC/Select, RAC/DateRangePicker, react-aria/interactions, RAC/DatePicker, RAC/Checkbox, RAC/CheckboxGroup, RAC/Switch | `packages/react-aria-components/test/Autocomplete.test.tsx :: rac-dynamic-menu AriaAutocomplete async filtering performed outside the autocomplete should properly filter and autofocus the first item when typing forward` |
| 8 | Error: expect(received).toStrictEqual(expected) // deep equality | react-aria/table, RAC/Table | `packages/react-aria/test/table/ariaTableResizing.test.tsx :: Aria Table Resizing resizing table will not affect pixel widths` |
| 8 | Error: expect(received).toBe(expected) // Object.is equality | react-aria/interactions, react-aria/dnd, react-aria/utils, react-aria/disclosure | `packages/react-aria/test/interactions/useFocusVisible.test.js :: useFocusVisible Setups global event listeners in a different window removes event listeners on beforeunload` |
| 7 | TypeError: Cannot assign to read only property 'props' of object '#<Object>' | RAC/Tree, RAC/Table, react-aria/selection, react-aria/dnd | `packages/react-aria-components/test/Tree.test.tsx :: Tree focusMode and allowsArrowNavigation focusMode="child" with default arrow navigation ArrowDown from child navigates to first child of next item` |
| 6 | Error: expect(jest.fn()).toHaveBeenCalledWith(...expected) | RAC/GridList, react-aria/utils | `packages/react-aria-components/test/GridList.test.js :: GridList links mouse should work with RouterProvider` |
| 5 | Error: expect(received).toBeNull() | react-aria/aria-modal-polyfill | `packages/react-aria/test/aria-modal-polyfill/index.test.tsx :: watchModals should hide everything except the modal` |
| 4 | Error: expect(element).toHaveAttribute("aria-expanded", "true") // element.getAttribute("aria-expanded") === "true" | RAC/Tree | `packages/react-aria-components/test/Tree.test.tsx :: rac-staticAriaTree interaction - mouse should have the expected attributes on the rows` |
| 4 | Error: expect(element).toHaveStyle() | react-aria/interactions, react-aria/overlays, RAC/ColorSwatch | `packages/react-aria/test/interactions/usePress.test.js :: usePress disable text-selection when pressed non related style changes during press down shouldn't overwrite user-select on press end (non-iOS)` |
| 4 | Error: Current active element is not on any of the table rows | RAC/Table | `packages/react-aria-components/test/Table.test.js :: Table selectionBehavior="replace" keyboard should perform selection with single selection` |
| 4 | TypeError: Cannot assign to read only property 'ref' of object '#<Object>' | react-aria/dnd | `packages/react-aria/test/dnd/dnd.test.js :: useDrag and useDrop screen reader should restore focus to the current drop target when focusing a non drop target element` |
| 3 | Error: expect(element).toHaveAttribute("aria-hidden", "true") // element.getAttribute("aria-hidden") === "true" | RAC/Menu, react-aria/dnd | `packages/react-aria-components/test/Menu.test.tsx :: Menu Submenus should close all submenus if interacting outside root submenu` |
| 2 | TestingLibraryElementError: Found multiple elements with the role "textbox" | RAC/Autocomplete | `packages/react-aria-components/test/Autocomplete.test.tsx :: Autocomplete should be able to tab inside a focus scope that contains` |
| 2 | Error: expect(element).toHaveAttribute("aria-label", "Insert between Cat and Dog") // element.getAttribute("aria-label") === "Insert between Cat and Dog" | RAC/GridList, RAC/Tree | `packages/react-aria-components/test/GridList.test.js :: GridList drag and drop should not skip drop positions before/after a disabled item` |
| 2 | Error: ActiveElement is not in the tree | RAC/Tree | `packages/react-aria-components/test/Tree.test.tsx :: rac-staticAriaTree interaction - keyboard should have the expected attributes on the rows` |
| 2 | Error: expect(received).toContain(expected) // indexOf | RAC/DateField, RAC/TimeField | `packages/react-aria-components/test/DateField.test.js :: DateField supports validation errors` |
| 1 | Error: expect(element).toHaveAttribute("data-drop-target", "true") // element.getAttribute("data-drop-target") === "true" | RAC/GridList | `packages/react-aria-components/test/GridList.test.js :: GridList drag and drop should support dropping with horizontal arrow keys when orientation is horizontal` |
| 1 | Error: expect(element).toHaveAttribute("data-selected", "true") // element.getAttribute("data-selected") === "true" | RAC/Tree | `packages/react-aria-components/test/Tree.test.tsx :: Tree drag and drop should allow selection even when drag and drop is disabled` |
| 1 | Error: ActiveElement is not in the gridlist | RAC/Tree | `packages/react-aria-components/test/Tree.test.tsx :: Tree press events should support press events on items when using keyboard` |
| 1 | Error: expect(element).toHaveAttribute("aria-label", "Insert after Budget") // element.getAttribute("aria-label") === "Insert after Budget" | RAC/Treeble | `packages/react-aria-components/test/Treeble.test.js :: Treeble should properly walk through nested levels of drop positioning` |
| 1 | Error: expect(element).toHaveAttribute("aria-label", "Insert between Games and Program Files") // element.getAttribute("aria-label") === "Insert between Games and Program Files" | RAC/Table | `packages/react-aria-components/test/Table.test.js :: Table drag and drop should not skip drop positions before/after a disabled item` |
| 1 | TestingLibraryElementError: Found multiple elements with the role "checkbox" | RAC/Table | `packages/react-aria-components/test/Table.test.js :: Table contexts should not propagate the checkbox context from selection into other cells` |
| 1 | TypeError: Cannot assign to read only property 'actionCellProps' of object '#<Object>' | RAC/Table | `packages/react-aria-components/test/Table.test.js :: Table keyboardNavigationBehavior='tab' and textfields in row focusMode='child' arrow navigating to a focusMode="child" cell focuses the child directly` |
| 1 | TypeError: Cannot assign to read only property 'cellProps' of object '#<Object>' | RAC/Table | `packages/react-aria-components/test/Table.test.js :: Table cells with focusable children in arrow navigation mode focusMode='cell' arrow navigation with focusMode="cell": cell element stays focused on navigate, arrows enter/exit children within cell` |
| 1 | TestingLibraryElementError: Found multiple elements with the role "dialog" | RAC/Dialog | `packages/react-aria-components/test/Dialog.test.js :: Dialog should not close Modal when DateRangePicker is dismissed by outside click` |
| 1 | Error: expect(element).not.toHaveAttribute("aria-describedby") // element.hasAttribute("aria-describedby") | react-aria/dnd | `packages/react-aria/test/dnd/useDraggableCollection.test.js :: useDraggableCollection screen reader should support row actions` |
| 1 | Error: expect(received).toThrow() | react-aria/dnd | `packages/react-aria/test/dnd/dnd.test.js :: useDrag and useDrop screen reader should handle when a non drop target element is added` |
| 1 | Error: expect(element).toHaveAttribute("data-dragging", "true") // element.getAttribute("data-dragging") === "true" | react-aria/dnd | `packages/react-aria/test/dnd/dnd.test.js :: useDrag and useDrop screen reader should ignore clicks not from screen readers during dragging` |
| 1 | Error: expect(element).not.toHaveAttribute("data-focus-visible") // element.hasAttribute("data-focus-visible") | RAC/Form | `packages/react-aria-components/test/Form.test.js :: Form shows focus-visible when a form library moves focus to the first invalid field on submit` |
| 1 | Error: expect(jest.fn()).toHaveBeenCalled() | react-aria/numberfield | `packages/react-aria/test/numberfield/useNumberField.test.ts :: useNumberField hook should return numberFieldProps all events are merged into the input element` |

## jsdom

No failing tests.

Raw Jest JSON, logs and probe receipts: `downstream/react-aria/output/<mode>/` (gitignored).
