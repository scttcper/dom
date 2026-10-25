// @vitest-environment-options {"layout":"none"}
/**
 * The same virtualizer without layout-lite (the default in every compat profile, like jsdom):
 * geometry reads are zero, so TanStack Virtual sees a 0px viewport and renders only its overscan,
 * and scrolling is never clamped. This is what suites mock prototypes to get around.
 *
 * Spec: CSSOM View — https://drafts.csswg.org/cssom-view/#dom-element-getboundingclientrect
 * Deviation: docs/deviations.md "Layout" row.
 */
import { act, render, screen } from "@testing-library/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";
import { describe, expect, test } from "vitest";

function List() {
  const parentRef = useRef<HTMLDivElement>(null);
  const v = useVirtualizer({
    count: 1000,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 35,
    overscan: 2,
  });
  return (
    <div ref={parentRef} data-testid="scroller" style={{ height: 400, overflow: "auto" }}>
      <div style={{ height: v.getTotalSize(), position: "relative" }}>
        {v.getVirtualItems().map((item) => (
          <div key={item.key} role="row" style={{ position: "absolute", top: item.start, height: 35 }}>
            Row {item.index}
          </div>
        ))}
      </div>
    </div>
  );
}

describe("layout: none — geometry stays zero (https://drafts.csswg.org/cssom-view/)", () => {
  test("the virtualizer measures a 0px scroll element and renders only the overscan rows", () => {
    render(<List />);
    const scroller = screen.getByTestId("scroller");
    expect([scroller.offsetHeight, scroller.clientHeight, scroller.scrollHeight]).toEqual([0, 0, 0]);
    expect(scroller.getBoundingClientRect().toJSON()).toEqual({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    });
    expect(screen.queryAllByRole("row").length).toBeLessThanOrEqual(3);
  });

  test("scrollTop is stored as assigned (no maximum, no scroll event)", () => {
    render(<List />);
    const scroller = screen.getByTestId("scroller");
    let events = 0;
    scroller.addEventListener("scroll", () => events++);
    act(() => {
      scroller.scrollTop = 1e9;
    });
    expect(scroller.scrollTop).toBe(1e9);
    expect(events).toBe(0);
  });
});
