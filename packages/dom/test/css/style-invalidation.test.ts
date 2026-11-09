/**
 * Which DOM changes leave cached computed styles valid (packages/dom/src/css/style-deps.ts,
 * `styleRecord` in cascade.ts): a text node changing between two non-empty strings, and an
 * `aria-*` / `data-*` attribute no indexed style rule's selector mentions. Everything else must
 * still be seen, so the cached answers are compared with a document that has never cached any.
 *
 * Specs:
 *   CSSOM — getComputedStyle: https://drafts.csswg.org/cssom/#dom-window-getcomputedstyle
 *   Selectors 4 — attribute selectors: https://drafts.csswg.org/selectors-4/#attribute-selectors
 *   Selectors 4 — :empty: https://drafts.csswg.org/selectors-4/#the-empty-pseudo
 *   Selectors 4 — :has(), :not(), :is(): https://drafts.csswg.org/selectors-4/#relational
 *   CSS Cascade 5 — cascade sorting: https://drafts.csswg.org/css-cascade-5/#cascade-sort
 *   HTML — the hidden attribute: https://html.spec.whatwg.org/#the-hidden-attribute
 */
import { describe, expect, test } from "vitest";
import { createWindow } from "@ctrl/dom";
import { styleRecord } from "../../src/css/cascade.ts";
import { $impl } from "../../src/keys.ts";

// biome-ignore lint: untyped DOM surface in tests
type Any = any;

const CSS = `
  .card { display: flex; color: black }
  .card[data-state="open"] { display: grid }
  [aria-expanded="true"] + .panel { display: block }
  .panel { display: none }
  .list:has([data-selected]) { color: blue }
  .item:not([aria-disabled="true"]) { color: green }
  :is(.a, [data-kind="b"]) > .label { visibility: hidden }
  .note:empty { display: none }
  #special { color: red }
`;
const HTML = `
  <div class="card" id="card" data-state="closed" data-unused="1" aria-label="Card">
    <button id="toggle" aria-expanded="false" aria-describedby="x">Toggle</button>
    <div class="panel" id="panel">Panel text</div>
    <ul class="list" id="list"><li class="item" id="item1">One</li><li class="item" id="item2" aria-disabled="true">Two</li></ul>
    <div data-kind="a" id="group"><span class="label" id="label">Label</span></div>
    <p class="note" id="note">note</p>
    <span hidden id="hidden">hidden</span>
  </div>`;

function page(): { window: Any; document: Any } {
  const window: Any = createWindow();
  const document = window.document;
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.append(style);
  document.body.innerHTML = HTML;
  return { window, document };
}

const PROPERTIES = ["display", "color", "visibility"];
function styles(window: Any, document: Any): Record<string, string> {
  const out: Record<string, string> = {};
  for (const el of document.body.querySelectorAll("*")) {
    const computed = window.getComputedStyle(el);
    out[el.id] = PROPERTIES.map((p) => computed.getPropertyValue(p)).join(" ");
  }
  return out;
}

