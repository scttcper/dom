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
    for (const key of ["render", "renderHook", "cleanup", "act", "fireEvent", "screen", "within", "waitFor", "configure", "getConfig", "prettyDOM", "queries"]) {
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
    expect(Object.keys(a)).toEqual(expect.arrayContaining(["container", "baseElement", "debug", "rerender", "unmount", "asFragment", "getByText", "findAllByRole"]));
    expect(a).not.toBe(b);
    expect(a.getByText).toBe(b.getByText);
    expect(a.getByText("two")).toBe(b.container.firstChild);
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
