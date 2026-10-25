// Ported from @testing-library/react@16.3.3
// https://github.com/testing-library/react-testing-library/blob/v16.3.3/src/__tests__/cleanup.js
// `jest.*` -> `vi.*`. `jest.resetAllMocks()` -> `vi.resetAllMocks()`.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, test, vi } from "vitest";
import * as React from "react";
import { render, cleanup } from "@ctrl/dom/react";

// No lib.dom in this repo: environment globals are untyped here.
declare const document: any;
declare const window: any;
declare const Event: any;

test("cleans up the document", () => {
  const spy = vi.fn();
  const divId = "my-div";

  class Test extends React.Component {
    componentWillUnmount() {
      expect(document.getElementById(divId)).toBeInTheDocument();
      spy();
    }

    render() {
      return <div id={divId} />;
    }
  }

  render(<Test />);
  cleanup();
  expect(document.body).toBeEmptyDOMElement();
  expect(spy).toHaveBeenCalledTimes(1);
});

test("cleanup does not error when an element is not a child", () => {
  render(<div />, { container: document.createElement("div") });
  cleanup();
});

test("cleanup runs effect cleanup functions", () => {
  const spy = vi.fn();

  const Test = () => {
    React.useEffect(() => spy);

    return null;
  };

  render(<Test />);
  cleanup();
  expect(spy).toHaveBeenCalledTimes(1);
});

describe("fake timers and missing act warnings", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {
      // assert messages explicitly
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  test("cleanup does not flush microtasks", () => {
    const microTaskSpy = vi.fn();
    function Test() {
      const counter = 1;
      const [, setDeferredCounter] = React.useState<number | null>(null);
      React.useEffect(() => {
        let cancelled = false;
        Promise.resolve().then(() => {
          microTaskSpy();
          if (!cancelled) {
            setDeferredCounter(counter);
          }
        });

        return () => {
          cancelled = true;
        };
      }, [counter]);

      return null;
    }
    render(<Test />);

    cleanup();

    expect(microTaskSpy).toHaveBeenCalledTimes(0);
    // console.error is mocked
    expect(console.error).toHaveBeenCalledTimes(0);
  });

  test("cleanup does not swallow missing act warnings", () => {
    const deferredStateUpdateSpy = vi.fn();
    function Test() {
      const counter = 1;
      const [, setDeferredCounter] = React.useState<number | null>(null);
      React.useEffect(() => {
        let cancelled = false;
        setTimeout(() => {
          deferredStateUpdateSpy();
          if (!cancelled) {
            setDeferredCounter(counter);
          }
        }, 0);

        return () => {
          cancelled = true;
        };
      }, [counter]);

      return null;
    }
    render(<Test />);

    vi.runAllTimers();
    cleanup();

    expect(deferredStateUpdateSpy).toHaveBeenCalledTimes(1);
    // console.error is mocked
    expect(console.error).toHaveBeenCalledTimes(1);
    expect((console.error as any).mock.calls[0][0]).toMatch("a test was not wrapped in act(...)");
  });
});
