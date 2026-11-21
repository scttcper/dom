// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/utils/focus/getTabDestination.ts

import {F_TABINDEX_ATTR} from '@ctrl/dom/internal'
import type {Element} from '../../dom-types.ts'
import {implAttr, implOf} from '../../ctrl-dom.ts'
import {isDisabled} from '../misc/isDisabled.ts'
import {isElementType} from '../misc/isElementType.ts'
import {isVisible} from '../misc/isVisible.ts'
import {FOCUSABLE_SELECTOR} from './selector.ts'

/** `Number(el.getAttribute('tabindex'))`, off the wrapper on @ctrl/dom. */
function tabIndexAttr(el: Element): number {
  const impl = implAttr === undefined ? null : implOf(el)
  if (impl === null) return Number(el.getAttribute('tabindex'))
  return (impl.flags & F_TABINDEX_ATTR) === 0
    ? 0
    : Number(implAttr!(impl, 'tabindex'))
}

/** Upstream's sort comparator, over the tabindex values. */
function compareTabIndex(i: number, j: number): number {
  if (i === j) {
    return 0
  } else if (i === 0) {
    return 1
  } else if (j === 0) {
    return -1
  }
  return i - j
}

export function getTabDestination(activeElement: Element, shift: boolean) {
  const document = activeElement.ownerDocument
  const focusableElements = document.querySelectorAll(FOCUSABLE_SELECTOR)

  // Most forms use document order. Only save explicit nonzero values if we need to sort.
  let elements: Element[] = []
  let tabIndexes: number[] | undefined
  for (let k = 0, n = focusableElements.length; k < n; k++) {
    const el = focusableElements[k] as Element
    const tabIndex = tabIndexAttr(el)
    if (el === activeElement || !(tabIndex < 0)) {
      if (tabIndex !== 0) {
        tabIndexes ??= []
        tabIndexes[elements.length] = tabIndex
      }
      elements.push(el)
    }
  }

  // tabindex has no effect if the active element has negative tabindex
  if (tabIndexes && tabIndexAttr(activeElement) >= 0) {
    // Invalid tabindex values compare as NaN. Match the upstream stable sort by removing
    // disabled elements first. In document order we can skip them as we look for the next stop.
    const indexes = tabIndexes
    const order: number[] = []
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i]!
      if (el === activeElement || !isDisabled(el)) order.push(i)
    }
    order.sort((a, b) => compareTabIndex(indexes[a] ?? 0, indexes[b] ?? 0))
    elements = order.map(i => elements[i]!)
  }

  elements.unshift(document.body)
  const stops = pruneRadioGroups(elements, activeElement)
  for (let index = stops.indexOf(activeElement); ;) {
    index += shift ? -1 : 1

    // loop at overflow
    if (index === stops.length) {
      index = 0
    } else if (index === -1) {
      index = stops.length - 1
    }

    const el = stops[index]
    if (el === null) continue
    if (el === activeElement || el === document.body) return el
    if (!isDisabled(el) && isVisible(el)) return el
  }
}

/** Mark skipped radios in place. A checked radio only supersedes earlier stops in its own group. */
function pruneRadioGroups(stops: (Element | null)[], active: Element) {
  const activeGroup =
    isElementType(active, 'input') && active.type === 'radio'
      ? active.name
      : undefined
  // Upstream's plain object also affects radio names such as "constructor".
  const checked: Record<string, Element> = {}
  let positions: Map<string, number[]> | undefined
  // The body at index zero is always a stop.
  for (let i = 1; i < stops.length; i++) {
    const el = stops[i]!
    if (!isElementType(el, 'input') || el.type !== 'radio' || el === active)
      continue
    const name = el.name
    if (!name) continue
    // A disabled radio is no stop and its checkedness supersedes nothing. Only a checked one is
    // asked (a climb to the root each): an unchecked one that stays in the list is passed over
    // as disabled by the caller's walk, which asks every candidate anyway.
    const isChecked = el.checked
    if (name === activeGroup || (isChecked && isDisabled(el))) {
      stops[i] = null
      continue
    }
    positions ??= new Map()
    const group = positions.get(name)
    if (isChecked) {
      // Across forms, multiple radios of the same name can be checked. Keep the last in tab order.
      checked[name] = el
      if (group) {
        for (const index of group) stops[index] = null
        group.length = 0
      }
    } else if (checked[name] !== undefined) {
      stops[i] = null
      continue
    }
    if (group) group.push(i)
    else positions.set(name, [i])
  }
  return stops
}
