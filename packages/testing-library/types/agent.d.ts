// @ctrl/dom additions (not in @testing-library/dom): `@ctrl/dom/testing-library/agent`, the
// support behind jest-dom's `toMatchAriaSnapshot` and the failure snapshots of the agent debug
// mode. See docs/agent-debugging.md in the repository.

/** One line of a template-vs-tree diff: `=` equal, `-` only in the template, `+` only in the tree. */
export interface AriaSnapshotDiffLine {
  kind: '=' | '-' | '+'
  text: string
}

export interface AriaSnapshotMatch {
  /** Whether the accessibility tree contains the template (Playwright's partial matching). */
  pass: boolean
  /** The template in canonical form, one line per node. */
  expected(): string
  /** The template against the closest part of the tree, in the template's shape. */
  diff(): AriaSnapshotDiffLine[]
  /** The whole aria snapshot (budgeted, sibling runs not collapsed), usable as a template. */
  received(): string
}

/** A template that is not valid aria snapshot YAML. */
export class AriaTemplateError extends Error {}

/**
 * Matches the accessibility tree of `container` against an aria snapshot template with
 * Playwright's semantics (https://playwright.dev/docs/aria-snapshots): partial, ordered child
 * matching, names as strings or `/regex/`, `[checked]` / `[level=2]` states, `- text:` runs.
 */
export function matchAriaSnapshot(
  container: Element | Document | DocumentFragment,
  template: string,
): AriaSnapshotMatch

/** `CTRL_DOM_DEBUG` when it names an agent format, else null. */
export function envDebugFormat(): 'aria' | 'compact' | null

/** `document.body` when a test failed, for a failure report. */
export interface FailureSnapshot {
  format: 'aria' | 'compact'
  text: string
  full: string
  previous: string | undefined
}

/** Forget the previous snapshot (call when a test starts). */
export function resetFailureSnapshot(document: Document): void

/** Snapshot `document.body`; null when `CTRL_DOM_DEBUG` is unset. */
export function captureFailureSnapshot(document: Document): FailureSnapshot | null

/** The report appended to a failing test's error message. */
export function formatFailureSnapshot(snapshot: FailureSnapshot, errorMessage: string): string

/** Append text to an error's message and stack. */
export function appendToErrorMessage(error: unknown, text: string): boolean
