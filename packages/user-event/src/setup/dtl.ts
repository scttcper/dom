// Bridge to the Testing Library DOM config (`getConfig().asyncWrapper/eventWrapper/
// getElementError`), which framework adapters (@rtd/react, @testing-library/react) configure
// with `act()` as a side effect of being imported.
//
// Upstream imports `getConfig` from `@testing-library/dom`; we import it from
// `@rtd/testing-library` (our drop-in, a hard dependency), falling back to a built-in default
// config (identity wrappers) only if that module does not provide getConfig/configure.
//
// The import is static on purpose: a top-level `await import()` here made the package an
// async ES module, which `require()` (Node's require(esm), Jest) cannot load and which cannot
// be bundled to CommonJS (scripts/build.ts).

import * as rtdTestingLibrary from '@rtd/testing-library'
import type {Element} from '../dom-types.ts'

export interface DTLConfig {
  asyncWrapper: <R>(cb: () => Promise<R> | R) => Promise<R>
  eventWrapper: <R>(cb: () => R) => R
  getElementError: (message: string | null, container: Element) => Error
}

export interface DTLModule {
  getConfig(): DTLConfig
  configure(config: Partial<DTLConfig> | ((existing: DTLConfig) => Partial<DTLConfig>)): void
}

const defaultConfig: DTLConfig = {
  asyncWrapper: async cb => cb(),
  eventWrapper: cb => cb(),
  getElementError(message) {
    const error = new Error(message ?? '')
    error.name = 'TestingLibraryElementError'
    return error
  },
}

function load(mod: Partial<DTLModule> & {default?: Partial<DTLModule>}): DTLModule | null {
  const getConfig = mod.getConfig ?? mod.default?.getConfig
  const configure = mod.configure ?? mod.default?.configure
  return typeof getConfig === 'function' && typeof configure === 'function'
    ? {getConfig, configure}
    : null
}

const dtl: DTLModule | null = load(rtdTestingLibrary as unknown as Partial<DTLModule>)
/** Which module provides `getConfig` ('default' when none could be loaded). */
export const dtlSource: string = dtl ? '@rtd/testing-library' : 'default'

const getConfigImpl: () => DTLConfig = dtl ? dtl.getConfig : () => defaultConfig

/** The Testing Library DOM module user-event reads its config from, or null (built-in defaults). */
export const dtlModule: DTLModule | null = dtl

export function getConfig(): DTLConfig {
  return getConfigImpl()
}
