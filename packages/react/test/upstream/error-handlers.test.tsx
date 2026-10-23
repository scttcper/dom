// Ported from @testing-library/react@16.3.3
// https://github.com/testing-library/react-testing-library/blob/v16.3.3/src/__tests__/error-handlers.js
// React 19 only (the React 18 `toErrorDev` branches are dropped: this package peers on react@^19).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, test, vi } from "vitest";
import * as React from "react";
import { render, renderHook } from "@rtd/react";

// No lib.dom in this repo: environment globals are untyped here.
declare const document: any;
declare const window: any;
declare const Event: any;

test("render errors", () => {
  function Thrower(): React.ReactNode {
    throw new Error("Boom!");
  }

  expect(() => {
    render(<Thrower />);
  }).toThrow("Boom!");
});

test("onUncaughtError is not supported in render", () => {
  function Thrower(): React.ReactNode {
    throw new Error("Boom!");
  }
  const onUncaughtError = vi.fn(() => {});

  expect(() => {
    render(<Thrower />, {
      // @ts-expect-error -- not supported, typed as never (like upstream)
      onUncaughtError(error: unknown, errorInfo: unknown) {
        console.log({ error, errorInfo });
      },
    });
  }).toThrow("onUncaughtError is not supported. The `render` call will already throw on uncaught errors.");

  expect(onUncaughtError).toHaveBeenCalledTimes(0);
});

test("onCaughtError is supported in render", () => {
  const thrownError = new Error("Boom!");
  const handleComponentDidCatch = vi.fn();
  const onCaughtError = vi.fn();
  class ErrorBoundary extends React.Component<{ children?: React.ReactNode }, { error: unknown }> {
    state = { error: null };
    static getDerivedStateFromError(error: unknown) {
      return { error };
    }
    componentDidCatch(error: unknown, errorInfo: unknown) {
      handleComponentDidCatch(error, errorInfo);
    }
    render() {
      if (this.state.error) {
        return null;
      }
      return this.props.children;
    }
  }
  function Thrower(): React.ReactNode {
    throw thrownError;
  }

  render(
    <ErrorBoundary>
      <Thrower />
    </ErrorBoundary>,
    {
      onCaughtError,
    },
  );

  expect(onCaughtError).toHaveBeenCalledWith(thrownError, {
    componentStack: expect.any(String),
    errorBoundary: expect.any(Object),
  });
});

test("onRecoverableError is supported in render", () => {
  const onRecoverableError = vi.fn();

  const container = document.createElement("div");
  container.innerHTML = "<div>server</div>";
  // We just hope we forwarded the callback correctly (which is guaranteed since we just pass it along)
  render(<div>client</div>, {
    container,
    hydrate: true,
    onRecoverableError,
  });
  expect(onRecoverableError).toHaveBeenCalledTimes(1);
});

test("onUncaughtError is not supported in renderHook", () => {
  function useThrower() {
    throw new Error("Boom!");
  }
  const onUncaughtError = vi.fn(() => {});

  expect(() => {
    renderHook(useThrower, {
      // @ts-expect-error -- not supported, typed as never (like upstream)
      onUncaughtError(error: unknown, errorInfo: unknown) {
        console.log({ error, errorInfo });
      },
    });
  }).toThrow("onUncaughtError is not supported. The `render` call will already throw on uncaught errors.");

  expect(onUncaughtError).toHaveBeenCalledTimes(0);
});

test("onCaughtError is supported in renderHook", () => {
  const thrownError = new Error("Boom!");
  const handleComponentDidCatch = vi.fn();
  const onCaughtError = vi.fn();
  class ErrorBoundary extends React.Component<{ children?: React.ReactNode }, { error: unknown }> {
    state = { error: null };
    static getDerivedStateFromError(error: unknown) {
      return { error };
    }
    componentDidCatch(error: unknown, errorInfo: unknown) {
      handleComponentDidCatch(error, errorInfo);
    }
    render() {
      if (this.state.error) {
        return null;
      }
      return this.props.children;
    }
  }
  function useThrower() {
    throw thrownError;
  }

  renderHook(useThrower, {
    onCaughtError,
    wrapper: ErrorBoundary,
  });

  expect(onCaughtError).toHaveBeenCalledWith(thrownError, {
    componentStack: expect.any(String),
    errorBoundary: expect.any(Object),
  });
});

// Currently, there's no recoverable error without hydration.
// The option is still supported though.
test("onRecoverableError is supported in renderHook", () => {
  const onRecoverableError = vi.fn();

  renderHook(
    () => {
      // TODO: trigger recoverable error
    },
    {
      onRecoverableError,
    },
  );
});
