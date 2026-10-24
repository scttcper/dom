/**
 * Layout-lite: the opt-in geometry model behind the CSSOM View members
 * (`createWindow({ layout: "lite" })`, docs/layout.md).
 *
 * Specs:
 *   CSSOM View getBoundingClientRect() — https://drafts.csswg.org/cssom-view/#dom-element-getboundingclientrect
 *   CSSOM View getClientRects() — https://drafts.csswg.org/cssom-view/#dom-element-getclientrects
 *   CSSOM View offset* — https://drafts.csswg.org/cssom-view/#extensions-to-the-htmlelement-interface
 *   CSSOM View client* — https://drafts.csswg.org/cssom-view/#dom-element-clienttop
 *   CSSOM View scroll* — https://drafts.csswg.org/cssom-view/#dom-element-scrolltop, #dom-element-scrollheight
 *   CSSOM View scrollIntoView() — https://drafts.csswg.org/cssom-view/#dom-element-scrollintoview
 *   CSS 2 visual formatting model — https://drafts.csswg.org/css2/#visual-model-intro
 *   CSS Flexbox layout algorithm — https://drafts.csswg.org/css-flexbox-1/#layout-algorithm
 *   Resize Observer — https://drafts.csswg.org/resize-observer/
 *
 * The model is an approximation (docs/layout.md), so expectations pin the documented rules —
 * block stacking, 0.5em per character, line-height 1.2 — not browser pixels. The first block
 * pins that without the option every geometry API returns exactly what it always did.
 */
import { describe, expect, test } from "vitest";
import { createWindow, ResizeObserver, type Document, type Window } from "@rtd/dom";

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
  toJSON(): object;
}
interface El {
  getBoundingClientRect(): Rect;
  getClientRects(): { length: number; item(i: number): Rect | null };
  offsetTop: number;
  offsetLeft: number;
  offsetWidth: number;
  offsetHeight: number;
  offsetParent: El | null;
  clientTop: number;
  clientLeft: number;
  clientWidth: number;
  clientHeight: number;
  scrollWidth: number;
  scrollHeight: number;
  scrollTop: number;
  scrollLeft: number;
  scrollTo(...a: unknown[]): void;
  scrollBy(...a: unknown[]): void;
  scroll(...a: unknown[]): void;
  scrollIntoView(arg?: unknown): void;
  style: { setProperty(n: string, v: string): void; height: string; width: string; display: string };
  addEventListener(t: string, f: (e: { type: string }) => void): void;
  remove(): void;
  attachShadow(o: { mode: string }): { innerHTML: string };
  appendChild<T>(c: T): T;
  innerHTML: string;
}

function lite(html: string, options: { width?: number; height?: number } = {}): { window: Window; document: Document; $: (sel: string) => El } {
  const window = createWindow({ layout: "lite", html, ...options });
  const document = window.document;
  return { window, document, $: (sel) => document.querySelector(sel) as unknown as El };
}

const rect = (el: El) => {
  const r = el.getBoundingClientRect();
  return [r.x, r.y, r.width, r.height];
};

const ZERO_RECT = { x: 0, y: 0, width: 0, height: 0, top: 0, right: 0, bottom: 0, left: 0 };

describe("layout: none (the default) — geometry is unchanged", () => {
  const MARKUP = `<div id=a style="width:100px;height:50px;padding:5px;border:1px solid;overflow:auto"><p style="height:500px">x</p></div>`;

  for (const options of [{}, { layout: "none" as const }, { compat: "modern" as const }, { compat: "jsdom-26" as const }]) {
    test(`every geometry API returns zero (${JSON.stringify(options)})`, () => {
      // A layout-lite window in the same process must not change other windows.
      lite(`<div style="height:10px"></div>`).$("div").offsetHeight;
      const window = createWindow({ html: MARKUP, ...options });
      const el = window.document.querySelector("#a") as unknown as El;
      expect(el.getBoundingClientRect().toJSON()).toEqual(ZERO_RECT);
      expect(el.getClientRects().length).toBe(0);
      expect([el.offsetTop, el.offsetLeft, el.offsetWidth, el.offsetHeight]).toEqual([0, 0, 0, 0]);
      expect([el.clientTop, el.clientLeft, el.clientWidth, el.clientHeight]).toEqual([0, 0, 0, 0]);
      expect([el.scrollWidth, el.scrollHeight]).toEqual([0, 0]);
      const root = window.document.documentElement as unknown as El;
      expect([root.clientWidth, root.clientHeight, root.scrollHeight]).toEqual([0, 0, 0]);
    });
  }

  test("scrollTop is stored as assigned (no maximum), fires no scroll event; scrollIntoView does nothing", () => {
    const el = createWindow({ html: MARKUP }).document.querySelector("#a") as unknown as El;
    let events = 0;
    el.addEventListener("scroll", () => events++);
    el.scrollTop = 1e6;
    el.scrollBy(0, 5);
    expect(el.scrollTop).toBe(1e6 + 5);
    el.scrollIntoView();
    expect(events).toBe(0);
  });

  test("ResizeObserver never calls back", async () => {
    const window = createWindow({ html: MARKUP });
    let calls = 0;
    new ResizeObserver(() => calls++).observe(window.document.querySelector("#a") as never);
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toBe(0);
  });

  test("the option resolves to \"none\" unless it is exactly \"lite\"", () => {
    const w = createWindow({ html: MARKUP, layout: "full" as never });
    expect((w.document.querySelector("#a") as unknown as El).offsetWidth).toBe(0);
  });
});

