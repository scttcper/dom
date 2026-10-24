// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/tests/environment/select.ts
//
// @ts-nocheck -- ported verbatim; upstream types these tests against lib.dom, which this monorepo
// does not load (we are the DOM). Vitest does not typecheck; src/ is fully typed.

import {isJsdomEnv, isLegacyJsdomEnv, isRtdEnv, render} from '#testHelpers'
import {waitFor} from '@testing-library/dom'

test('`Selection.setBaseAndExtent()` resets input selection in browser', async () => {
  const {element} = render<HTMLInputElement>(`<input value="foo"/>`, {
    selection: {focusOffset: 3},
  })
  expect(element.selectionStart).toBe(3)

  element.ownerDocument.getSelection()?.setBaseAndExtent(element, 0, element, 0)

  // divergence: @rtd/dom keeps the input's own selection, like jsdom
  expect(element.selectionStart).toBe(isJsdomEnv() || isRtdEnv() ? 3 : 0)
})

// @rtd/dom queues `select` per https://html.spec.whatwg.org/#dom-textarea/input-setselectionrange
test('events are not dispatched on same microtask in browser', async () => {
  const {element} = render<HTMLInputElement>(`<input value="foo"/>`)
  const onSelect = vi.fn()
  element.addEventListener('select', onSelect)

  element.setSelectionRange(1, 2)

  expect(onSelect).toBeCalledTimes(isLegacyJsdomEnv() ? 1 : 0) // divergence: jsdom 30 queues `select`

  await waitFor(() => expect(onSelect).toBeCalledTimes(1))
})

test('`HTMLInputElement.focus()` in contenteditable changes `Selection` in browser', () => {
  const {element, xpathNode} = render<HTMLInputElement>(
    `<div contenteditable="true"><input/></div><span></span>`,
    {
      selection: {
        focusNode: '//span',
      },
    },
  )

  expect(element.ownerDocument.getSelection()).toHaveProperty(
    'anchorNode',
    xpathNode('//span'),
  )

  xpathNode('//input').focus()

  expect(element.ownerDocument.getSelection()).toHaveProperty(
    'anchorNode',
    // divergence: jsdom 30 moves the Selection onto the focused input itself
    // @rtd/dom, like jsdom 20, leaves the document Selection alone on focus()
    isLegacyJsdomEnv() || isRtdEnv()
      ? xpathNode('//span')
      : isJsdomEnv()
        ? xpathNode('//input')
        : element,
  )
})
