// Port of @testing-library/react@16.3.3 src/pure.js (+ types/index.d.ts)
// https://github.com/testing-library/react-testing-library/blob/v16.3.3/src/pure.js
// https://github.com/testing-library/react-testing-library/blob/v16.3.3/types/index.d.ts
//
// Same behavior as upstream. Performance differences (no observable change):
// - The default queries bound to a baseElement are computed once per baseElement (WeakMap)
//   instead of re-binding ~120 query functions on every render()/renderHook() call; the
//   render result still gets them as own enumerable properties, exactly like upstream.
// - A container render() created itself is given to a later render() once cleanup() has removed
//   it, when it is still what a new `<div>` would be (reusableContainers below). React adds 142
//   event listeners to every new root container and skips that for one it has listened on.
//   Observable only through a reference kept past cleanup(): the same element comes back.
// - The legacy root path is gone: React 19 has no ReactDOM.render, so `legacyRoot: true`
//   throws the same error upstream throws on React 19.

import * as React from "react";
import * as ReactDOMClient from "react-dom/client";
import {
  configure as configureDTL,
  getQueriesForElement,
  prettyDOM,
  type BoundFunction,
  type PrettyDOMOptions,
  type Queries,
  type prettyFormat,
  type queries,
} from "./dtl.ts";
import act, {
  actReleasingSuspendedWork,
  actRoots,
  getIsReactActEnvironment,
  setReactActEnvironment,
} from "./act-compat.ts";
import {
  canSkipZeroDelayWait,
  listenerCount,
  loopTurn,
  registerTestHooks,
  reusableElement,
  skipZeroDelayWait,
  traceSync,
  tracing,
} from "@ctrl/dom/internal";
import { fireEvent } from "./fire-event.ts";
import { getConfig, configure, type Config, type ConfigFn } from "./config.ts";

// Containers React can render into / hydrate. Typed loosely on purpose: these are whatever
// DOM the test environment provides (@ctrl/dom, or jsdom/happy-dom for the stock comparison).
type RendererableContainer = ReactDOMClient.Container;
type HydrateableContainer = Parameters<(typeof ReactDOMClient)["hydrateRoot"]>[0];
type DOMElement = any;

export type RenderResult<
  Q extends Queries = typeof queries,
  Container extends RendererableContainer | HydrateableContainer = DOMElement,
  BaseElement extends RendererableContainer | HydrateableContainer = Container,
> = {
  container: Container;
  baseElement: BaseElement;
  debug: (
    baseElement?:
      | RendererableContainer
      | HydrateableContainer
      | Array<RendererableContainer | HydrateableContainer>
      | undefined,
    maxLength?: number | undefined,
    // Ours: PrettyDOMOptions (upstream: prettyFormat.OptionsReceived) adds `format: "aria"` & co.
    options?: (prettyFormat.OptionsReceived & PrettyDOMOptions) | undefined,
  ) => void;
  rerender: (ui: React.ReactNode) => void;
  unmount: () => void;
  asFragment: () => DOMElement;
} & { [P in keyof Q]: BoundFunction<Q[P]> };

export interface RenderOptions<
  Q extends Queries = typeof queries,
  Container extends RendererableContainer | HydrateableContainer = DOMElement,
  BaseElement extends RendererableContainer | HydrateableContainer = Container,
