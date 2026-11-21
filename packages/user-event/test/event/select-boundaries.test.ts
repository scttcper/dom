/**
 * selectBoundaries (packages/user-event/src/event/selection/selectBoundaries.ts) replaces
 * upstream's `selection.removeAllRanges(); selection.addRange(range.cloneRange())` in the mouse
 * selection code: it must leave the selection upstream's two calls leave.
 *
 * Specs:
 *   Selection.addRange — https://w3c.github.io/selection-api/#dom-selection-addrange
 *   Selection.setBaseAndExtent — https://w3c.github.io/selection-api/#dom-selection-setbaseandextent
 * Upstream: https://github.com/testing-library/user-event/blob/v14.6.8/src/event/selection/setSelectionPerMouse.ts
 *   and modifySelectionPerMouse.ts
 */
import {describe, expect, test} from 'vitest'
import {selectBoundaries} from '../../src/event/selection/selectBoundaries.ts'

declare const document: any

/** What upstream does with a range of these boundary points. */
function upstream(
  startNode: any,
  startOffset: number,
  endNode: any,
  endOffset: number,
) {
  const range = document.createRange()
  range.setStart(startNode, startOffset)
  range.setEnd(endNode, endOffset)
  const selection = document.getSelection()
  selection.removeAllRanges()
  selection.addRange(range.cloneRange())
}

function snapshot() {
  const s = document.getSelection()
  return {
    rangeCount: s.rangeCount,
    anchor: [s.anchorNode, s.anchorOffset],
    focus: [s.focusNode, s.focusOffset],
    type: s.type,
    direction: s.direction,
    text: s.toString(),
  }
}

describe('selectBoundaries — https://w3c.github.io/selection-api/#dom-selection-addrange', () => {
  test('leaves the selection that adding a range with those boundary points leaves', () => {
    document.body.innerHTML =
      '<p>one <b>two</b> three</p><p>four</p><input value="five">'
    const [first, second] = document.querySelectorAll('p')
    const cases: Array<[any, number, any, number]> = [
      [first.firstChild, 1, first.firstChild, 1],
      [first.firstChild, 0, first.firstChild, 3],
      [first.firstChild, 2, first.lastChild, 4],
      [first, 0, second, 1],
      [first.querySelector('b').firstChild, 1, second.firstChild, 2],
      [document.body, 0, document.body, 3],
    ]
    for (const [sn, so, en, eo] of cases) {
      upstream(sn, so, en, eo)
      const expected = snapshot()
      document.getSelection().collapse(document.body, 0)
      selectBoundaries(document, sn, so, en, eo)
      expect(snapshot()).toEqual(expected)
    }
  })

  test('boundary points outside the document or in a shadow tree empty the selection, as addRange ignores such a range', () => {
    document.body.innerHTML = '<p>text</p><div id="host"></div>'
    const detached = document.createElement('p')
    detached.textContent = 'detached'
    const shadow = document.getElementById('host').attachShadow({mode: 'open'})
    shadow.innerHTML = '<span>shadow</span>'
    for (const node of [detached.firstChild, shadow.firstChild.firstChild]) {
      document.getSelection().selectAllChildren(document.body)
      upstream(node, 0, node, 2)
      const expected = snapshot()
      document.getSelection().selectAllChildren(document.body)
      selectBoundaries(document, node, 0, node, 2)
      expect(snapshot()).toEqual(expected)
      expect(expected.rangeCount).toBe(0)
    }
  })
})
