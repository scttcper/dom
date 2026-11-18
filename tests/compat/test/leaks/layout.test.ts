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
import { createWindow, IntersectionObserver, ResizeObserver } from "@ctrl/dom";
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

test("no-layout observers release removed targets while the observers stay live", async () => {
  const w = createWindow();
  const tracker = new Tracker();
  const observers = [new ResizeObserver(() => {}), new IntersectionObserver(() => {})];
  (() => {
    for (const observer of observers) {
      const el = tracker.track("observed element", w.document.body!.appendChild(w.document.createElement("div")));
      observer.observe(el);
      el.remove();
    }
  })();
  expect(await tracker.alive()).toEqual({});
  for (const observer of observers) observer.disconnect();
  w.close();
});

describe("layout-lite retention", () => {
  test("an active resize observer releases a removed target and continues watching the mounted target", async () => {
    const w = createWindow({ layout: "lite" });
    const tracker = new Tracker();
    const mounted = w.document.body!.appendChild(w.document.createElement("div"));
    let delivered = 0;
    (() => {
      const removed = tracker.track("removed target", w.document.body!.appendChild(w.document.createElement("div")));
      const observer = new ResizeObserver((entries) => {
        if (entries.some((entry) => (entry as { target: object }).target === mounted)) delivered++;
      });
      observer.observe(mounted);
      observer.observe(removed);
      removed.remove();
    })();
    expect(await tracker.alive()).toEqual({});
    expect(delivered).toBe(1);
    mounted.setAttribute("style", "height:42px");
    void mounted.getBoundingClientRect();
    await Promise.resolve();
    expect(delivered).toBe(2);
    w.close();
  });

  test("stopping the last resize observation releases its callback without another layout", async () => {
    const w = createWindow({ layout: "lite", html: HTML });
    const el = w.document.getElementById("r")!;
    const tracker = new Tracker();
    await (async () => {
      const disconnected = new ResizeObserver(tracker.track("disconnected callback", () => {}));
      const unobserved = new ResizeObserver(tracker.track("unobserved callback", () => {}));
      disconnected.observe(el);
      unobserved.observe(el);
      await new Promise<void>((resolve) => setImmediate(resolve));
      disconnected.disconnect();
      unobserved.unobserve(el);
    })();
    expect(await tracker.alive()).toEqual({});
    w.close();
  });

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
