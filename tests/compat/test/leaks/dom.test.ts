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
import {
  createWindow,
  currentWindowOrNull,
  installGlobals,
  MouseEvent,
  MutationObserver,
  type HTMLFormElement,
  type HTMLInputElement,
  type ShadowRoot,
  type Window,
} from "@ctrl/dom";
import { $css } from "@ctrl/dom/internal";
import { queryAllByLabelText } from "@ctrl/dom/testing-library";
import { activeObservers, subtreeObservers } from "../../../../packages/dom/src/observers/queue.ts";
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

test("a live window releases media queries when their last change listener goes away", async () => {
  const w = createWindow();
  const tracker = new Tracker();
  const listener = () => {};
  (() => {
    const query = () => tracker.track("media query", w.matchMedia("(max-width: 600px)"));
    const legacy = query();
    legacy.addListener(listener);
    legacy.removeListener(listener);
    const property = query();
    property.onchange = listener;
    property.onchange = null;
    const controller = new AbortController();
    query().addEventListener("change", listener, { signal: controller.signal });
    controller.abort();
    query().addEventListener("change", listener, { signal: controller.signal });
    query().addEventListener("change", listener, { once: true });
    w.innerWidth = 500;
  })();
  expect(await tracker.alive()).toEqual({});
  w.close();
});

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
  test("abandoned mutation observers release their callbacks and restore the idle mutation path", async () => {
    const w = createWindow();
    const tracker = new Tracker();
    await collectGarbage();
    const counts = [activeObservers, subtreeObservers];
    (() => {
      const row = tracker.track("observed row", w.document.createElement("div"));
      const callback = tracker.track("callback", () => row.textContent);
      const observer = tracker.track("observer", new MutationObserver(callback));
      observer.observe(row, { subtree: true, attributes: true });
      observer.observe(w.document.createElement("input"), { childList: true });
      expect([activeObservers, subtreeObservers]).toEqual(counts.map((n) => n + 1));
    })();
    expect(await tracker.alive()).toEqual({});
    await collectGarbage();
    expect([activeObservers, subtreeObservers]).toEqual(counts);
    w.close();
  });

  test("a mutation observer releases discarded targets and keeps observing reachable detached targets", async () => {
    const w = createWindow();
    const tracker = new Tracker();
    const observer = new MutationObserver(() => {});
    const live = w.document.createElement("div");
    observer.observe(live, { attributes: true });
    (() => {
      const row = tracker.track("observed row", w.document.body!.appendChild(w.document.createElement("div")));
      row.appendChild(tracker.track("row content", w.document.createElement("input")));
      observer.observe(row, { attributes: true, subtree: true });
      row.remove();
    })();
    expect(await tracker.alive()).toEqual({});
    live.id = "updated";
    expect(observer.takeRecords().map((r) => r.target)).toEqual([live]);
    observer.disconnect();
    w.close();
  });

  test("a live abort signal releases discarded click targets and their callbacks", async () => {
    const w = createWindow();
    const controller = new AbortController();
    const tracker = new Tracker();
    function addRow() {
      const row = tracker.track("button", w.document.createElement("button"));
      const click = tracker.track("click handler", () => row.classList.toggle("active"));
      w.document.body!.append(row);
      row.addEventListener("click", click, { signal: controller.signal });
      row.remove();
    }
    for (let i = 0; i < 20; i++) addRow();
    expect(await tracker.alive()).toEqual({});
    controller.abort();
    w.close();
  });

  test("removing the last abortable listener releases its signal and application abort handlers", async () => {
    const w = createWindow();
    const tracker = new Tracker();
    const target = w.document.body!;
    (() => {
      const controller = new AbortController();
      const signal = tracker.track("signal", controller.signal);
      signal.addEventListener(
        "abort",
        tracker.track("abort handler", () => {}),
      );
      const click = () => {};
      target.addEventListener("click", click, { signal });
      target.removeEventListener("click", click);
    })();
    expect(await tracker.alive()).toEqual({});
    w.close();
  });

  test("aborting releases a live target's callbacks even if an earlier abort handler stops propagation", async () => {
    const w = createWindow();
    const controller = new AbortController();
    controller.signal.addEventListener("abort", (event) => event.stopImmediatePropagation());
    const tracker = new Tracker();
    (() => {
      const click = tracker.track("click handler", () => {});
      w.document.addEventListener("click", click, { signal: controller.signal });
    })();
    controller.abort();
    expect(await tracker.alive()).toEqual({});
    w.close();
  });

  test("an abort handler that captures its discarded target lets both sides be collected", async () => {
    const w = createWindow();
    const tracker = new Tracker();
    (() => {
      const button = tracker.track("button", w.document.createElement("button"));
      const signal = tracker.track("signal", new AbortController().signal);
      signal.addEventListener("abort", () => button.remove());
      button.addEventListener("click", () => {}, { signal });
    })();
    expect(await tracker.alive()).toEqual({});
    w.close();
  });

  test("a composed click releases its detached shadow host after dispatch", async () => {
    const w = createWindow();
    const tracker = new Tracker();
    (() => {
      const host = tracker.track("host", w.document.body!.appendChild(w.document.createElement("article")));
      const shadow = tracker.track("shadow root", host.attachShadow({ mode: "closed" }));
      const button = tracker.track("button", shadow.appendChild(w.document.createElement("button")));
      button.dispatchEvent(new MouseEvent("click", { composed: true, bubbles: true }));
      host.remove();
    })();
    expect(await tracker.alive()).toEqual({});
    w.close();
  });

  test("a checked radio releases the previous radio and its detached subtree", async () => {
    const w = createWindow({
      html: "<form><label><input type=radio name=g checked>Old</label><input id=current type=radio name=g></form>",
    });
    const tracker = new Tracker();
    const current = w.document.getElementById("current") as HTMLInputElement;
    (() => {
      const label = tracker.track("previous label", w.document.querySelector("label")!);
      tracker.track("previous radio", label.firstChild!);
      current.click();
      label.remove();
    })();
    expect(await tracker.alive()).toEqual({});
    expect(current.checked).toBe(true);
    w.close();
  });

  test("named field lookups release removed rows and discarded live lists while the form stays mounted", async () => {
    const w = createWindow({ html: "<form id=f></form>" });
    const form = w.document.getElementById("f") as HTMLFormElement & Record<string, any>;
    const tracker = new Tracker();
    (() => {
      for (let i = 0; i < 20; i++) {
        const name = `field-${i}`;
        const row = tracker.track("row", w.document.createElement("label"));
        const input = tracker.track("input", w.document.createElement("input") as HTMLInputElement);
        input.name = name;
        row.append(input);
        form.append(row);
        expect(form[name]).toBe(input);
        row.append(input.cloneNode());
        expect(tracker.track("list", form[name]).length).toBe(2);
        row.remove();
      }
    })();
    expect(await tracker.alive()).toEqual({});
    expect(form.length).toBe(0);
    w.close();
  });

  test("tracking a form attribute in a detached tree releases both control and form", async () => {
    const w = createWindow();
    const tracker = new Tracker();
    (() => {
      const form = tracker.track("form", w.document.createElement("form") as HTMLFormElement & { field?: unknown });
      const input = tracker.track("input", w.document.createElement("input") as HTMLInputElement);
      form.id = "example";
      input.name = "field";
      input.setAttribute("form", form.id);
      form.append(input);
      expect(form.field).toBe(input);
    })();
    expect(await tracker.alive()).toEqual({});
    w.close();
  });

  test("a parser-associated input releases its removed form without another owner lookup", async () => {
    const w = createWindow({ html: "<div><form id=f></div><input id=i>" });
    const tracker = new Tracker();
    const input = w.document.getElementById("i") as HTMLInputElement;
    (() => {
      const form = tracker.track("form", w.document.getElementById("f")!);
      expect(input.form).toBe(form);
      form.remove();
    })();
    expect(await tracker.alive()).toEqual({});
    expect(input.form).toBeNull();
    w.close();
  });

  test("ranges adjusted during removal are collectable while the document stays open", async () => {
    const w = createWindow();
    const tracker = new Tracker();
    const child = w.document.createElement("button");
    w.document.body!.append(child);
    for (let i = 0; i < 20; i++) tracker.track("range", w.document.createRange()).selectNodeContents(child);
    child.remove();
    expect(await tracker.alive()).toEqual({});
    w.close();
  });

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
      queryAllByLabelText(d.body as any, "First");
      queryAllByLabelText(d.body as any, "E");
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

  test("a mounted root releases discarded getElementsBy collections and keeps held collections live", async () => {
    const w = createWindow();
    const root = w.document.body!;
    const tracker = new Tracker();
    const held = root.getElementsByClassName("active row");
    for (let i = 0; i < 20; i++) {
      tracker.track("class collection", root.getElementsByClassName(`class-${i}`));
      tracker.track("tag collection", root.getElementsByTagName(`tag-${i}`));
      tracker.track("namespace collection", root.getElementsByTagNameNS("*", `tag-${i}`));
    }
    expect(await tracker.alive()).toEqual({});
    root.appendChild(w.document.createElement("div")).className = "row active";
    expect(root.getElementsByClassName("active row")).toBe(held);
    expect(held.item(0)).toBe(root.firstChild);
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
      // The document keys snapshots weakly by their owner, including those read on detached trees.
      void box.children.length;
      void clone.children[0];
      void clone.getElementsByTagName("span").length;
      void (clone.querySelector("input") as unknown as { labels: { length: number } }).labels.length;
    })();
    expect(await tracker.alive()).toEqual({});
    w.close();
  });

  test.each([false, true])(
    "a live detached form releases removed collection members (adopted: %s)",
    async (adopted) => {
      const w = createWindow();
      const other = adopted ? createWindow() : null;
      const tracker = new Tracker();
      const form = w.document.createElement("form") as HTMLFormElement;
      const input = w.document.createElement("input") as HTMLInputElement;
      (() => {
        const label = tracker.track("label", w.document.createElement("label"));
        const button = tracker.track("button", w.document.createElement("button"));
        label.append(input, button);
        form.append(label);
        expect(form.children.length).toBe(1);
        expect(form.elements.length).toBe(2);
        expect(input.labels!.length).toBe(1);
        other?.document.adoptNode(form);
        input.remove();
        label.remove();
      })();
      expect(await tracker.alive()).toEqual({});
      expect(form.elements.length).toBe(0);
      expect(input.labels!.length).toBe(0);
      other?.close();
      w.close();
    },
  );
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
