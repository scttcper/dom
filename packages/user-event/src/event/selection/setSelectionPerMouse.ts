// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/event/selection/setSelectionPerMouse.ts

import type {Document, Element, Node, Range} from '../../dom-types.ts'
import {getUIValue, setUISelection} from '../../document/index.ts'
import {hasNoSelection, hasOwnSelection} from '../../utils/index.ts'
import {type SelectionRange} from './index.ts'
import {resolveCaretPosition} from './resolveCaretPosition.ts'
import {selectBoundaries} from './selectBoundaries.ts'

export function setSelectionPerMouseDown({
  document,
  target,
  clickCount,
  node,
  offset,
}: {
  document: Document
  target: Element
  clickCount: number
  node?: Node
  offset?: number
}): Range | SelectionRange | undefined {
  if (hasNoSelection(target)) {
    return
  }
  const targetHasOwnSelection = hasOwnSelection(target)

  // Only a double or triple click at a text offset needs the target's full text.
  const expand = !node && clickCount % 3 !== 1
  const text = targetHasOwnSelection
    ? String(getUIValue(target))
    : expand
      ? String(target.textContent)
      : ''
  const [start, end] = expand
    ? getTextRange(text, offset, clickCount)
    : [offset, offset]

  // TODO: implement modifying selection per shift/ctrl+mouse
  if (targetHasOwnSelection) {
    setUISelection(target, {
      anchorOffset: start ?? text.length,
      focusOffset: end ?? text.length,
    })
    return {
      node: target,
      start: start ?? 0,
      end: end ?? text.length,
    }
  } else {
    const startPosition = resolveCaretPosition({
      target,
      node,
      offset: start,
    })
    const endPosition =
      start === end
        ? startPosition
        : resolveCaretPosition({target, node, offset: end})

    const range = target.ownerDocument.createRange()
    try {
      range.setStart(startPosition.node, startPosition.offset)
      range.setEnd(endPosition.node, endPosition.offset)
    } catch {
      throw new Error('The given offset is out of bounds.')
    }

    // Upstream adds a clone of the range to the selection.
    selectBoundaries(
      document,
      range.startContainer,
      range.startOffset,
      range.endContainer,
      range.endOffset,
    )

    return range
  }
}

function getTextRange(
  text: string,
  pos: number | undefined,
  clickCount: number,
) {
  if (text.length === 0) {
    return [pos, pos]
  }

  const textPos = pos ?? text.length
  if (clickCount % 3 === 2) {
    return [
      textPos -
        (text.substr(0, pos).match(/(\w+|\s+|\W)?$/) as RegExpMatchArray)[0]
          .length,
      pos === undefined
        ? pos
        : pos +
          (text.substr(pos).match(/^(\w+|\s+|\W)?/) as RegExpMatchArray)[0]
            .length,
    ]
  }

  // triple click
  return [
    textPos -
      (text.substr(0, pos).match(/[^\r\n]*$/) as RegExpMatchArray)[0].length,
    pos === undefined
      ? pos
      : pos +
        (text.substr(pos).match(/^[^\r\n]*/) as RegExpMatchArray)[0].length,
  ]
}
