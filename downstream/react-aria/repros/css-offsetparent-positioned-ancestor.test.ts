/**
 * Downstream repro (React Aria: 54 failures in react-aria/test/overlays/calculatePosition.test.ts,
 * e.g. "placement = left ... Should calculate the correct position": position.right 774 instead
 * of 350 — the overlay is positioned against the 1024px viewport instead of its 600px
 * `position: relative` container).
 *
 * React Aria's getContainingBlock(overlay) (packages/react-aria/src/overlays/calculatePosition.ts,
 * Apache-2.0, logic reproduced below) uses `overlay.offsetParent`; when that is null it walks up
 * and accepts the first ancestor whose computed transform/filter/contain/willChange make it a
 * containing block, else the viewport.
 *
 * - Browsers: offsetParent is the nearest positioned ancestor (the container).
 *   https://drafts.csswg.org/cssom-view/#dom-htmlelement-offsetparent
 * - jsdom 26 (upstream's baseline): offsetParent is always null, but its getComputedStyle returns
 *   "" for transform/filter/..., so every ancestor "is a containing block" and the walk stops at
 *   the parent — the container — by accident.
 * - @ctrl/dom: offsetParent is always null AND computed transform is "none", so the walk reaches
 *   the viewport.
 *
 * The offsetParent algorithm needs no layout (computed `position`/`display` and the tree only),
 * so implementing it gives browser behaviour and makes these tests pass. Owner: css
 * (HTMLElement.offsetParent, cssom-view). The jsdom case uses upstream's jsdom 26 from the checkout.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { hasCheckout, windows } from "./engines.ts";

function getContainingBlock(window: any, node: any): any {
  const { document } = window;
  const isContainingBlock = (n: any): boolean => {
    const style = window.getComputedStyle(n);
    return style.transform !== "none" || /transform|perspective/.test(style.willChange) || style.filter !== "none" || style.contain === "paint";
  };
  let offsetParent = node.offsetParent;
  if (offsetParent && offsetParent === document.body && window.getComputedStyle(offsetParent).position === "static" && !isContainingBlock(offsetParent)) {
    offsetParent = document.documentElement;
  }
  if (offsetParent == null) {
    offsetParent = node.parentElement;
    while (offsetParent && !isContainingBlock(offsetParent)) offsetParent = offsetParent.parentElement;
  }
  return offsetParent || document.documentElement;
}

const engines = {
  "jsdom 26 (upstream)": () => {
    const require = createRequire(fileURLToPath(new URL("../checkout/package.json", import.meta.url)));
    return new (require("jsdom").JSDOM)("").window;
  },
  "ctrl-dom": windows["ctrl-dom"],
};

describe.each(Object.keys(engines) as Array<keyof typeof engines>)("%s", (engine) => {
  test.skipIf(engine !== "ctrl-dom" && !hasCheckout)("an overlay inside a position:relative container resolves that container as its containing block", () => {
    const window = engines[engine]();
    const { document } = window;
    const container = document.createElement("div");
    container.style.position = "relative";
    const overlay = document.createElement("div");
    container.append(overlay);
    document.body.append(container);
    expect(getContainingBlock(window, overlay) === container).toBe(true);
  });

  test.skipIf(engine === "ctrl-dom")("(jsdom 26 gets there by accident: offsetParent is null)", () => {
    const { document } = engines[engine]();
    const container = document.createElement("div");
    container.style.position = "relative";
    const overlay = document.createElement("div");
    container.append(overlay);
    document.body.append(container);
    expect(overlay.offsetParent).toBe(null);
  });

  test.skipIf(engine !== "ctrl-dom")("offsetParent is the nearest positioned ancestor (CSSOM View)", () => {
    const { document } = engines[engine]();
    const container = document.createElement("div");
    container.style.position = "relative";
    const overlay = document.createElement("div");
    container.append(overlay);
    document.body.append(container);
    expect(overlay.offsetParent === container).toBe(true);
  });
});
