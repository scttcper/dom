// Port of @testing-library/react@16.3.3 src/pure.js (+ types/index.d.ts)
// https://github.com/testing-library/react-testing-library/blob/v16.3.3/src/pure.js
// https://github.com/testing-library/react-testing-library/blob/v16.3.3/types/index.d.ts
//
// Same behavior as upstream. Performance differences (no observable change):
// - The default queries bound to a baseElement are computed once per baseElement (WeakMap)
//   instead of re-binding ~120 query functions on every render()/renderHook() call; the
//   render result still gets them as own enumerable properties, exactly like upstream.
// - The legacy root path is gone: React 19 has no ReactDOM.render, so `legacyRoot: true`
//   throws the same error upstream throws on React 19.

import * as React from "react";
import * as ReactDOMClient from "react-dom/client";
import {
  configure as configureDTL,
  getQueriesForElement,
  prettyDOM,
  type BoundFunction,
  type Queries,
  type prettyFormat,
  type queries,
} from "./dtl.ts";
import act, { getIsReactActEnvironment, setReactActEnvironment } from "./act-compat.ts";
import { fireEvent } from "./fire-event.ts";
import { getConfig, configure, type Config, type ConfigFn } from "./config.ts";

// Containers React can render into / hydrate. Typed loosely on purpose: these are whatever
// DOM the test environment provides (@rtd/dom, or jsdom/happy-dom for the stock comparison).
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
    options?: prettyFormat.OptionsReceived | undefined,
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
export type BaseRenderHookOptions<Props, Q extends Queries, Container extends RendererableContainer | HydrateableContainer, BaseElement extends RendererableContainer | HydrateableContainer> =
  RenderHookOptions<Props, Q, Container, BaseElement>;

/** @deprecated */
export interface ClientRenderHookOptions<Props, Q extends Queries, Container extends RendererableContainer, BaseElement extends RendererableContainer = Container>
  extends BaseRenderHookOptions<Props, Q, Container, BaseElement> {
  hydrate?: false | undefined;
}

/** @deprecated */
export interface HydrateHookOptions<Props, Q extends Queries, Container extends HydrateableContainer, BaseElement extends HydrateableContainer = Container>
  extends BaseRenderHookOptions<Props, Q, Container, BaseElement> {
  hydrate: true;
}

declare const jest: any;
declare const document: any;

function jestFakeTimersAreEnabled(): boolean {
  if (typeof jest !== "undefined" && jest !== null) {
    return (
      // legacy timers
      (setTimeout as any)._isMockFunction === true ||
      // modern timers
      Object.prototype.hasOwnProperty.call(setTimeout, "clock")
    );
  }
  return false;
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
        setTimeout(() => {
          resolve();
        }, 0);
        if (jestFakeTimersAreEnabled()) {
          jest.advanceTimersByTime(0);
        }
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
      act(() => {
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

function strictModeIfNeeded(innerElement: React.ReactNode, reactStrictMode: boolean | undefined): React.ReactNode {
  return (reactStrictMode ?? getConfig().reactStrictMode) ? React.createElement(React.StrictMode, null, innerElement) : innerElement;
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
    act(() => {
      root = ReactDOMClient.hydrateRoot(container, strictModeIfNeeded(wrapUiIfNeeded(ui, WrapperComponent), reactStrictMode), {
        onCaughtError,
        onRecoverableError,
      } as ReactDOMClient.HydrationOptions);
    });
  } else {
    root = ReactDOMClient.createRoot(container, {
      onCaughtError,
      onRecoverableError,
    } as ReactDOMClient.RootOptions);
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
    },
  };
}

// Queries bound to a base element, computed once per element. `document.body` is the base
// element of nearly every render in a test file, so this turns ~120 `bind` calls per render
// into a property copy.
const defaultBoundQueries = new WeakMap<object, Record<string, unknown>>();

function boundQueriesFor(baseElement: any, customQueries: Queries | undefined): Record<string, unknown> {
  if (customQueries !== undefined) return getQueriesForElement(baseElement, customQueries as any) as Record<string, unknown>;
  let bound = defaultBoundQueries.get(baseElement);
  if (bound === undefined) {
    bound = getQueriesForElement(baseElement) as Record<string, unknown>;
    defaultBoundQueries.set(baseElement, bound);
  }
  return bound;
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

function renderRoot(
  ui: React.ReactNode,
  { baseElement, container, hydrate, queries, root, wrapper: WrapperComponent, reactStrictMode }: RenderRootOptions,
): RenderResult<any, any, any> {
  act(() => {
    if (hydrate) {
      root.hydrate();
    } else {
      root.render(strictModeIfNeeded(wrapUiIfNeeded(ui, WrapperComponent), reactStrictMode));
    }
  });

  return {
    container,
    baseElement,
    debug: (el: unknown = baseElement, maxLength?: number, options?: prettyFormat.OptionsReceived) =>
      Array.isArray(el)
        ? // eslint-disable-next-line no-console
          el.forEach((e) => console.log(prettyDOM(e, maxLength, options)))
        : // eslint-disable-next-line no-console
          console.log(prettyDOM(el as any, maxLength, options)),
    unmount: () => {
      act(() => {
        root.unmount();
      });
    },
    rerender: (rerenderUi: React.ReactNode) => {
      renderRoot(rerenderUi, {
        container,
        baseElement,
        root,
        wrapper: WrapperComponent,
        reactStrictMode,
      });
      // Intentionally do not return anything to avoid unnecessarily complicating the API.
      // folks can use all the same utilities we return in the first place that are bound to
      // the container
    },
    asFragment: () => {
      if (typeof document.createRange === "function") {
        return document.createRange().createContextualFragment(container.innerHTML);
      }
      const template = document.createElement("template");
      template.innerHTML = container.innerHTML;
      return template.content;
    },
    ...boundQueriesFor(baseElement, queries),
  } as RenderResult<any, any, any>;
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
export function render(
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
  if (!container) {
    container = baseElement.appendChild(document.createElement("div"));
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
    }
  }
  mountedRootEntries.length = 0;
  mountedContainers.clear();
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
