/**
 * Retention under layout-lite (`createWindow({ layout: "lite" })`, docs/layout.md): boxes are
 * kept in a WeakMap keyed by node and stamped with the layout generation, ResizeObserver
 * bookkeeping is keyed weakly by document, so neither a closed window nor a removed subtree
 * stays reachable through them.
 *
 * Specs: ECMAScript WeakRef liveness (https://tc39.es/ecma262/#sec-weak-ref-objects); DOM remove
 * (https://dom.spec.whatwg.org/#concept-node-remove); Resize Observer
 * (https://drafts.csswg.org/resize-observer/).
 */
import { describe, expect, test } from "vitest";
import { createWindow, ResizeObserver } from "@rtd/dom";
import { Tracker } from "./gc.ts";

const HTML = `<div id=s style="height:100px;overflow:auto"><div style="display:flex;flex-direction:column;height:2000px">
<p style="flex:1">a</p><p style="position:absolute;top:0;right:0">b</p></div></div><div id=r style="height:10px"></div>`;

interface El {
  getBoundingClientRect(): unknown;
  offsetHeight: number;
  scrollHeight: number;
  scrollTop: number;
  remove(): void;
}

describe("layout-lite retention", () => {
  test("a closed layout-lite window, its document, nodes and ResizeObservers are collectable", async () => {
    const tracker = new Tracker();
    await (async () => {
      const w = createWindow({ layout: "lite", html: HTML });
      const d = w.document;
      const s = d.getElementById("s") as unknown as El;
      tracker.track("window", w);
      tracker.track("document", d);
      tracker.track("node", s);
      s.getBoundingClientRect();
      s.scrollTop = 50;
      const ro = new ResizeObserver(() => {});
      ro.observe(s as never);
      tracker.track("ResizeObserver", ro);
      await Promise.resolve();
      w.close();
    })();
    expect(await tracker.alive()).toEqual({});
  });

  test("a subtree removed from a live layout-lite document is collectable after layout and observation", async () => {
    const w = createWindow({ layout: "lite", html: HTML });
    const tracker = new Tracker();
    await (async () => {
      const s = w.document.getElementById("s") as unknown as El;
      tracker.track("removed subtree", s);
      void s.scrollHeight;
      const ro = new ResizeObserver(() => {});
      ro.observe(s as never);
      await Promise.resolve();
      ro.disconnect();
      s.remove();
      void (w.document.getElementById("r") as unknown as El).offsetHeight;
    })();
    expect(await tracker.alive()).toEqual({});
    w.close();
  });
});
