/**
 * getTabDestination (packages/user-event/src/utils/focus/getTabDestination.ts) reads each
 * tabindex once and skips the sort when every value is 0; it must pick the element upstream's
 * function picks, for any mix of tabindex values (positive, negative, zero, missing, invalid),
 * disabled controls and radio groups.
 *
 * Specs: HTML — sequential focus navigation order: https://html.spec.whatwg.org/#sequential-focus-navigation-order
 *   (user-event approximates it; the oracle here is upstream, not the spec)
 * Upstream: https://github.com/testing-library/user-event/blob/v14.6.8/src/utils/focus/getTabDestination.ts
 */
import {describe, expect, test} from 'vitest'
import {getTabDestination} from '../../src/utils/focus/getTabDestination.ts'
import {FOCUSABLE_SELECTOR} from '../../src/utils/focus/selector.ts'
import {isDisabled} from '../../src/utils/misc/isDisabled.ts'
import {isElementType} from '../../src/utils/misc/isElementType.ts'
import {isVisible} from '../../src/utils/misc/isVisible.ts'

/** mulberry32: a seeded PRNG whose every output bit is usable (an LCG's low bits cycle). */
function mulberry32(seed: number): (n: number) => number {
  let a = seed >>> 0
  return n => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n) | 0
  }
}

/** Upstream's function, verbatim apart from types. */
function upstream(activeElement: any, shift: boolean): any {
  const document = activeElement.ownerDocument
  const focusableElements = document.querySelectorAll(FOCUSABLE_SELECTOR)
  const enabledElements = Array.from(
    focusableElements as ArrayLike<any>,
  ).filter(
    el =>
      el === activeElement ||
      !(Number(el.getAttribute('tabindex')) < 0 || isDisabled(el)),
  )
  if (Number(activeElement.getAttribute('tabindex')) >= 0) {
    enabledElements.sort((a, b) => {
      const i = Number(a.getAttribute('tabindex'))
      const j = Number(b.getAttribute('tabindex'))
      if (i === j) return 0
      else if (i === 0) return 1
      else if (j === 0) return -1
      return i - j
    })
  }
  const checkedRadio: Record<string, any> = {}
  let prunedElements = [document.body]
  const activeRadioGroup = isElementType(activeElement, 'input', {
    type: 'radio',
  })
    ? activeElement.name
    : undefined
  enabledElements.forEach(el => {
    if (isElementType(el, 'input', {type: 'radio'}) && el.name) {
      if (el === activeElement) {
        prunedElements.push(el)
        return
      } else if (el.name === activeRadioGroup) {
        return
      }
      if (el.checked) {
        prunedElements = prunedElements.filter(
          e => !isElementType(e, 'input', {type: 'radio', name: el.name}),
        )
        prunedElements.push(el)
        checkedRadio[el.name] = el
        return
      }
      if (typeof checkedRadio[el.name] !== 'undefined') return
    }
    prunedElements.push(el)
  })
  for (let index = prunedElements.findIndex(el => el === activeElement); ;) {
    index += shift ? -1 : 1
    if (index === prunedElements.length) index = 0
    else if (index === -1) index = prunedElements.length - 1
    if (
      prunedElements[index] === activeElement ||
      prunedElements[index] === document.body ||
      isVisible(prunedElements[index])
    ) {
      return prunedElements[index]
    }
  }
}

function outcome(f: () => unknown): unknown {
  try {
    return f()
  } catch (e) {
    return `throws ${String(e)}`
  }
}

const TABINDEX = [null, null, null, '0', '-1', '1', '2', '3', 'x', ' 2 ', '1e1']

describe('getTabDestination — https://html.spec.whatwg.org/#sequential-focus-navigation-order', () => {
  test('picks what upstream picks from every element, both directions, over 200 random forms', () => {
    const rnd = mulberry32(7)
    for (let round = 0; round < 200; round++) {
      let html = ''
      for (let i = 0; i < 12; i++) {
        const t = TABINDEX[rnd(TABINDEX.length)]
        const ti = t === null ? '' : ` tabindex="${t}"`
        const dis = rnd(6) === 0 ? ' disabled' : ''
        switch (rnd(5)) {
          case 0:
            html += `<input${ti}${dis}>`
            break
          case 1:
            html += `<button${ti}${dis}>b</button>`
            break
          case 2:
            html += `<input type="radio" name="g${rnd(2)}"${rnd(3) === 0 ? ' checked' : ''}${ti}${dis}>`
            break
          case 3:
            html += `<div${t === null ? ' tabindex="0"' : ti}>d</div>`
            break
          default:
            html += `<a href="#"${ti}>a</a>`
        }
      }
      document.body.innerHTML = html
      const candidates = [document.body, ...Array.from(document.body.children)]
      for (const active of candidates) {
        for (const shift of [false, true]) {
          // Shift+Tab from an element missing from the list (disabled, negative tabindex) throws
          // in upstream too (its index walks to -2): compare outcomes, errors included.
          expect(outcome(() => getTabDestination(active as any, shift))).toBe(
            outcome(() => upstream(active, shift)),
          )
        }
      }
    }
  })
})
