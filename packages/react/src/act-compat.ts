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
//   its Scheduler (packages/react/src/ReactAct.js).
// - A FiberRoot's `callbackNode`/`callbackPriority`: the root's scheduled task, which inside act
//   is a placeholder object for a task in `actQueue` (ReactFiberRootScheduler.js).
type ActTask = (didTimeout: boolean) => ActTask | null;
interface FiberRoot {
  callbackNode: { callback?: unknown } | null;
  callbackPriority: number;
}
const reactInternals = (React as unknown as Record<string, { actQueue: ActTask[] | null }>)
  .__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

/** Roots created by render()/renderHook(), whose suspended work survives a synchronous act. */
export const actRoots = new Set<object>();

function noop(): void {}

// A component suspended on data (`use(promise)`, `lazy`) inside a synchronous act: React 19
// commits the fallback, then queues a prerender of the suspended subtree that waits on the same
// promise and stays in the act queue. The act drops that queue when it returns, but the root keeps
// the placeholder it got inside act, and React never replaces a placeholder of the same
// priority: when the promise resolves, the root does not reschedule and the boundary shows its
// fallback forever. React's answer, `await act(...)`, hides the fallback from the test and polls
// every macrotask until the promise settles (attaching a listener to it each time).
//
// Do what React does outside act instead: drop the queued work and its placeholders, so the
// promise's resolution schedules the retry like in a browser (inside whatever act scope is open
// then, e.g. waitFor's). The fallback stays observable until then.
function releaseSuspendedWork(queue: ActTask[]): void {
  queue.length = 0;
  reactInternals.actQueue = null;
  for (const root of actRoots) {
    const fiberRoot = (root as { _internalRoot: FiberRoot | null })._internalRoot;
    const node = fiberRoot?.callbackNode;
    // A Scheduler task has a `callback`; the act placeholder is an empty object.
    if (node != null && node.callback === undefined) {
      fiberRoot!.callbackNode = null;
      fiberRoot!.callbackPriority = 0;
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
      let queue: ActTask[] | null = null;
      const actResult = actImplementation(() => {
        queue = reactInternals.actQueue;
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
      // Work left in the queue after the outermost act returned waits on a promise.
      if (queue !== null && (queue as ActTask[]).length !== 0 && reactInternals.actQueue === null) {
        // Marking the act as awaited silences React's "the act call was not awaited" warning
        // (the work is handled). It also reopens the queue for React's flush loop; releasing
        // closes it again, so the loop finds nothing and resolves.
        (actResult as PromiseLike<unknown>).then(noop, noop);
        releaseSuspendedWork(queue);
      }
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