> {
  /**
   * By default, React Testing Library will create a div and append that div to the
   * document.body. Your React component will be rendered in the created div. If you provide
   * your own HTMLElement container via this option, it will not be appended to the
   * document.body automatically.
   *
   * @see https://testing-library.com/docs/react-testing-library/api/#container
   */
  container?: Container | undefined;
  /**
   * Defaults to the container if the container is specified. Otherwise `document.body` is
   * used for the default. This is used as the base element for the queries as well as what
   * is printed when you use `debug()`.
   *
   * @see https://testing-library.com/docs/react-testing-library/api/#baseelement
   */
  baseElement?: BaseElement | undefined;
  /**
   * If `hydrate` is set to `true`, then it will render with `ReactDOM.hydrate`.
   *
   * @see https://testing-library.com/docs/react-testing-library/api/#hydrate)
   */
  hydrate?: boolean | undefined;
  /**
   * Only works if used with React 18. Throws on React 19.
   */
  legacyRoot?: boolean | undefined;
  /**
   * Callback called when React catches an error in an Error Boundary.
   *
   * @see {@link https://react.dev/reference/react-dom/client/createRoot#parameters createRoot#options}
   */
  onCaughtError?: ReactDOMClient.RootOptions extends { onCaughtError?: infer OnCaughtError } ? OnCaughtError : never;
  /**
   * Callback called when React automatically recovers from errors.
   *
   * @see {@link https://react.dev/reference/react-dom/client/createRoot#parameters createRoot#options}
   */
  onRecoverableError?: ReactDOMClient.RootOptions["onRecoverableError"];
  /**
   * Not supported at the moment
   */
  onUncaughtError?: never;
  /**
   * Queries to bind. Overrides the default set from DOM Testing Library unless merged.
   *
   * @see https://testing-library.com/docs/react-testing-library/api/#queries
   */
  queries?: Q | undefined;
  /**
   * Pass a React Component as the wrapper option to have it rendered around the inner element.
   *
   * @see https://testing-library.com/docs/react-testing-library/api/#wrapper
   */
  wrapper?: React.JSXElementConstructor<{ children: React.ReactNode }> | undefined;
  /**
   * When enabled, <StrictMode> is rendered around the inner element.
   * If defined, overrides the value of `reactStrictMode` set in `configure`.
   */
  reactStrictMode?: boolean;
}

/** @deprecated */
export type BaseRenderOptions<
  Q extends Queries,
  Container extends RendererableContainer | HydrateableContainer,
  BaseElement extends RendererableContainer | HydrateableContainer,
> = RenderOptions<Q, Container, BaseElement>;

/** @deprecated */
export interface ClientRenderOptions<
  Q extends Queries,
  Container extends RendererableContainer,
  BaseElement extends RendererableContainer = Container,
> extends BaseRenderOptions<Q, Container, BaseElement> {
  hydrate?: false | undefined;
}

/** @deprecated */
export interface HydrateOptions<
  Q extends Queries,
  Container extends HydrateableContainer,
  BaseElement extends HydrateableContainer = Container,
> extends BaseRenderOptions<Q, Container, BaseElement> {
  hydrate: true;
}

export interface RenderHookResult<Result, Props> {
  /** Triggers a re-render. The props will be passed to your renderHook callback. */
  rerender: (props?: Props) => void;
  /** This is a stable reference to the latest value returned by your renderHook callback */
  result: {
    /** The value returned by your renderHook callback */
    current: Result;
  };
  /** Unmounts the test component. */
  unmount: () => void;
}

export interface RenderHookOptions<
  Props,
  Q extends Queries = typeof queries,
  Container extends RendererableContainer | HydrateableContainer = DOMElement,
  BaseElement extends RendererableContainer | HydrateableContainer = Container,
> extends BaseRenderOptions<Q, Container, BaseElement> {
  /** The argument passed to the renderHook callback. */
  initialProps?: Props | undefined;
}

/** @deprecated */
export type BaseRenderHookOptions<
  Props,
  Q extends Queries,
  Container extends RendererableContainer | HydrateableContainer,
  BaseElement extends RendererableContainer | HydrateableContainer,
> = RenderHookOptions<Props, Q, Container, BaseElement>;

/** @deprecated */
export interface ClientRenderHookOptions<
  Props,
  Q extends Queries,
  Container extends RendererableContainer,
  BaseElement extends RendererableContainer = Container,
> extends BaseRenderHookOptions<Props, Q, Container, BaseElement> {
  hydrate?: false | undefined;
}

/** @deprecated */
export interface HydrateHookOptions<
  Props,
  Q extends Queries,
  Container extends HydrateableContainer,
  BaseElement extends HydrateableContainer = Container,
> extends BaseRenderHookOptions<Props, Q, Container, BaseElement> {
  hydrate: true;
}

declare const jest: any;
declare const document: any;

