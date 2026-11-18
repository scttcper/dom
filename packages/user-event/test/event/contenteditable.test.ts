import {createWindow} from '@ctrl/dom'
import {expect, test} from 'vitest'
import {selectAll} from '../../src/event/selection/selectAll.ts'
import type {Element} from '../../src/dom-types.ts'

test('selectAll prefers an empty contenteditable ancestor and sees attribute edits', () => {
  const {document} = createWindow({
    html: '<div contenteditable><section contenteditable="true"><b>hello</b></section></div>',
  })
  const outer = document.querySelector('div')!
  const inner = document.querySelector('section')!
  const target = document.querySelector('b')! as unknown as Element

  selectAll(target)
  expect(document.getSelection()!.anchorNode).toBe(outer)
  outer.removeAttribute('contenteditable')
  selectAll(target)
  expect(document.getSelection()!.anchorNode).toBe(inner)
  inner.setAttribute('contenteditable', 'false')
  selectAll(target)
  expect(document.getSelection()!.anchorNode).toBe(document.body)
})
