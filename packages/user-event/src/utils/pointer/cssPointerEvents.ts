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
import {ApiLevel, getLevelRef} from '../misc/level.ts'

export function hasPointerEvents(
  instance: Instance,
  element: Element,
): boolean {
  return checkPointerEvents(instance, element) === undefined
}

function blockedPointerEventsTree(element: Element): Element[] | undefined {
  const window = getWindow(element)
  const impl = implOf(element)
  if (
    impl &&
    typeof window.getComputedStyle === 'function' &&
    getComputedStyleOverride(impl) === null
  ) {
    // Our cascade resolves inheritance on the element itself. Only blocked interactions need a diagnostic tree.
    const value = pointerEvents(impl)
    if (value === 'none') return [element]
    if (value && value !== 'inherit' && value !== 'unset') return undefined
  }

  for (
    let el: Element | null = element, tree: Element[] = [];
    el?.ownerDocument;
    el = el.parentElement
  ) {
    tree.push(el)
    const pointerEvents = window.getComputedStyle(el).pointerEvents
    if (pointerEvents && !['inherit', 'unset'].includes(pointerEvents)) {
      return pointerEvents === 'none' ? tree : undefined
    }
  }

  return undefined
}

const PointerEventsCheck = Symbol('Last check for pointer-events')
type PointerEventsCheckable = Element & {
  [PointerEventsCheck]?: {
    [k in ApiLevel]?: object
  } & {
    result: Element[] | undefined
  }
}

function checkPointerEvents(
  instance: Instance,
  element: PointerEventsCheckable,
) {
  const lastCheck = element[PointerEventsCheck]

  const needsCheck =
    instance.config.pointerEventsCheck !==
      (PointerEventsCheckLevel.Never as number) &&
    (!lastCheck ||
      (hasBitFlag(
        instance.config.pointerEventsCheck,
        PointerEventsCheckLevel.EachApiCall,
      ) &&
        lastCheck[ApiLevel.Call] !== getLevelRef(instance, ApiLevel.Call)) ||
      (hasBitFlag(
        instance.config.pointerEventsCheck,
        PointerEventsCheckLevel.EachTrigger,
      ) &&
        lastCheck[ApiLevel.Trigger] !==
          getLevelRef(instance, ApiLevel.Trigger)))

  if (!needsCheck) {
    return lastCheck?.result
  }

  const tree = blockedPointerEventsTree(element)

  element[PointerEventsCheck] = {
    [ApiLevel.Call]: getLevelRef(instance, ApiLevel.Call),
    [ApiLevel.Trigger]: getLevelRef(instance, ApiLevel.Trigger),
    result: tree,
  }

  return tree
}

export function assertPointerEvents(instance: Instance, element: Element) {
  const tree = checkPointerEvents(instance, element)

  if (tree) {
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

function printTree(tree: Element[]) {
  return tree
    .reverse()
    .map((el, i) =>
      [
        ''.padEnd(i),
        el.tagName,
        el.id && `#${el.id}`,
        el.hasAttribute('data-testid') &&
          `(testId=${el.getAttribute('data-testid')})`,
        getLabelDescr(el),
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
