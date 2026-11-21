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
import { JSDOM } from "jsdom";
import { createWindow, type Document } from "@ctrl/dom";
import { setUIValue } from "../../../src/html/forms/ui.ts";
import { $selectionEpoch } from "../../../src/keys.ts";

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

  test("appending options preserves selection across attribute changes, dirty options and optgroups", () => {
    const s = select("<option>A</option><option>B</option>");
    const [a, b] = s.options;
    b.defaultSelected = true;
    s.appendChild(new window.Option("C"));
    expect(s.value).toBe("B");
    b.selected = false;
    b.defaultSelected = false;
    b.defaultSelected = true;
    expect(s.value).toBe("A");

    const group = document.createElement("optgroup");
    group.appendChild(new window.Option("D", "D", true, true));
    s.appendChild(group);
    expect(s.value).toBe("D");
    a.selected = true;
    expect([...s.selectedOptions]).toEqual([a]);
    expect(s.cloneNode(true).value).toBe("A");
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
    document.body!.innerHTML =
      "<form id=f><select><option>a</option><optgroup><option id=o>b</option></optgroup></select></form>";
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

  test("UI edits and range replacements normalize newlines while reset restores the live default", () => {
    document.body!.innerHTML = "<form id=f><textarea id=t></textarea></form>";
    const t = $("t");
    t.defaultValue = "default\r\ntext";
    setUIValue(t, "a\r\nb\rc");
    expect(t.value).toBe("a\nb\nc");
    t.setSelectionRange(1, 3);
    t.value = "a\rb\r\nc";
    expect([t.selectionStart, t.selectionEnd]).toEqual([1, 3]);
    t.setRangeText("X\r\nY", 1, 3);
    expect(t.cloneNode(true).value).toBe("aX\nY\nc");
    expect(t.defaultValue).toBe("default\r\ntext");
    $("f").reset();
    expect(t.value).toBe("default\ntext");
    t.firstChild.data = "new\rdefault";
    expect(t.value).toBe("new\ndefault");
  });

  test("rows/cols are limited to positive numbers with fallback: 0 writes the default", () => {
    const t = document.createElement("textarea") as any;
    expect([t.rows, t.cols]).toEqual([2, 20]);
    t.rows = 0;
    expect(t.getAttribute("rows")).toBe("2");
  });
});

// `_childrenChangedSteps` skips the selectedness setting algorithm for one unselected option
// appended to a drop-down that has its selected option. Whatever the history, the result has to
// be what running the algorithm on every change gives: the same random edits on a select that
// may skip and on one that is never allowed to, and appends alone against jsdom.
describe("selectedness after appends, differential — https://html.spec.whatwg.org/#selectedness-setting-algorithm", () => {
  function mulberry32(seed: number): (n: number) => number {
    let a = seed >>> 0;
    return (n) => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n) | 0;
    };
  }

  // biome-ignore lint: untyped DOM surface in tests
  function makeOption(doc: any, random: (n: number) => number, step: number): any {
    const option = doc.createElement("option");
    option.textContent = `o${step}`;
    const kind = random(8);
    if (kind === 0) option.setAttribute("selected", "");
    if (kind === 1) option.disabled = true;
    return option;
  }

  /** One random edit of `select`; the same `random` sequence drives both sides. */
  // biome-ignore lint: untyped DOM surface in tests
  function edit(doc: any, select: any, random: (n: number) => number, step: number): string {
    const options = select.options;
    const pick = () => options[random(options.length)];
    const op = random(20);
    if (op < 10 || options.length === 0) {
      select.appendChild(makeOption(doc, random, step));
      return "append";
    }
    switch (op) {
      case 10:
        select.insertBefore(makeOption(doc, random, step), select.firstChild);
        return "prepend";
      case 11:
        pick().remove();
        return "remove";
      case 12:
        pick().selected = true;
        return "select";
      case 13:
        pick().selected = false;
        return "deselect";
      case 14: {
        const option = pick();
        option.disabled = !option.disabled;
        return "toggle disabled";
      }
      case 15:
        select.selectedIndex = random(options.length + 1) - 1;
        return "selectedIndex";
      case 16: {
        const option = pick();
        if (option.hasAttribute("selected")) option.removeAttribute("selected");
        else option.setAttribute("selected", "");
        return "toggle selected attribute";
      }
      case 17: {
        // Another select changes its own selection: the count of changes is shared.
        const other = doc.createElement("select");
        other.appendChild(doc.createElement("option"));
        other.appendChild(doc.createElement("option")).selected = true;
        return "another select";
      }
      case 18:
        select.multiple = !select.multiple;
        return "toggle multiple";
      default:
        select.appendChild(select.firstChild);
        return "move first to the end";
    }
  }

  // biome-ignore lint: untyped DOM surface in tests
  const state = (select: any) => ({
    // biome-ignore lint: untyped DOM surface in tests
    selected: Array.from(select.options, (o: any) => o.selected),
    selectedIndex: select.selectedIndex,
    value: select.value,
  });

  test.each([
    ["outside the document", false],
    ["in the document", true],
  ])(
    "every kind of edit, against a select that runs the algorithm each time: 60 seeds of 80 edits, %s",
    (_where, connected) => {
      for (let seed = 1; seed <= 60; seed++) {
        const doc = createWindow().document as any;
        const fast = doc.createElement("select");
        const reference = doc.createElement("select");
        if (connected) doc.body.append(fast, reference);
        const randoms = [mulberry32(seed), mulberry32(seed)];
        const history: string[] = [];
        for (let step = 0; step < 80; step++) {
          history.push(edit(doc, fast, randoms[0], step));
          // Never one selected option on record: the next append cannot be skipped.
          reference[$selectionEpoch] = -1;
          edit(doc, reference, randoms[1], step);
          expect(state(fast), `seed ${seed}: ${history.join(", ")}`).toEqual(state(reference));
        }
      }
    },
  );

  test.each([
    ["outside the document", false],
    ["in the document", true],
  ])("appended options (plain, selected, disabled), against jsdom: 40 seeds of 60, %s", (_where, connected) => {
    for (let seed = 1; seed <= 40; seed++) {
      const docs = [new JSDOM("<!doctype html><body></body>").window.document, createWindow().document] as any[];
      const selects = docs.map((doc) => {
        const select = doc.createElement("select");
        if (connected) doc.body.appendChild(select);
        return select;
      });
      const randoms = [mulberry32(seed), mulberry32(seed)];
      for (let step = 0; step < 60; step++) {
        for (let i = 0; i < 2; i++) selects[i].appendChild(makeOption(docs[i], randoms[i], step));
        // Read every few appends only, so runs of appends go unobserved as in a React mount.
        if (step % 7 === 6) expect(state(selects[1]), `seed ${seed}, step ${step}`).toEqual(state(selects[0]));
      }
      expect(state(selects[1]), `seed ${seed}`).toEqual(state(selects[0]));
    }
  });
});
