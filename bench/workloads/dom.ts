// DOM micro workloads, ported from ~/gh/dom-bench (src/workloads.jsx) and
// ~/gh/vibedom/bench/dom-bench/render-workloads.mjs. Same operations and verification, adapted
// to this harness (fixture creation, resets and verification are untimed).

import type { Workload } from "./types.ts";
import { check, eq } from "./types.ts";

const size = 1000;
const tags = ["div", "span", "button", "input"];
const rowsHtml = Array.from(
  { length: 250 },
  (_, i) => `<div class="row" data-testid="row-${i}"><span>Item ${i}</span></div>`,
).join("");

export const domWorkloads: Workload[] = [
  {
    id: "dom/create-4k",
    title: "Create 4,000 ordinary elements",
    kind: "dom",
    iterations: 25,
    warmup: 8,
    setup({ document }) {
      return {
        run() {
          const out: any[] = [];
          for (let i = 0; i < size * 4; i++) out.push(document.createElement(tags[i % tags.length]));
          return out;
        },
        verify(elements: any) {
          eq(elements.length, size * 4, "count");
          for (let i = 0; i < elements.length; i++) {
            const el = elements[i];
            eq(el.localName, tags[i % tags.length], "localName");
            check(el.ownerDocument === document, "ownerDocument");
            check(el.parentNode === null && el.isConnected === false, "detached");
          }
        },
      };
    },
  },
  {
    id: "dom/build-1000-rows",
    title: "Build 1,000 attributed rows (label + input)",
    kind: "dom",
    iterations: 20,
    warmup: 5,
    setup({ document }) {
      const container = document.createElement("main");
      document.body.append(container);
      return {
        run() {
          for (let i = 0; i < size; i++) {
            const row = document.createElement("div");
            row.className = "row";
            row.setAttribute("data-id", String(i));
            const label = document.createElement("label");
            label.htmlFor = `control-${i}`;
            label.textContent = `Row ${i}`;
            const input = document.createElement("input");
            input.id = `control-${i}`;
            input.name = `field-${i}`;
            input.value = String(i);
            row.append(label, input);
            container.append(row);
          }
        },
        verify() {
          eq(container.children.length, size, "rows");
          for (let i = 0; i < size; i++) {
            const row = container.children[i];
            eq(row.className, "row", "className");
            eq(row.dataset.id, String(i), "dataset.id");
            eq(row.children.length, 2, "row children");
            eq(row.firstChild.textContent, `Row ${i}`, "label text");
            eq(row.firstChild.htmlFor, `control-${i}`, "htmlFor");
            eq(row.lastChild.name, `field-${i}`, "input name");
            eq(row.lastChild.value, String(i), "input value");
            check(document.getElementById(`control-${i}`) === row.lastChild, "getElementById");
            check(row.lastChild.isConnected, "connected");
          }
        },
        afterEach() {
          container.replaceChildren();
        },
        close() {
          container.remove();
        },
      };
    },
  },
  {
    id: "dom/attr-revisions",
    title: "Four revisions of four attributes on 1,000 elements",
    kind: "dom",
    iterations: 20,
    warmup: 5,
    setup({ document }) {
      const container = document.createElement("main");
      const elements: any[] = [];
      for (let i = 0; i < size; i++) {
        const el = document.createElement("button");
        el.setAttribute("class", "initial");
        el.setAttribute("aria-label", "Initial");
        el.setAttribute("data-state", "initial");
        el.setAttribute("title", "Initial");
        container.append(el);
        elements.push(el);
      }
      document.body.append(container);
      let revision = 0;
      return {
        run() {
          for (let round = 0; round < 4; round++) {
            revision++;
            for (let i = 0; i < elements.length; i++) {
              const el = elements[i];
              el.setAttribute("class", `state-${revision}`);
              el.setAttribute("aria-label", `Label ${revision}`);
              el.setAttribute("data-state", String(revision));
              el.setAttribute("title", `Title ${revision}`);
            }
          }
        },
        verify() {
          for (const el of elements) {
            eq(el.className, `state-${revision}`, "className");
            eq(el.getAttribute("aria-label"), `Label ${revision}`, "aria-label");
            eq(el.dataset.state, String(revision), "dataset.state");
            eq(el.title, `Title ${revision}`, "title");
            eq(el.attributes.length, 4, "attributes.length");
          }
          eq(container.querySelectorAll(`.state-${revision}`).length, size, "class query");
          eq(container.querySelectorAll(`[data-state="${revision}"]`).length, size, "attr query");
        },
        close() {
          container.remove();
        },
      };
    },
  },
  {
    id: "dom/deep-clone",
    title: "Deep-clone a 1,000-row subtree",
    kind: "dom",
    iterations: 20,
    warmup: 5,
    setup({ document }) {
      const source = document.createElement("section");
      source.innerHTML = Array.from(
        { length: size },
        (_, i) =>
          `<div class="row" data-id="${i}"><label for="item-${i}">Row ${i}</label><input id="item-${i}" name="field-${i}" value="${i}"></div>`,
      ).join("");
      return {
        run() {
          return source.cloneNode(true);
        },
        verify(clone: any) {
          check(clone.parentNode === null, "clone detached");
          check(clone.ownerDocument === document, "ownerDocument");
          eq(clone.children.length, size, "rows");
          for (let i = 0; i < size; i++) {
            const row = clone.children[i];
            const original = source.children[i];
            check(row !== original && row.firstChild !== original.firstChild, "new nodes");
            eq(row.className, "row", "className");
            eq(row.dataset.id, String(i), "dataset.id");
            eq(row.firstChild.textContent, `Row ${i}`, "label text");
            eq(row.lastChild.id, `item-${i}`, "input id");
            eq(row.lastChild.name, `field-${i}`, "input name");
            eq(row.lastChild.value, String(i), "input value");
          }
          clone.firstChild.setAttribute("class", "changed");
          eq(source.firstChild.className, "row", "source untouched");
        },
      };
    },
  },
  {
    id: "dom/innerhtml-250",
    title: "innerHTML parse, 250 rows (500 elements)",
    kind: "dom",
    iterations: 50,
    warmup: 10,
    setup({ document }) {
      const container = document.createElement("main");
      document.body.append(container);
      return {
        run() {
          container.innerHTML = rowsHtml;
          return container.childElementCount;
        },
        verify(count) {
          eq(count, 250, "childElementCount");
          eq(container.lastElementChild.getAttribute("data-testid"), "row-249", "last row");
          eq(container.lastElementChild.firstChild.textContent, "Item 249", "last row text");
        },
        close() {
          container.remove();
        },
      };
    },
  },
  {
    id: "dom/selector-warm",
    title: "Warm selector queries, 250 rows",
    kind: "dom",
    iterations: 200,
    warmup: 20,
    setup({ document }) {
      const container = document.createElement("main");
      container.innerHTML = rowsHtml;
      document.body.append(container);
      return {
        run() {
          let n = 0;
          for (let k = 0; k < 10; k++) {
            n +=
              container.querySelectorAll("[data-testid]").length +
              container.querySelectorAll('[data-testid="row-249"]').length;
          }
          return n;
        },
        verify(n) {
          eq(n, 2510, "match count");
        },
        close() {
          container.remove();
        },
      };
    },
  },
  {
    id: "dom/mutation-query",
    title: "Attribute mutation + selector queries, 250 rows",
    kind: "dom",
    iterations: 200,
    warmup: 20,
    setup({ document }) {
      const container = document.createElement("main");
      container.innerHTML = rowsHtml;
      document.body.append(container);
      const target = container.lastElementChild;
      return {
        run() {
          let n = 0;
          for (let k = 0; k < 10; k++) {
            target.toggleAttribute("data-dirty");
            n +=
              container.querySelectorAll("[data-testid]").length +
              container.querySelectorAll('[data-testid="row-249"]').length +
              container.querySelectorAll("[data-dirty]").length;
          }
          return n;
        },
        verify(n) {
          // 10 rounds × 251, plus [data-dirty] matching on 5 of the 10 toggles.
          eq(n, 2515, "match count");
        },
        close() {
          container.remove();
        },
      };
    },
  },
  {
    // Stock Testing Library's getByRole runs `querySelectorAll(makeRoleSelector(role))` (an
    // explicit-role item plus the role's implicit tags) after every render; app code and older
    // tests use `#id descendant` queries.
    id: "dom/role-selector-query",
    title: "Attribute mutation + role selector lists and #id-rooted queries, 250 rows",
    kind: "dom",
    iterations: 100,
    warmup: 20,
    setup({ document }) {
      const container = document.createElement("main");
      container.innerHTML =
        Array.from(
          { length: 250 },
          (_, i) =>
            `<div class="row"><h3>Row ${i}</h3><label>Name ${i}<input type="text"></label><button type="button">Edit</button>${i % 10 === 0 ? `<div role="button">More</div>` : ""}</div>`,
        ).join("") + `<section id="panel"><ul>${"<li><a href='#'>x</a></li>".repeat(20)}</ul></section>`;
      document.body.append(container);
      const target = container.lastElementChild;
      return {
        run() {
          let n = 0;
          for (let k = 0; k < 5; k++) {
            target.toggleAttribute("data-dirty");
            n +=
              container.querySelectorAll('*[role~="button"],button,input').length +
              container.querySelectorAll('*[role~="textbox"],input,textarea').length +
              container.querySelectorAll('*[role~="heading"],h1,h2,h3,h4,h5,h6').length +
              container.querySelectorAll("#panel li > a").length +
              container.querySelectorAll("#missing li").length;
          }
          return n;
        },
        verify(n) {
          // Per round: 250 buttons + 25 [role=button] + 250 inputs; 250 inputs; 250 h3; 20 links.
          eq(n, 5 * (525 + 250 + 250 + 20), "match count");
        },
        close() {
          container.remove();
        },
      };
    },
  },
  {
    // getComputedStyle (and the accessibility tree's display/visibility checks) after a mutation:
    // every element's style is recomputed under rules scoped by ancestor classes.
    id: "dom/computed-style-mutation",
    title: "Attribute mutation + computed display/visibility/color on 200 elements, 200 ancestor rules",
    kind: "dom",
    iterations: 30,
    warmup: 5,
    setup({ document, window }) {
      const sheet = document.createElement("style");
      sheet.textContent =
        Array.from(
          { length: 200 },
          (_, i) => `.scope-${i} > .item { color: rgb(${i % 255}, 10, 20); padding: ${i % 8}px; }`,
        ).join("\n") + "\n.item { display: flex } .item:hover { color: blue }";
      document.head.append(sheet);
      const container = document.createElement("main");
      container.innerHTML = Array.from(
        { length: 20 },
        (_, i) => `<section class="scope-${i}">${'<span class="item"></span>'.repeat(10)}</section>`,
      ).join("");
      document.body.append(container);
      const items = container.querySelectorAll(".item");
      return {
        run() {
          container.toggleAttribute("data-revision");
          let correct = 0;
          for (let i = 0; i < items.length; i++) {
            const style = window.getComputedStyle(items[i]);
            if (
              style.display === "flex" &&
              style.visibility === "visible" &&
              style.color === `rgb(${Math.floor(i / 10)}, 10, 20)`
            )
              correct++;
          }
          return correct;
        },
        verify(n) {
          eq(n, 200, "computed styles after mutation");
        },
        close() {
          container.remove();
          sheet.remove();
        },
      };
    },
  },
  {
    // Inline style churn: positioning libraries (Floating UI) assign left/top/transform on every
    // update, React sets style props one by one. Each write updates the style attribute.
    id: "dom/inline-style-churn",
    title: "Inline style writes: 6 properties at a time on 50 elements, 2 patterns (10 rounds)",
    kind: "dom",
    iterations: 30,
    warmup: 5,
    setup({ document }) {
      const els: any[] = [];
      for (let i = 0; i < 50; i++) els.push(document.body.appendChild(document.createElement("div")));
      let round = 0;
      return {
        run() {
          for (let r = 0; r < 10; r++) {
            const k = round++;
            for (let i = 0; i < els.length; i++) {
              const s = els[i].style;
              Object.assign(s, {
                position: "absolute",
                left: `${k % 7}px`,
                top: `${(k * 3) % 5}px`,
                transform: `translate(${k % 3}px, 0px)`,
                minWidth: "120px",
                visibility: k % 2 ? "visible" : "hidden",
              });
              s.display = k % 3 ? "flex" : "block";
              s.width = `${k % 4}0px`;
              s.opacity = String((k % 10) / 10);
              s.marginTop = "4px";
              s.setProperty("--offset", `${k % 5}px`);
            }
          }
          return round - 1;
        },
        verify(k) {
          for (const el of els) {
            eq(el.style.left, `${k % 7}px`, "left");
            eq(el.style.width, `${k % 4}0px`, "width");
            eq(el.style.getPropertyValue("--offset"), `${k % 5}px`, "custom property");
            check(el.getAttribute("style").includes("min-width: 120px"), "style attribute");
          }
        },
        close() {
          for (const el of els) el.remove();
        },
      };
    },
  },
  {
    id: "dom/event-propagation-30",
    title: "Event propagation, capture + bubble, 30 levels (10 dispatches)",
    kind: "dom",
    iterations: 200,
    warmup: 50,
    setup({ document, window }) {
      const container = document.createElement("main");
      document.body.append(container);
      let target = container;
      let calls = 0;
      let ordered = true;
      for (let depth = 0; depth < 30; depth++) {
        const el = document.createElement("div");
        target.append(el);
        el.addEventListener(
          "bench-propagation",
          () => {
            if (calls !== depth) ordered = false;
            calls++;
          },
          { capture: true },
        );
        el.addEventListener("bench-propagation", () => {
          if (calls !== 59 - depth) ordered = false;
          calls++;
        });
        target = el;
      }
      const event = new window.Event("bench-propagation", { bubbles: true });
      return {
        run() {
          let total = 0;
          for (let k = 0; k < 10; k++) {
            calls = 0;
            ordered = true;
            target.dispatchEvent(event);
            total += ordered ? calls : -1000;
          }
          return total;
        },
        verify(n) {
          eq(n, 600, "ordered listener calls");
        },
        close() {
          container.remove();
        },
      };
    },
  },
  {
    id: "dom/mutation-observer-50",
    title: "MutationObserver streaming, 50 appends",
    kind: "dom",
    iterations: 100,
    warmup: 20,
    setup({ document, window }) {
      const container = document.createElement("main");
      document.body.append(container);
      const blocks: any[] = [];
      for (let i = 0; i < 50; i++) {
        const p = document.createElement("p");
        p.textContent = `Streamed paragraph ${i}`;
        blocks.push(p);
      }
      let delivered = 0;
      let resolve!: (n: number) => void;
      let reject!: (e: Error) => void;
      const observer = new window.MutationObserver((records: any[]) => {
        for (const record of records) {
          if (record.type !== "childList" || record.target !== container || record.removedNodes.length) {
            reject(new Error("unexpected streaming mutation record"));
            return;
          }
          for (const node of record.addedNodes) {
            if (node !== blocks[delivered]) {
              reject(new Error("streaming blocks delivered out of order"));
              return;
            }
            delivered++;
          }
        }
        if (delivered === blocks.length) resolve(delivered);
      });
      return {
        beforeEach() {
          delivered = 0;
          observer.observe(container, { childList: true });
        },
        run() {
          const delivery = new Promise<number>((res, rej) => {
            resolve = res;
            reject = rej;
          });
          for (const block of blocks) container.append(block);
          return delivery;
        },
        verify(n) {
          eq(n, 50, "delivered additions");
          eq(container.childElementCount, 50, "children");
        },
        afterEach() {
          observer.disconnect();
          container.replaceChildren();
        },
        close() {
          observer.disconnect();
          container.remove();
        },
      };
    },
  },
  {
    // Leak workload: windows created and closed in one process (what a reused test worker does
    // per file). Times 10 create → build → close cycles; `heapSlopeKBPerWindow` is the
    // least-squares slope of heap-after-GC per closed window (≈0 when closing releases
    // everything).
    id: "dom/window-churn",
    title: "Window churn: create, build a form, close (memory slope)",
    kind: "dom",
    iterations: 40,
    warmup: 10,
    async setup({ config }) {
      const html = `<!doctype html><html><head><style>.a { color: red }</style></head><body><form>${rowsHtml}<input id=i><button>Go</button></form></body></html>`;
      let open: () => { document: any; close(): void };
      if (config === "jsdom") {
        const { JSDOM } = await import("jsdom");
        open = () => {
          const w = new JSDOM(html).window;
          return { document: w.document, close: () => w.close() };
        };
      } else if (config === "happy-dom") {
        const { Window } = await import("happy-dom");
        open = () => {
          const w = new Window();
          w.document.write(html);
          return { document: w.document, close: () => void w.happyDOM.close() };
        };
      } else {
        const { createWindow, currentWindowOrNull, setCurrentWindow } = await import("@ctrl/dom");
        open = () => {
          // Keep the environment's window current (createWindow activates the new one).
          const previous = currentWindowOrNull();
          const w = createWindow({ html });
          setCurrentWindow(previous);
          return { document: w.document, close: () => w.close() };
        };
      }
      const gc = (globalThis as any).gc as () => void;
      const heap: Array<[number, number]> = [];
      let done = 0;
      const CYCLES = 10;
      return {
        run() {
          let rows = 0;
          for (let c = 0; c < CYCLES; c++) {
            const w = open();
            const d = w.document;
            rows += d.querySelectorAll(".row").length;
            d.getElementById("i").focus();
            d.body.addEventListener("click", () => {});
            w.close();
          }
          return rows;
        },
        verify(rows: any) {
          eq(rows, 250 * CYCLES, "rows found");
        },
        afterEach() {
          done += CYCLES;
          if (done % (CYCLES * 5) === 0 && gc) {
            gc();
            gc();
            heap.push([done, process.memoryUsage().heapUsed]);
          }
        },
        extra(): Record<string, number> {
          const pts = heap.slice(2);
          if (pts.length < 3) return {};
          const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
          const my = pts.reduce((a, p) => a + p[1], 0) / pts.length;
          let num = 0;
          let den = 0;
          for (const [x, y] of pts) {
            num += (x - mx) * (y - my);
            den += (x - mx) ** 2;
          }
          return { heapSlopeKBPerWindow: num / den / 1024 };
        },
      };
    },
  },
];
