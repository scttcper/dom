/**
 * The select, option, optgroup and textarea elements.
 *
 * Spec: HTML Standard §4.10.7 "The select element", §4.10.10 "The option element",
 * §4.10.11 "The textarea element"
 *   selectedness setting algorithm  https://html.spec.whatwg.org/#selectedness-setting-algorithm
 *   HTMLOptionsCollection           https://html.spec.whatwg.org/#htmloptionscollection
 *   option.text                     https://html.spec.whatwg.org/#dom-option-text
 *   textarea raw/API value          https://html.spec.whatwg.org/#concept-textarea-raw-value
 *
 * Ported in part from WPT html/semantics/forms/the-select-element/{selected-index,
 * select-ask-for-reset,common-HTMLOptionsCollection*}.html and the-textarea-element/value-defaultValue-textContent.html.
 */
import { beforeEach, describe, expect, test } from "vitest";
import { createWindow, type Document } from "@ctrl/dom";

// biome-ignore lint: untyped DOM surface in tests
let window: any;
let document: Document;
// biome-ignore lint: untyped DOM surface in tests
const $ = (id: string): any => document.getElementById(id);

beforeEach(() => {
  window = createWindow();
  document = window.document;
});

function select(html: string, attrs = ""): any {
  document.body!.innerHTML = `<select id=s ${attrs}>${html}</select>`;
  return $("s");
}

describe("selectedness setting algorithm — https://html.spec.whatwg.org/#selectedness-setting-algorithm", () => {
  test("the first non-disabled option is selected by default in a single select", () => {
    expect(select("<option>a</option><option>b</option>").selectedIndex).toBe(0);
    expect(select("<option disabled>a</option><option>b</option>").selectedIndex).toBe(1);
  });

  test("the last of several selected options wins in a single select", () => {
    expect(select("<option selected>a</option><option selected>b</option>").selectedIndex).toBe(1);
  });

  test("multiple and size>1 selects have no default selection", () => {
    expect(select("<option>a</option>", "multiple").selectedIndex).toBe(-1);
    expect(select("<option>a</option>", "size=2").selectedIndex).toBe(-1);
  });

  test("removing the selected option selects the first remaining option", () => {
    const s = select("<option>a</option><option selected>b</option><option>c</option>");
    s.options[1].remove();
    expect(s.value).toBe("a");
  });

  test("option.selected = true deselects the others (single); = false re-runs the algorithm", () => {
    const s = select("<option>a</option><option>b</option>");
    s.options[1].selected = true;
    expect([s.options[0].selected, s.options[1].selected]).toEqual([false, true]);
    s.options[1].selected = false;
    expect(s.selectedIndex).toBe(0);
  });

  test("createElement-built selects settle as options are appended", () => {
    const s = document.createElement("select") as any;
    const a = document.createElement("option");
    a.textContent = "a";
    s.appendChild(a);
    expect(s.value).toBe("a");
    const b = document.createElement("option") as any;
    b.textContent = "b";
    b.defaultSelected = true;
    s.appendChild(b);
    expect(s.value).toBe("b");
  });
});

describe("select IDL — https://html.spec.whatwg.org/#the-select-element", () => {
  test("value setter selects the first matching option, or none", () => {
    const s = select("<option>a</option><option value=x>b</option><option value=x>c</option>");
    s.value = "x";
    expect(s.selectedIndex).toBe(1);
    s.value = "nope";
    expect(s.selectedIndex).toBe(-1);
    expect(s.value).toBe("");
  });

  test("type, length, item, namedItem, selectedOptions", () => {
    const s = select("<option id=o1>a</option><optgroup><option name=n selected>b</option></optgroup>", "multiple");
    expect(s.type).toBe("select-multiple");
    expect(s.length).toBe(2);
    expect(s.item(1).text).toBe("b");
    expect(s.namedItem("n")).toBe(s.options[1]);
    expect([...s.selectedOptions].map((o: any) => o.text)).toEqual(["b"]);
    s.options[0].selected = true;
    expect(s.selectedOptions.length).toBe(2);
  });

  test("required with a placeholder label option suffers from being missing", () => {
    const s = select('<option value="">pick</option><option>a</option>', "required");
    expect(s.validity.valueMissing).toBe(true);
    expect(s.validationMessage).toBe("Constraints not satisfied"); // jsdom text by default
    s.selectedIndex = 1;
    expect(s.validity.valid).toBe(true);
  });
});

