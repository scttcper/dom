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
// @ctrl/dom/internal always comes from the same @ctrl/dom as this package (it is one of its
// subpaths), so every hook below exists; what varies is whether a node is one of its nodes
// (implOf). The import is static: a top-level `await import()` would make the package an async ES
// module that `require()` and the CommonJS build cannot load.

import {
  $impl as importedImpl,
  NodeImpl as ImportedNodeImpl,
  T,
  attr,
  clearUIValue,
  getUISelection,
  getUIValue,
  setUISelection,
  setUIValue,
} from '@ctrl/dom/internal'
import type {NodeImpl} from '@ctrl/dom/internal'
import type {Element, Node} from './dom-types.ts'

// Read once: the CommonJS build reads an imported binding through rolldown's interop getter on
// every access, and implOf runs for most events user-event creates (Sentry's suite profile).
const $impl: typeof importedImpl = importedImpl
const NodeImplClass: typeof ImportedNodeImpl = ImportedNodeImpl

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

/** @ctrl/dom UI value/selection hooks. */
export const ctrlDomUI = {
  getUIValue,
  setUIValue,
  clearUIValue,
  getUISelection,
  setUISelection,
} as unknown as CtrlDomFormsUI

export {
  /**
   * Let `ms` of idle time pass on @ctrl/dom's idle-skipping clock (src/window/clock.ts), as a
   * real wait would there; false when a timer falls due in that time. True without such a clock.
   */
  skipIdleTime,
  /**
   * Whether `fn` is the setTimeout/setInterval of @ctrl/dom's active idle-skipping clock, or a
   * copy of its own properties (src/window/clock.ts): the timers created through it are the
   * clock's. False without such a clock.
   */
  isClockTimer,
  /**
   * Whether immediates other than @ctrl/dom's clock's own are queued (src/window/clock.ts);
   * without a clock, any queued immediate.
   */
  foreignImmediatesPending as immediatesPending,
  /**
   * `setImmediate(resolve)`; on @ctrl/dom's idle-skipping clock without the event-loop turn when
   * that turn would run nothing else (src/window/clock.ts, loopTurn).
   */
  loopTurn,
} from '@ctrl/dom/internal'

/** The NodeImpl behind an @ctrl/dom wrapper, or null for nodes of other DOM implementations. */
export function implOf(node: Node | null | undefined): NodeImpl | null {
  if (node == null) return null
  const impl = (node as {[$impl]?: unknown})[$impl]
  return impl instanceof NodeImplClass ? impl : null
}

/** `attr(el, lowercaseName)` and the tag ids of @ctrl/dom's node records (src/nodes), for walks that stay off the wrappers. */
export const implAttr: (el: NodeImpl, lowerName: string) => string | null = attr
export const TAGS: Record<string, number> = T

/** Whether `el` is an @ctrl/dom element, whose UI value and selection ctrlDomUI keeps. */
export function hasCtrlDomUI(el: Element): boolean {
  return implOf(el) !== null
}
