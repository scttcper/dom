// Ported from @testing-library/react@16.3.3
// https://github.com/testing-library/react-testing-library/blob/v16.3.3/src/__tests__/renderHook.js
// React 18-gated tests are dropped.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, test, vi } from "vitest";
import React, { useEffect } from "react";
import { configure, renderHook, type Config } from "@ctrl/dom/react/pure";

test("gives committed result", () => {
  const { result } = renderHook(() => {
    const [state, setState] = React.useState(1);

    React.useEffect(() => {
      setState(2);
    }, []);

    return [state, setState];
  });

  expect(result.current).toEqual([2, expect.any(Function)]);
});

test("allows rerendering", () => {
  const { result, rerender } = renderHook(
    ({ branch }: { branch: string }) => {
      const [left, setLeft] = React.useState("left");
      const [right, setRight] = React.useState("right");

      switch (branch) {
        case "left":
          return [left, setLeft];
        case "right":
          return [right, setRight];

        default:
          throw new Error("No Props passed. This is a bug in the implementation");
      }
    },
    { initialProps: { branch: "left" } },
  );

  expect(result.current).toEqual(["left", expect.any(Function)]);

  rerender({ branch: "right" });

  expect(result.current).toEqual(["right", expect.any(Function)]);
});

test("allows wrapper components", async () => {
  const Context = React.createContext("default");
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <Context.Provider value="provided">{children}</Context.Provider>;
  }
  const { result } = renderHook(
    () => {
      return React.useContext(Context);
    },
    {
      wrapper: Wrapper,
    },
  );

  expect(result.current).toEqual("provided");
});

test("legacyRoot throws", () => {
  const Context = React.createContext("default");
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <Context.Provider value="provided">{children}</Context.Provider>;
  }
  expect(() => {
    renderHook(
      () => {
        return React.useContext(Context);
      },
      {
        wrapper: Wrapper,
        legacyRoot: true,
      },
    ).result;
  }).toThrowErrorMatchingInlineSnapshot(
    `[Error: \`legacyRoot: true\` is not supported in this version of React. If your app runs React 19 or later, you should remove this flag. If your app runs React 18 or earlier, visit https://react.dev/blog/2022/03/08/react-18-upgrade-guide for upgrade instructions.]`,
  );
});

describe("reactStrictMode", () => {
  let originalConfig: Config;
  beforeEach(() => {
    // Grab the existing configuration so we can restore
    // it at the end of the test
    configure((existingConfig) => {
      originalConfig = existingConfig;
      // Don't change the existing config
      return {};
    });
  });

  afterEach(() => {
    configure(originalConfig);
  });

  test("reactStrictMode in renderOptions has precedence over config when rendering", () => {
    const hookMountEffect = vi.fn();
    configure({ reactStrictMode: false });

    renderHook(() => useEffect(() => hookMountEffect()), {
      reactStrictMode: true,
    });

    expect(hookMountEffect).toHaveBeenCalledTimes(2);
  });
});