describe("HTMLOptionsCollection — https://html.spec.whatwg.org/#htmloptionscollection", () => {
  test("add() with index/element references, remove(index), length setter", () => {
    const s = select("<option>a</option><option>b</option>");
    const o = new window.Option("z", "zv");
    s.options.add(o, 0);
    expect([...s.options].map((x: any) => x.value)).toEqual(["zv", "a", "b"]);
    s.add(new window.Option("y"), s.options[2]);
    expect([...s.options].map((x: any) => x.text)).toEqual(["z", "a", "y", "b"]);
    s.options.remove(0);
    s.remove(99);
    expect(s.length).toBe(3);
    s.options.length = 1;
    expect(s.length).toBe(1);
    s.options.length = 3;
    expect(s.options[2].text).toBe("");
  });

  test("add() of an ancestor throws HierarchyRequestError", () => {
    document.body!.innerHTML = "<optgroup id=g><select id=s></select></optgroup>";
    expect(() => $("s").add($("g"))).toThrow(expect.objectContaining({ name: "HierarchyRequestError" }));
  });

  test("select.remove() with no arguments removes the select itself", () => {
    const s = select("<option>a</option>");
    s.remove();
    expect(s.isConnected).toBe(false);
  });
});

describe("the option element — https://html.spec.whatwg.org/#the-option-element", () => {
  test("text strips and collapses whitespace and excludes scripts; label/value fall back to text", () => {
    const s = select("<option id=o>  a \n b <script>x</script></option>");
    const o = s.options[0];
    expect(o.text).toBe("a b");
    expect(o.value).toBe("a b");
    expect(o.label).toBe("a b");
    o.setAttribute("label", "L");
    expect(o.label).toBe("L");
  });

  test("index and form", () => {
    document.body!.innerHTML = "<form id=f><select><option>a</option><optgroup><option id=o>b</option></optgroup></select></form>";
    expect($("o").index).toBe(1);
    expect($("o").form).toBe($("f"));
  });

  test("Option() legacy factory", () => {
    const o = new window.Option("text", "val", true, false);
    expect([o.text, o.value, o.defaultSelected, o.selected]).toEqual(["text", "val", true, false]);
    expect(o instanceof window.HTMLOptionElement).toBe(true);
  });

  test("dirtiness stops tracking the selected attribute", () => {
    const s = select("<option>a</option><option>b</option>", "multiple");
    const o = s.options[1];
    o.setAttribute("selected", "");
    expect(o.selected).toBe(true);
    o.selected = false;
    o.setAttribute("selected", "");
    expect(o.selected).toBe(false);
  });
});

describe("the textarea element — https://html.spec.whatwg.org/#the-textarea-element", () => {
  test("defaultValue is the child text; value follows it until dirty", () => {
    document.body!.innerHTML = "<textarea id=t>abc</textarea>";
    const t = $("t");
    expect(t.value).toBe("abc");
    t.textContent = "def";
    expect(t.value).toBe("def");
    t.value = "x";
    t.textContent = "ghi";
    expect([t.value, t.defaultValue]).toEqual(["x", "ghi"]);
  });

  test("the API value normalizes CRLF/CR to LF; textLength counts code units", () => {
    const t = document.createElement("textarea") as any;
    t.value = "a\r\nb\rc";
    expect(t.value).toBe("a\nb\nc");
    expect(t.textLength).toBe(5);
    expect(t.type).toBe("textarea");
  });

  test("selection API, select() and setRangeText", () => {
    const t = document.createElement("textarea") as any;
    t.value = "hello";
    expect([t.selectionStart, t.selectionEnd]).toEqual([5, 5]);
    t.setSelectionRange(1, 3);
    t.setRangeText("EY");
    expect(t.value).toBe("hEYlo");
    t.select();
    expect([t.selectionStart, t.selectionEnd]).toEqual([0, 5]);
  });

  test("rows/cols are limited to positive numbers with fallback: 0 writes the default", () => {
    const t = document.createElement("textarea") as any;
    expect([t.rows, t.cols]).toEqual([2, 20]);
    t.rows = 0;
    expect(t.getAttribute("rows")).toBe("2");
  });
});
