// Bridge to the Testing Library DOM config (`getConfig().asyncWrapper/eventWrapper/
// getElementError`), which framework adapters (@ctrl/dom/react, @testing-library/react) configure
// with `act()` as a side effect of being imported.
//
// Upstream imports `getConfig` from `@testing-library/dom`; we import it from
// `@ctrl/dom/testing-library` (our drop-in, a hard dependency), falling back to a built-in default
// config (identity wrappers) only if that module does not provide getConfig/configure.
//
// The import is static on purpose: a top-level `await import()` here made the package an
// async ES module, which `require()` (Node's require(esm), Jest) cannot load and which cannot
// be bundled to CommonJS (scripts/build.ts).

import * as ctrlDomTestingLibrary from '@ctrl/dom/testing-library'
import type {Element} from '../dom-types.ts'

export interface DTLConfig {
  asyncWrapper: <R>(cb: () => Promise<R> | R) => Promise<R>
  eventWrapper: <R>(cb: () => R) => R
  getElementError: (message: string | null, container: Element) => Error
}

export interface DTLModule {
  getConfig(): DTLConfig
  configure(
    config: Partial<DTLConfig> | ((existing: DTLConfig) => Partial<DTLConfig>),
  ): void
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

function load(
  mod: Partial<DTLModule> & {default?: Partial<DTLModule>},
): DTLModule | null {
  const getConfig = mod.getConfig ?? mod.default?.getConfig
  const configure = mod.configure ?? mod.default?.configure
  return typeof getConfig === 'function' && typeof configure === 'function'
    ? {getConfig, configure}
    : null
}

const dtl: DTLModule | null = load(
  ctrlDomTestingLibrary as unknown as Partial<DTLModule>,
)
/** Which module provides `getConfig` ('default' when none could be loaded). */
export const dtlSource: string = dtl ? '@ctrl/dom/testing-library' : 'default'

/** The Testing Library DOM module user-event reads its config from, or null (built-in defaults). */
export const dtlModule: DTLModule | null = dtl

/**
 * Mixed setups: stock `@testing-library/react` configures stock `@testing-library/dom`, not
 * ours. When a React act environment is active (`IS_REACT_ACT_ENVIRONMENT`, which RTL sets),
 * @ctrl/dom/testing-library's `asyncWrapper` is still its default (no @ctrl/dom adapter configured it)
 * and a *different* `@testing-library/dom` instance is importable, user-event reads that
 * one's config instead, so stock RTL's `act()` wrapping applies. The import is dynamic (no
 * top-level await: the package must stay loadable with `require()`), triggered at the first
 * API call; when `@testing-library/dom` is aliased to @ctrl/dom/testing-library it resolves to the
 * same module and nothing changes. Plain DOM tests never load anything.
 */
let fallback: DTLModule | null = null
let fallbackLoad: Promise<void> | null = null
let fallbackSettled = false

let lastWrapper: unknown = null
let lastWrapperIsDefault = false

/**
 * DTL's default `asyncWrapper` is `(cb) => cb()`; adapters replace it with an act() wrapper.
 * Checked at every API call, so the answer for the current function is memoized (it is
 * replaced only by `configure()`).
 */
function isDefaultWrapper(fn: unknown): boolean {
  if (fn === lastWrapper) return lastWrapperIsDefault
  lastWrapper = fn
  lastWrapperIsDefault =
    typeof fn === 'function' &&
    /^\(?(\w+)\)?=>\1\(\)$/.test(String(fn).replace(/\s/g, ''))
  return lastWrapperIsDefault
}

function ownConfigured(): boolean {
  return dtl === null || !isDefaultWrapper(dtl.getConfig().asyncWrapper)
}

function reactActEnvironment(): boolean {
  return (
    (globalThis as {IS_REACT_ACT_ENVIRONMENT?: unknown})
      .IS_REACT_ACT_ENVIRONMENT === true
  )
}

/**
 * The `@testing-library/dom` that the project's `@testing-library/react` uses (resolved from the
 * working directory), not one next to this package: a different copy has a different config.
 */
function resolveFromProject(specifier: string): string {
  try {
    const cwd = typeof process === 'object' ? process.cwd() : '.'
    let base = cwd
    try {
      const rtl = require.resolve('@testing-library/react', {paths: [cwd]})
      base = rtl.slice(0, Math.max(rtl.lastIndexOf('/'), rtl.lastIndexOf('\\')))
    } catch {
      // no stock RTL in the project
    }
    return require.resolve(specifier, {paths: [base]})
  } catch {
    return specifier
  }
}

function loadFallback(): Promise<void> {
  // In CommonJS (Jest, our CJS bundle) use the module's own `require` so the module registry
  // (and moduleNameMapper) hands out the same instance stock RTL configured; in ESM, import().
  const specifier = '@testing-library/dom'
  const mod: Promise<unknown> =
    typeof require === 'function'
      ? new Promise(resolve => resolve(require(resolveFromProject(specifier))))
      : import(specifier)
  return mod
    .then(
      m => {
        const other = load(
          m as Partial<DTLModule> & {default?: Partial<DTLModule>},
        )
        if (other !== null && other.getConfig !== dtl?.getConfig)
          fallback = other
      },
      () => {},
    )
    .finally(() => {
      fallbackSettled = true
    })
}

/**
 * A promise to await before the first API call of a mixed setup; undefined otherwise (and on
 * every later call, so calls stay synchronous up to their first await, like upstream).
 */
export function resolveConfigSource(): Promise<void> | undefined {
  if (fallbackSettled || ownConfigured() || !reactActEnvironment())
    return undefined
  fallbackLoad ??= loadFallback()
  return fallbackLoad
}

const ownGetConfig: () => DTLConfig = dtl ? dtl.getConfig : () => defaultConfig

export function getConfig(): DTLConfig {
  if (fallback !== null && !ownConfigured()) return fallback.getConfig()
  return ownGetConfig()
}
