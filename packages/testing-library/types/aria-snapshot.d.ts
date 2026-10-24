// @ctrl/dom additions (not in @testing-library/dom): agent-oriented debugging output.
// See docs/agent-debugging.md in the repository.

export interface AriaSnapshotOptions {
  /** Include elements excluded from the accessibility tree, marked `[hidden]` (default false, like `*ByRole`). */
  hidden?: boolean
  /** Line budget; the rest becomes `# … N more lines` (default 200, or the `CTRL_DOM_DEBUG_LINES` env var). */
  maxLines?: number
  /** Truncate names, values and text to this many characters (default 100). */
  maxTextLength?: number
  /** Runs of more than this many same-role siblings print the first ones and `- role … (+N more)` (default 5; `Infinity` disables). */
  collapseAfter?: number
  /** Print link targets as `- /url: …` children (default false). */
  urls?: boolean
}

/**
 * The accessibility tree of `container` (default `document.body`) in Playwright's aria snapshot
 * YAML (https://playwright.dev/docs/aria-snapshots): roles, accessible names, the states
 * `*ByRole` filters on (`[checked]`, `[disabled]`, `[expanded]`, `[pressed]`, `[selected]`,
 * `[level=N]`, `[current=…]`), textbox/slider values after the colon, text, and `[active]` on
 * the focused element. Elements without a role are skipped (their children hoisted). Computed
 * with the same role/name/hidden rules as `*ByRole`, so it shows exactly what queries match.
 *
 * A token-cheap alternative to `prettyDOM` for reading a failing test:
 *
 * ```
 * - heading "Checkout" [level=1]
 * - textbox "Email" [active]: ada@example.com
 * - checkbox "Remember me" [checked]
 * - button "Pay" [disabled]
 * ```
 */
export function ariaSnapshot(
  container?: Element | Document | DocumentFragment,
  options?: AriaSnapshotOptions,
): string

/**
 * A compact diff of two `ariaSnapshot()` results: removed lines (`- `), added lines (`+ `) and
 * their unchanged parent lines as context; `"(no changes)"` when equal.
 */
export function diffAriaSnapshots(before: string, after: string): string
