// Port of @testing-library/react@16.3.3 src/act-compat.js
// https://github.com/testing-library/react-testing-library/blob/v16.3.3/src/act-compat.js
//
// React 19 always has `React.act`, so the `react-dom/test-utils` fallback upstream keeps for
// React 18.0 is dropped (this package peers on react@^19).

import * as React from "react";

type ActCallback = () => unknown;

const reactAct = React.act as (callback: ActCallback) => PromiseLike<unknown> & unknown;

interface ActGlobal {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
}

export function setReactActEnvironment(isReactActEnvironment: boolean | undefined): void {
  (globalThis as ActGlobal).IS_REACT_ACT_ENVIRONMENT = isReactActEnvironment;
}

export function getIsReactActEnvironment(): boolean | undefined {
  return (globalThis as ActGlobal).IS_REACT_ACT_ENVIRONMENT;
}

// React internals this module reaches into (not public API; same shape since React 18.0):
// - `actQueue`: the Scheduler tasks React defers to the open act scope instead of giving them to
//   its Scheduler; `didUsePromise`, set when a task suspends on data; `thrownErrors`, the errors
//   act rethrows once the scope ends (packages/react/src/ReactAct.js).
// - A FiberRoot's `callbackNode`/`callbackPriority`: the root's scheduled task, which inside act
//   is a placeholder object for a task in `actQueue` (ReactFiberRootScheduler.js).
type ActTask = (didTimeout: boolean) => ActTask | null;
interface FiberRoot {
  callbackNode: { callback?: unknown } | null;
  callbackPriority: number;
}
interface ReactInternals {
  actQueue: ActTask[] | null;
  didUsePromise: boolean;
  thrownErrors: unknown[];
}
const reactInternals = (React as unknown as Record<string, ReactInternals>)
  .__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

/** Roots created by render()/renderHook(), whose suspended work survives a synchronous act. */
export const actRoots = new Set<object>();

function fiberRootWithActPlaceholder(root: object): FiberRoot | null {
  const fiberRoot = (root as { _internalRoot: FiberRoot | null })._internalRoot;
  const node = fiberRoot?.callbackNode;
  // A Scheduler task has a `callback`; the act placeholder is an empty object.
  return node != null && node.callback === undefined ? fiberRoot! : null;
}

// A component suspended on data (`use(promise)`, `lazy`) inside a synchronous act: React 19
// commits the fallback, then queues a prerender of the suspended subtree that waits on the same
// promise. React's flush leaves that task in the act queue and drops the queue when the act
// returns, but the root keeps the placeholder it got inside act, and React never replaces a
// placeholder of the same priority: when the promise resolves, the root does not reschedule and
// the boundary shows its fallback forever (and React logs "the act call was not awaited").
// React's answer, `await act(...)`, hides the fallback from the test and polls every macrotask
// until the promise settles (attaching a listener to it each time).
//
// So RTL's own synchronous acts flush the queue themselves before React does, as React's
// flushActQueue would, but drop the tasks that suspend on data (React would drop them with the
// queue anyway: nobody awaits these acts) and clear the placeholders on the roots render()
// created, as React does outside act. The promise's resolution then schedules the retry like in
// a browser (inside whatever act scope is open then, e.g. waitFor's), and the fallback stays
// observable until then. React's flush finds the queue empty, so it does not warn. A root created
// some other way that suspends in one of these acts stays on its fallback, as it does upstream.
function flushReleasingSuspendedWork(queue: ActTask[]): void {
  let suspended = false;
  let i = 0;
  try {
    for (; i < queue.length; i++) {
      let task = queue[i];
      while (true) {
        reactInternals.didUsePromise = false;
        const continuation = task(false);
        if (continuation === null) break;
        if (reactInternals.didUsePromise) {
          suspended = true;
          break;
        }
        task = continuation;
      }
    }
    queue.length = 0;
  } catch (error) {
    // As React's flushActQueue: drop what ran, rethrow when the scope ends, leave the rest.
    queue.splice(0, i + 1);
    reactInternals.thrownErrors.push(error);
  }
  if (!suspended) return;
  for (const root of actRoots) {
    const fiberRoot = fiberRootWithActPlaceholder(root);
    if (fiberRoot !== null) {
      fiberRoot.callbackNode = null;
      fiberRoot.callbackPriority = 0;
    }
  }
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return value !== null && typeof value === "object" && typeof (value as PromiseLike<unknown>).then === "function";
}

function withGlobalActEnvironment(actImplementation: typeof reactAct) {
  return (callback: ActCallback): unknown => {
    const previousActEnvironment = getIsReactActEnvironment();
    setReactActEnvironment(true);
    try {
      // The return value of `act` is always a thenable.
      let callbackNeedsToBeAwaited = false;
      const actResult = actImplementation(() => {
        const result = callback();
        if (isThenable(result)) callbackNeedsToBeAwaited = true;
        return result;
      });
      if (callbackNeedsToBeAwaited) {
        const thenable = actResult as PromiseLike<unknown>;
        return {
          then: (resolve: (value: unknown) => void, reject: (error: unknown) => void) => {
            thenable.then(
              (returnValue) => {
                setReactActEnvironment(previousActEnvironment);
                resolve(returnValue);
              },
              (error) => {
                setReactActEnvironment(previousActEnvironment);
                reject(error);
              },
            );
          },
        };
      }
      setReactActEnvironment(previousActEnvironment);
      return actResult;
    } catch (error) {
      // Can't be a `finally {}` block since we don't know if we have to immediately restore
      // IS_REACT_ACT_ENVIRONMENT or if we have to await the callback first.
      setReactActEnvironment(previousActEnvironment);
      throw error;
    }
  };
}

/** `React.act` with `IS_REACT_ACT_ENVIRONMENT` set to true for its duration. */
const act = withGlobalActEnvironment(reactAct) as typeof React.act;

export default act;

/**
 * `act` for RTL's own synchronous updates (render, rerender, hydrate, events): work that
 * suspends on data is handed back to React's normal scheduling instead of being dropped with the
 * act queue. The exported `act` keeps React's semantics.
 */
export function actReleasingSuspendedWork(callback: () => void): void {
  // Only the outermost act flushes; nested ones leave the queue to it.
  if (reactInternals.actQueue !== null) {
    act(callback);
    return;
  }
  act(() => {
    const queue = reactInternals.actQueue!;
    callback();
    flushReleasingSuspendedWork(queue);
  });
}