function advanceFakeTimersIfEnabled(): void {
  if (typeof jest !== "undefined" && jest !== null) {
    if (
      // legacy timers
      (setTimeout as any)._isMockFunction === true ||
      // modern timers
      Object.prototype.hasOwnProperty.call(setTimeout, "clock")
    ) {
      jest.advanceTimersByTime(0);
    }
    return;
  }
  // Divergence (intentional), as in @ctrl/dom/testing-library's helpers.ts: also advance the
  // @sinonjs/fake-timers clock `vi.useFakeTimers()` installs. Upstream's asyncWrapper waits on a
  // faked `setTimeout(0)` it never advances there, so every waitFor/findBy hangs.
  const clock = (setTimeout as any).clock;
  if (typeof clock?.tick === "function") clock.tick(0);
}

function drainWithTimer(resolve: () => void): void {
  setTimeout(() => {
    resolve();
  }, 0);
  advanceFakeTimersIfEnabled();
}

let inEventWrapper = false;

configureDTL({
  unstable_advanceTimersWrapper: (cb: () => unknown) => {
    return act(cb as () => void);
  },
  // We just want to run `waitFor` without IS_REACT_ACT_ENVIRONMENT
  // But that's not necessarily how `asyncWrapper` is used since it's a public method.
  // Let's just hope nobody else is using it.
  asyncWrapper: async (cb: () => Promise<unknown>) => {
    const previousActEnvironment = getIsReactActEnvironment();
    setReactActEnvironment(false);
    try {
      const result = await cb();
      // Drain microtask queue.
      // Otherwise we'll restore the previous act() environment, before we resolve the
      // `waitFor` call. The caller would have no chance to wrap the in-flight Promises in
      // `act()`.
      await new Promise<void>((resolve) => {
        // Ours: on @ctrl/dom's idle-skipping clock with real timers, an idle loop and nothing due
        // within the timer's 1 ms, the same wait in one macrotask boundary instead of two turns
        // (loopTurn: without the event-loop turn itself when it would run nothing). The check is
        // repeated there, after the microtasks still queued now: work they schedule (React's,
        // through setImmediate) gets the 0 ms timer's wait, as upstream.
        if (canSkipZeroDelayWait(globalThis)) {
          loopTurn(() => (skipZeroDelayWait(globalThis) ? resolve() : drainWithTimer(resolve)));
          return;
        }
        drainWithTimer(resolve);
      });
      return result;
    } finally {
      setReactActEnvironment(previousActEnvironment);
    }
  },
  eventWrapper: (cb: () => unknown) => {
    if (inEventWrapper) {
      return cb();
    }
    inEventWrapper = true;
    try {
      let result: unknown;
      actReleasingSuspendedWork(() => {
        result = cb();
      });
      return result;
    } finally {
      inEventWrapper = false;
    }
  },
} as Partial<Config>);

interface RootHandle {
  hydrate(): void;
  render(element: React.ReactNode): void;
  unmount(): void;
}

// Ideally we'd just use a WeakMap where containers are keys and roots are values. We use two
// variables so that we can bail out in constant time when we render with a new container
// (most common use case).
const mountedContainers = new Set<unknown>();
const mountedRootEntries: Array<{ container: any; root: RootHandle }> = [];

/**
 * Containers render() created, waiting for another render() in the same document. React's
 * `createRoot` adds 142 event listeners to a container it has not seen (`listenToAllSupportedEvents`,
 * 142 bound functions on its side and as many listener records on ours) and nothing to one it has:
 * a warm render + unmount of a small tree takes 12.8 µs in a reused container against 18.8 µs in a
 * new one. Only for @ctrl/dom elements. Keyed weakly by document and holding only that document's
 * elements, so nothing here outlives a window.
 */
const reusableContainers = new WeakMap<object, unknown[]>();
/** What a container render() created had once React made it a root: listeners and own keys. */
const ownContainers = new WeakMap<object, { listeners: number; keys: number }>();
const MAX_REUSABLE_CONTAINERS = 8;

function strictModeIfNeeded(innerElement: React.ReactNode, reactStrictMode: boolean | undefined): React.ReactNode {
  return (reactStrictMode ?? getConfig().reactStrictMode)
    ? React.createElement(React.StrictMode, null, innerElement)
    : innerElement;
}

