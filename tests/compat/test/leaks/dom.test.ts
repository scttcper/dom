/**
 * Retention of windows, documents and nodes after `window.close()`, and of removed subtrees in a
 * live document.
 *
 * Specs: ECMAScript WeakRef liveness (https://tc39.es/ecma262/#sec-weak-ref-objects);
 * HTML window.close() (https://html.spec.whatwg.org/#dom-window-close) — @ctrl/dom closes the
 * window for good (docs/deviations.md), cancelling its animation frames, idle callbacks and tasks;
 * DOM remove (https://dom.spec.whatwg.org/#concept-node-remove); CSSOM adoptedStyleSheets
 * (https://drafts.csswg.org/cssom/#dom-documentorshadowroot-adoptedstylesheets).
 */
import { describe, expect, test } from "vitest";
import { createWindow, currentWindowOrNull, installGlobals, type ShadowRoot, type Window } from "@ctrl/dom";
import { $css } from "@ctrl/dom/internal";
import { Tracker, collectGarbage, heapSlope } from "./gc.ts";

const HTML = `<!doctype html><html><head><style>.a { color: red } @media (min-width: 10px) { .b { display: none } }</style></head>
<body><div id=root><p class=a>hi</p><iframe srcdoc="<p>nested</p>"></iframe><label for=i>Name</label><input id=i>
<select><option>1</option></select><textarea>t</textarea></div></body></html>`;

let ceCounter = 0;

/** Build a window and exercise most subsystems; returns nothing (all references stay local). */
function exercise(tracker: Tracker, { close = true, install = false } = {}): void {
  const w = createWindow({ html: HTML });
  const uninstall = install ? installGlobals(w) : null;
  const win = w as unknown as Record<string, any>;
  const d = w.document;
  tracker.track("window", w);
  tracker.track("document", d);
  const root = d.getElementById("root")!;
  tracker.track("root", root);
  const iframe = d.querySelector("iframe") as unknown as { contentWindow: object | null };
  d.body!.append(d.createElement("iframe"));
  const nested = (d.body!.lastChild as unknown as { contentWindow: object | null }).contentWindow;
  if (nested !== null) tracker.track("iframe window", nested);
  if (iframe.contentWindow !== null) tracker.track("srcdoc window", iframe.contentWindow);

  const mo = new win.MutationObserver(() => {});
  mo.observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
  tracker.track("MutationObserver", mo);
  const live = root.getElementsByTagName("span");
  tracker.track("HTMLCollection", live);
  const childNodes = root.childNodes;
  tracker.track("NodeList", childNodes);
  for (let k = 0; k < 50; k++) {
    const s = d.createElement("span");
    s.setAttribute("data-k", String(k));
    s.className = `c${k % 3}`;
    s.textContent = `x${k}`;
    root.appendChild(s);
  }
  void live.length;
  void childNodes.length;
  root.querySelectorAll("span[data-k]");
  d.querySelector(".c1");
  root.matches("div#root");
  const range = d.createRange();
  range.selectNodeContents(root);
  tracker.track("Range", range);
  win.getSelection().selectAllChildren(root);
  const walker = d.createTreeWalker(root);
  walker.nextNode();
  const iterator = d.createNodeIterator(root);
  iterator.nextNode();
  tracker.track("NodeIterator", iterator);
  w.getComputedStyle(root.querySelector("p")!).color;
  const sheet = (d.querySelector("style") as unknown as { sheet: { insertRule(r: string): void } }).sheet;
  sheet.insertRule(".x { color: blue }");
  tracker.track("sheet", sheet);
  (d.getElementById("i") as unknown as { focus(): void; labels: unknown }).focus();
  void (d.getElementById("i") as unknown as { labels: { length: number } }).labels.length;
  w.requestAnimationFrame(() => {});
  w.requestIdleCallback(() => {});
  w.postMessage("x", "*");
  const mql = w.matchMedia("(min-width: 500px)");
  mql.addEventListener("change", () => {});
  tracker.track("MediaQueryList", mql);
  root.addEventListener("click", () => {});
  w.addEventListener("resize", () => {});
  root.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
  const name = `x-leak-${ceCounter++}`;
  const XEl = class extends win.HTMLElement {
    connectedCallback() {}
    static observedAttributes = ["a"];
    attributeChangedCallback() {}
  };
  win.customElements.define(name, XEl);
  root.appendChild(d.createElement(name)).setAttribute("a", "1");
  tracker.track("custom element class", XEl);
  const host = d.createElement("div");
  root.append(host);
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = "<slot></slot><b>s</b>";
  host.append(d.createElement("i"));
  tracker.track("ShadowRoot", shadow);
  d.body!.insertAdjacentHTML("beforeend", "<p>more</p>");
  new win.DOMParser().parseFromString("<p>parsed</p>", "text/html");
  localStorageTouch(w);
  mo.takeRecords();
  if (close) w.close();
  uninstall?.();
}

