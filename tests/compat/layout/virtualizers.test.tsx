/**
 * Layout-lite with React virtualizers (docs/layout.md): the environment runs with
 * `environmentOptions["ctrl-dom"].layout = "lite"` (vitest.layout.config.ts), and components
 * that measure their scroll container render a window of rows and follow scrolling, with no
 * prototype mocks.
 *
 * Specs behind the behavior:
 *   CSSOM View offsetHeight — https://drafts.csswg.org/cssom-view/#dom-htmlelement-offsetheight
 *   CSSOM View scrollTop / scrollHeight / clientHeight — https://drafts.csswg.org/cssom-view/#dom-element-scrolltop
 *   CSSOM View scrolling events — https://drafts.csswg.org/cssom-view/#scrolling-events
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef, useState, type UIEvent } from "react";
import { describe, expect, test } from "vitest";

const rows = Array.from({ length: 1000 }, (_, i) => `Row ${i}`);

/** The TanStack Virtual README's fixed-size list. */
function TanStackList({ estimate = 35 }: { estimate?: number }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimate,
    overscan: 2,
  });
  return (
    <div ref={parentRef} data-testid="scroller" style={{ height: 400, overflow: "auto" }}>
      <div style={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}>
        {virtualizer.getVirtualItems().map((item) => (
          <div
            key={item.key}
            role="row"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: item.size,
              transform: `translateY(${item.start}px)`,
            }}
          >
            {rows[item.index]}
          </div>
        ))}
      </div>
    </div>
  );
}

/** react-window's FixedSizeList, reduced to what it reads: clientHeight/scrollHeight/scrollTop in onScroll. */
function FixedSizeList({ height, itemSize }: { height: number; itemSize: number }) {
  const [offset, setOffset] = useState(0);
  const onScroll = (e: UIEvent<HTMLDivElement>) => {
    const { clientHeight, scrollHeight, scrollTop } = e.currentTarget;
    setOffset(Math.max(0, Math.min(scrollTop, scrollHeight - clientHeight)));
  };
  const start = Math.floor(offset / itemSize);
  const stop = Math.min(rows.length - 1, Math.ceil((offset + height) / itemSize));
  const items = [];
  for (let i = start; i <= stop; i++) {
    items.push(
      <div key={i} role="row" style={{ position: "absolute", top: i * itemSize, height: itemSize, width: "100%" }}>
        {rows[i]}
      </div>,
    );
  }
  return (
    <div data-testid="scroller" onScroll={onScroll} style={{ position: "relative", height, overflow: "auto" }}>
      <div style={{ height: rows.length * itemSize, width: "100%" }}>{items}</div>
    </div>
  );
}

const rendered = () => screen.getAllByRole("row").map((r) => r.textContent);

describe("TanStack Virtual (useVirtualizer) — https://tanstack.com/virtual", () => {
  test("measures the scroll element (offsetHeight 400) and renders the visible rows plus overscan", () => {
    render(<TanStackList />);
    // 400px / 35px per row = rows 0..11 visible, +2 overscan.
    expect(rendered()).toEqual(rows.slice(0, 14));
    expect(screen.getByTestId("scroller").scrollHeight).toBe(35_000);
  });

  test("assigning scrollTop clamps to scrollHeight - clientHeight and fires scroll; the window follows", () => {
    render(<TanStackList />);
    const scroller = screen.getByTestId("scroller");
    act(() => {
      scroller.scrollTop = 3500;
    });
    expect(scroller.scrollTop).toBe(3500);
    // Rows 100..111 visible, 2 overscan rows on each side.
    expect(rendered()).toEqual(rows.slice(98, 114));
    act(() => {
      scroller.scrollTop = 1e9;
    });
    expect(scroller.scrollTop).toBe(35_000 - 400);
    expect(rendered().at(-1)).toBe("Row 999");
  });

  test("fireEvent.scroll with a target scrollTop (Testing Library's idiom) works too", () => {
    render(<TanStackList />);
    fireEvent.scroll(screen.getByTestId("scroller"), { target: { scrollTop: 700 } });
    expect(rendered()[0]).toBe("Row 18");
  });

  test("rendered rows have real boxes: translateY moves getBoundingClientRect, not offsetTop", () => {
    render(<TanStackList />);
    const row3 = screen.getByText("Row 3");
    const scrollerTop = screen.getByTestId("scroller").getBoundingClientRect().top;
    expect(row3.getBoundingClientRect().top - scrollerTop).toBe(105);
    expect(row3.offsetHeight).toBe(35);
    expect(row3.offsetTop).toBe(0);
  });

  test("scrollToIndex scrolls the element and renders around the index", () => {
    let api: ReturnType<typeof useVirtualizer<HTMLDivElement, Element>> | undefined;
    function WithApi() {
      const parentRef = useRef<HTMLDivElement>(null);
      api = useVirtualizer({
        count: rows.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 35,
        overscan: 0,
      });
      return (
        <div ref={parentRef} data-testid="scroller" style={{ height: 400, overflow: "auto" }}>
          <div style={{ height: api.getTotalSize(), position: "relative" }}>
            {api.getVirtualItems().map((item) => (
              <div
                key={item.key}
                role="row"
                style={{ position: "absolute", top: item.start, height: 35, width: "100%" }}
              >
                {rows[item.index]}
              </div>
            ))}
          </div>
        </div>
      );
    }
    render(<WithApi />);
    act(() => api!.scrollToIndex(500, { align: "start" }));
    expect(screen.getByTestId("scroller").scrollTop).toBe(500 * 35);
    expect(rendered()[0]).toBe("Row 500");
  });
});

describe("react-window style FixedSizeList (reads clientHeight/scrollHeight in onScroll)", () => {
  test("renders the first window, then the window at the scrolled offset", () => {
    render(<FixedSizeList height={300} itemSize={50} />);
    expect(rendered()).toEqual(rows.slice(0, 7));
    const scroller = screen.getByTestId("scroller");
    expect([scroller.clientHeight, scroller.scrollHeight]).toEqual([300, 50_000]);
    act(() => {
      scroller.scrollTop = 1000;
    });
    expect(rendered()).toEqual(rows.slice(20, 27));
  });

  test("scroll offsets past the end clamp, as the component's own Math.min expects", () => {
    render(<FixedSizeList height={300} itemSize={50} />);
    fireEvent.scroll(screen.getByTestId("scroller"), { target: { scrollTop: 999_999 } });
    expect(rendered().at(-1)).toBe("Row 999");
  });
});
