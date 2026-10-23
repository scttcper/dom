// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/tests/_helpers/index.ts
//
// @ts-nocheck -- ported verbatim; upstream types these tests against lib.dom, which this monorepo
// does not load (we are the DOM). Vitest does not typecheck; src/ is fully typed.

// this is pretty helpful:
// https://codesandbox.io/s/quizzical-worker-eo909

import {configure, getConfig} from '#testHelpers/dtl.ts'

export {render, setup} from './setup.ts'
export {addEventListener, addListeners} from './listeners.ts'

export function isJsdomEnv() {
  return window.navigator.userAgent.includes(' jsdom/')
}

/**
 * Divergence from upstream: upstream's suite runs on jsdom 20, we run on jsdom 30 (and
 * @rtd/dom). Newer jsdom fixed several quirks the upstream assertions branch on via
 * `isJsdomEnv()` (inherited computed styles, Selection updates on focus, async `select` events,
 * `isContentEditable`). Tests asserting those quirks use this instead; on jsdom >= 21 they take
 * the browser branch. Verified by running the suite against stock user-event (RTD_UE_IMPL=stock):
 * it fails the same assertions without this.
 */
/**
 * Divergence: @rtd/dom is a third environment besides jsdom and the browser. Where the upstream
 * assertions branch on the environment, @rtd/dom takes the branch matching its documented
 * behavior (noted at each use).
 */
export function isRtdEnv() {
  return window.navigator.userAgent.includes(' rtd/')
}

export function isLegacyJsdomEnv() {
  const m = / jsdom\/(\d+)/.exec(window.navigator.userAgent)
  return m !== null && Number(m[1]) <= 20
}

/**
 * Reset the DTL wrappers
 *
 * Framework libraries configure the wrappers in DTL as side effect when being imported.
 * In the Toolbox testenvs that side effect is triggered by including the library as a setup file.
 */
export function resetWrappers() {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const {asyncWrapper, eventWrapper} = {...getConfig()}

  configure({
    asyncWrapper: (cb: () => Promise<unknown>) => cb(),
    eventWrapper: (cb: () => void) => cb(),
  })

  return () => configure({
    asyncWrapper,
    eventWrapper,
  })
}
