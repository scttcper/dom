/**
 * React 19 Suspense through the plain Testing Library API, without `await act(...)` wrappers.
 *
 * On React 19, stock @testing-library/react leaves a boundary that suspended during `render()`
 * (or a later `fireEvent`) stuck on its fallback, so `findBy*` times out unless the test wraps
 * the update in `await act(async () => ...)`, which in turn hides the fallback from the test.
 * Every test here is written the way such tests were written on React 18: assert the fallback
 * synchronously, then `findBy*` / `waitFor` / `waitForElementToBeRemoved` the content.
 *
 * React behavior pinned: https://react.dev/reference/react/Suspense,
 * https://react.dev/reference/react/use, https://react.dev/reference/react/lazy.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import * as React from "react";
import { Suspense, lazy, use, useState } from "react";
import { fireEvent, render, renderHook, screen, waitFor, waitForElementToBeRemoved } from "@ctrl/dom/react";

function deferred<T>() {
  return Promise.withResolvers<T>();
}

function Reader({ promise }: { promise: Promise<string> }) {
  return <p>{use(promise)}</p>;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("Suspense during render()", () => {
  // First in the file: React logs this warning once per module instance.
  test("logs no act warning: the suspended work is handled, not left to `await act`", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { promise, resolve } = deferred<string>();
    render(
      <Suspense fallback="fallback">
        <Reader promise={promise} />
      </Suspense>,
    );
    resolve("done");
    await screen.findByText("done");
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  test("shows the fallback synchronously, then findBy* resolves once the promise does", async () => {
    const { promise, resolve } = deferred<string>();
    render(
      <Suspense fallback="fallback">
        <Reader promise={promise} />
      </Suspense>,
    );
    expect(screen.getByText("fallback")).toBeInTheDocument();
    resolve("resolved");
    expect(await screen.findByText("resolved")).toBeInTheDocument();
    expect(screen.queryByText("fallback")).not.toBeInTheDocument();
  });

  test("a promise that resolves on a timer (mocked API latency) reveals the content", async () => {
    const promise = new Promise<string>((resolve) => setTimeout(resolve, 20, "loaded"));
    render(
      <Suspense fallback="fallback">
        <Reader promise={promise} />
      </Suspense>,
    );
    expect(screen.getByText("fallback")).toBeInTheDocument();
    expect(await screen.findByText("loaded")).toBeInTheDocument();
  });

  // Only the first of several identical tests used to pass.
  for (const run of [1, 2, 3]) {
    test(`repeated identical test #${run} still un-suspends`, async () => {
      const promise = new Promise<string>((resolve) => setTimeout(resolve, 5, `run ${run}`));
      render(
        <Suspense fallback="fallback">
          <Reader promise={promise} />
        </Suspense>,
      );
      expect(await screen.findByText(`run ${run}`)).toBeInTheDocument();
    });
  }

  test("React.lazy deep in the tree resolves without preloading the module", async () => {
    const LazyPanel = lazy(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { default: () => <section aria-label="panel">lazy content</section> };
    });
    render(
      <main>
        <h1>Page</h1>
        <div>
          <Suspense fallback={<span>loading panel</span>}>
            <LazyPanel />
          </Suspense>
        </div>
      </main>,
    );
    expect(screen.getByText("loading panel")).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "panel" })).toHaveTextContent("lazy content");
  });

  test("nested boundaries reveal in order as their promises resolve", async () => {
    const outer = deferred<string>();
    const inner = deferred<string>();
    render(
      <Suspense fallback="outer fallback">
        <Reader promise={outer.promise} />
        <Suspense fallback="inner fallback">
          <Reader promise={inner.promise} />
        </Suspense>
      </Suspense>,
    );
    expect(screen.getByText("outer fallback")).toBeInTheDocument();
    outer.resolve("outer");
    expect(await screen.findByText("outer")).toBeInTheDocument();
    expect(screen.getByText("inner fallback")).toBeInTheDocument();
    inner.resolve("inner");
    expect(await screen.findByText("inner")).toBeInTheDocument();
  });

  test("a Suspense wrapper + waitForElementToBeRemoved on the fallback (the Jotai-style setup)", async () => {
    const { promise, resolve } = deferred<string>();
    function Wrapper({ children }: { children: React.ReactNode }) {
      return <Suspense fallback={<div data-testid="suspense" />}>{children}</Suspense>;
    }
    render(<Reader promise={promise} />, { wrapper: Wrapper });
    expect(screen.getByTestId("suspense")).toBeInTheDocument();
    setTimeout(resolve, 10, "atom value");
    await waitForElementToBeRemoved(() => screen.queryByTestId("suspense"));
    expect(screen.getByText("atom value")).toBeInTheDocument();
  });

  test("a rejected promise reaches the error boundary", async () => {
    class Boundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
      state = { error: null as Error | null };
      static getDerivedStateFromError(error: Error) {
        return { error };
      }
      render() {
        return this.state.error ? <p role="alert">{this.state.error.message}</p> : this.props.children;
      }
    }
    const { promise, reject } = deferred<string>();
    const onCaughtError = vi.fn();
    render(
      <Boundary>
        <Suspense fallback="fallback">
          <Reader promise={promise} />
        </Suspense>
      </Boundary>,
      { onCaughtError },
    );
    expect(screen.getByText("fallback")).toBeInTheDocument();
    reject(new Error("failed to load"));
    expect(await screen.findByRole("alert")).toHaveTextContent("failed to load");
  });
});

describe("Suspense triggered by an event", () => {
  test("fireEvent.click that suspends shows the fallback, then the content", async () => {
    const pending = deferred<string>();
    function App() {
      const [promise, setPromise] = useState<Promise<string> | null>(null);
      return (
        <>
          <button onClick={() => setPromise(pending.promise)}>load</button>
          <Suspense fallback="fallback">{promise ? <Reader promise={promise} /> : <p>idle</p>}</Suspense>
        </>
      );
    }
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "load" }));
    expect(screen.getByText("fallback")).toBeInTheDocument();
    pending.resolve("details");
    expect(await screen.findByText("details")).toBeInTheDocument();
  });

  test("startTransition keeps the previous content until the suspended update resolves", async () => {
    const pending = deferred<string>();
    function App() {
      const [promise, setPromise] = useState<Promise<string>>(() => Promise.resolve("first"));
      const [isPending, startTransition] = React.useTransition();
      return (
        <>
          <button onClick={() => startTransition(() => setPromise(pending.promise))}>next</button>
          {isPending && <span>pending</span>}
          <Suspense fallback="fallback">
            <Reader promise={promise} />
          </Suspense>
        </>
      );
    }
    render(<App />);
    expect(await screen.findByText("first")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "next" }));
    expect(await screen.findByText("pending")).toBeInTheDocument();
    expect(screen.getByText("first")).toBeInTheDocument();
    pending.resolve("second");
    expect(await screen.findByText("second")).toBeInTheDocument();
    expect(screen.queryByText("pending")).not.toBeInTheDocument();
  });
});

describe("renderHook with a suspending hook", () => {
  test("result.current fills in once the promise resolves", async () => {
    const { promise, resolve } = deferred<number>();
    const { result } = renderHook(() => use(promise), {
      wrapper: ({ children }) => <Suspense fallback={null}>{children}</Suspense>,
    });
    expect(result.current).toBeNull();
    resolve(42);
    await waitFor(() => expect(result.current).toBe(42));
  });
});

describe("Suspense with fake timers", () => {
  test("vi.useFakeTimers: findBy* advances past React's fallback throttle", async () => {
    vi.useFakeTimers();
    const promise = new Promise<string>((resolve) => setTimeout(resolve, 100, "heading"));
    render(
      <Suspense fallback="fallback">
        <h1>
          <Reader promise={promise} />
        </h1>
      </Suspense>,
    );
    expect(screen.getByText("fallback")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("heading");
  });

  for (const run of [1, 2]) {
    test(`vi.useFakeTimers: repeated identical test #${run} still un-suspends`, async () => {
      vi.useFakeTimers();
      const promise = new Promise<string>((resolve) => setTimeout(resolve, 50, `fake ${run}`));
      render(
        <Suspense fallback="fallback">
          <Reader promise={promise} />
        </Suspense>,
      );
      expect(await screen.findByText(`fake ${run}`)).toBeInTheDocument();
    });
  }

  test("vi.useFakeTimers: data that arrives after many waitFor advances", async () => {
    vi.useFakeTimers();
    const promise = new Promise<string>((resolve) => setTimeout(resolve, 900, "slow"));
    render(
      <Suspense fallback="fallback">
        <Reader promise={promise} />
      </Suspense>,
    );
    expect(await screen.findByText("slow")).toBeInTheDocument();
  });

  test("vi.useFakeTimers: fireEvent.click that suspends, then findBy*", async () => {
    vi.useFakeTimers();
    function App() {
      const [promise, setPromise] = useState<Promise<string> | null>(null);
      return (
        <>
          <button onClick={() => setPromise(new Promise((resolve) => setTimeout(resolve, 200, "clicked")))}>
            load
          </button>
          <Suspense fallback="fallback">{promise ? <Reader promise={promise} /> : <p>idle</p>}</Suspense>
        </>
      );
    }
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "load" }));
    expect(screen.getByText("fallback")).toBeInTheDocument();
    expect(await screen.findByText("clicked")).toBeInTheDocument();
  });
});
