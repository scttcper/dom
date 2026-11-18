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
  DataTransfer,
  FileReader,
  HTMLElement,
  installGlobals,
  MouseEvent,
  MutationObserver,
  NodeList,
  type CustomElementRegistry,
  type Element,
  type HTMLDialogElement,
  type HTMLFormElement,
  type HTMLInputElement,
  type HTMLSlotElement,
  type HTMLTemplateElement,
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

test("discarded NodeList subclasses release the DOM captured by their prototype", async () => {
  const w = createWindow();
  const tracker = new Tracker();
  (() => {
    const input = tracker.track("input", w.document.createElement("input"));
    class InputList extends NodeList {
      override _snapshot() {
        return [input];
      }
    }
    tracker.track("NodeList subclass", InputList);
    const list = new InputList(null);
    expect(list[0]).toBe(input);
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

  test("shared storage releases discarded tabs while live peers keep the stored data", async () => {
    const original = createWindow();
    const tracker = new Tracker();
    function openTab(i: number) {
      const tab = tracker.track("shared tab", createWindow({ shareStorageWith: original }));
      tracker.track("tab document", tab.document);
      tab.localStorage.setItem("step", String(i));
    }
    for (let i = 0; i < 12; i++) openTab(i);
    const peer = createWindow({ shareStorageWith: original });
    expect(peer.localStorage.getItem("step")).toBe("11");
    expect(await tracker.alive()).toEqual({});
    original.localStorage.setItem("step", "done");
    expect(peer.localStorage.getItem("step")).toBe("done");
    original.close();
    peer.close();
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
  test("manual assignment releases removed children and slots independently", async () => {
    const w = createWindow();
    const d = w.document;
    const host = d.body!.appendChild(d.createElement("div"));
    const root = host.attachShadow({ mode: "open", slotAssignment: "manual" });
    const slot = root.appendChild(d.createElement("slot")) as HTMLSlotElement;
    const survivor = host.appendChild(d.createTextNode("kept"));
    const tracker = new Tracker();
    (() => {
      const removed = tracker.track("removed child", host.appendChild(d.createElement("button")));
      slot.assign(removed, survivor);
      removed.remove();
      const other = tracker.track("removed slot", root.appendChild(d.createElement("slot")) as HTMLSlotElement);
      other.assign(survivor);
      other.remove();
    })();
    expect(await tracker.alive()).toEqual({});
    expect(slot.assignedNodes()).toEqual([]);
    expect(survivor.assignedSlot).toBeNull();
    slot.assign(survivor);
    survivor.remove();
    host.append(survivor);
    expect(survivor.assignedSlot).toBe(slot);
    w.close();
  });

  test.each(["dialog", "popover"] as const)(
    "a removed %s releases its pressed subtree before pointerup",
    async (kind) => {
      const w = createWindow();
      const body = w.document.body!;
      const tracker = new Tracker();
      function open() {
        if (kind === "dialog") {
          const dialog = body.appendChild(w.document.createElement("dialog")) as HTMLDialogElement;
          dialog.closedBy = "any";
          dialog.show();
          return dialog;
        }
        const popover = body.appendChild(w.document.createElement("div")) as HTMLElement;
        popover.setAttribute("popover", "auto");
        popover.showPopover();
        return popover;
      }
      (() => {
        const overlay = tracker.track(kind, open());
        const child = overlay.appendChild(tracker.track("pressed button", w.document.createElement("button")));
        child.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
        overlay.remove();
      })();
      const next = open();
      expect(await tracker.alive()).toEqual({});
      const isOpen = () => (kind === "dialog" ? next.hasAttribute("open") : next.matches(":popover-open"));
      body.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
      expect(isOpen()).toBe(true);
      body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
      body.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
      expect(isOpen()).toBe(false);
      w.close();
    },
  );

  test("open overlays release discarded invokers and focus restoration targets", async () => {
    const w = createWindow();
    const body = w.document.body!;
    const tracker = new Tracker();
    const dialog = body.appendChild(w.document.createElement("dialog")) as HTMLDialogElement;
    const popover = body.appendChild(w.document.createElement("div")) as HTMLElement;
    popover.setAttribute("popover", "manual");
    (() => {
      const opener = tracker.track(
        "previously focused",
        body.appendChild(w.document.createElement("button")) as HTMLElement & { focus(): void },
      );
      opener.focus();
      dialog.show();
      opener.remove();
      const source = tracker.track(
        "popover source",
        body.appendChild(w.document.createElement("button")) as HTMLElement,
      );
      popover.showPopover({ source });
      source.remove();
    })();
    expect(await tracker.alive()).toEqual({});
    dialog.close();
    popover.hidePopover();
    w.close();
  });

  test("mounted controls release removed ARIA targets after their reflected arrays were read", async () => {
    const w = createWindow();
    const d = w.document;
    const tracker = new Tracker();
    type Relations = { ariaControlsElements: readonly Element[] | null };
    const field = d.body!.appendChild(d.createElement("input")) as Element & Relations;
    const button = d.body!.appendChild(d.createElement("button")) as Element & Relations;
    (w.customElements as CustomElementRegistry).define("x-aria-control", class extends HTMLElement {});
    const custom = d.body!.appendChild(d.createElement("x-aria-control")) as HTMLElement;
    const internals = custom.attachInternals() as unknown as Relations;
    const stable = d.body!.appendChild(d.createElement("span"));
    (() => {
      const addPopup = (label: string) => tracker.track(label, d.body!.appendChild(d.createElement("div")));
      const byId = addPopup("ID reference");
      byId.id = "popup";
      field.setAttribute("aria-controls", "popup");
      const explicit = addPopup("explicit reference");
      button.ariaControlsElements = [explicit];
      const internal = addPopup("internals reference");
      internals.ariaControlsElements = [stable, internal];
      expect(field.ariaControlsElements).toEqual([byId]);
      expect(button.ariaControlsElements).toEqual([explicit]);
      expect(internals.ariaControlsElements).toEqual([stable, internal]);
      byId.remove();
      explicit.remove();
      internal.remove();
    })();
    expect(await tracker.alive()).toEqual({});
    expect(field.ariaControlsElements).toEqual([]);
    expect(button.ariaControlsElements).toEqual([]);
    const snapshot = internals.ariaControlsElements;
    await collectGarbage();
    expect(internals.ariaControlsElements).toBe(snapshot);
    expect(snapshot).toEqual([stable]);
    w.close();
  });

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

  test("a mounted custom field releases its removed validation anchor and former form", async () => {
    const w = createWindow();
    const doc = w.document;
    const tracker = new Tracker();
    const owners: (string | null)[] = [];
    (w.customElements as CustomElementRegistry).define(
      "x-form-field",
      class extends HTMLElement {
        static formAssociated = true;
        formAssociatedCallback(owner: Element | null) {
          owners.push(owner?.id ?? null);
        }
      },
    );
    const field = doc.body!.appendChild(doc.createElement("x-form-field")) as HTMLElement;
    const internals = field.attachInternals();
    (() => {
      const form = tracker.track("former form", doc.body!.appendChild(doc.createElement("form")));
      form.id = "owner";
      field.setAttribute("form", "owner");
      expect(internals.form).toBe(form);
      const anchor = tracker.track("validation anchor", field.appendChild(doc.createElement("input")));
      internals.setValidity({ customError: true }, "Invalid value", anchor);
      anchor.remove();
      form.remove();
    })();
    expect(internals.form).toBeNull();
    expect(internals.validationMessage).toBe("Invalid value");
    expect(await tracker.alive()).toEqual({});
    field.removeAttribute("form");
    expect(owners).toEqual(["owner", null]);
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
  test.each(["owner removal", "rule deletion", "adopted replacement", "adopted rule replacement"])(
    "active trees release sheets and rules after %s without another style read",
    async (operation) => {
      const w = createWindow();
      const doc = w.document;
      const tracker = new Tracker();
      const host = doc.body!.appendChild(doc.createElement("div"));
      const root = host.attachShadow({ mode: "open" }) as ShadowRoot;
      const target = root.appendChild(doc.createElement("div"));
      const win = w as unknown as Record<string, any>;
      (() => {
        if (operation === "owner removal" || operation === "rule deletion") {
          const style = doc.createElement("style");
          style.textContent = "div { display: grid } div { color: red }";
          root.appendChild(style);
          const sheet = (style as any).sheet;
          tracker.track("rule", sheet.cssRules[0]);
          expect(w.getComputedStyle(target).display).toBe("grid");
          if (operation === "owner removal") {
            tracker.track("sheet", sheet);
            style.remove();
          } else sheet.deleteRule(0);
        } else {
          const sheet = new win.CSSStyleSheet();
          sheet.replaceSync("div { display: grid }");
          tracker.track("rule", sheet.cssRules[0]);
          const scope = root as ShadowRoot & { adoptedStyleSheets: object[] };
          scope.adoptedStyleSheets = [sheet];
          expect(w.getComputedStyle(target).display).toBe("grid");
          if (operation === "adopted replacement") {
            tracker.track("sheet", sheet);
            scope.adoptedStyleSheets = [];
          } else sheet.replaceSync("div { display: flex }");
        }
      })();
      expect(await tracker.alive()).toEqual({});
      expect(w.getComputedStyle(target).display).toBe(operation === "adopted rule replacement" ? "flex" : "block");
      w.close();
    },
  );

  test("mutating the adopted sheet array releases its former sheets before another style read", async () => {
    const w = createWindow();
    const tracker = new Tracker();
    const doc = w.document as typeof w.document & { adoptedStyleSheets: object[] };
    const sheets = doc.adoptedStyleSheets;
    (() => {
      const sheet = new (w as unknown as Record<string, any>).CSSStyleSheet();
      sheet.replaceSync("body { display: grid }");
      tracker.track("sheet", sheet);
      tracker.track("rule", sheet.cssRules[0]);
      sheets.push(sheet);
      expect(w.getComputedStyle(doc.body!).display).toBe("grid");
      sheets.pop();
    })();
    expect(await tracker.alive()).toEqual({});
    expect(w.getComputedStyle(doc.body!).display).toBe("block");
    w.close();
  });

  test("a rule deleted while its shadow host is in template contents is collectible before the next style read", async () => {
    const w = createWindow();
    const doc = w.document;
    const host = doc.body!.appendChild(doc.createElement("div"));
    const root = host.attachShadow({ mode: "open" }) as ShadowRoot & { adoptedStyleSheets: object[] };
    const target = root.appendChild(doc.createElement("button"));
    const sheet = new (w as unknown as Record<string, any>).CSSStyleSheet();
    sheet.replaceSync("button { display: grid }");
    root.adoptedStyleSheets.push(sheet);
    const template = doc.createElement("template") as HTMLTemplateElement;
    template.content.appendChild(host);
    expect(w.getComputedStyle(target).display).toBe("grid");
    const tracker = new Tracker();
    tracker.track("deleted rule", sheet.cssRules[0]);
    sheet.deleteRule(0);
    expect(await tracker.alive()).toEqual({});
    expect(w.getComputedStyle(target).display).not.toBe("grid");
    w.close();
  });

  test("moving a styled shadow host to another document releases its former window and constructed sheet", async () => {
    const tracker = new Tracker();
    const { destination, root, target } = (() => {
      const source = tracker.track("source window", createWindow());
      tracker.track("source document", source.document);
      const group = source.document.body!.appendChild(source.document.createElement("section"));
      const host = group.appendChild(source.document.createElement("div"));
      const root = host.attachShadow({ mode: "open" }) as ShadowRoot & { adoptedStyleSheets: object[] };
      const target = root.appendChild(source.document.createElement("button"));
      const sheet = new (source as unknown as Record<string, any>).CSSStyleSheet();
      sheet.replaceSync("[aria-pressed] { display: grid }");
      root.adoptedStyleSheets.push(tracker.track("constructed sheet", sheet));
      target.setAttribute("aria-pressed", "");
      expect(source.getComputedStyle(target).display).toBe("grid");
      source.document.adoptNode(group);
      expect(root.adoptedStyleSheets[0]).toBe(sheet);
      const destination = createWindow();
      destination.document.body!.appendChild(group);
      return { destination, root, target };
    })();
    expect(await tracker.alive()).toEqual({});
    expect(root.adoptedStyleSheets).toHaveLength(0);
    const sheet = new (destination as unknown as Record<string, any>).CSSStyleSheet();
    sheet.replaceSync("[aria-pressed] { display: flex }");
    root.adoptedStyleSheets.push(sheet);
    expect(destination.getComputedStyle(target).display).toBe("flex");
    target.removeAttribute("aria-pressed");
    expect(destination.getComputedStyle(target).display).not.toBe("flex");
    destination.close();
  });

  test("holding an empty adopted sheet array releases its detached shadow root", async () => {
    const w = createWindow();
    const tracker = new Tracker();
    const held = (() => {
      const host = tracker.track("host", w.document.body!.appendChild(w.document.createElement("div")));
      const root = tracker.track("shadow root", host.attachShadow({ mode: "open" })) as ShadowRoot & {
        adoptedStyleSheets: object[];
      };
      const array = root.adoptedStyleSheets;
      host.remove();
      return array;
    })();
    expect(await tracker.alive()).toEqual({});
    expect(held).toHaveLength(0);
    w.close();
  });

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

describe("file lifetimes", () => {
  test("keeping drag items leaves their transfer and cached views collectible", async () => {
    const tracker = new Tracker();
    const items = (() => {
      const transfer = tracker.track("transfer", new DataTransfer());
      transfer.items.add(new File(["payload"], "kept.txt"));
      tracker.track("file list", transfer.files);
      tracker.track("types", transfer.types);
      return transfer.items;
    })();
    expect(await tracker.alive()).toEqual({});
    expect(items[0].getAsFile()?.name).toBe("kept.txt");
    items.clear();
    expect(items.length).toBe(0);
  });

  test.each(["remove", "clear"] as const)("a retained drag item releases its file after %s", async (method) => {
    const tracker = new Tracker();
    const transfer = new DataTransfer();
    const item = (() => {
      const file = tracker.track("dragged file", new File(["payload"], "drag.txt", { type: "text/plain" }));
      const item = transfer.items.add(file)!;
      expect(transfer.files.item(0)).toBe(file);
      if (method === "remove") transfer.items.remove(0);
      else transfer.items.clear();
      return item;
    })();
    expect(await tracker.alive()).toEqual({});
    expect(item.getAsFile()).toBeNull();
    expect(item.type).toBe("");
    expect(transfer.files.length).toBe(0);
  });

  test("an aborted file read releases the reader and blob before its bytes settle", async () => {
    const tracker = new Tracker();
    const bytes = Promise.withResolvers<ArrayBuffer>();
    const events: string[] = [];
    (() => {
      const blob = tracker.track("aborted blob", new Blob(["payload"]));
      blob.arrayBuffer = () => bytes.promise;
      const reader = tracker.track("aborted reader", new FileReader());
      for (const type of ["load", "abort", "loadend"]) reader.addEventListener(type, () => events.push(type));
      reader.readAsDataURL(blob);
      reader.abort();
    })();
    try {
      expect(await tracker.alive()).toEqual({});
    } finally {
      bytes.resolve(new ArrayBuffer(0));
      await bytes.promise;
    }
    expect(events).toEqual(["abort", "loadend"]);
  });
});

describe("heap slope", () => {
  test("replaced stylesheets release generated attribute selector names in a live document", async () => {
    const w = createWindow();
    const doc = w.document;
    const style = doc.head!.appendChild(doc.createElement("style"));
    const { bytesPerCycle } = await heapSlope(
      (i) => {
        const selectors = Array.from({ length: 64 }, (_, j) => `[data-option-${i}-${j}]`);
        style.textContent = selectors.join("") + " { color: blue }";
        void w.getComputedStyle(doc.body!).color;
      },
      { warmup: 80, samples: 6, every: 60 },
    );
    w.close();
    expect(bytesPerCycle).toBeLessThan(1024);
  });

  test("short-lived custom event subscriptions release their generated type names", async () => {
    const w = createWindow();
    const target = w.document.body!;
    const listener = () => {};
    const { bytesPerCycle } = await heapSlope(
      (i) => {
        const row = w.document.createElement("button");
        for (let j = 0; j < 50; j++) {
          const type = `validation:${i}:${j}`;
          target.addEventListener(type, listener);
          target.removeEventListener(type, listener);
          row.addEventListener(type, listener);
        }
      },
      { warmup: 60, samples: 6, every: 60 },
    );
    w.close();
    expect(bytesPerCycle).toBeLessThan(512);
  });

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
