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
