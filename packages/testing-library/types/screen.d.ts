// Difference: upstream imports these from pretty-format, which @ctrl/dom does not install (./pretty-format.d.ts).
import {OptionsReceived} from './pretty-format.js'
import {BoundFunctions, Queries} from './get-queries-for-element.js'
import * as queries from './queries.js'
import {AriaSnapshotOptions} from './aria-snapshot.js'
import {PrettyDOMOptions} from './pretty-dom.js'

export type Screen<Q extends Queries = typeof queries> = BoundFunctions<Q> & {
  /**
   * Convenience function for `pretty-dom` which also allows an array
   * of elements
   */
  debug: (
    element?: Array<Element | HTMLDocument> | Element | HTMLDocument,
    maxLength?: number,
    options?: OptionsReceived & Pick<PrettyDOMOptions, 'format'> & AriaSnapshotOptions,
  ) => void
  /**
   * Convenience function for `Testing Playground` which logs and returns the URL that
   * can be opened in a browser
   */
  logTestingPlaygroundURL: (element?: Element | HTMLDocument) => string
  /**
   * @ctrl/dom addition: the accessibility tree of `element` (default `document.body`) as
   * Playwright-style aria snapshot YAML: roles, accessible names, states and text, exactly as
   * `*ByRole` queries see them. Far smaller than `debug()`'s HTML; meant for reading failures.
   */
  ariaSnapshot: (element?: Element | HTMLDocument | DocumentFragment, options?: AriaSnapshotOptions) => string
}

export const screen: Screen