function wrapUiIfNeeded(innerElement: React.ReactNode, wrapperComponent: RenderOptions["wrapper"]): React.ReactNode {
  return wrapperComponent ? React.createElement(wrapperComponent, null, innerElement) : innerElement;
}

interface CreateRootOptions {
  hydrate: boolean;
  onCaughtError: RenderOptions["onCaughtError"];
  onRecoverableError: RenderOptions["onRecoverableError"];
  ui: React.ReactNode;
  wrapper: RenderOptions["wrapper"];
  reactStrictMode: boolean | undefined;
}

function createConcurrentRoot(
  container: any,
  { hydrate, onCaughtError, onRecoverableError, ui, wrapper: WrapperComponent, reactStrictMode }: CreateRootOptions,
): RootHandle {
  let root!: ReactDOMClient.Root;
  if (hydrate) {
    try {
      actReleasingSuspendedWork(() => {
        root = ReactDOMClient.hydrateRoot(
          container,
          strictModeIfNeeded(wrapUiIfNeeded(ui, WrapperComponent), reactStrictMode),
          {
            onCaughtError,
            onRecoverableError,
          } as ReactDOMClient.HydrationOptions,
        );
        // Registered before the act flushes, so suspended hydration work can be released.
        actRoots.add(root);
      });
    } catch (error) {
      // The root never reaches mountedRootEntries, so cleanup() would not unregister it.
      actRoots.delete(root);
      throw error;
    }
  } else {
    root = ReactDOMClient.createRoot(container, {
      onCaughtError,
      onRecoverableError,
    } as ReactDOMClient.RootOptions);
    actRoots.add(root);
  }

  return {
    hydrate() {
      if (!hydrate) {
        throw new Error("Attempted to hydrate a non-hydrateable root. This is a bug in `@testing-library/react`.");
      }
      // Nothing to do since hydration happens when creating the root object.
    },
    render(element) {
      root.render(element);
    },
    unmount() {
      root.unmount();
      actRoots.delete(root);
    },
  };
}

/**
 * A render result with the default queries bound to a base element, in upstream's key order (the
 * six render fields, then the queries), built once per element. `document.body` is the base
 * element of nearly every render in a test file: each render clones it (`{ ...template }` copies a
 * fast object wholesale, ~50 ns) instead of binding ~50 queries and adding them to a fresh object
 * one by one (~4 µs), then fills in the six fields.
 */
const resultTemplates = new WeakMap<object, Record<string, unknown>>();

function resultTemplateFor(baseElement: any): Record<string, unknown> {
  let template = resultTemplates.get(baseElement);
  if (template === undefined) {
    template = {
      container: undefined,
      baseElement: undefined,
      debug: undefined,
      unmount: undefined,
      rerender: undefined,
      asFragment: undefined,
      ...(getQueriesForElement(baseElement) as Record<string, unknown>),
    };
    resultTemplates.set(baseElement, template);
  }
  return template;
}

interface RenderRootOptions {
  baseElement: any;
  container: any;
  hydrate?: boolean;
  queries?: Queries | undefined;
  root: RootHandle;
  wrapper: RenderOptions["wrapper"];
  reactStrictMode: boolean | undefined;
}

function actRender(
  ui: React.ReactNode,
  root: RootHandle,
  hydrate: boolean | undefined,
  WrapperComponent: RenderOptions["wrapper"],
  reactStrictMode: boolean | undefined,
): void {
  actReleasingSuspendedWork(() => {
    if (hydrate) {
      root.hydrate();
    } else {
      root.render(strictModeIfNeeded(wrapUiIfNeeded(ui, WrapperComponent), reactStrictMode));
    }
  });
}

