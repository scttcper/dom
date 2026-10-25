/**
 * DOM work, on the environment's global `document`: happy-dom's own comparison (README
 * "Performance": parse, serialize, querySelectorAll, custom elements), measured over many warm
 * iterations instead of one cold call, plus work component tests lean on.
 *
 * Specs exercised:
 *   - innerHTML / fragment parsing:   https://html.spec.whatwg.org/#dom-element-innerhtml
 *   - serialization:                  https://html.spec.whatwg.org/#serialising-html-fragments
 *   - querySelectorAll:               https://dom.spec.whatwg.org/#dom-parentnode-queryselectorall
 *   - custom elements, shadow roots:  https://html.spec.whatwg.org/#custom-elements
 *   - event dispatch:                 https://dom.spec.whatwg.org/#concept-event-dispatch
 *   - getComputedStyle:               https://drafts.csswg.org/cssom/#dom-window-getcomputedstyle
 *
 * Contenders that share another's DOM (`sameDomAs`) skip this file.
 */
import { describe, expect, test } from "vitest";
import { cssInJsSheet, styledFormHTML } from "../fixtures/css-in-js.ts";
import { PAGE } from "../fixtures/page.ts";
import { measure, sharesDom } from "../lib/bench.ts";

describe.skipIf(sharesDom)("happy-dom's comparison, warm", () => {
  test("parse", async (ctx) => {
    await measure(ctx, "Parse a 220 KB page (body.innerHTML =)", () => {
      document.body.innerHTML = PAGE;
    });
    expect(document.querySelectorAll(".card")).toHaveLength(180);
  });

  test("serialize", async (ctx) => {
    document.body.innerHTML = PAGE;
    await measure(ctx, "Serialize the page (body.innerHTML)", () => document.body.innerHTML.length);
  });

  // Queries the way code consumes them: Testing Library and app code Array.from() / spread the
  // result. (A bare `.length` mostly measures a result cache: happy-dom returns the same NodeList
  // until the document changes.)
  for (const [selector, count] of [
    ["li", 612],
    [".card", 180],
    ["[aria-label]", 419],
    ['[class~="card"]', 180],
    [":nth-child(2n+1)", null],
  ] as const) {
    test(`querySelectorAll ${selector}`, async (ctx) => {
      document.body.innerHTML = PAGE;
      if (count !== null) expect(document.querySelectorAll(selector)).toHaveLength(count);
      await measure(
        ctx,
        `Array.from(querySelectorAll('${selector}'))`,
        () => Array.from(document.querySelectorAll(selector)).length,
      );
    });
  }

  test("custom elements", async (ctx) => {
    if (customElements.get("x-card") === undefined) {
      customElements.define(
        "x-card",
        class extends HTMLElement {
          static observedAttributes = ["key1", "key2"];
          changes = 0;
          constructor() {
            super();
            this.attachShadow({ mode: "open" });
          }
          attributeChangedCallback() {
            this.changes++;
          }
          connectedCallback() {
            this.shadowRoot!.innerHTML = `<style>:host { display: block; } div { color: red; }</style><div class="x"><slot></slot><span>${this.getAttribute("key1")}</span></div>`;
          }
        },
      );
    }
    await measure(ctx, "Render 100 custom elements with shadow roots", () => {
      document.body.innerHTML = '<x-card key1="a" key2="b">text</x-card>'.repeat(100);
      return (document.body.lastElementChild as HTMLElement & { shadowRoot: ShadowRoot }).shadowRoot.innerHTML.length;
    });
    expect(document.body.querySelector("x-card")!.shadowRoot!.querySelector("span")!.textContent).toBe("a");
  });
});

describe.skipIf(sharesDom)("more DOM work component tests do", () => {
  test("create elements", async (ctx) => {
    await measure(ctx, "Build a form of 1,000 labelled inputs", () => {
      const form = document.createElement("form");
      for (let i = 0; i < 1000; i++) {
        const label = document.createElement("label");
        label.setAttribute("for", `f${i}`);
        label.textContent = `Field ${i}`;
        const input = document.createElement("input");
        input.id = `f${i}`;
        input.name = `f${i}`;
        form.append(label, input);
      }
      document.body.replaceChildren(form);
    });
    expect(document.querySelectorAll("input")).toHaveLength(1000);
  });

  test("event dispatch", async (ctx) => {
    let target: Element = document.body;
    document.body.replaceChildren();
    let calls = 0;
    for (let i = 0; i < 30; i++) {
      const child = document.createElement("div");
      child.addEventListener("click", () => calls++, true);
      child.addEventListener("click", () => calls++);
      target.append(child);
      target = child;
    }
    await measure(ctx, "Dispatch 10 clicks through 30 ancestors (capture + bubble)", () => {
      for (let i = 0; i < 10; i++) target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(calls).toBeGreaterThan(0);
  });

  test("getComputedStyle", async (ctx) => {
    document.head.innerHTML =
      "<style>.hidden { display: none } .card { color: rgb(1, 2, 3) } section > .card:nth-child(odd) { visibility: hidden }</style>";
    document.body.innerHTML = PAGE;
    const cards = [...document.querySelectorAll(".card")].slice(0, 100);
    await measure(ctx, "getComputedStyle of 100 elements (display, visibility)", () => {
      let visible = 0;
      for (const el of cards) {
        const style = getComputedStyle(el);
        if (style.display !== "none" && style.visibility !== "hidden") visible++;
      }
      return visible;
    });
    document.head.innerHTML = "";
  });

  test("getComputedStyle, CSS-in-JS", async (ctx) => {
    document.head.innerHTML = `<style>${cssInJsSheet(200)}</style>`;
    document.body.innerHTML = styledFormHTML(40);
    const elements = [...document.querySelectorAll(".field, .field > label, .field > input")].slice(0, 100);
    expect(elements).toHaveLength(100);
    let i = 0;
    await measure(ctx, "getComputedStyle of 100 elements under a 1,200-rule CSS-in-JS sheet", () => {
      // A class change between reads, as a rerender would make: caches must not answer everything.
      elements[i++ % 100].classList.toggle("theme-dark");
      let visible = 0;
      for (const el of elements) {
        const style = getComputedStyle(el);
        if (style.display !== "none" && style.visibility !== "hidden") visible++;
      }
      return visible;
    });
    document.head.innerHTML = "";
  });

  test("query after mutation", async (ctx) => {
    document.body.innerHTML = PAGE;
    const card = document.querySelector(".card")!;
    let i = 0;
    await measure(ctx, "Mutate an attribute, then querySelectorAll('[aria-label]')", () => {
      card.setAttribute("data-version", String(i++));
      return document.querySelectorAll("[aria-label]").length;
    });
  });
});
