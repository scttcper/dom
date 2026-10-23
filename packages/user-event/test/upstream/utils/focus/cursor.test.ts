// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/tests/utils/focus/cursor.ts
//
// @ts-nocheck -- ported verbatim; upstream types these tests against lib.dom, which this monorepo
// does not load (we are the DOM). Vitest does not typecheck; src/ is fully typed.

import cases from '#testHelpers/jest-in-case.ts'
import {getNextCursorPosition} from '#src/utils/index.ts'
import {setup} from '#testHelpers'
import {evaluateXPath} from '#testHelpers/xpath.ts'

cases<{
  html: string
  nodeSelector: string
  offset: number
  direction: -1 | 1
  inputType?: string
  expectedSelector?: string
  expectedOffset?: number
}>(
  'get next cursor position',
  ({
    html,
    nodeSelector,
    offset,
    direction,
    inputType,
    expectedSelector,
    expectedOffset,
  }) => {
    const {element} = setup(`<div>${html}</div>`)
    // divergence: `document.evaluate` -> evaluateXPath (no XPath in @rtd/dom), see _helpers/xpath.ts
    const node = evaluateXPath(nodeSelector, element)
    expect(node).toBeTruthy()
    const expectedNode = expectedSelector
      ? evaluateXPath(expectedSelector, element)
      : undefined
    expect(expectedNode)[expectedSelector ? 'toBeTruthy' : 'toBeFalsy']()

    document.getSelection()?.setPosition(node, offset)
    const nextPosition = getNextCursorPosition(
      node as Node,
      offset,
      direction,
      inputType,
    )

    expect(nextPosition?.node).toBe(expectedNode)
    if (expectedNode) {
      expect(nextPosition).toHaveProperty('offset', expectedOffset)
    }
  },
  {
    'in text node forwards': {
      html: `foobar`,
      nodeSelector: 'text()',
      offset: 3,
      direction: 1,
      expectedSelector: 'text()',
      expectedOffset: 4,
    },
    'in text node backwards': {
      html: `foobar`,
      nodeSelector: 'text()',
      offset: 3,
      direction: -1,
      expectedSelector: 'text()',
      expectedOffset: 2,
    },
    'across text nodes forwards': {
      html: `<span>foo</span><span>bar</span>`,
      nodeSelector: '*[1]/text()',
      offset: 3,
      direction: 1,
      expectedSelector: '*[2]/text()',
      expectedOffset: 1,
    },
    'across text nodes backwards': {
      html: `<span>foo</span><span>bar</span>`,
      nodeSelector: '*[2]/text()',
      offset: 0,
      direction: -1,
      expectedSelector: '*[1]/text()',
      expectedOffset: 2,
    },
    'to start of body backwards': {
      html: `foobar`,
      nodeSelector: 'text()',
      offset: 1,
      direction: -1,
      expectedSelector: 'text()',
      expectedOffset: 0,
    },
    'to start of contenteditable backwards': {
      html: `<span>foo</span><span contenteditable>bar</span>`,
      nodeSelector: '*[@contenteditable]/text()',
      offset: 1,
      direction: -1,
      expectedSelector: '*[@contenteditable]/text()',
      expectedOffset: 0,
    },
    'over input forwards': {
      html: `<span>foo</span><input type="checkbox"><span>bar</span>`,
      nodeSelector: 'span[1]/text()',
      offset: 3,
      direction: 1,
      expectedSelector: '.',
      expectedOffset: 2,
    },
    'over input backwards': {
      html: `<span>foo</span><input type="checkbox"><span>bar</span>`,
      nodeSelector: 'span[2]/text()',
      offset: 0,
      direction: -1,
      expectedSelector: '.',
      expectedOffset: 1,
    },
    'over line break forwards to text node': {
      html: `<span>foo</span><br/><span>bar</span>`,
      nodeSelector: 'span[1]/text()',
      offset: 3,
      direction: 1,
      expectedSelector: 'span[2]/text()',
      expectedOffset: 0,
    },
    'over line break backwards to text node': {
      html: `<span>foo</span><br/><span>bar</span>`,
      nodeSelector: 'span[2]/text()',
      offset: 0,
      direction: -1,
      expectedSelector: 'span[1]/text()',
      expectedOffset: 3,
    },
    'over line break forwards to checkbox': {
      html: `<span>foo</span><input type="checkbox"/><span></span><br/><span></span><input type="checkbox"/><span>bar</span>`,
      nodeSelector: '.',
      offset: 2,
      direction: 1,
      expectedSelector: '.',
      expectedOffset: 5,
    },
    'over line break backwards to checkbox': {
      html: `<span>foo</span><input type="checkbox"/><span></span><br/><span></span><input type="checkbox"/><span>bar</span>`,
      nodeSelector: '.',
      offset: 5,
      direction: -1,
      expectedSelector: '.',
      expectedOffset: 2,
    },
    'over line break forwards to line break': {
      html: `<span>foo</span><br/><div></div><br/><span>bar</span>`,
      nodeSelector: 'span[1]/text()',
      offset: 3,
      direction: 1,
      expectedSelector: '.',
      expectedOffset: 3,
    },
    'over line break backwards to line break': {
      html: `<span>foo</span><br/><div></div><br/><span>bar</span>`,
      nodeSelector: 'span[2]/text()',
      offset: 0,
      direction: -1,
      expectedSelector: '.',
      expectedOffset: 3,
    },
    'over line break forwards at edge of focus area': {
      html: `<span></span><br/><span>foo</span><br/><span></span>`,
      nodeSelector: 'span[2]/text()',
      offset: 3,
      direction: 1,
      expectedSelector: undefined,
      expectedOffset: undefined,
    },
    'over line break backwards at edge of focus area': {
      html: `<span></span><br/><span>foo</span><br/><span></span>`,
      nodeSelector: 'span[2]/text()',
      offset: 0,
      direction: -1,
      expectedSelector: undefined,
      expectedOffset: undefined,
    },
    'over line break backwards at edge of focus area when deleting': {
      html: `<span></span><br/><span>foo</span><br/><span></span>`,
      nodeSelector: 'span[2]/text()',
      offset: 0,
      direction: -1,
      inputType: 'deleteContentBackward',
      expectedSelector: '.',
      expectedOffset: 1,
    },
    'at edge of focus area': {
      html: `foo<span contenteditable>bar</span>baz`,
      nodeSelector: 'span/text()',
      offset: 3,
      direction: 1,
      expectedSelector: undefined,
      expectedOffset: undefined,
    },
    'over comment': {
      html: `<span>foo</span><!--comment--><span>bar</span>`,
      nodeSelector: 'span[1]/text()',
      offset: 3,
      direction: 1,
      expectedSelector: 'span[2]/text()',
      expectedOffset: 1,
    },
  },
)