function localStorageTouch(w: Window): void {
  w.localStorage.setItem("k", "v");
  w.sessionStorage.setItem("k", "v");
  w.history.pushState({}, "", "/next");
  void w.navigator.userAgent;
}

describe("window.close() — https://html.spec.whatwg.org/#dom-window-close", () => {
  test("closed windows, their documents, nodes, observers, ranges, iframes and custom element classes are collectable", async () => {
    const tracker = new Tracker();
    for (let i = 0; i < 5; i++) exercise(tracker);
    expect(currentWindowOrNull()).toBeNull();
    expect(await tracker.alive()).toEqual({});
  });

  test("installGlobals + uninstall + close: nothing retained by the host global or module state", async () => {
    const tracker = new Tracker();
    for (let i = 0; i < 5; i++) exercise(tracker, { install: true });
    expect((globalThis as { document?: unknown }).document).toBeUndefined();
    expect(await tracker.alive()).toEqual({});
  });

  test("without close(), only the current window (the most recently created) stays reachable", async () => {
    const tracker = new Tracker();
    for (let i = 0; i < 5; i++) exercise(tracker, { close: false });
    // Pending animation frames / idle callbacks / posted messages run within ~20 ms.
    await new Promise((r) => setTimeout(r, 40));
    const alive = await tracker.alive();
    expect(alive.window).toBe(1);
    currentWindowOrNull()!.close();
    expect(await tracker.alive()).toEqual({});
  });
});

describe("remove — https://dom.spec.whatwg.org/#concept-node-remove", () => {
  test("a removed subtree is collectable although queries and label lookups on the document cached results that contained it", async () => {
    const w = createWindow({ html: HTML });
    const d = w.document;
    const tracker = new Tracker();
    (() => {
      const box = d.createElement("section");
      box.innerHTML =
        "<label>First <input class=f form=fid></label><label for=e>E</label><input id=e class=f form=fid><p class=f>p</p>";
      d.body!.append(box);
      tracker.track("subtree", box);
      tracker.track("input", box.querySelector("input")!);
      // Cached per root: the document, body and the subtree itself.
      d.querySelectorAll(".f");
      d.body!.querySelector("p.f");
      void (d.getElementById("e") as unknown as { labels: { length: number } }).labels.length;
      w.getComputedStyle(box.querySelector("p")!).color;
      // Live collections and form caches snapshot their members (version-stamped).
      void d.body!.children.length;
      void d.getElementsByClassName("f").length;
      void d.body!.getElementsByTagName("input").length;
      const form = d.createElement("form");
      d.body!.append(form);
      form.id = "fid";
      void (form as unknown as { elements: { length: number } }).elements.length;
      box.remove();
    })();
    expect(await tracker.alive()).toEqual({});
    w.close();
  });

  test("a detached tree whose live collections were read is collectable without any later removal", async () => {
    const w = createWindow({ html: HTML });
    const d = w.document;
    const tracker = new Tracker();
    (() => {
      const box = d.createElement("section");
      box.innerHTML = "<div><label for=d>D</label><input id=d></div><div><span>s</span></div>";
      const clone = box.cloneNode(true) as typeof box;
      tracker.track("detached tree", box);
      tracker.track("clone", clone);
      // Snapshots of collections rooted in a detached node are not registered with the document.
      void box.children.length;
      void clone.children[0];
      void clone.getElementsByTagName("span").length;
      void (clone.querySelector("input") as unknown as { labels: { length: number } }).labels.length;
    })();
    expect(await tracker.alive()).toEqual({});
    w.close();
  });
});

