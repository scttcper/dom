/**
 * Downstream repro (Base UI: 69 failures in combobox/menu via
 * internals/useInitialLiveRegionTextMutation.ts `document.createTreeWalker(el, NodeFilter.SHOW_TEXT)`
 * -> "ReferenceError: NodeFilter is not defined").
 *
 * NodeFilter is a callback interface with constants, exposed on Window as an object with
 * SHOW_* / FILTER_* constants. @ctrl/dom exports it from src/index.ts, but
 * window/interfaces.ts only exposes exports that are functions (plus NAMESPACE_EXPORTS =
 * ["CSS"]), so `window.NodeFilter` / global `NodeFilter` is undefined.
 *
 * Spec: https://dom.spec.whatwg.org/#interface-nodefilter ([Exposed=Window] callback interface)
 *       https://webidl.spec.whatwg.org/#legacy-callback-interface-object
 * Owner: window (packages/dom/src/window/interfaces.ts).
 */
import { expect, test } from "vitest";
import { differential } from "./engines.ts";

differential("NodeFilter is exposed on window", (make) => {
  test("window.NodeFilter.SHOW_TEXT === 4 and createTreeWalker accepts it", () => {
    const window = make();
    expect(window.NodeFilter?.SHOW_TEXT).toBe(4);
    window.document.body.innerHTML = "<p>a<b>b</b></p>";
    const walker = window.document.createTreeWalker(window.document.body, window.NodeFilter.SHOW_TEXT);
    let last = null;
    while (walker.nextNode()) last = walker.currentNode;
    expect(last?.data).toBe("b");
  });
});
