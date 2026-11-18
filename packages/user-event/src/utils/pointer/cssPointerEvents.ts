// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/utils/pointer/cssPointerEvents.ts

import {getComputedStyleOverride, pointerEvents} from '@ctrl/dom/internal'
import {implOf} from '../../ctrl-dom.ts'
import type {
  Element,
  HTMLInputElement,
  HTMLLabelElement,
} from '../../dom-types.ts'
import {PointerEventsCheckLevel} from '../../options.ts'
import {type Instance} from '../../setup/index.ts'
import {getWindow} from '../misc/getWindow.ts'
import {isElementType} from '../misc/isElementType.ts'
import type {LevelRefs} from '../misc/level.ts'

export function hasPointerEvents(
  instance: Instance,
  element: Element,
): boolean {
  return checkPointerEvents(instance, element) === undefined
}

// Most blocked checks resolve on the target. A fallback style implementation may
// require walking ancestors. A target can outlive any of those ancestors.
type Blocked = true | WeakRef<Element>[]

function blockedPointerEventsTree(element: Element): Blocked | undefined {
  const window = getWindow(element)
  const impl = implOf(element)
  if (
    impl &&
    typeof window.getComputedStyle === 'function' &&
    getComputedStyleOverride(impl) === null
  ) {
    // Our cascade resolves inheritance on the element itself. Only blocked interactions need a diagnostic tree.
    const value = pointerEvents(impl)
    if (value === 'none') return true
    if (value && value !== 'inherit' && value !== 'unset') return undefined
  }

  for (
    let el: Element | null = element, ancestors: Element[] | undefined;
    el?.ownerDocument;
    el = el.parentElement
  ) {
    if (el !== element) (ancestors ??= []).push(el)
    const pointerEvents = window.getComputedStyle(el).pointerEvents
    if (pointerEvents === 'none')
      return ancestors?.map(ancestor => new WeakRef(ancestor)) ?? true
    if (
      pointerEvents &&
      pointerEvents !== 'inherit' &&
      pointerEvents !== 'unset'
    )
      break
  }

  return undefined
}

const PointerEventsCheck = Symbol('Last check for pointer-events')
type PointerEventsCheckable = Element & {
  [PointerEventsCheck]?: LevelRefs & {result: Blocked | undefined}
}

function checkPointerEvents(
  instance: Instance,
  element: PointerEventsCheckable,
) {
  const lastCheck = element[PointerEventsCheck]
  const {call, trigger} = instance.levelRefs
  const level = instance.config.pointerEventsCheck

  const needsCheck =
    level !== PointerEventsCheckLevel.Never &&
    (!lastCheck ||
      (hasBitFlag(level, PointerEventsCheckLevel.EachApiCall) &&
        lastCheck.call !== call) ||
      (hasBitFlag(level, PointerEventsCheckLevel.EachTrigger) &&
        lastCheck.trigger !== trigger))

  if (!needsCheck) {
    return lastCheck?.result
  }

  const result = blockedPointerEventsTree(element)
  if (lastCheck) {
    lastCheck.call = call
    lastCheck.trigger = trigger
    lastCheck.result = result
  } else {
    element[PointerEventsCheck] = {call, trigger, result}
  }
  return result
}

export function assertPointerEvents(instance: Instance, element: Element) {
  const blocked = checkPointerEvents(instance, element)

  if (blocked) {
    const tree =
      blocked === true
        ? [element]
        : [...blocked.map(ref => ref.deref()).reverse(), element]
    throw new Error(
      [
        `Unable to perform pointer interaction as the element ${
          tree.length > 1 ? 'inherits' : 'has'
        } \`pointer-events: none\`:`,
        '',
        printTree(tree),
      ].join('\n'),
    )
  }
}

function printTree(tree: Array<Element | undefined>) {
  return tree
    .map((el, i) =>
      [
        ''.padEnd(i),
        el?.tagName ?? '(removed element)',
        el?.id && `#${el.id}`,
        el?.hasAttribute('data-testid') &&
          `(testId=${el.getAttribute('data-testid')})`,
        el && getLabelDescr(el),
        tree.length > 1 &&
          i === 0 &&
          '  <-- This element declared `pointer-events: none`',
        tree.length > 1 &&
          i === tree.length - 1 &&
          '  <-- Asserted pointer events here',
      ]
        .filter(Boolean)
        .join(''),
    )
    .join('\n')
}

function getLabelDescr(element: Element) {
  let label: string | undefined | null
  if (element.hasAttribute('aria-label')) {
    label = element.getAttribute('aria-label') as string
  } else if (element.hasAttribute('aria-labelledby')) {
    label = element.ownerDocument
      .getElementById(element.getAttribute('aria-labelledby') as string)
      ?.textContent?.trim()
  } else if (
    isElementType(element, [
      'button',
      'input',
      'meter',
      'output',
      'progress',
      'select',
      'textarea',
    ]) &&
    (element as HTMLInputElement).labels?.length
  ) {
    label = Array.from((element as HTMLInputElement).labels!)
      .map((el: HTMLLabelElement) => el.textContent?.trim())
      .join('|')
  } else if (isElementType(element, 'button')) {
    label = element.textContent?.trim()
  }
  label = label?.replace(/\n/g, '  ')
  if (Number(label?.length) > 30) {
    label = `${label?.substring(0, 29)}…`
  }
  return label ? `(label=${label})` : ''
}

// With the eslint rule and prettier the bitwise operation isn't nice to read
function hasBitFlag(conf: number, flag: number) {
  return (conf & flag) > 0
}