describe("block boxes in normal flow — https://drafts.csswg.org/css2/#normal-block", () => {
  test("auto width fills the containing block (the viewport for the root); blocks stack vertically", () => {
    const { $ } = lite(`<div id=a style="height:30px"></div><div id=b style="height:20px"></div>`, { width: 800 });
    expect(rect($("#a"))).toEqual([0, 0, 800, 30]);
    expect(rect($("#b"))).toEqual([0, 30, 800, 20]);
    expect(rect($("body"))).toEqual([0, 0, 800, 50]);
  });

  test("margins, borders and padding: the border box is width + padding + border; margins offset it (no collapsing)", () => {
    const { $ } = lite(`<div id=o style="padding:10px;border:2px solid"><div id=i style="margin:5px 7px;padding:3px;height:10px"></div><div id=j style="margin-top:5px;height:1px"></div></div>`, { width: 500 });
    expect(rect($("#o"))).toEqual([0, 0, 500, 2 + 10 + (5 + 16 + 5) + (5 + 1) + 10 + 2]);
    expect(rect($("#i"))).toEqual([12 + 7, 12 + 5, 500 - 24 - 14, 16]);
    // #i's bottom margin (5) and #j's top margin (5) add up: no margin collapsing.
    expect($("#j").getBoundingClientRect().top).toBe(12 + 5 + 16 + 5 + 5);
  });

  test("width/height units: px, %, em, rem, vw/vh, calc(), min()/max(); box-sizing: border-box", () => {
    const { $ } = lite(
      `<div id=p style="width:400px;font-size:10px">
        <div id=pct style="width:50%;height:2em"></div>
        <div id=calc style="width:calc(100% - 3rem);height:calc(10vh / 2)"></div>
        <div id=minmax style="width:min(300px, 90%);height:max(1px, 3em)"></div>
        <div id=bb style="box-sizing:border-box;width:100px;height:40px;padding:10px;border:5px solid"></div>
      </div>`,
      { width: 1000, height: 600 },
    );
    expect(rect($("#pct")).slice(2)).toEqual([200, 20]);
    expect(rect($("#calc")).slice(2)).toEqual([400 - 48, 30]);
    expect(rect($("#minmax")).slice(2)).toEqual([300, 30]);
    expect(rect($("#bb")).slice(2)).toEqual([100, 40]);
    expect([$("#bb").clientWidth, $("#bb").clientHeight]).toEqual([90, 30]);
  });

  test("min-/max-width and -height clamp; auto horizontal margins center a definite width", () => {
    const { $ } = lite(`<div id=a style="max-width:300px;min-height:50px"></div><div id=c style="width:200px;margin:0 auto;height:1px"></div>`, { width: 1000 });
    expect(rect($("#a"))).toEqual([0, 0, 300, 50]);
    expect(rect($("#c"))).toEqual([400, 50, 200, 1]);
  });

  test("percentage heights resolve against a definite containing block height, else behave as auto", () => {
    const { $ } = lite(`<div style="height:200px"><div id=a style="height:50%"></div></div><div><div id=b style="height:50%">x</div></div>`);
    expect($("#a").offsetHeight).toBe(100);
    expect($("#b").getBoundingClientRect().height).toBeCloseTo(19.2);
  });

  test("display: none boxes (and their subtrees) are zero and take no space; display: contents children flow in the parent", () => {
    const { $ } = lite(`<div id=n style="display:none;height:50px"><p id=np style="height:5px"></p></div><section style="display:contents"><div id=c style="height:10px"></div></section><div id=after style="height:1px"></div>`);
    expect($("#n").getBoundingClientRect().toJSON()).toEqual(ZERO_RECT);
    expect($("#np").offsetHeight).toBe(0);
    expect($("section").getClientRects().length).toBe(0);
    expect(rect($("#c")).slice(1, 2)).toEqual([0]);
    expect($("#after").getBoundingClientRect().top).toBe(10);
  });

  test("disconnected elements have no box", () => {
    const { document } = lite(``);
    const el = document.createElement("div") as unknown as El;
    el.style.height = "10px";
    expect([el.offsetHeight, el.clientHeight, el.getClientRects().length]).toEqual([0, 0, 0]);
  });
});

