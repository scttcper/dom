// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/setup/setup.ts

import type {Document, Node} from '../dom-types.ts'
import {patchFocus} from '../document/patchFocus.ts'
import {prepareDocument} from '../document/prepareDocument.ts'
import {dispatchEvent, dispatchUIEvent} from '../event/index.ts'
import {defaultKeyMap as defaultKeyboardMap} from '../keyboard/keyMap.ts'
import {defaultKeyMap as defaultPointerMap} from '../pointer/keyMap.ts'
import {type Options, PointerEventsCheckLevel} from '../options.ts'
import {
  ApiLevel,
  attachClipboardStubToView,
  getDocumentFromNode,
  getWindow,
  setLevelRef,
} from '../utils/index.ts'
import {
  defaultAdvanceTimers,
  markTimers,
  yieldBetweenActions,
} from '../utils/misc/wait.ts'
import {System} from '../system/index.ts'
import {userEventApi} from './api.ts'
import {wrapAsync} from './wrapAsync.ts'
import {resolveConfigSource} from './dtl.ts'
import {type DirectOptions} from './directApi.ts'
import {describeCall, tracePromise, tracing} from '@ctrl/dom/internal'

/**
 * Default options applied when API is called per `userEvent.anyApi()`
 */
const defaultOptionsDirect: Required<Options> = {
  applyAccept: true,
  autoModify: true,
  delay: 0,
  // Upstream captures `globalThis.document` at import time. Environments that install the
  // document after importing user-event (or replace it per test) are served by the getter below.
  get document() {
    return (globalThis as {document?: Document}).document as Document
  },
  keyboardMap: defaultKeyboardMap,
  pointerMap: defaultPointerMap,
  pointerEventsCheck: PointerEventsCheckLevel.EachApiCall,
  skipAutoClose: false,
  skipClick: false,
  skipHover: false,
  writeToClipboard: false,
  advanceTimers: defaultAdvanceTimers,
}

/**
 * Default options applied when API is called per `userEvent().anyApi()`
 */
const defaultOptionsSetup: Required<Options> = {
  ...defaultOptionsDirect,
  writeToClipboard: true,
}
// The spread above evaluated the getter once; keep it lazy.
Object.defineProperty(defaultOptionsSetup, 'document', {
  get: () => (globalThis as {document?: Document}).document,
  enumerable: true,
})

export type UserEventApi = typeof userEventApi

export type UserEvent = {
  readonly setup: (...args: Parameters<typeof setupSub>) => UserEvent
} & {
  readonly [k in keyof UserEventApi]: (
    ...args: Parameters<UserEventApi[k]>
  ) => ReturnType<UserEventApi[k]>
}

export type Instance = UserEventApi & {
  config: Config
  dispatchEvent: OmitThisParameter<typeof dispatchEvent>
  dispatchUIEvent: OmitThisParameter<typeof dispatchUIEvent>
  system: System
  levelRefs: Record<number, object | undefined>
}

export type Config = Required<Options>

export function createConfig(
  options: Options = {},
  defaults: Required<Options> = defaultOptionsSetup,
  node?: Node,
): Config {
  const document = getDocument(options, node, defaults)

  return {
    ...defaults,
    ...options,
    document,
  }
}

/**
 * Start a "session" with userEvent.
 * All APIs returned by this function share an input device state and a default configuration.
 */
export function setupMain(options: Options = {}) {
  const config = createConfig(options)
  prepareDocument(config.document)
  patchFocus(getWindow(config.document).HTMLElement)

  const view =
    config.document.defaultView ??
    /* istanbul ignore next */ (globalThis as {window?: any}).window
  attachClipboardStubToView(view)

  return createInstance(config).api
}

/**
 * Setup in direct call per `userEvent.anyApi()`
 */
export function setupDirect(
  {
    keyboardState,
    pointerState,
    ...options
  }: DirectOptions & {keyboardState?: System; pointerState?: System} = {}, // backward-compatibility
  node?: Node,
) {
  const config = createConfig(options, defaultOptionsDirect, node)
  prepareDocument(config.document)
  patchFocus(getWindow(config.document).HTMLElement)

  const system = pointerState ?? keyboardState ?? new System()

  return {
    api: createInstance(config, system).api,
    system,
  }
}

/**
 * Create a set of callbacks with different default settings but the same state.
 */
export function setupSub(this: Instance, options: Options) {
  return createInstance({...this.config, ...options}, this.system).api
}

function wrapAndBindImpl<
  Args extends unknown[],
  Impl extends (this: Instance, ...args: Args) => Promise<unknown>,
>(instance: Instance, impl: Impl, name: string = impl.name) {
  function method(...args: Args) {
    setLevelRef(instance, ApiLevel.Call)

    const run = () =>
      wrapAsync(() => {
        markTimers(instance.config)
        return impl.apply(instance, args).then(async ret => {
          // Upstream: `await wait(instance.config)`. Same semantics unless no timer could run
          // during that wait (see utils/misc/wait.ts).
          await yieldBetweenActions(instance.config)
          return ret
        })
      })
    // Mixed setups (stock RTL + this package) resolve the config source once (see dtl.ts).
    const pending = resolveConfigSource()
    const go = () => (pending === undefined ? run() : pending.then(run))
    // Ours: a span per action when something subscribes to @ctrl/dom's tracing channel.
    if (!tracing()) return go()
    return tracePromise(
      `user-event.${name}`,
      describeCall(`user.${name}`, args),
      go,
    )
  }
  Object.defineProperty(method, 'name', {get: () => impl.name})

  return method
}

export function createInstance(
  config: Config,
  system: System = new System(),
): {
  instance: Instance
  api: UserEvent
} {
  const instance = {} as Instance
  Object.assign(instance, {
    config,
    dispatchEvent: dispatchEvent.bind(instance),
    dispatchUIEvent: dispatchUIEvent.bind(instance),
    system,
    levelRefs: {},
    ...userEventApi,
  })

  return {
    instance,
    api: {
      ...(Object.fromEntries(
        Object.entries(userEventApi).map(([name, api]) => [
          name,
          // Ours: the API's name for its span (bundlers may rename the function: `type$1`).
          wrapAndBindImpl(
            instance,
            api as (this: Instance, ...args: unknown[]) => Promise<unknown>,
            name,
          ),
        ]),
      ) as unknown as UserEventApi),
      setup: setupSub.bind(instance),
    } as unknown as UserEvent,
  }
}

function getDocument(
  options: Partial<Config>,
  node: Node | undefined,
  defaults: Required<Options>,
) {
  return (
    options.document ?? (node && getDocumentFromNode(node)) ?? defaults.document
  )
}
