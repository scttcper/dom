// Fast paths for nodes owned by @ctrl/dom.
//
// user-event works on any DOM (it must, to be a drop-in on jsdom/happy-dom too), but when the
// node is an @ctrl/dom wrapper it can skip the public API and use @ctrl/dom/internal:
//
// - UI value / UI selection: upstream patches `value`, `setSelectionRange`, `selectionStart`,
//   `selectionEnd`, `select` and `setRangeText` on every focused <input>/<textarea> instance
//   (document/interceptor.ts) to tell programmatic writes from simulated user input, which costs
//   six `defineProperty` calls per element and boxed `String`/`Number` objects per keystroke.
//   @ctrl/dom keeps the UI value and UI selection as element state and exposes them through
//   `getUIValue/setUIValue/getUISelection/setUISelection` (src/html/forms/ui.ts), so React's
//   `_valueTracker` (an own `value` property React installs on the node) never sees simulated
//   input — exactly what the interceptor achieves on jsdom — without touching the element.
// - Tree/attribute reads (isElementType, isDisabled, getTreeDiff, focusability) walk NodeImpl.
// - CSS reads (`pointer-events`, `display`, `visibility`) go through css/internal.ts.
//
// Each hook is used only when @ctrl/dom/internal actually exports it (the import is static: a
// top-level `await import()` would make the package an async ES module that `require()` and the
// CommonJS build cannot load). Expected contracts are
// documented on `CtrlDomFormsUI` / `CtrlDomCss`.

import * as ctrlDomInternal from '@ctrl/dom/internal'
import type {NodeImpl} from '@ctrl/dom/internal'
import type {Element, Node} from './dom-types.ts'
import {$impl} from '@ctrl/dom/internal'

/**
 * @ctrl/dom html-forms UI state (`src/html/forms/ui.ts`, re-exported from `@ctrl/dom/internal`).
 * All functions take the public wrapper of an <input> or <textarea>.
 */
export interface CtrlDomFormsUI {
  /** The value as displayed in the UI (unsanitized; e.g. "1e" while typing into type=number). */
  getUIValue(el: Element): string
  /**
   * Set the value as a user edit: sanitizes, sets the dirty value flag, keeps the raw UI value,
   * and never invokes an own-property `value` setter on the instance (React's value tracker
   * does not observe it). Fires no events.
   */
  setUIValue(el: Element, value: string): void
  /** Forget the UI value (the next getUIValue returns `.value`). */
  clearUIValue(el: Element): void
  /** UI selection; available for every value-mode input type, not only those supporting the selection API. */
  getUISelection(el: Element): {
    start: number
    end: number
    direction: 'forward' | 'backward' | 'none'
  }
  /** Set the UI selection (clamped to the UI value). Fires no events. */
  setUISelection(
    el: Element,
    start: number,
    end?: number,
    direction?: 'forward' | 'backward' | 'none',
  ): void
}

/**
 * Contract expected from @ctrl/dom css (`src/css/internal.ts`).
 *
 * TODO(css): export from `@ctrl/dom/internal`.
 */
export interface CtrlDomCss {
  /** Computed value of `property` for the element (specified + inherited, no layout). */
  computedValue(el: NodeImpl, property: string): string
  isDisplayNone(el: NodeImpl): boolean
  isVisibilityHidden(el: NodeImpl): boolean
}

type InternalModule = Record<string, unknown>

const internal: InternalModule | null =
  ctrlDomInternal as unknown as InternalModule

function pick<T>(names: Array<keyof T & string>): T | null {
  if (internal === null) return null
  const out = {} as Record<string, unknown>
  for (const name of names) {
    const fn = internal[name]
    if (typeof fn !== 'function') return null
    out[name] = fn
  }
  return out as T
}

/** @ctrl/dom UI value/selection hooks, or null while html-forms does not provide them. */
export const ctrlDomUI: CtrlDomFormsUI | null = pick<CtrlDomFormsUI>([
  'getUIValue',
  'setUIValue',
  'clearUIValue',
  'getUISelection',
  'setUISelection',
])

/** @ctrl/dom computed-style fast reads, or null while css does not provide them. */
export const ctrlDomCss: CtrlDomCss | null = pick<CtrlDomCss>([
  'computedValue',
  'isDisplayNone',
  'isVisibilityHidden',
])

const skipIdle = internal?.skipIdleTime as ((ms: number) => boolean) | undefined

/**
 * Let `ms` of idle time pass on @ctrl/dom's idle-skipping clock (src/window/clock.ts), as a real
 * wait would there; false when a timer falls due in that time. True without such a clock.
 */
export function skipIdleTime(ms: number): boolean {
  return skipIdle === undefined || skipIdle(ms)
}

const foreignImmediates = internal?.foreignImmediatesPending as
  | (() => boolean | null)
  | undefined

/**
 * Whether immediates other than @ctrl/dom's clock's own are queued (src/window/clock.ts); on
 * another DOM, any queued immediate. False when Node cannot tell.
 */
export function immediatesPending(): boolean {
  if (foreignImmediates !== undefined) return foreignImmediates() === true
  if (
    typeof process !== 'object' ||
    typeof process.getActiveResourcesInfo !== 'function'
  )
    return false
  return process.getActiveResourcesInfo().includes('Immediate')
}

const NodeImplClass = (internal?.NodeImpl ?? null) as
  | (abstract new (...args: never[]) => NodeImpl)
  | null

/** The NodeImpl behind an @ctrl/dom wrapper, or null for nodes of other DOM implementations. */
export function implOf(node: Node | null | undefined): NodeImpl | null {
  if (NodeImplClass === null || node == null) return null
  const impl = (node as {[$impl]?: unknown})[$impl]
  return impl instanceof NodeImplClass ? impl : null
}

/** Whether `el` is an @ctrl/dom element and the html-forms UI hooks are available. */
export function hasCtrlDomUI(el: Element): boolean {
  return ctrlDomUI !== null && implOf(el) !== null
}
