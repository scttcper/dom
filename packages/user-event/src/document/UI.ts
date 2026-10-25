// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/document/UI.ts
//
// Two implementations behind one API:
// - @ctrl/dom elements (when html-forms provides the hooks, see ../ctrl-dom.ts): the UI value and UI
//   selection are element state inside the DOM; no interceptors, no boxed values.
// - every other DOM: upstream's approach — the UI state is stored under symbols on the element
//   and written through the interceptors installed by prepareDocument (interceptor.ts).

import type {HTMLInputElement, HTMLTextAreaElement} from '../dom-types.ts'
import {hasCtrlDomUI, ctrlDomUI} from '../ctrl-dom.ts'

const UIValue = Symbol('Displayed value in UI')
const UISelection = Symbol('Displayed selection in UI')
const InitialValue = Symbol('Initial value to compare on blur')

type EditableElement = (HTMLInputElement | HTMLTextAreaElement) & {
  [UIValue]?: string
  [InitialValue]?: string
  [UISelection]?: UISelection
}

interface UISelection {
  anchorOffset: number
  focusOffset: number
}

export type UIValueString = string & {[UIValue]: true}
export type UISelectionStart = number & {[UISelection]: true}

export function isUIValue(
  value: string | UIValueString,
): value is UIValueString {
  return typeof value === 'object' && UIValue in value
}

export function isUISelectionStart(
  start: number | UISelectionStart | null,
): start is UISelectionStart {
  return !!start && typeof start === 'object' && UISelection in start
}

export function setUIValue(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
  const el = element as EditableElement
  if (el[InitialValue] === undefined) {
    el[InitialValue] = el.value
  }

  if (hasCtrlDomUI(el)) {
    ctrlDomUI!.setUIValue(el, value)
    return
  }

  el[UIValue] = value

  el.value = Object.assign(new String(value), {
    [UIValue]: true,
  }) as unknown as string
}

export function getUIValue(element: HTMLInputElement | HTMLTextAreaElement) {
  const el = element as EditableElement
  if (hasCtrlDomUI(el)) {
    return ctrlDomUI!.getUIValue(el)
  }
  return el[UIValue] === undefined ? el.value : String(el[UIValue])
}

/** Flag the IDL value as clean. This does not change the value. */
export function setUIValueClean(
  element: HTMLInputElement | HTMLTextAreaElement,
) {
  if (hasCtrlDomUI(element)) {
    ctrlDomUI!.clearUIValue(element)
    return
  }
  ;(element as EditableElement)[UIValue] = undefined
}

export function clearInitialValue(
  element: HTMLInputElement | HTMLTextAreaElement,
) {
  ;(element as EditableElement)[InitialValue] = undefined
}

export function getInitialValue(
  element: HTMLInputElement | HTMLTextAreaElement,
) {
  return (element as EditableElement)[InitialValue]
}

export function setUISelectionRaw(
  element: HTMLInputElement | HTMLTextAreaElement,
  selection: UISelection,
) {
  ;(element as EditableElement)[UISelection] = selection
}

export function setUISelection(
  element: HTMLInputElement | HTMLTextAreaElement,
  {
    focusOffset: focusOffsetParam,
    anchorOffset: anchorOffsetParam = focusOffsetParam,
  }: {
    anchorOffset?: number
    focusOffset: number
  },
  mode: 'replace' | 'modify' = 'replace',
) {
  const el = element as EditableElement
  const valueLength = getUIValue(el).length
  const sanitizeOffset = (o: number) => Math.max(0, Math.min(valueLength, o))

  if (hasCtrlDomUI(el)) {
    // @ctrl/dom stores start/end/direction like the selection API. user-event also needs the
    // anchor for 'modify' (shift-extend); it is remembered next to the DOM state and only
    // trusted while the DOM selection still matches it (a programmatic change resets it).
    const anchorOffset =
      mode === 'replace'
        ? sanitizeOffset(anchorOffsetParam)
        : getUISelection(el).anchorOffset
    const focusOffset = sanitizeOffset(focusOffsetParam)
    el[UISelection] = {anchorOffset, focusOffset}
    // Same direction upstream ends up with: it calls `setSelectionRange(start, end)`.
    ctrlDomUI!.setUISelection(
      el,
      Math.min(anchorOffset, focusOffset),
      Math.max(anchorOffset, focusOffset),
      'none',
    )
    return
  }

  const anchorOffset =
    mode === 'replace' || el[UISelection] === undefined
      ? sanitizeOffset(anchorOffsetParam)
      : el[UISelection].anchorOffset
  const focusOffset = sanitizeOffset(focusOffsetParam)

  const startOffset = Math.min(anchorOffset, focusOffset)
  const endOffset = Math.max(anchorOffset, focusOffset)

  el[UISelection] = {
    anchorOffset,
    focusOffset,
  }

  if (el.selectionStart === startOffset && el.selectionEnd === endOffset) {
    return
  }

  const startObj = Object.assign(new Number(startOffset), {
    [UISelection]: true,
  }) as unknown as number

  try {
    el.setSelectionRange(startObj, endOffset)
  } catch {
    // DOMException for invalid state is expected when calling this
    // on an element without support for setSelectionRange
  }
}

export type UISelectionRange = UISelection & {
  startOffset: number
  endOffset: number
}

export function getUISelection(
  element: HTMLInputElement | HTMLTextAreaElement,
): UISelectionRange {
  const el = element as EditableElement
  let sel: UISelection
  if (hasCtrlDomUI(el)) {
    const {start, end} = ctrlDomUI!.getUISelection(el)
    const remembered = el[UISelection]
    sel =
      remembered !== undefined &&
      Math.min(remembered.anchorOffset, remembered.focusOffset) === start &&
      Math.max(remembered.anchorOffset, remembered.focusOffset) === end
        ? remembered
        : {anchorOffset: start, focusOffset: end}
  } else {
    sel = el[UISelection] ?? {
      anchorOffset: el.selectionStart ?? 0,
      focusOffset: el.selectionEnd ?? 0,
    }
  }
  return {
    anchorOffset: sel.anchorOffset,
    focusOffset: sel.focusOffset,
    startOffset: Math.min(sel.anchorOffset, sel.focusOffset),
    endOffset: Math.max(sel.anchorOffset, sel.focusOffset),
  }
}

export function hasUISelection(
  element: HTMLInputElement | HTMLTextAreaElement,
) {
  return hasCtrlDomUI(element) || !!(element as EditableElement)[UISelection]
}

/** Flag the IDL selection as clean. This does not change the selection. */
export function setUISelectionClean(
  element: HTMLInputElement | HTMLTextAreaElement,
) {
  ;(element as EditableElement)[UISelection] = undefined
}