describe("inline content — https://drafts.csswg.org/css2/#inline-formatting", () => {
  test("a text run is one line-height tall (normal = 1.2em) and 0.5em per collapsed character wide", () => {
    const { $ } = lite(`<div id=d style="font-size:20px">ab  cd <span id=s>xyz</span></div><p id=p style="line-height:30px">x</p>`);
    expect($("#d").offsetHeight).toBe(24);
    // "ab  cd " collapses to "ab cd" (5 characters × 10px): each text node drops its leading and trailing white space.
    expect(rect($("#s"))).toEqual([50, 0, 30, 24]);
    expect($("#p").offsetHeight).toBe(30);
    // https://drafts.csswg.org/cssom-view/#dom-element-clientwidth step 1: inline boxes report 0.
    expect([$("#s").clientWidth, $("#s").clientHeight, $("#s").scrollHeight]).toEqual([0, 0, 0]);
  });

  test("inline-blocks shrink to fit and sit on the line; <br> ends a line", () => {
    const { $ } = lite(`<div id=d><button id=b style="padding:0 4px">OK</button><br>next</div>`);
    // "OK" = 2 × 8px + 8px horizontal padding.
    expect(rect($("#b")).slice(0, 3)).toEqual([0, 0, 24]);
    expect($("#d").offsetHeight).toBe(Math.round(2 * 19.2));
  });

  test("replaced elements use their width/height attributes (img) or defaults (canvas 300×150)", () => {
    const { $ } = lite(`<img width=40 height=30><canvas></canvas><img id=scaled width=40 height=30 style="width:80px">`);
    expect([$("img").offsetWidth, $("img").offsetHeight]).toEqual([40, 30]);
    expect([$("canvas").offsetWidth, $("canvas").offsetHeight]).toEqual([300, 150]);
    expect([$("#scaled").offsetWidth, $("#scaled").offsetHeight]).toEqual([80, 60]);
  });
});

