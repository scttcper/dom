// @vitest-environment-options {"layout":"lite","compat":"modern"}
/**
 * ResizeObserver under layout-lite (the "modern" profile exposes it as a global): observations
 * are delivered from layout-lite boxes, so components that size themselves from ResizeObserver
 * entries (virtualizers' item measurement, auto-sizers, scroll areas) render without mocks.
 *
 * Specs:
 *   Resize Observer — https://drafts.csswg.org/resize-observer/
 *   ResizeObservation (lastReportedSizes starts at -1×-1) — https://drafts.csswg.org/resize-observer/#resizeobservation
 *   calculate box size — https://drafts.csswg.org/resize-observer/#calculate-box-size
 */
import { act, render, screen, waitFor } from "@testing-library/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useLayoutEffect, useRef, useState } from "react";
import { describe, expect, test } from "vitest";

function AutoSizer() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState("unmeasured");
  useLayoutEffect(() => {
    const ro = new ResizeObserver(([entry]) => setSize(`${entry.contentRect.width}x${entry.contentRect.height}`));
    ro.observe(ref.current!);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ width: "50%", height: 120, padding: 10 }}>
      {size}
    </div>
  );
}

describe("ResizeObserver delivery — https://drafts.csswg.org/resize-observer/#broadcast-active-resize-observations", () => {
  test("an initial observation arrives with the content box (contentRect) after observe()", async () => {
    render(<AutoSizer />);
    // innerWidth 1024 → 50% = 512 wide content box; height 120.
    expect(await screen.findByText("512x120")).toBeTruthy();
  });

  test("a later size change is observed after the next geometry read recomputes layout", async () => {
    const seen: number[] = [];
    const el = document.body.appendChild(document.createElement("div"));
    el.style.height = "10px";
    const ro = new ResizeObserver((entries) => seen.push(entries[0].borderBoxSize[0].blockSize));
    ro.observe(el, { box: "border-box" });
    await waitFor(() => expect(seen).toEqual([10]));
    el.style.height = "25px";
    void el.offsetHeight;
    await waitFor(() => expect(seen).toEqual([10, 25]));
    ro.disconnect();
    el.remove();
  });

  test("TanStack Virtual measures dynamic rows through ResizeObserver entries (measureElement)", async () => {
    const heights = [20, 60, 30, 90];
    function Dynamic() {
      const parentRef = useRef<HTMLDivElement>(null);
      const v = useVirtualizer({ count: 400, getScrollElement: () => parentRef.current, estimateSize: () => 50 });
      return (
        <div ref={parentRef} data-testid="scroller" style={{ height: 300, overflow: "auto" }}>
          <div style={{ height: v.getTotalSize(), position: "relative" }}>
            {v.getVirtualItems().map((item) => (
              <div
                key={item.key}
                data-index={item.index}
                ref={v.measureElement}
                role="row"
                style={{ position: "absolute", top: 0, width: "100%", transform: `translateY(${item.start}px)` }}
              >
                <div style={{ height: heights[item.index % 4] }}>Row {item.index}</div>
              </div>
            ))}
          </div>
        </div>
      );
    }
    render(<Dynamic />);
    // Estimated 400 × 50; measured rows replace estimates: 0..3 are 20+60+30+90 = 200px.
    await waitFor(() => expect(screen.getByText("Row 4").parentElement!.style.transform).toBe("translateY(200px)"));
    act(() => {
      screen.getByTestId("scroller").scrollTop = 2000;
    });
    await waitFor(() => expect(screen.getAllByRole("row").length).toBeGreaterThan(5));
  });
});
