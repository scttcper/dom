// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/tests/event/selection/selectAll.ts
//
// @ts-nocheck -- ported verbatim; upstream types these tests against lib.dom, which this monorepo
// does not load (we are the DOM). Vitest does not typecheck; src/ is fully typed.

import {setup} from '#testHelpers'
import {getUISelection} from '#src/document/index.ts'
import {isAllSelected, selectAll} from '#src/event/selection/index.ts'

test('select all in input', async () => {
  const {element} = setup<HTMLInputElement>(`<input value="foo bar baz"/>`)

  expect(isAllSelected(element)).toBe(false)

  selectAll(element)

  expect(getUISelection(element)).toHaveProperty('startOffset', 0)
  expect(getUISelection(element)).toHaveProperty('endOffset', 11)
  expect(element).toHaveProperty('selectionStart', 0)
  expect(element).toHaveProperty('selectionEnd', 11)

  expect(isAllSelected(element)).toBe(true)
})

test('select all in textarea', async () => {
  const {element} = setup<HTMLTextAreaElement>(
    `<textarea>foo\nbar\nbaz</textarea>`,
  )

  expect(isAllSelected(element)).toBe(false)

  selectAll(element)

  expect(getUISelection(element)).toHaveProperty('startOffset', 0)
  expect(getUISelection(element)).toHaveProperty('endOffset', 11)
  expect(element).toHaveProperty('selectionStart', 0)
  expect(element).toHaveProperty('selectionEnd', 11)

  expect(isAllSelected(element)).toBe(true)
})

test('select all in contenteditable', async () => {
  const {element} = setup(`
        <div contenteditable><div>foo</div><div>bar</div></div>
        <div>baz</div>
    `)

  expect(isAllSelected(element)).toBe(false)

  selectAll(element)

  const selection = document.getSelection()
  expect(selection).toHaveProperty('anchorNode', element)
  expect(selection).toHaveProperty('anchorOffset', 0)
  expect(selection).toHaveProperty('focusNode', element)
  expect(selection).toHaveProperty('focusOffset', 2)

  expect(isAllSelected(element)).toBe(true)
})

test('select all outside of editable', async () => {
  const {element} = setup(`
        <input type="checkbox"/>
        <div>foo</div>
    `)

  expect(isAllSelected(element)).toBe(false)

  selectAll(element)

  const selection = document.getSelection()
  expect(selection).toHaveProperty('anchorNode', element.ownerDocument.body)
  expect(selection).toHaveProperty('anchorOffset', 0)
  expect(selection).toHaveProperty('focusNode', element.ownerDocument.body)
  expect(selection).toHaveProperty(
    'focusOffset',
    element.ownerDocument.body.childNodes.length,
  )

  expect(isAllSelected(element)).toBe(true)
})
