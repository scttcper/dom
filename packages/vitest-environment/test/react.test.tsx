// @vitest-environment rtd
// @vitest-environment-options { "url": "http://localhost:3000/app?x=1", "width": 1280, "matchMedia": true }
/**
 * Integration: stock React 19 + @testing-library/react + @testing-library/dom from
 * node_modules running on vitest-environment-rtd (the drop-in path: swap only the environment).
 *
 * Specs exercised through the libraries:
 *   HTML Standard — The Window object: https://html.spec.whatwg.org/#the-window-object
 *   DOM Standard — Events: https://dom.spec.whatwg.org/#events
 *   WAI-ARIA roles via @testing-library/dom queries: https://w3c.github.io/aria/#role_definitions
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cleanup, fireEvent, render, screen, waitFor, act } from "@testing-library/react";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function Counter({ initial = 0 }: { initial?: number }) {
  const [count, setCount] = useState(initial);
  return (
    <div>
      <h1>Count: {count}</h1>
      <button type="button" onClick={() => setCount((c) => c + 1)}>
        Increment
      </button>
      <label>
        Name
        <input aria-label="name" defaultValue="" />
      </label>
    </div>
  );
}

function Viewport() {
  const [wide, setWide] = useState(() => window.matchMedia("(min-width: 1000px)").matches);
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1000px)");
    const onChange = (e: { matches: boolean }) => setWide(e.matches);
    mql.addEventListener("change", onChange as never);
    return () => mql.removeEventListener("change", onChange as never);
  }, []);
  return <p>{wide ? "wide" : "narrow"}</p>;
}

function Frame() {
  const [frames, setFrames] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setFrames((f) => f + 1));
    return () => cancelAnimationFrame(id);
  }, []);
  return <output>frames: {frames}</output>;
}

describe("environment globals — https://html.spec.whatwg.org/#the-window-object", () => {
  test("window is the global and environment options apply", () => {
    expect(window).toBe(globalThis);
    expect(document.defaultView).toBe(window);
    expect(location.href).toBe("http://localhost:3000/app?x=1");
    expect(innerWidth).toBe(1280);
    expect(document.body.tagName).toBe("BODY");
    expect(navigator.language).toBe("en-US");
  });

  test("DOM interfaces replace Node's while keeping Node's platform APIs", () => {
    expect(document.createElement("div")).toBeInstanceOf(HTMLElement);
    expect(new Event("x")).toBeInstanceOf(Event);
    expect(typeof URL).toBe("function");
    expect(typeof fetch).toBe("function");
    expect(new DOMException("m", "AbortError").name).toBe("AbortError");
  });

  test("FormData is the DOM one and accepts our forms (https://xhr.spec.whatwg.org/#interface-formdata)", () => {
    const form = document.createElement("form");
    form.innerHTML = '<input name="a" value="1"><input name="b" value="2">';
    const data = new FormData(form as never);
    expect([...data.entries()]).toEqual([["a", "1"], ["b", "2"]]);
  });
});

describe("React + Testing Library — https://dom.spec.whatwg.org/#events", () => {
  test("render, query by role and fire events", () => {
    render(<Counter initial={2} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Count: 2");
    fireEvent.click(screen.getByRole("button", { name: "Increment" }));
    expect(screen.getByRole("heading").textContent).toBe("Count: 3");
    const input = screen.getByRole("textbox", { name: "name" }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Ada" } });
    expect(input.value).toBe("Ada");
  });

  test("matchMedia change events re-render", () => {
    render(<Viewport />);
    expect(screen.getByText("wide")).toBeTruthy();
    act(() => {
      window.innerWidth = 800;
    });
    expect(screen.getByText("narrow")).toBeTruthy();
  });

  test("requestAnimationFrame callbacks run (real timers)", async () => {
    render(<Frame />);
    await waitFor(() => expect(screen.getByText("frames: 1")).toBeTruthy());
  });

  test("requestAnimationFrame is controlled by fake timers", () => {
    vi.useFakeTimers();
    render(<Frame />);
    expect(screen.getByText("frames: 0")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(20);
    });
    expect(screen.getByText("frames: 1")).toBeTruthy();
    vi.useRealTimers();
    expect(typeof requestAnimationFrame).toBe("function");
    expect(typeof cancelAnimationFrame).toBe("function");
  });

  test("an exception thrown by a React onClick is reported to the host as uncaughtException (https://html.spec.whatwg.org/#report-an-exception)", () => {
    // Vitest reports `uncaughtException` as an unhandled error that fails the run unless another
    // process listener exists; this listener stands in for Vitest's and keeps the run green.
    const errors: unknown[] = [];
    const listener = (error: unknown) => errors.push(error);
    process.on("uncaughtException", listener);
    try {
      const boom = new Error("boom from onClick");
      function Thrower() {
        return (
          <button
            type="button"
            onClick={() => {
              throw boom;
            }}
          >
            throw
          </button>
        );
      }
      const { container } = render(<Thrower />);
      fireEvent.click(container.querySelector("button")!);
      expect(errors).toContain(boom);
    } finally {
      process.off("uncaughtException", listener);
    }
  });

  test("a throwing native listener is reported too, unless an error listener cancels it", () => {
    const errors: unknown[] = [];
    const listener = (error: unknown) => errors.push(error);
    process.on("uncaughtException", listener);
    try {
      const el = document.createElement("div");
      const boom = new Error("listener boom");
      el.addEventListener("click", () => {
        throw boom;
      });
      el.dispatchEvent(new Event("click"));
      expect(errors).toEqual([boom]);
      const handled = (e: Event) => e.preventDefault();
      window.addEventListener("error", handled);
      el.dispatchEvent(new Event("click"));
      window.removeEventListener("error", handled);
      expect(errors).toEqual([boom]);
    } finally {
      process.off("uncaughtException", listener);
    }
  });

  test("React portals into an iframe document (https://html.spec.whatwg.org/#the-iframe-element)", () => {
    function Framed() {
      const [frame, setFrame] = useState<HTMLIFrameElement | null>(null);
      const [count, setCount] = useState(0);
      const body = frame?.contentDocument?.body;
      return (
        <>
          <iframe title="frame" ref={setFrame} />
          {body ? createPortal(<button onClick={() => setCount((c) => c + 1)}>inside {count}</button>, body) : null}
        </>
      );
    }
    render(<Framed />);
    const iframe = screen.getByTitle("frame") as HTMLIFrameElement;
    const button = iframe.contentDocument!.querySelector("button")!;
    expect(button.textContent).toBe("inside 0");
    fireEvent.click(button);
    expect(button.textContent).toBe("inside 1");
    expect(iframe.contentWindow!.parent).toBe(window);
  });

  test("localStorage and history work through the globals", () => {
    localStorage.setItem("k", "v");
    expect(localStorage.getItem("k")).toBe("v");
    history.pushState({ a: 1 }, "", "/next");
    expect(location.pathname).toBe("/next");
    expect(history.state).toEqual({ a: 1 });
  });
});