function renderRoot(
  ui: React.ReactNode,
  { baseElement, container, hydrate, queries, root, wrapper: WrapperComponent, reactStrictMode }: RenderRootOptions,
): RenderResult<any, any, any> {
  actRender(ui, root, hydrate, WrapperComponent, reactStrictMode);

  const debug = (el: unknown = baseElement, maxLength?: number, options?: PrettyDOMOptions) =>
    Array.isArray(el)
      ? // eslint-disable-next-line no-console
        el.forEach((e) => console.log(prettyDOM(e, maxLength, options)))
      : // eslint-disable-next-line no-console
        console.log(prettyDOM(el as any, maxLength, options));
  const unmount = () => {
    act(() => {
      root.unmount();
    });
  };
  const rerender = (rerenderUi: React.ReactNode) => {
    // Upstream calls renderRoot here and drops the result; building it copies every bound query.
    const rerender = () => actRender(rerenderUi, root, false, WrapperComponent, reactStrictMode);
    // Ours: a span when something subscribes to @ctrl/dom's tracing channel.
    if (tracing()) traceSync("react.rerender", `rerender(${describeElement(rerenderUi)})`, rerender);
    else rerender();
    // Intentionally do not return anything to avoid unnecessarily complicating the API.
    // folks can use all the same utilities we return in the first place that are bound to
    // the container
  };
  const asFragment = () => {
    if (typeof document.createRange === "function") {
      return document.createRange().createContextualFragment(container.innerHTML);
    }
    const template = document.createElement("template");
    template.innerHTML = container.innerHTML;
    return template.content;
  };
  if (queries !== undefined) {
    return {
      container,
      baseElement,
      debug,
      unmount,
      rerender,
      asFragment,
      ...getQueriesForElement(baseElement, queries as any),
    } as RenderResult<any, any, any>;
  }
  const result = { ...resultTemplateFor(baseElement) };
  result.container = container;
  result.baseElement = baseElement;
  result.debug = debug;
  result.unmount = unmount;
  result.rerender = rerender;
  result.asFragment = asFragment;
  return result as RenderResult<any, any, any>;
}

function legacyRootError(callee: Function): Error {
  const error = new Error(
    "`legacyRoot: true` is not supported in this version of React. " +
      "If your app runs React 19 or later, you should remove this flag. " +
      "If your app runs React 18 or earlier, visit https://react.dev/blog/2022/03/08/react-18-upgrade-guide for upgrade instructions.",
  );
  Error.captureStackTrace(error, callee);
  return error;
}

/**
 * Render into a container which is appended to document.body. It should be used with cleanup.
 */
export function render<
  Q extends Queries = typeof queries,
  Container extends RendererableContainer | HydrateableContainer = DOMElement,
  BaseElement extends RendererableContainer | HydrateableContainer = Container,
>(ui: React.ReactNode, options: RenderOptions<Q, Container, BaseElement>): RenderResult<Q, Container, BaseElement>;
export function render(ui: React.ReactNode, options?: Omit<RenderOptions, "queries"> | undefined): RenderResult;
export function render(ui: React.ReactNode, options?: RenderOptions<any, any, any>): any {
  // Ours: a span per render when something subscribes to @ctrl/dom's tracing channel.
  if (!tracing()) return renderUntraced(ui, options);
  return traceSync("react.render", `render(${describeElement(ui)})`, () => renderUntraced(ui, options));
}

/**
 * `<Signup />` for a React element: the component under test, through wrappers that test helpers
 * add (providers, StrictMode, fragments, a data router's route element, as in a
 * `render(<RouterProvider router={createMemoryRouter([{ element: <Providers>{ui}</Providers> }])} />)` helper).
 */
function describeElement(ui: React.ReactNode): string {
  if (!React.isValidElement(ui)) return typeof ui === "string" ? JSON.stringify(ui) : String(ui);
  let element: React.ReactElement = ui;
  for (let depth = 0; depth < 10; depth++) {
    const inner = isWrapper(element) ? wrappedElement(element) : null;
    if (inner === null) break;
    element = inner;
  }
  return describeTree(element, 0);
}

/** `<Signup />`; a host element shows what it holds: `<div><Checkbox /></div>`, `<div>…</div>`. */
function describeTree(element: React.ReactElement, depth: number): string {
  const name = componentName(element.type) || "Component";
  if (typeof element.type !== "string") return `<${name} />`;
  const children = (element.props as { children?: React.ReactNode }).children;
  if (children === undefined || children === null || children === false) return `<${name} />`;
  const only = onlyElement(children);
  return only !== null && depth < 2 ? `<${name}>${describeTree(only, depth + 1)}</${name}>` : `<${name}>…</${name}>`;
}

