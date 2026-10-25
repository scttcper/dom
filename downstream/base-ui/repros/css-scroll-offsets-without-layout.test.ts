/**
 * Downstream repro (Base UI: scroll-area [data-scrolling] tests and drawer scroll/swipe tests,
 * ~16 failures in both ctrl-dom modes).
 *
 * Tests set scroll positions without layout: `el.scrollTop = 40` after mocking scrollHeight /
 * clientHeight, or Testing Library's idiom `fireEvent.scroll(el, { target: { scrollTop: 1 } })`
 * (which assigns the property before dispatching). jsdom keeps the assigned offsets; @ctrl/dom
 * follows CSSOM View's "no associated box -> do nothing" and reads back 0, so components that
 * read `scrollTop` in their scroll handler never see a scroll.
 *
 * Spec: https://drafts.csswg.org/cssom-view/#dom-element-scrolltop (setter steps 7-9 drop the
 * value without a box: the deviation needed is jsdom's "store the clamped-at-0 value").
 * Owner: css (CSSOM View scrolling; record the choice in docs/deviations.md).
 */
import { expect, test } from "vitest";
import { differential } from "./engines.ts";

differential("assigned scroll offsets are retained without layout", (make) => {
  test("scrollTop / scrollLeft read back what was assigned", () => {
    const { document } = make();
    document.body.innerHTML = '<div style="overflow:auto;height:40px"><div style="height:160px"></div></div>';
    const el = document.body.firstElementChild;
    el.scrollTop = 40;
    el.scrollLeft = 2;
    expect(el.scrollTop).toBe(40);
    expect(el.scrollLeft).toBe(2);
  });
});