describe("changes that cannot change a computed style keep the cached style records — https://drafts.csswg.org/cssom/#dom-window-getcomputedstyle", () => {
  const record = (document: Any, id: string) => styleRecord(document.getElementById(id)[$impl]);

  test("a text node changing between two non-empty strings", () => {
    const { window, document } = page();
    styles(window, document);
    const before = record(document, "panel");
    document.getElementById("panel").firstChild.data = "Other text";
    document.getElementById("item1").firstChild.nodeValue = "1";
    expect(record(document, "panel")).toBe(before);
  });

  test("an aria-* or data-* attribute no selector mentions, set, changed and removed", () => {
    const { window, document } = page();
    styles(window, document);
    const before = record(document, "card");
    const card = document.getElementById("card");
    card.setAttribute("data-unused", "2");
    card.setAttribute("data-new", "");
    card.removeAttribute("aria-label");
    document.getElementById("toggle").setAttribute("aria-describedby", "y");
    expect(record(document, "card")).toBe(before);
  });

  test.each([
    ["class", (d: Any) => d.getElementById("card").classList.add("x")],
    ["id", (d: Any) => (d.getElementById("item1").id = "special")],
    ["style", (d: Any) => d.getElementById("card").setAttribute("style", "color: red")],
    ["hidden", (d: Any) => d.getElementById("hidden").removeAttribute("hidden")],
    ["a data-* attribute in a selector", (d: Any) => d.getElementById("card").setAttribute("data-state", "open")],
    ["an aria-* attribute in a selector", (d: Any) => d.getElementById("toggle").setAttribute("aria-expanded", "true")],
    ["an attribute named inside :has()", (d: Any) => d.getElementById("item1").setAttribute("data-selected", "")],
    ["an attribute named inside :not()", (d: Any) => d.getElementById("item2").removeAttribute("aria-disabled")],
    ["an attribute named inside :is()", (d: Any) => d.getElementById("group").setAttribute("data-kind", "b")],
    ["text that becomes empty (:empty)", (d: Any) => (d.getElementById("note").firstChild.data = "")],
    ["an inserted element", (d: Any) => d.getElementById("list").append(d.createElement("li"))],
    ["a removed element", (d: Any) => d.getElementById("toggle").remove()],
  ])("a change to %s is seen", (_what, change) => {
    const warm = page();
    styles(warm.window, warm.document);
    change(warm.document);
    const cold = page();
    change(cold.document);
    expect(styles(warm.window, warm.document)).toEqual(styles(cold.window, cold.document));
  });

  test("text going from empty to non-empty is seen (:empty stops matching)", () => {
    const { window, document } = page();
    const note = document.getElementById("note");
    note.firstChild.data = "";
    expect(window.getComputedStyle(note).display).toBe("none");
    note.firstChild.data = "again";
    expect(window.getComputedStyle(note).display).toBe("block");
  });

  test("a sheet added later that mentions an attribute makes changes to it count from then on", () => {
    const { window, document } = page();
    const card = document.getElementById("card");
    expect(window.getComputedStyle(card).color).toBe("black");
    const style = document.createElement("style");
    style.textContent = '[data-late="on"] { color: purple }';
    document.head.append(style);
    expect(window.getComputedStyle(card).color).toBe("black");
    card.setAttribute("data-late", "on");
    expect(window.getComputedStyle(card).color).toBe("purple");
    card.setAttribute("data-late", "off");
    expect(window.getComputedStyle(card).color).toBe("black");
  });
});

describe("cached answers equal a cold document's after any sequence of changes — https://drafts.csswg.org/css-cascade-5/#cascade-sort", () => {
  // A small deterministic generator: the sequence is the same on every run.
  function random(seed: number): () => number {
    let state = seed;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 2 ** 32;
    };
  }
  const IDS = ["card", "toggle", "panel", "list", "item1", "item2", "group", "label", "note", "hidden"];
  const ATTRIBUTES: [string, string[]][] = [
    ["data-state", ["open", "closed"]],
    ["aria-expanded", ["true", "false"]],
    ["data-selected", [""]],
    ["aria-disabled", ["true", "false"]],
    ["data-kind", ["a", "b", "c"]],
    ["data-unused", ["1", "2"]],
    ["aria-label", ["x", "y"]],
    ["class", ["card", "panel", "item a", "label", "note"]],
    ["hidden", [""]],
  ];
  const TEXTS = ["", "a", "longer text"];

  function step(document: Any, next: () => number): string {
    const el = document.getElementById(IDS[Math.floor(next() * IDS.length)]);
    const kind = next();
    if (kind < 0.35) {
      const text = [...el.childNodes].find((n: Any) => n.nodeType === 3);
      const value = TEXTS[Math.floor(next() * TEXTS.length)];
      if (text === undefined) return "skip";
      text.data = value;
      return `text of #${el.id} = ${JSON.stringify(value)}`;
    }
    const [name, values] = ATTRIBUTES[Math.floor(next() * ATTRIBUTES.length)];
    if (next() < 0.3) {
      el.removeAttribute(name);
      return `#${el.id} removeAttribute ${name}`;
    }
    const value = values[Math.floor(next() * values.length)];
    el.setAttribute(name, value);
    return `#${el.id} ${name}=${JSON.stringify(value)}`;
  }

  test.each([1, 2, 3])("400 random text and attribute changes, seed %i", (seed) => {
    const warm = page();
    const cold = page();
    const nextWarm = random(seed);
    const nextCold = random(seed);
    const log: string[] = [];
    for (let i = 0; i < 400; i++) {
      log.push(step(warm.document, nextWarm));
      step(cold.document, nextCold);
      // The warm document is read after every change, so its caches are in play throughout; the
      // cold one is rebuilt from its markup and read once.
      const fresh = page();
      fresh.document.body.innerHTML = cold.document.body.innerHTML;
      expect(styles(warm.window, warm.document), log.slice(-3).join(" ; ")).toEqual(
        styles(fresh.window, fresh.document),
      );
    }
  });
});