/** A component's display name, without the `$1` suffix bundlers add when names collide. */
function componentName(type: unknown): string {
  if (typeof type === "string") return type;
  if (typeof type === "symbol") return type.description?.replace(/^react\./, "") ?? "";
  const t = type as {
    displayName?: string;
    name?: string;
    render?: { name?: string };
    type?: { name?: string };
  } | null;
  const name = t?.displayName ?? t?.name ?? t?.render?.name ?? t?.type?.name ?? "";
  return name.replace(/\$\d+$/, "");
}

const WRAPPER = /(?:Providers?|Context|Router|Wrapper|Fragment|StrictMode|Suspense|Profiler)$/;

/**
 * Providers, routers and the like, plus anonymous components with a single child element: test
 * helpers build their wrappers in factories (`makeAllTheProviders()` returning a function).
 */
function isWrapper(element: React.ReactElement): boolean {
  if (typeof element.type === "symbol") return true;
  const name = componentName(element.type);
  return (
    WRAPPER.test(name) ||
    (name === "" && onlyElement((element.props as { children?: React.ReactNode }).children) !== null)
  );
}

interface Route {
  element?: React.ReactNode;
  children?: Route[];
}

/** The one element a wrapper renders: its only child, or a data router's first route element. */
function wrappedElement(element: React.ReactElement): React.ReactElement | null {
  const props = element.props as { children?: React.ReactNode; router?: { routes?: Route[] } };
  return onlyElement(props.children) ?? firstRouteElement(props.router?.routes);
}

/** The first route element that is not an `<Outlet />` (a layout route's), depth first. */
function firstRouteElement(routes: Route[] | undefined): React.ReactElement | null {
  for (const route of routes ?? []) {
    const element = onlyElement(route.element);
    if (element !== null && componentName(element.type) !== "Outlet") return element;
    const nested = firstRouteElement(route.children);
    if (nested !== null) return nested;
  }
  return null;
}

function onlyElement(node: React.ReactNode): React.ReactElement | null {
  if (React.isValidElement(node)) return node;
  if (!Array.isArray(node)) return null;
  const elements = node.filter((n) => React.isValidElement(n));
  return elements.length === 1 ? (elements[0] as React.ReactElement) : null;
}

function renderUntraced(
  ui: React.ReactNode,
  {
    container,
    baseElement = container,
    legacyRoot = false,
    onCaughtError,
    onUncaughtError,
    onRecoverableError,
    queries,
    hydrate = false,
    wrapper,
    reactStrictMode,
  }: RenderOptions<any, any, any> = {},
): any {
  if (onUncaughtError !== undefined) {
    throw new Error("onUncaughtError is not supported. The `render` call will already throw on uncaught errors.");
  }
  // React 19 has no ReactDOM.render, so legacy roots are never supported.
  if (legacyRoot) throw legacyRootError(render);

  if (!baseElement) {
    // default to document.body instead of documentElement to avoid output of potentially-large
    // head elements (such as JSS style blocks) in debug output
    baseElement = document.body;
  }
  let created = false;
  if (!container) {
    const reused = reusableContainers.get(document)?.pop();
    created = reused === undefined;
    container = baseElement.appendChild(reused ?? document.createElement("div"));
  }

  let root: RootHandle | undefined;
  if (!mountedContainers.has(container)) {
    root = createConcurrentRoot(container, {
      hydrate,
      onCaughtError,
      onRecoverableError,
      ui,
      wrapper,
      reactStrictMode,
    });
    if (created) {
      ownContainers.set(container, { listeners: listenerCount(container), keys: Object.keys(container).length });
    }
    mountedRootEntries.push({ container, root });
    // we'll add it to the mounted containers regardless of whether it's actually added to
    // document.body so the cleanup method works regardless of whether they're passing us a
    // custom container or not.
    mountedContainers.add(container);
  } else {
    for (let i = 0; i < mountedRootEntries.length; i++) {
      const rootEntry = mountedRootEntries[i];
      if (rootEntry.container === container) root = rootEntry.root;
    }
  }

  return renderRoot(ui, {
    container,
    baseElement,
    queries,
    hydrate,
    wrapper,
    root: root!,
    reactStrictMode,
  });
}