describe("flex containers — https://drafts.csswg.org/css-flexbox-1/#layout-algorithm", () => {
  test("row: fixed items keep their width, flex-grow shares the free space, items stretch to the container height", () => {
    const { $ } = lite(`<div style="display:flex;width:600px;height:100px;gap:10px"><div id=a style="width:100px"></div><div id=b style="flex:1"></div><div id=c style="flex:2"></div></div>`);
    expect(rect($("#a"))).toEqual([0, 0, 100, 100]);
    expect(rect($("#b"))).toEqual([110, 0, 160, 100]);
    expect(rect($("#c"))).toEqual([280, 0, 320, 100]);
  });

  test("row: flex-shrink shrinks overflowing items in proportion to their base size", () => {
    const { $ } = lite(`<div style="display:flex;width:300px"><div id=a style="width:200px;height:1px"></div><div id=b style="width:200px;height:1px;flex-shrink:0"></div></div>`);
    expect([$("#a").offsetWidth, $("#b").offsetWidth]).toEqual([100, 200]);
  });

  test("row with indefinite height: the line is as tall as the tallest item and auto-height items stretch to it", () => {
    const { $ } = lite(`<div id=f style="display:flex"><div id=a style="height:40px;width:10px"></div><div id=b style="width:10px"></div><div id=c style="width:10px;align-self:flex-start">x</div></div>`);
    expect($("#f").offsetHeight).toBe(40);
    expect($("#b").offsetHeight).toBe(40);
    expect($("#c").offsetHeight).toBe(19);
  });

  test("justify-content and align-items position items in the free space", () => {
    const { $ } = lite(`<div style="display:flex;width:300px;height:100px;justify-content:center;align-items:center"><div id=a style="width:100px;height:20px"></div></div><div style="display:flex;width:300px;justify-content:space-between"><i id=l style="width:10px;height:1px;display:block"></i><i id=r style="width:10px;height:1px;display:block"></i></div>`);
    expect(rect($("#a"))).toEqual([100, 40, 100, 20]);
    expect($("#r").getBoundingClientRect().left).toBe(290);
  });

  test("column: a flex: 1 child takes the remaining height of a definite container (app shell + scrolling list)", () => {
    const { $ } = lite(`<div style="display:flex;flex-direction:column;height:500px"><header style="height:60px"></header><main id=m style="flex:1;overflow:auto"><div style="height:2000px"></div></main><footer style="height:40px"></footer></div>`);
    expect(rect($("#m"))).toEqual([0, 60, 1024, 400]);
    expect([$("#m").clientHeight, $("#m").scrollHeight]).toEqual([400, 2000]);
    expect($("footer").getBoundingClientRect().top).toBe(460);
  });

  test("nested: a column grown inside a row stretched to a definite height", () => {
    const { $ } = lite(`<div style="display:flex;height:300px"><nav style="width:100px"></nav><div id=col style="flex:1;display:flex;flex-direction:column"><div style="height:50px"></div><div id=list style="flex:1;overflow:auto"></div></div></div>`, { width: 600 });
    expect(rect($("#col"))).toEqual([100, 0, 500, 300]);
    expect(rect($("#list"))).toEqual([100, 50, 500, 250]);
  });

  test("table rows share their width equally between cells", () => {
    const { $ } = lite(`<table style="width:300px"><tbody><tr><td id=a>1</td><td>2</td><td id=c>3</td></tr></tbody></table>`);
    expect(rect($("#a")).slice(2, 3)).toEqual([100]);
    expect($("#c").getBoundingClientRect().left).toBe(200);
  });
});

describe("positioning — https://drafts.csswg.org/css2/#positioning-scheme", () => {
  test("relative: top/left offset the box (and its subtree) without affecting siblings", () => {
    const { $ } = lite(`<div id=r style="position:relative;top:10px;left:5px;height:20px"><i id=i style="display:block;height:5px"></i></div><div id=s style="height:1px"></div>`);
    expect(rect($("#r")).slice(0, 2)).toEqual([5, 10]);
    expect(rect($("#i")).slice(0, 2)).toEqual([5, 10]);
    expect($("#s").getBoundingClientRect().top).toBe(20);
  });

  test("absolute: against the nearest positioned ancestor's padding box; right/bottom anchor; left+right size", () => {
    const { $ } = lite(`<div style="height:30px"></div><div id=cb style="position:relative;width:400px;height:200px;border:5px solid;padding:10px">
      <div id=tl style="position:absolute;top:0;left:0;width:20px;height:20px"></div>
      <div id=br style="position:absolute;right:10px;bottom:10px;width:20px;height:20px"></div>
      <div id=st style="position:absolute;left:10px;right:10px;top:50%;height:1px"></div>
    </div>`);
    expect(rect($("#tl"))).toEqual([5, 35, 20, 20]);
    expect(rect($("#br"))).toEqual([5 + 420 - 10 - 20, 35 + 220 - 10 - 20, 20, 20]);
    expect(rect($("#st"))).toEqual([15, 35 + 110, 400, 1]);
    // https://drafts.csswg.org/cssom-view/#dom-htmlelement-offsettop: relative to the offsetParent's padding edge.
    expect([$("#br").offsetTop, $("#br").offsetLeft]).toEqual([190, 390]);
    expect($("#br").offsetParent).toBe($("#cb"));
  });

  test("absolute with auto offsets sits at its static position; auto width shrinks to fit", () => {
    const { $ } = lite(`<div style="position:relative"><div style="height:40px"></div><div id=a style="position:absolute">hello</div></div>`);
    expect(rect($("#a"))).toEqual([0, 40, 40, 19.2]);
  });

  test("fixed: against the viewport, unaffected by window scrolling; others move with it", () => {
    const { window, $ } = lite(`<div style="height:3000px"></div><div id=f style="position:fixed;bottom:0;left:0;right:0;height:50px"></div>`, { width: 800, height: 600 });
    window.scrollY = 100;
    expect(rect($("#f"))).toEqual([0, 550, 800, 50]);
    expect($("body").getBoundingClientRect().top).toBe(-100);
    expect($("#f").offsetParent).toBe(null);
  });

  test("translate transforms move getBoundingClientRect (with the subtree) but not offsetTop", () => {
    const { $ } = lite(`<div id=t style="transform:translate(10px, 20px);height:10px"><p id=p style="height:5px;transform:translateY(5px)"></p></div>`);
    expect(rect($("#t")).slice(0, 2)).toEqual([10, 20]);
    expect(rect($("#p")).slice(0, 2)).toEqual([10, 25]);
    expect($("#t").offsetTop).toBe(0);
  });
});

