// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/tests/_helpers/setup.ts
//
// @ts-nocheck -- ported verbatim; upstream types these tests against lib.dom, which this monorepo
// does not load (we are the DOM). Vitest does not typecheck; src/ is fully typed.

import {addListeners, EventHandlers} from './listeners.ts'
import {evaluateXPath} from './xpath.ts'
import userEvent from '#src/index.ts'
import {Options} from '#src/options.ts'
import {FOCUSABLE_SELECTOR} from '#src/utils/index.ts'
import {setSelection} from '#src/event/selection/index.ts'

export function render<Elements extends Element | Element[] = HTMLElement>(
  ui: string,
  {
    eventHandlers,
    focus,
    selection,
  }: {
    eventHandlers?: EventHandlers
    focus?: string | false
    selection?: {
      focusNode?: string
      anchorNode?: string
      focusOffset?: number
      anchorOffset?: number
    }
  } = {},
) {
  const div = document.createElement('div')
  div.innerHTML = ui.trim()
  document.body.append(div)

  if (typeof focus === 'string') {
    ;(assertSingleNodeFromXPath(focus, div) as HTMLElement).focus()
  } else if (focus !== false) {
    ;(div.querySelector(FOCUSABLE_SELECTOR) as HTMLElement | undefined)?.focus()
  }

  if (selection) {
    const focusNode =
      typeof selection.focusNode === 'string'
        ? assertSingleNodeFromXPath(selection.focusNode, div)
        : document.activeElement
    const anchorNode =
      typeof selection.anchorNode === 'string'
        ? assertSingleNodeFromXPath(selection.anchorNode, div)
        : focusNode
    const focusOffset = selection.focusOffset ?? 0
    const anchorOffset = selection.anchorOffset ?? focusOffset

    if (!focusNode || !anchorNode) {
      throw new Error(`missing/invalid selection.focusNode`)
    }
    setSelection({
      focusNode,
      anchorNode,
      focusOffset,
      anchorOffset,
    })
  }

  type ElementsArray = Elements extends Array<Element> ? Elements : [Elements]
  // The HTMLCollection in lib.d.ts does not allow array access
  type ElementsCollection = HTMLCollection &
    ElementsArray & {
      item<N extends number>(i: N): ElementsArray[N]
    }

  return {
    element: div.firstChild as ElementsArray[0],
    elements: div.children as ElementsCollection,
    ...addListeners(Array.from(div.children), {
      eventHandlers,
    }),
    xpathNode: <NodeType extends Node = HTMLElement>(xpath: string) =>
      assertSingleNodeFromXPath(xpath, div) as NodeType,
  }
}

function assertSingleNodeFromXPath(xpath: string, context: Node) {
  // Divergence: upstream uses `document.evaluate`; @rtd/dom has no XPath (not needed for
  // testing React components), so the tiny subset these tests use is evaluated in xpath.ts.
  const node = evaluateXPath(xpath, context)

  if (!node) {
    throw new Error(`invalid XPath: "${xpath}"`)
  }

  return node
}

export function setup<Elements extends Element | Element[] = HTMLElement>(
  ui: string,
  {
    eventHandlers,
    focus,
    selection,
    ...options
  }: Parameters<typeof render>[1] & Options = {},
) {
  return {
    user: userEvent.setup(options),
    ...render<Elements>(ui, {eventHandlers, focus, selection}),
  }
}