/**
 * Unmounts React trees that were mounted with render.
 */
export function cleanup(): void {
  for (let i = 0; i < mountedRootEntries.length; i++) {
    const { root, container } = mountedRootEntries[i];
    act(() => {
      root.unmount();
    });
    if (container.parentNode === document.body) {
      document.body.removeChild(container);
      // Reused by a later render() while it is what a new <div> would be, the listeners
      // createRoot added and React's two keys aside: no attributes, children, observers, or
      // listeners and properties of the test's or the app's.
      const own = ownContainers.get(container);
      // React's commit sets `onclick` on a root container that has none (a no-op, for Safari's
      // click delegation) and leaves it there; cleared, the next mount sets it again.
      if (own !== undefined) container.onclick = null;
      if (
        own !== undefined &&
        reusableElement(container, own.listeners) &&
        Object.keys(container).length === own.keys
      ) {
        let reusable = reusableContainers.get(document);
        if (reusable === undefined) reusableContainers.set(document, (reusable = []));
        if (reusable.length < MAX_REUSABLE_CONTAINERS) reusable.push(container);
      }
    }
  }
  mountedRootEntries.length = 0;
  mountedContainers.clear();
}

// Ours: where test files share a window and this module (Vitest with `isolate: false`, the
// ctrlDom() plugin's `sharedWorkers`), the trees a file left mounted are unmounted before the next
// one starts (@ctrl/dom window/file-reset.ts).
registerTestHooks("react", {
  fileEnd() {
    cleanup();
    dropHoistedResources();
  },
});

/**
 * React 19 moves `<style precedence>`, `<link rel="stylesheet" precedence>` and async scripts to
 * `<head>` and never takes them out: it keeps them, by key, in a map on the document
 * (`__reactResources$…`, react-dom's getResourcesFromRoot), so the next tree that asks for one
 * finds it there. Fine within a test file; left for the next one, a test of "this renders no style
 * element" finds the previous file's (Base UI's CSPProvider tests). Both go: the elements and the
 * map that says they are in place.
 */
function dropHoistedResources(): void {
  for (const key of Object.keys(document)) {
    if (!key.startsWith("__reactResources$")) continue;
    const resources = document[key] as { hoistableStyles?: unknown; hoistableScripts?: unknown } | null;
    for (const map of [resources?.hoistableStyles, resources?.hoistableScripts]) {
      if (!(map instanceof Map)) continue;
      for (const resource of map.values()) {
        // A resource record holding its element, or the element itself.
        const element = resource?.instance ?? resource;
        if (typeof element?.remove === "function") element.remove();
      }
    }
    delete document[key];
  }
}

/**
 * Allows you to render a hook within a test React component without having to create that
 * component yourself.
 */
export function renderHook<
  Result,
  Props,
  Q extends Queries = typeof queries,
  Container extends RendererableContainer | HydrateableContainer = DOMElement,
  BaseElement extends RendererableContainer | HydrateableContainer = Container,
>(
  renderCallback: (initialProps: Props) => Result,
  options: RenderHookOptions<Props, Q, Container, BaseElement> | undefined = {},
): RenderHookResult<Result, Props> {
  const { initialProps, ...renderOptions } = options;

  if (renderOptions.legacyRoot) throw legacyRootError(renderHook);

  const result = React.createRef<Result>() as { current: Result };

  function TestComponent({ renderCallbackProps }: { renderCallbackProps: Props }) {
    const pendingResult = renderCallback(renderCallbackProps);

    React.useEffect(() => {
      result.current = pendingResult;
    });

    return null;
  }

  const { rerender: baseRerender, unmount } = render(
    React.createElement(TestComponent, { renderCallbackProps: initialProps as Props }),
    renderOptions as RenderOptions,
  );

  function rerender(rerenderCallbackProps?: Props) {
    return baseRerender(React.createElement(TestComponent, { renderCallbackProps: rerenderCallbackProps as Props }));
  }

  return { result, rerender, unmount };
}

// just re-export everything from dom-testing-library
export * from "./dtl.ts";
export { act, fireEvent, getConfig, configure, type Config, type ConfigFn };