describe("client and scroll metrics — https://drafts.csswg.org/cssom-view/#dom-element-clientwidth", () => {
  test("clientTop/Left are the border widths, clientWidth/Height the padding box (no scrollbars)", () => {
    const { $ } = lite(`<div id=a style="width:100px;height:50px;padding:5px;border:2px solid;border-left-width:7px"></div>`);
    expect([$("#a").clientTop, $("#a").clientLeft, $("#a").clientWidth, $("#a").clientHeight]).toEqual([2, 7, 110, 60]);
    expect([$("#a").offsetWidth, $("#a").offsetHeight]).toEqual([119, 64]);
  });

  test("the root element's client box is the viewport; its scrollHeight covers the document", () => {
    const { $ } = lite(`<div style="height:2000px"></div>`, { width: 800, height: 600 });
    const root = $("html");
    expect([root.clientWidth, root.clientHeight, root.scrollHeight]).toEqual([800, 600, 2000]);
  });

  test("scrollWidth/Height: the content extent plus end padding, at least the padding box", () => {
    const { $ } = lite(`<div id=s style="width:100px;height:100px;padding:10px;overflow:auto"><div style="width:300px;height:250px"></div></div><div id=e style="height:40px;overflow:hidden"></div>`);
    expect([$("#s").scrollWidth, $("#s").scrollHeight]).toEqual([320, 270]);
    expect([$("#e").scrollHeight, $("#e").clientHeight]).toEqual([40, 40]);
  });

  test("scrollTop/scrollLeft clamp to [0, scrollHeight - clientHeight] and fire one scroll event per change", () => {
    const { $ } = lite(`<div id=s style="height:100px;overflow:auto"><div style="height:400px"></div></div>`);
    const s = $("#s");
    const events: string[] = [];
    s.addEventListener("scroll", (e) => events.push(e.type));
    s.scrollTop = 120;
    expect(s.scrollTop).toBe(120);
    s.scrollTop = 120; // unchanged: no event
    s.scrollTop = 1e6;
    expect(s.scrollTop).toBe(300);
    s.scrollTop = -10;
    expect(s.scrollTop).toBe(0);
    expect(events).toEqual(["scroll", "scroll", "scroll"]);
    s.scrollLeft = 50; // nothing to scroll horizontally
    expect(s.scrollLeft).toBe(0);
  });

  test("scroll()/scrollTo()/scrollBy() clamp and fire once", () => {
    const { $ } = lite(`<div id=s style="height:100px;overflow:auto"><div style="height:400px"></div></div>`);
    const s = $("#s");
    let events = 0;
    s.addEventListener("scroll", () => events++);
    s.scrollTo({ top: 50 });
    s.scrollBy(0, 1000);
    s.scroll(0, 10);
    expect(s.scrollTop).toBe(10);
    expect(events).toBe(3);
  });

  test("scrolling moves descendants' getBoundingClientRect, not their offsetTop", () => {
    const { $ } = lite(`<div id=s style="height:100px;overflow:auto"><div style="height:200px"></div><p id=p style="height:10px"></p></div>`);
    $("#s").scrollTop = 100;
    expect($("#p").getBoundingClientRect().top).toBe(100);
    expect($("#p").offsetTop).toBe(200);
  });

  test("a stored offset is re-clamped when the content shrinks", () => {
    const { $ } = lite(`<div id=s style="height:100px;overflow:auto"><div id=c style="height:400px"></div></div>`);
    $("#s").scrollTop = 300;
    $("#c").style.height = "150px";
    expect($("#s").scrollTop).toBe(50);
  });

  test("scrollIntoView() scrolls scroll-container ancestors: block start by default, end for false, nearest", () => {
    const { $ } = lite(`<div id=s style="height:100px;overflow:auto"><div style="height:500px"></div><p id=p style="height:20px"></p><div style="height:500px"></div></div>`);
    $("#p").scrollIntoView();
    expect($("#s").scrollTop).toBe(500);
    $("#p").scrollIntoView(false);
    expect($("#s").scrollTop).toBe(420);
    $("#s").scrollTop = 0;
    $("#p").scrollIntoView({ block: "nearest" });
    expect($("#s").scrollTop).toBe(420);
    $("#p").scrollIntoView({ block: "center" });
    expect($("#s").scrollTop).toBe(460);
  });
});

