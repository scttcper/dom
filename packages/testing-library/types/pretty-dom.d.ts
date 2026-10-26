// Difference: upstream imports these from pretty-format, which @ctrl/dom does not install (./pretty-format.d.ts).
import * as prettyFormat from './pretty-format.js'
import {AriaSnapshotOptions} from './aria-snapshot.js'

export interface PrettyDOMOptions extends prettyFormat.OptionsReceived {
  /**
   * Given a `Node` return `false` if you wish to ignore that node in the output.
   * By default, ignores `<style />`, `<script />` and comment nodes.
   */
  filterNode?: (node: Node) => boolean
  /**
   * @ctrl/dom addition. `"pretty"`: upstream's HTML. `"aria"`: the accessibility snapshot
   * (see `ariaSnapshot`; its options apply). `"compact"`: HTML without `class`/`style`
   * attributes and SVG internals. Defaults to the `CTRL_DOM_DEBUG` environment variable
   * (`aria` or `compact`), else `"pretty"`.
   */
  format?: DebugFormat
  hidden?: AriaSnapshotOptions['hidden']
  maxLines?: AriaSnapshotOptions['maxLines']
  maxTextLength?: AriaSnapshotOptions['maxTextLength']
  collapseAfter?: AriaSnapshotOptions['collapseAfter']
  urls?: AriaSnapshotOptions['urls']
}

/** @ctrl/dom addition: output formats of `prettyDOM` / `screen.debug`. */
export type DebugFormat = 'pretty' | 'aria' | 'compact'

export function prettyDOM(
  dom?: Element | HTMLDocument,
  maxLength?: number,
  options?: PrettyDOMOptions,
): string | false
export function logDOM(
  dom?: Element | HTMLDocument,
  maxLength?: number,
  options?: PrettyDOMOptions,
): void
export {prettyFormat}
