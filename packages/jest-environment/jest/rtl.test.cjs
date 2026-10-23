/**
 * Integration: stock React 19 + @testing-library/react from node_modules under Jest 30 with
 * jest-environment-rtd (via the package's jest-preset).
 *
 * Specs exercised through the libraries:
 *   HTML Standard — The Window object: https://html.spec.whatwg.org/#the-window-object
 *   HTML Standard — Reporting exceptions: https://html.spec.whatwg.org/#report-an-exception
 *   DOM Standard — Events: https://dom.spec.whatwg.org/#events
 */
"use strict";
const React = require("react");
const { render, screen, fireEvent, act, cleanup } = require("@testing-library/react");

const h = React.createElement;

function Counter() {
  const [n, setN] = React.useState(0);
  return h("div", null, h("h1", null, `Count: ${n}`), h("button", { type: "button", onClick: () => setN(n + 1) }, "Increment"));
}

function Frame() {
  const [frames, setFrames] = React.useState(0);
  React.useEffect(() => {
    const id = requestAnimationFrame(() => setFrames((f) => f + 1));
    return () => cancelAnimationFrame(id);
  }, []);
  return h("output", null, `frames: ${frames}`);
}

afterEach(() => {
  cleanup();
  jest.useRealTimers();
});

describe("environment globals — https://html.spec.whatwg.org/#the-window-object", () => {
  test("window is the vm global; testEnvironmentOptions apply", () => {
    expect(window).toBe(globalThis);
    expect(document.defaultView).toBe(window);
    expect(location.href).toBe("http://localhost:3000/start");
    expect(innerWidth).toBe(1280);
    expect(document.createElement("div")).toBeInstanceOf(HTMLElement);
  });

  test("@rtd/dom required from a test is the environment's instance (singleton shim)", () => {
    const dom = require("@rtd/dom");
    const internal = require("@rtd/dom/internal");
    expect(dom.Node).toBe(Node);
    expect(dom.currentWindowOrNull().document).toBe(document);
    expect(typeof internal.windowHooks).toBe("object");
    expect(document.body._impl).toBeInstanceOf(internal.NodeImpl);
  });
});

describe("React + Testing Library — https://dom.spec.whatwg.org/#events", () => {
  test("render, getByRole, fireEvent", () => {
    render(h(Counter));
    fireEvent.click(screen.getByRole("button", { name: "Increment" }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Count: 1");
  });

  test("Jest modern fake timers control requestAnimationFrame", () => {
    jest.useFakeTimers();
    render(h(Frame));
    expect(screen.getByText("frames: 0")).toBeTruthy();
    act(() => {
      jest.advanceTimersByTime(20);
    });
    expect(screen.getByText("frames: 1")).toBeTruthy();
  });
});
