// Bridge to the Testing Library DOM config (`getConfig().asyncWrapper/eventWrapper/
// getElementError`), which framework adapters (@rtd/react, @testing-library/react) configure
// with `act()` as a side effect of being imported.
//
// Upstream imports `getConfig` from `@testing-library/dom`. We resolve, in order:
//   1. `@rtd/testing-library` (our drop-in for @testing-library/dom; used with @rtd/react),
//   2. `@testing-library/dom` when it is installed (people swapping only user-event),
//   3. a built-in default config (identity wrappers).
// The specifiers are computed so TypeScript does not try to resolve them (the packages are
// optional at type level and may still be in flight).
//
// TODO(testing-library): once @rtd/testing-library exports `getConfig`, consider making it a
// static import; keep the @testing-library/dom fallback for mixed setups.

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

async function load(specifier: string): Promise<DTLModule | null> {
  try {
    const mod = (await import(specifier)) as Partial<DTLModule> & {default?: Partial<DTLModule>}
    const getConfig = mod.getConfig ?? mod.default?.getConfig
    const configure = mod.configure ?? mod.default?.configure
    return typeof getConfig === 'function' && typeof configure === 'function'
      ? {getConfig, configure}
      : null
  } catch {
    return null
  }
}

const candidates = ['@rtd/testing-library', '@testing-library/dom']
let dtl: DTLModule | null = null
/** Which module provides `getConfig` ('default' when none could be loaded). */
export let dtlSource = 'default'
for (const specifier of candidates) {
  dtl = await load(specifier)
  if (dtl) {
    dtlSource = specifier
    break
  }
}

const getConfigImpl: () => DTLConfig = dtl ? dtl.getConfig : () => defaultConfig

/** The Testing Library DOM module user-event reads its config from, or null (built-in defaults). */
export const dtlModule: DTLModule | null = dtl

export function getConfig(): DTLConfig {
  return getConfigImpl()
}
