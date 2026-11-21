/**
 * @ctrl/dom/react-specific behavior that the upstream suites do not pin.
 */
import { describe, expect, test, vi } from "vitest";
import * as React from "react";
import * as pure from "@ctrl/dom/react/pure";
import * as main from "@ctrl/dom/react";

declare const document: any;

describe("entry points", () => {
  test("the main entry re-exports everything from /pure plus DOM Testing Library", () => {
    for (const key of Object.keys(pure)) expect(main).toHaveProperty(key);
    for (const key of [
      "render",
      "renderHook",
      "cleanup",
      "act",
      "fireEvent",
      "screen",
      "within",
      "waitFor",
      "configure",
      "getConfig",
      "prettyDOM",
      "queries",
    ]) {
      expect(typeof (main as any)[key]).not.toBe("undefined");
    }
  });

  test("fireEvent keeps every DOM Testing Library alias", async () => {
    const dtl = await import("../src/dtl.ts");
    for (const key of Object.keys(dtl.fireEvent)) expect(typeof (main.fireEvent as any)[key]).toBe("function");
  });
});

describe("render result", () => {
  test("query functions are own enumerable properties bound to baseElement, shared across renders", () => {
    const a = main.render(<p>one</p>);
    const b = main.render(<p>two</p>);
    expect(Object.keys(a)).toEqual(
      expect.arrayContaining([
        "container",
        "baseElement",
        "debug",
        "rerender",
        "unmount",
        "asFragment",
        "getByText",
        "findAllByRole",
      ]),
    );
    expect(a).not.toBe(b);
    expect(a.getByText).toBe(b.getByText);
    expect(a.getByText("two")).toBe(b.container.firstChild);
  });

  test("keeps upstream's key order (render fields, then the queries), and each render its own fields", () => {
    const a = main.render(<p>one</p>);
    const b = main.render(<p>two</p>);
    expect(Object.keys(a).slice(0, 6)).toEqual([
      "container",
      "baseElement",
      "debug",
      "unmount",
      "rerender",
      "asFragment",
    ]);
    expect(Object.keys(a)).toEqual(Object.keys(b));
    expect(Object.keys(a)).toHaveLength(6 + Object.keys(main.queries).length);
    expect(a.container).not.toBe(b.container);
    expect(a.unmount).not.toBe(b.unmount);
    const copy = { ...a };
    expect(copy.getByText("one")).toBe(a.container.firstChild);
  });

  test("custom queries are bound per render and replace the defaults", () => {
    const queryAllByFoo = (container: any) => Array.from(container.querySelectorAll("[data-foo]"));
    const queries = { getByFoo: (container: any) => queryAllByFoo(container)[0] };
    const result: any = main.render(<span data-foo="x">foo</span>, { queries: queries as any });
    expect(Object.keys(result)).not.toContain("getByText");
    expect(result.getByFoo()).toBe(result.container.firstChild);
  });

  test("a different baseElement gets its own bound queries", () => {
    const host = document.body.appendChild(document.createElement("section"));
    const a = main.render(<b>in host</b>, { baseElement: host });
    const b = main.render(<b>in body</b>);
    expect(a.getByText).not.toBe(b.getByText);
    expect(a.queryByText("in body")).toBeNull();
    host.remove();
  });

  test("removing a focused input during cleanup leaves focus on the body without firing blur", () => {
    const onBlur = vi.fn();
    const view = main.render(<input onBlur={onBlur} />);
    const field = view.getByRole("textbox");
    field.focus();
    expect(document.activeElement).toBe(field);
    main.cleanup();
    expect(document.activeElement).toBe(document.body);
    expect(onBlur).not.toHaveBeenCalled();
  });
});

