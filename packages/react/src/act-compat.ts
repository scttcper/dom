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

// React 19 internals this module reaches into (not public API; checked against 19.3):
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

// Suspending on data (`use`, `lazy`) inside a synchronous act: React commits the fallback and
// queues a prerender that waits on the promise. React's flushActQueue stops at that task, the act
// drops the queue when it returns, but the root keeps act's placeholder callbackNode, which React
// never replaces with one of the same priority, so the boundary never leaves its fallback
// (react.development.js flushActQueue/act, react-dom-client.development.js
// scheduleTaskForRootDuringMicrotask). Awaiting the act only helps for data resolved by then.
//
// So RTL's own synchronous acts flush the queue first, as flushActQueue does, drop the tasks that
// suspend on data (React would drop them with the queue: nobody awaits these acts), and clear the
// placeholder on the roots render() created, so the promise's ping reschedules the retry like in
// a browser. React then finds an empty queue and does not warn. Roots created some other way stay
// on their fallback, as upstream, but without React's warning.
//
// Returns the errors React recorded (uncaught render errors) or a task threw: React checks
// `thrownErrors` right after the callback and rethrows without closing its queue, so the caller
// rethrows them once act has returned. Tasks after a throwing one stay for React's own flush.
function flushReleasingSuspendedWork(queue: ActTask[]): unknown[] {
  let suspended = false;
  let i = 0;
  try {
    for (; i < queue.length; i++) {
      let task: ActTask | null = queue[i];
      while (task !== null) {
        reactInternals.didUsePromise = false;
        task = task(false);
        if (task !== null && reactInternals.didUsePromise) {
          suspended = true;
          break;
        }
      }
    }
    queue.length = 0;
  } catch (error) {
    // As flushActQueue: drop what ran, the throwing task too.
    queue.splice(0, i + 1);
    // First, as before React's recorded errors.
    reactInternals.thrownErrors.unshift(error);
  }
  if (suspended) {
    for (const root of actRoots) {
      const fiberRoot = (root as { _internalRoot: FiberRoot | null })._internalRoot;
      const node = fiberRoot?.callbackNode;
      // A Scheduler task has a `callback`; act's placeholder is an empty object.
      if (node != null && node.callback === undefined) {
        fiberRoot!.callbackNode = null;
        fiberRoot!.callbackPriority = 0;
      }
    }
  }
  return reactInternals.thrownErrors.splice(0);
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
  let errors: unknown[] = [];
  try {
    act(() => {
      const queue = reactInternals.actQueue!;
      callback();
      errors = flushReleasingSuspendedWork(queue);
    });
  } catch (actError) {
    // React's flush of the tasks left after a throwing one threw too.
    errors.push(actError);
  }
  // As React's act: one error as is, several aggregated.
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors);
}
