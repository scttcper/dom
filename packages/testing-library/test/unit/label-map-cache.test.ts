/**
 * ByLabelText reuses a tree's label associations (aria's `labelMapForTree`, stamped with the
 * document version) between queries. Each input to it must be seen by the next query: the tree,
 * a label's `for`, a control's `id`, an input becoming `type=hidden` (not labelable), and a
 * form-associated custom element's upgrade (labelable from then on).
 *
 * Specs: HTML labeled control — https://html.spec.whatwg.org/#labeled-control;
 *   labelable elements — https://html.spec.whatwg.org/#category-label;
 *   form-associated custom elements — https://html.spec.whatwg.org/#form-associated-custom-element
 * Upstream: https://github.com/testing-library/dom-testing-library/blob/main/src/queries/label-text.ts
 */
import { afterEach, describe, expect, test } from "vitest";
import { queryAllByLabelText, queryByLabelText } from "../../src/index.ts";

declare const document: any;
declare const customElements: any;
declare const HTMLElement: any;

afterEach(() => {
  document.body.innerHTML = "";
});

describe("label associations across queries — https://html.spec.whatwg.org/#labeled-control", () => {
  test("a label's for, a control's id and the tree are read again after they change", () => {
    document.body.innerHTML = `<label for="a">Name</label><input id="a"><input id="b">`;
    const [a, b] = document.querySelectorAll("input");
    expect(queryByLabelText(document.body, "Name")).toBe(a);
    document.querySelector("label").setAttribute("for", "b");
    expect(queryByLabelText(document.body, "Name")).toBe(b);
    b.id = "c";
    expect(queryByLabelText(document.body, "Name")).toBeNull();
    a.id = "b";
    expect(queryByLabelText(document.body, "Name")).toBe(a);
    a.remove();
    expect(queryByLabelText(document.body, "Name")).toBeNull();
    document.body.append(a);
    expect(queryByLabelText(document.body, "Name")).toBe(a);
  });

  test("an input that becomes type=hidden stops being labelled", () => {
    document.body.innerHTML = `<label>Secret <input></label>`;
    const input = document.querySelector("input");
    expect(queryAllByLabelText(document.body, "Secret")).toEqual([input]);
    input.type = "hidden";
    expect(queryAllByLabelText(document.body, "Secret")).toEqual([]);
  });

  test("a form-associated custom element is labelled once it is upgraded", () => {
    document.body.innerHTML = `<label for="x">Rating</label><x-rating-cache id="x"></x-rating-cache>`;
    const el = document.getElementById("x");
    expect(queryByLabelText(document.body, "Rating")).toBeNull();
    customElements.define(
      "x-rating-cache",
      class extends HTMLElement {
        static formAssociated = true;
      },
    );
    expect(queryByLabelText(document.body, "Rating")).toBe(el);
  });
});