describe("invalidation — version-stamped, recomputed on the next read", () => {
  test("DOM mutations, inline style changes, style sheets and viewport resizes are reflected", () => {
    const { window, document, $ } = lite(`<div id=a style="height:10px"></div>`);
    expect($("#a").offsetHeight).toBe(10);
    $("#a").style.height = "20px";
    expect($("#a").offsetHeight).toBe(20);
    const b = document.createElement("div") as unknown as El;
    b.style.height = "5px";
    (document.body as unknown as El).appendChild(b);
    expect(($("body") as El).offsetHeight).toBe(25);
    const style = document.createElement("style");
    style.textContent = `#a { padding-top: 3px }`;
    document.head!.appendChild(style);
    expect($("#a").offsetHeight).toBe(23);
    window.innerWidth = 500;
    expect($("#a").offsetWidth).toBe(500);
  });
});

describe("shadow trees — https://dom.spec.whatwg.org/#concept-shadow-tree", () => {
  test("a host lays out its shadow tree; slotted light children flow where their slot is", () => {
    const { document, $ } = lite(`<div id=host><p id=light style="height:7px"></p></div>`);
    const root = $("#host").attachShadow({ mode: "open" });
    root.innerHTML = `<div style="height:13px"></div><slot></slot>`;
    expect($("#light").getBoundingClientRect().top).toBe(13);
    expect($("#host").offsetHeight).toBe(20);
    void document;
  });
});

describe("ResizeObserver — https://drafts.csswg.org/resize-observer/#broadcast-active-resize-observations", () => {
  test("observe() delivers an initial entry (lastReportedSizes starts at -1×-1) with content, border and device-pixel sizes", async () => {
    const { window, $ } = lite(`<div id=a style="width:100px;height:40px;padding:5px;border:1px solid"></div>`);
    window.devicePixelRatio = 2;
    const calls: unknown[] = [];
    const ro = new ResizeObserver((entries, observer) => {
      const e = entries[0] as { target: unknown; contentRect: Rect; borderBoxSize: { inlineSize: number; blockSize: number }[]; contentBoxSize: { inlineSize: number }[]; devicePixelContentBoxSize: { inlineSize: number }[] };
      calls.push([e.target === $("#a"), observer === ro, e.contentRect.toJSON(), e.borderBoxSize[0].inlineSize, e.borderBoxSize[0].blockSize, e.contentBoxSize[0].inlineSize, e.devicePixelContentBoxSize[0].inlineSize]);
    });
    ro.observe($("#a") as never);
    expect(calls).toEqual([]); // delivered after the current task's microtasks, not synchronously
    await Promise.resolve();
    expect(calls).toEqual([[true, true, { x: 5, y: 5, width: 100, height: 40, top: 5, right: 105, bottom: 45, left: 5 }, 112, 52, 100, 200]]);
  });

  test("no entry while the observed box size is unchanged; a change is delivered after the next layout", async () => {
    const { $ } = lite(`<div id=a style="height:40px"></div>`);
    const sizes: number[] = [];
    const ro = new ResizeObserver((entries) => sizes.push((entries[0] as { contentRect: Rect }).contentRect.height));
    ro.observe($("#a") as never);
    await Promise.resolve();
    $("#a").innerHTML = "text"; // DOM change without a size change
    void $("#a").offsetHeight;
    await Promise.resolve();
    $("#a").style.height = "60px";
    void $("#a").offsetHeight;
    await Promise.resolve();
    $("#a").style.display = "none"; // https://drafts.csswg.org/resize-observer/#intro: fires when display becomes none
    void $("#a").offsetHeight;
    await Promise.resolve();
    expect(sizes).toEqual([40, 60, 0]);
    ro.disconnect();
  });

  test("unobserve()/disconnect() stop delivery", async () => {
    const { $ } = lite(`<div id=a style="height:40px"></div>`);
    let calls = 0;
    const ro = new ResizeObserver(() => calls++);
    ro.observe($("#a") as never);
    ro.unobserve($("#a") as never);
    await Promise.resolve();
    expect(calls).toBe(0);
  });
});
