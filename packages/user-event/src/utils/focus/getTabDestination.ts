// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/utils/focus/getTabDestination.ts

import type {Element, HTMLInputElement} from '../../dom-types.ts'
import {implAttr, implOf} from '../../ctrl-dom.ts'
import {isDisabled} from '../misc/isDisabled.ts'
import {isElementType} from '../misc/isElementType.ts'
import {isVisible} from '../misc/isVisible.ts'
import {FOCUSABLE_SELECTOR} from './selector.ts'

/** `Number(el.getAttribute('tabindex'))`, off the wrapper on @ctrl/dom. */
function tabIndexAttr(el: Element): number {
  const impl = implAttr === undefined ? null : implOf(el)
  return Number(
    impl === null ? el.getAttribute('tabindex') : implAttr!(impl, 'tabindex'),
  )
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

  // Ours: each tabindex is read once (upstream's comparator read two per comparison, so a Tab in
  // a 1,000-control form did ~20,000 getAttribute calls), and the sort is skipped when every
  // value is 0: the comparator then returns 0 throughout and the stable sort keeps the order.
  let enabledElements: Element[] = []
  const tabIndexes: number[] = []
  let anyNonZero = false
  for (let k = 0; k < focusableElements.length; k++) {
    const el = focusableElements[k] as Element
    const tabIndex = tabIndexAttr(el)
    if (el === activeElement || !(tabIndex < 0 || isDisabled(el))) {
      enabledElements.push(el)
      tabIndexes.push(tabIndex)
      if (tabIndex !== 0) anyNonZero = true
    }
  }

  // tabindex has no effect if the active element has negative tabindex
  if (anyNonZero && tabIndexAttr(activeElement) >= 0) {
    const order = enabledElements.map((el, k) => ({
      el,
      tabIndex: tabIndexes[k]!,
    }))
    order.sort((a, b) => compareTabIndex(a.tabIndex, b.tabIndex))
    enabledElements = order.map(o => o.el)
  }

  const checkedRadio: Record<string, HTMLInputElement> = {}
  let prunedElements = [document.body]
  const activeRadioGroup = isElementType(activeElement, 'input', {
    type: 'radio',
  })
    ? activeElement.name
    : undefined
  enabledElements.forEach(currentElement => {
    const el = currentElement as HTMLInputElement

    // For radio groups keep only the active radio
    // If there is no active radio, keep only the checked radio
    // If there is no checked radio, treat like everything else
    if (isElementType(el, 'input', {type: 'radio'}) && el.name) {
      // If the active element is part of the group, add only that
      if (el === activeElement) {
        prunedElements.push(el)
        return
      } else if (el.name === activeRadioGroup) {
        return
      }

      // If we stumble upon a checked radio, remove the others
      if (el.checked) {
        prunedElements = prunedElements.filter(
          e => !isElementType(e, 'input', {type: 'radio', name: el.name}),
        )
        prunedElements.push(el)
        checkedRadio[el.name] = el
        return
      }

      // If we already found the checked one, skip
      if (typeof checkedRadio[el.name] !== 'undefined') {
        return
      }
    }

    prunedElements.push(el)
  })

  for (let index = prunedElements.findIndex(el => el === activeElement); ;) {
    index += shift ? -1 : 1

    // loop at overflow
    if (index === prunedElements.length) {
      index = 0
    } else if (index === -1) {
      index = prunedElements.length - 1
    }

    if (
      prunedElements[index] === activeElement ||
      prunedElements[index] === document.body ||
      isVisible(prunedElements[index])
    ) {
      return prunedElements[index]
    }
  }
}
