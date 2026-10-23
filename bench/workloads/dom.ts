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
];