describe("container reuse", () => {
  // React's createRoot adds its 142 root listeners only to a container it has not listened on
  // (listenToAllSupportedEvents): https://react.dev/reference/react-dom/client/createRoot
  test("a container render() created is given to the next render() after cleanup(), and its events still reach React", () => {
    const first = main.render(<p>one</p>);
    main.cleanup();
    expect(first.container.parentNode).toBeNull();
    const onClick = vi.fn();
    const second = main.render(<button onClick={onClick}>two</button>);
    expect(second.container).toBe(first.container);
    expect(second.container.parentNode).toBe(document.body);
    expect(second.container.innerHTML).toBe("<button>two</button>");
    main.fireEvent.click(second.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
    main.cleanup();
  });

  test("two renders alive at once get different containers", () => {
    const a = main.render(<p>a</p>);
    const b = main.render(<p>b</p>);
    expect(a.container).not.toBe(b.container);
    main.cleanup();
  });

  test.each([
    ["an attribute", (c: any) => c.setAttribute("data-mine", "")],
    ["a listener", (c: any) => c.addEventListener("click", () => {})],
    ["a handler property", (c: any) => (c.ontoggle = () => {})],
    ["an own property", (c: any) => (c.mine = 1)],
    ["a mutation observer", (c: any) => new MutationObserver(() => {}).observe(c, { childList: true })],
    ["a shadow root", (c: any) => c.attachShadow({ mode: "closed" })],
    ["a child", (c: any) => c.append("left behind")],
  ])("a container the test gave %s is not reused", (_what, touch) => {
    main.cleanup();
    const first = main.render(<p>one</p>);
    touch(first.container);
    main.cleanup();
    const second = main.render(<p>two</p>);
    expect(second.container).not.toBe(first.container);
    main.cleanup();
  });

  test("a container the caller passed is never reused", () => {
    main.cleanup();
    const mine = document.body.appendChild(document.createElement("div"));
    main.render(<p>one</p>, { container: mine });
    main.cleanup();
    expect(main.render(<p>two</p>).container).not.toBe(mine);
    main.cleanup();
  });
});

describe("act environment", () => {
  test("act restores IS_REACT_ACT_ENVIRONMENT after an async callback resolves", async () => {
    const g = globalThis as any;
    g.IS_REACT_ACT_ENVIRONMENT = "sentinel";
    const pending = main.act(async () => {
      expect(g.IS_REACT_ACT_ENVIRONMENT).toBe(true);
      await Promise.resolve();
    });
    expect(g.IS_REACT_ACT_ENVIRONMENT).toBe(true);
    await pending;
    expect(g.IS_REACT_ACT_ENVIRONMENT).toBe("sentinel");
    g.IS_REACT_ACT_ENVIRONMENT = true;
  });

  test("waitFor runs with IS_REACT_ACT_ENVIRONMENT=false and restores it", async () => {
    const g = globalThis as any;
    let during: unknown;
    await main.waitFor(() => {
      during = g.IS_REACT_ACT_ENVIRONMENT;
    });
    expect(during).toBe(false);
    expect(g.IS_REACT_ACT_ENVIRONMENT).toBe(true);
  });

  test("asyncWrapper restores the act environment when the callback throws or rejects", async () => {
    const { getConfig } = await import("../src/dtl.ts");
    const error = new Error("Action failed");
    const fail = () => {
      throw error;
    };
    for (const callback of [fail, () => Promise.reject(error)]) {
      await expect(getConfig().asyncWrapper(callback)).rejects.toBe(error);
      expect((globalThis as any).IS_REACT_ACT_ENVIRONMENT).toBe(true);
    }
  });

  test("asyncWrapper's drain on the idle-skipping clock: one event-loop turn without a 0 ms timer when nothing is due, and a timer due within the millisecond still runs before it resolves", async () => {
    const { getConfig } = await import("../src/dtl.ts");
    const original = globalThis.setTimeout;
    let calls = 0;
    // Counts calls and copies the clock's own properties, as user-event's timer observer does.
    const counting = function (this: unknown, ...args: unknown[]) {
      calls++;
      return (original as (...a: unknown[]) => unknown).apply(this, args);
    };
    Object.defineProperties(counting, Object.getOwnPropertyDescriptors(original));
    globalThis.setTimeout = counting as unknown as typeof setTimeout;
    try {
      // Work earlier tests left queued (React's scheduler) settles first.
      for (let i = 0; i < 3; i++) await new Promise<void>((resolve) => setImmediate(resolve));
      const start = performance.now();
      await getConfig().asyncWrapper(async () => {});
      expect(calls).toBe(0);
      // The millisecond the 0 ms timer would have waited still passes on the clock.
      expect(performance.now() - start).toBeGreaterThanOrEqual(1);
      const order: string[] = [];
      setTimeout(() => order.push("timer"), 0);
      await getConfig().asyncWrapper(async () => {});
      order.push("drained");
      expect(order).toEqual(["timer", "drained"]);
      // The app's timer and the drain's own 0 ms timer.
      expect(calls).toBe(2);
    } finally {
      globalThis.setTimeout = original;
    }
  });

  test("asyncWrapper's drain: work that microtasks queued behind it schedule (React's scheduler, through setImmediate) runs before it resolves, as with the 0 ms timer", async () => {
    // Downstream: React Hook Form's useFieldArray "not corrupt parent state when remove is called
    // with values prop" read its update log before React's effects ran when the drain decided
    // from a microtask that it could take one turn.
    const { getConfig } = await import("../src/dtl.ts");
    for (let i = 0; i < 3; i++) await new Promise<void>((resolve) => setImmediate(resolve));
    const order: string[] = [];
    await getConfig().asyncWrapper(async () => {
      queueMicrotask(() => queueMicrotask(() => setImmediate(() => order.push("scheduled work"))));
    });
    order.push("drained");
    expect(order).toEqual(["scheduled work", "drained"]);
  });

  test("nested eventWrapper calls run inside a single act", () => {
    const spy = vi.fn();
    function Clicker() {
      const [n, setN] = React.useState(0);
      return (
        <button
          onClick={() => {
            setN(n + 1);
            main.fireEvent.focus(document.activeElement ?? document.body);
            spy(n);
          }}
        >
          {n}
        </button>
      );
    }
    main.render(<Clicker />);
    main.fireEvent.click(main.screen.getByRole("button"));
    expect(main.screen.getByRole("button")).toHaveTextContent("1");
    expect(spy).toHaveBeenCalledWith(0);
  });
});

describe("renderHook", () => {
  test("legacyRoot throws before rendering", () => {
    expect(() => main.renderHook(() => 1, { legacyRoot: true })).toThrow(/`legacyRoot: true` is not supported/);
    expect(document.body.innerHTML).toBe("");
  });

  test("unmount runs effect cleanups", () => {
    const cleanup = vi.fn();
    const { unmount } = main.renderHook(() => React.useEffect(() => cleanup, []));
    unmount();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});

// The environment gives React's per-object accessors one function pair (@ctrl/dom's
// window/shared-accessors.ts); React itself must not be able to tell.
describe("React's development build on shared accessors", () => {
  test("reading `key` off props warns once with React's own text, and the element still has its key", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const Row = (props: { label: string }) => <li>{props.label}</li>;
    const first = <Row key="a" label="one" />;
    const second = <Row key="b" label="two" />;
    expect([first.key, second.key]).toEqual(["a", "b"]);
    expect(Object.keys(second.props)).toEqual(["label"]);
    expect((second.props as { key?: unknown }).key).toBeUndefined();
    expect((first.props as { key?: unknown }).key).toBeUndefined();
    const keyWarnings = error.mock.calls.filter(([format]) => String(format).includes("`key` is not a prop"));
    error.mockRestore();
    expect(keyWarnings).toHaveLength(1);
    expect(keyWarnings[0][1]).toBe("Row");
    // cloneElement goes through hasValidKey(), which must still see the warning getter for what it is.
    expect(React.cloneElement(second, { label: "three" }).key).toBe("b");
  });

  test("controlled inputs: React sees a user's change through its value tracker and restores the controlled value", () => {
    const changes: string[] = [];
    function Fields() {
      const [text, setText] = React.useState("a");
      return (
        <>
          {["first", "second"].map((name) => (
            <input
              key={name}
              aria-label={name}
              value={name === "first" ? text : "fixed"}
              onChange={(event) => {
                changes.push(`${name}:${event.target.value}`);
                if (name === "first") setText(event.target.value);
              }}
            />
          ))}
          <input type="checkbox" aria-label="box" checked={false} onChange={() => changes.push("box")} />
        </>
      );
    }
    main.render(<Fields />);
    const first = main.screen.getByLabelText<any>("first");
    const second = main.screen.getByLabelText<any>("second");
    const box = main.screen.getByLabelText<any>("box");
    main.fireEvent.change(first, { target: { value: "ab" } });
    main.fireEvent.change(second, { target: { value: "changed" } });
    main.fireEvent.click(box);
    expect(changes).toEqual(["first:ab", "second:changed", "box"]);
    // Controlled: state that did not change puts the DOM back.
    expect([first.value, second.value, box.checked]).toEqual(["ab", "fixed", false]);
    // Setting the value React already tracks is not a change.
    main.fireEvent.change(first, { target: { value: "ab" } });
    expect(changes).toHaveLength(3);
  });
});