describe("adoptedStyleSheets — https://drafts.csswg.org/cssom/#dom-documentorshadowroot-adoptedstylesheets", () => {
  test("shadow roots that adopted a shared sheet (set, or read and pushed) are collectable once their hosts are removed", async () => {
    const w = createWindow({ html: HTML });
    const d = w.document;
    const win = w as unknown as Record<string, any>;
    const tracker = new Tracker();
    // Lit's pattern: one constructed sheet per component class, adopted by every instance.
    const shared = new win.CSSStyleSheet();
    shared.replaceSync(":host { display: block } .x { color: red }");
    (() => {
      for (let i = 0; i < 20; i++) {
        const host = d.createElement("div");
        const root = host.attachShadow({ mode: "open" }) as unknown as ShadowRoot & { adoptedStyleSheets: object[] };
        if (i % 2 === 0) root.adoptedStyleSheets = [shared];
        else root.adoptedStyleSheets.push(shared);
        root.innerHTML = "<span class=x>x</span>";
        d.body!.append(host);
        expect(w.getComputedStyle(root.querySelector("span")!).color).toBe("red");
        tracker.track("host", host);
        tracker.track("shadow root", root);
        host.remove();
      }
    })();
    expect(await tracker.alive()).toEqual({});
    // The document still styles itself, and the dead entries are pruned on the way.
    expect(w.getComputedStyle(d.querySelector("p")!).color).toBe("red");
    w.close();
  });

  test("the document's index of styled shadow roots stays bounded as they come and go", async () => {
    const w = createWindow({ html: HTML });
    const d = w.document;
    const shared = new (w as unknown as Record<string, any>).CSSStyleSheet();
    shared.replaceSync(".x { color: red }");
    const indexed = () =>
      (d as unknown as Record<symbol, { shadows: { refs: Set<unknown> } | null }>)[$css].shadows?.refs.size ?? 0;
    const churn = () => {
      for (let i = 0; i < 200; i++) {
        const host = d.createElement("div");
        const root = host.attachShadow({ mode: "open" }) as unknown as { adoptedStyleSheets: object[] };
        root.adoptedStyleSheets = [shared];
        d.body!.append(host);
        host.remove();
      }
    };
    churn();
    await collectGarbage();
    churn();
    // Adding prunes collected entries whenever the index doubles: well under 2 × 200 entries.
    expect(indexed()).toBeLessThanOrEqual(264);
    w.close();
  });
});

describe("heap slope", () => {
  test("ranges and NodeIterators created without mutations do not accumulate registry entries", async () => {
    const w = createWindow({ html: HTML });
    const d = w.document;
    const root = d.getElementById("root")!;
    const { bytesPerCycle } = await heapSlope(
      () => {
        for (let k = 0; k < 50; k++) {
          d.createRange().selectNodeContents(root);
          d.createNodeIterator(root).nextNode();
        }
      },
      { warmup: 100, samples: 6, every: 100 },
    );
    w.close();
    // 100 registrations per cycle: a leaked WeakRef each would be several KB per cycle.
    expect(bytesPerCycle).toBeLessThan(512);
  });

  test("createWindow → exercise → close cycles keep heap-after-GC flat", async () => {
    // A tracker that keeps nothing (WeakRefs themselves would grow the heap).
    const untracked = { track: <T>(_label: string, target: T) => target } as unknown as Tracker;
    const { bytesPerCycle, points } = await heapSlope(() => exercise(untracked), {
      warmup: 400,
      samples: 6,
      every: 80,
    });
    if (process.env.LEAK_DEBUG)
      console.log(points.map(([x, y]) => `${x}:${(y / 1024).toFixed(0)}K`).join(" "), bytesPerCycle);
    // One exercised window is ~100+ KB; anything retained per cycle shows up immediately. The
    // warmup absorbs JIT/feedback growth (the post-warmup slope is ~50 B/cycle).
    expect(bytesPerCycle).toBeLessThan(1024);
  });
});
