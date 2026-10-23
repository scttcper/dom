// Ported from @testing-library/react@16.3.3
// https://github.com/testing-library/react-testing-library/blob/v16.3.3/src/__tests__/end-to-end.js
//
// Divergence: jest's "legacy" and "modern" fake timers both map to vitest's (sinon-based)
// fake timers, and `globalThis.jest = vi` is set for this file because upstream's (and DTL's)
// fake-timer detection only looks for a global `jest` (vitest users do the same shim).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, test, vi } from "vitest";
import * as React from "react";
import { render, waitForElementToBeRemoved, screen, waitFor } from "@rtd/react";

const g = globalThis as any;
beforeAll(() => {
  g.jest = vi;
});
afterAll(() => {
  delete g.jest;
});

const timerModes: Array<[string, () => void]> = [
  ["real timers", () => vi.useRealTimers()],
  ["fake legacy timers", () => vi.useFakeTimers()],
  ["fake modern timers", () => vi.useFakeTimers()],
];

describe.each(timerModes)("it waits for the data to be loaded in a macrotask using %s", (label, useTimers) => {
  beforeEach(() => {
    useTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const fetchAMessageInAMacrotask = () =>
    new Promise<{ returnedMessage: string }>((resolve) => {
      // we are using random timeout here to simulate a real-time example
      // of an async operation calling a callback at a non-deterministic time
      const randomTimeout = Math.floor(Math.random() * 100);
      setTimeout(() => {
        resolve({ returnedMessage: "Hello World" });
      }, randomTimeout);
    });

  function ComponentWithMacrotaskLoader() {
    const [state, setState] = React.useState<{ data: any; loading: boolean }>({ data: undefined, loading: true });
    React.useEffect(() => {
      let cancelled = false;
      fetchAMessageInAMacrotask().then((data) => {
        if (!cancelled) {
          setState({ data, loading: false });
        }
      });

      return () => {
        cancelled = true;
      };
    }, []);

    if (state.loading) {
      return <div>Loading...</div>;
    }

    return <div data-testid="message">Loaded this message: {state.data.returnedMessage}!</div>;
  }

  test("waitForElementToBeRemoved", async () => {
    render(<ComponentWithMacrotaskLoader />);
    const loading = () => screen.getByText("Loading...");
    await waitForElementToBeRemoved(loading);
    expect(screen.getByTestId("message")).toHaveTextContent(/Hello World/);
  });

  test("waitFor", async () => {
    render(<ComponentWithMacrotaskLoader />);
    await waitFor(() => screen.getByText(/Loading../));
    await waitFor(() => screen.getByText(/Loaded this message:/));
    expect(screen.getByTestId("message")).toHaveTextContent(/Hello World/);
  });

  test("findBy", async () => {
    render(<ComponentWithMacrotaskLoader />);
    await expect(screen.findByTestId("message")).resolves.toHaveTextContent(/Hello World/);
  });
});

describe.each(timerModes)("it waits for the data to be loaded in many microtask using %s", (label, useTimers) => {
  beforeEach(() => {
    useTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const fetchAMessageInAMicrotask = () =>
    Promise.resolve({
      status: 200,
      json: () => Promise.resolve({ title: "Hello World" }),
    });

  function ComponentWithMicrotaskLoader() {
    const [fetchState, setFetchState] = React.useState<{ fetching: boolean; todo?: string }>({ fetching: true });

    React.useEffect(() => {
      if (fetchState.fetching) {
        fetchAMessageInAMicrotask().then((res) => {
          return (
            res
              .json()
              // By spec, the runtime can only yield back to the event loop once
              // the microtask queue is empty.
              // So we ensure that we actually wait for that as well before yielding back from `waitFor`.
              .then((data) => data)
              .then((data) => data)
              .then((data) => data)
              .then((data) => data)
              .then((data) => data)
              .then((data) => data)
              .then((data) => data)
              .then((data) => data)
              .then((data) => data)
              .then((data) => data)
              .then((data) => data)
              .then((data) => {
                setFetchState({ todo: data.title, fetching: false });
              })
          );
        });
      }
    }, [fetchState]);

    if (fetchState.fetching) {
      return <p>Loading..</p>;
    }

    return <div data-testid="message">Loaded this message: {fetchState.todo}</div>;
  }

  test("waitForElementToBeRemoved", async () => {
    render(<ComponentWithMicrotaskLoader />);
    const loading = () => screen.getByText("Loading..");
    await waitForElementToBeRemoved(loading);
    expect(screen.getByTestId("message")).toHaveTextContent(/Hello World/);
  });

  test("waitFor", async () => {
    render(<ComponentWithMicrotaskLoader />);
    await waitFor(() => {
      screen.getByText("Loading..");
    });
    await waitFor(() => {
      screen.getByText(/Loaded this message:/);
    });
    expect(screen.getByTestId("message")).toHaveTextContent(/Hello World/);
  });

  test("findBy", async () => {
    render(<ComponentWithMicrotaskLoader />);
    await expect(screen.findByTestId("message")).resolves.toHaveTextContent(/Hello World/);
  });
});

describe.each(timerModes)("it waits for the data to be loaded in a microtask using %s", (label, useTimers) => {
  beforeEach(() => {
    useTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const fetchAMessageInAMicrotask = () =>
    Promise.resolve({
      status: 200,
      json: () => Promise.resolve({ title: "Hello World" }),
    });

  function ComponentWithMicrotaskLoader() {
    const [fetchState, setFetchState] = React.useState<{ fetching: boolean; todo?: string }>({ fetching: true });

    React.useEffect(() => {
      if (fetchState.fetching) {
        fetchAMessageInAMicrotask().then((res) => {
          return res.json().then((data) => {
            setFetchState({ todo: data.title, fetching: false });
          });
        });
      }
    }, [fetchState]);

    if (fetchState.fetching) {
      return <p>Loading..</p>;
    }

    return <div data-testid="message">Loaded this message: {fetchState.todo}</div>;
  }

  test("waitForElementToBeRemoved", async () => {
    render(<ComponentWithMicrotaskLoader />);
    const loading = () => screen.getByText("Loading..");
    await waitForElementToBeRemoved(loading);
    expect(screen.getByTestId("message")).toHaveTextContent(/Hello World/);
  });

  test("waitFor", async () => {
    render(<ComponentWithMicrotaskLoader />);
    await waitFor(() => {
      screen.getByText("Loading..");
    });
    await waitFor(() => {
      screen.getByText(/Loaded this message:/);
    });
    expect(screen.getByTestId("message")).toHaveTextContent(/Hello World/);
  });

  test("findBy", async () => {
    render(<ComponentWithMicrotaskLoader />);
    await expect(screen.findByTestId("message")).resolves.toHaveTextContent(/Hello World/);
  });
});
