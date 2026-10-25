/**
 * The input element.
 *
 * Spec: HTML Standard §4.10.5 "The input element"
 *   https://html.spec.whatwg.org/#the-input-element
 *   value modes          https://html.spec.whatwg.org/#dom-input-value
 *   value sanitization   https://html.spec.whatwg.org/#value-sanitization-algorithm
 *   checkedness          https://html.spec.whatwg.org/#concept-fe-checked
 *   radio button groups  https://html.spec.whatwg.org/#radio-button-group
 *   type change steps    https://html.spec.whatwg.org/#input-type-change
 *   selection APIs       https://html.spec.whatwg.org/#textFieldSelection
 *   valueAsNumber/Date   https://html.spec.whatwg.org/#dom-input-valueasnumber
 *   stepUp/stepDown      https://html.spec.whatwg.org/#dom-input-stepup
 *
 * Several cases are ported from WPT html/semantics/forms/the-input-element (type-change-state.html,
 * valueMode.html, selection.html, input-stepup.html) and jsdom's test/to-upstream forms tests;
 * original assertions are kept.
 */
import { beforeEach, describe, expect, test } from "vitest";
import { createWindow, type Document } from "@ctrl/dom";

let document: Document;

beforeEach(() => {
  document = createWindow().document;
});

// biome-ignore lint: test helper
function input(attrs: Record<string, string> = {}): any {
  const el = document.createElement("input") as any;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

describe("value modes — https://html.spec.whatwg.org/#dom-input-value", () => {
  test("mode value: the value follows the value attribute until the dirty value flag is set", () => {
    const el = input({ value: "a" });
    expect(el.value).toBe("a");
    el.setAttribute("value", "b");
    expect(el.value).toBe("b");
    el.value = "c";
    el.setAttribute("value", "d");
    expect(el.value).toBe("c");
    expect(el.defaultValue).toBe("d");
  });

  test("mode default: setting value sets the value content attribute (hidden)", () => {
    const el = input({ type: "hidden" });
    el.value = "x";
    expect(el.getAttribute("value")).toBe("x");
  });

  test("mode default/on: checkbox value defaults to 'on'", () => {
    const el = input({ type: "checkbox" });
    expect(el.value).toBe("on");
    el.value = "yes";
    expect(el.getAttribute("value")).toBe("yes");
  });

  test("mode filename: only the empty string may be set; anything else throws InvalidStateError", () => {
    const el = input({ type: "file" });
    expect(el.value).toBe("");
    el.value = "";
    expect(() => (el.value = "C:\\x")).toThrow(expect.objectContaining({ name: "InvalidStateError" }));
  });

  test("[LegacyNullToEmptyString]: value = null is the empty string", () => {
    const el = input();
    el.value = null;
    expect(el.value).toBe("");
  });

  test("the value accessors live on HTMLInputElement.prototype (React inputValueTracking)", () => {
    const proto = Object.getPrototypeOf(input());
    const value = Object.getOwnPropertyDescriptor(proto, "value")!;
    const checked = Object.getOwnPropertyDescriptor(proto, "checked")!;
    expect(typeof value.get).toBe("function");
    expect(typeof value.set).toBe("function");
    expect(typeof checked.get).toBe("function");
    expect(typeof checked.set).toBe("function");
  });
});

describe("value sanitization — https://html.spec.whatwg.org/#value-sanitization-algorithm", () => {
  const cases: [type: string, raw: string, expected: string][] = [
    ["text", "a\nb\rc", "abc"],
    ["search", "a\r\nb", "ab"],
    ["password", "p\nw", "pw"],
    ["url", "  http://x.test/ \n", "http://x.test/"],
    ["email", "  a@b.c  ", "a@b.c"],
    ["number", "1.5", "1.5"],
    ["number", "1e3", "1e3"],
    ["number", "abc", ""],
    ["number", "1.", ""],
    ["number", " 1", ""],
    ["date", "2024-02-29", "2024-02-29"],
    ["date", "2023-02-29", ""],
    ["month", "2024-13", ""],
    ["month", "2024-01", "2024-01"],
    ["week", "2024-W10", "2024-W10"],
    ["week", "2024-W54", ""],
    ["time", "13:45", "13:45"],
    ["time", "24:00", ""],
    ["datetime-local", "2024-01-02 03:04", "2024-01-02T03:04"],
    ["datetime-local", "2024-01-02T03:04:00", "2024-01-02T03:04"],
    ["color", "#ABCDEF", "#abcdef"],
    ["color", "red", "#000000"],
    ["range", "", "50"],
    ["range", "200", "100"],
    ["range", "-5", "0"],
    ["range", "33.3", "33"],
  ];
  for (const [type, raw, expected] of cases) {
    test(`type=${type}: ${JSON.stringify(raw)} → ${JSON.stringify(expected)}`, () => {
      const el = input({ type });
      el.value = raw;
      expect(el.value).toBe(expected);
    });
  }

  test("email with multiple: each comma-separated value is trimmed", () => {
    const el = input({ type: "email", multiple: "" });
    el.value = " a@b.c , d@e.f ";
    expect(el.value).toBe("a@b.c,d@e.f");
  });

  test("range: the value is kept on a step from min (ties round up)", () => {
    const el = input({ type: "range", min: "0", max: "10", step: "4" });
    el.value = "6";
    expect(el.value).toBe("8");
    el.value = "10";
    expect(el.value).toBe("8"); // 12 would exceed max
  });

  test("non-dirty values are sanitized from the attribute", () => {
    expect(input({ type: "number", value: "x" }).value).toBe("");
    expect(input({ type: "color" }).value).toBe("#000000");
  });
});

describe("type change steps — https://html.spec.whatwg.org/#input-type-change", () => {
  test("value → default: a non-empty value is written to the value attribute", () => {
    const el = input();
    el.value = "typed";
    el.type = "hidden";
    expect(el.getAttribute("value")).toBe("typed");
    expect(el.value).toBe("typed");
  });

  test("default → value: the value comes from the attribute and the dirty flag is cleared", () => {
    const el = input({ type: "checkbox", value: "v" });
    el.type = "text";
    expect(el.value).toBe("v");
    el.setAttribute("value", "w");
    expect(el.value).toBe("w");
  });

  test("value → value: a dirty value is re-sanitized for the new type", () => {
    const el = input();
    el.value = "abc";
    el.type = "number";
    expect(el.value).toBe("");
    el.type = "text";
    expect(el.value).toBe("");
  });

  test("invalid type keywords fall back to text; type IDL lowercases", () => {
    expect(input({ type: "bogus" }).type).toBe("text");
    expect(input({ type: "CheckBox" }).type).toBe("checkbox");
  });
});

describe("checkedness — https://html.spec.whatwg.org/#concept-fe-checked", () => {
  test("follows the checked attribute until the dirty checkedness flag is set", () => {
    const el = input({ type: "checkbox" });
    el.setAttribute("checked", "");
    expect(el.checked).toBe(true);
    el.checked = false;
    el.setAttribute("checked", "");
    expect(el.checked).toBe(false);
    expect(el.defaultChecked).toBe(true);
  });

  test("parsed checked attribute sets initial checkedness", () => {
    document.body!.innerHTML = '<input type="checkbox" checked>';
    expect((document.body!.firstChild as any).checked).toBe(true);
  });

  test("cloneNode copies checkedness and value with their dirty flags", () => {
    const el = input({ type: "checkbox" });
    el.checked = true;
    const copy = el.cloneNode() as any;
    expect(copy.checked).toBe(true);
    copy.removeAttribute("checked");
    expect(copy.checked).toBe(true);
    const t = input({ value: "a" });
    t.value = "b";
    expect((t.cloneNode() as any).value).toBe("b");
  });
});

describe("radio button groups — https://html.spec.whatwg.org/#radio-button-group", () => {
  test("checking one radio unchecks the others with the same name and form owner", () => {
    document.body!.innerHTML = '<form><input type=radio name=r id=a><input type=radio name=r id=b></form><input type=radio name=r id=c>';
    const [a, b, c] = ["a", "b", "c"].map((id) => document.getElementById(id) as any);
    c.checked = true;
    a.checked = true;
    expect([a.checked, b.checked, c.checked]).toEqual([true, false, true]);
    b.checked = true;
    expect([a.checked, b.checked, c.checked]).toEqual([false, true, true]);
  });

  test("inserting a checked radio unchecks the group's checked radio", () => {
    document.body!.innerHTML = "<input type=radio name=r id=a checked>";
    const b = input({ type: "radio", name: "r", checked: "" });
    document.body!.appendChild(b);
    expect((document.getElementById("a") as any).checked).toBe(false);
    expect(b.checked).toBe(true);
  });

  test("radios without a name are not grouped", () => {
    const a = input({ type: "radio" });
    const b = input({ type: "radio" });
    document.body!.append(a, b);
    a.checked = true;
    b.checked = true;
    expect(a.checked && b.checked).toBe(true);
  });
});

describe("selection — https://html.spec.whatwg.org/#textFieldSelection", () => {
  test("setting value moves the cursor to the end with direction none", () => {
    const el = input();
    el.value = "hello";
    expect([el.selectionStart, el.selectionEnd, el.selectionDirection]).toEqual([5, 5, "none"]);
  });

  test("setSelectionRange clamps to the value length and orders start <= end", () => {
    const el = input({ value: "hello" });
    el.setSelectionRange(1, 3, "backward");
    expect([el.selectionStart, el.selectionEnd, el.selectionDirection]).toEqual([1, 3, "backward"]);
    el.setSelectionRange(4, 2);
    expect([el.selectionStart, el.selectionEnd]).toEqual([2, 2]);
    el.setSelectionRange(0, 99);
    expect(el.selectionEnd).toBe(5);
  });

  test("types without selection: getters return null, setters and setSelectionRange throw InvalidStateError", () => {
    for (const type of ["email", "number", "checkbox", "date"]) {
      const el = input({ type });
      expect(el.selectionStart).toBeNull();
      expect(el.selectionDirection).toBeNull();
      expect(() => el.setSelectionRange(0, 0)).toThrow(expect.objectContaining({ name: "InvalidStateError" }));
      expect(() => (el.selectionStart = 0)).toThrow(expect.objectContaining({ name: "InvalidStateError" }));
      expect(() => el.setRangeText("x")).toThrow(expect.objectContaining({ name: "InvalidStateError" }));
    }
  });

  test("select() / setSelectionRange queue a bubbling select event only when the selection changed", async () => {
    const el = input({ value: "abc" });
    const fired: boolean[] = [];
    el.addEventListener("select", (e: any) => fired.push(e.bubbles));
    el.select();
    expect([el.selectionStart, el.selectionEnd, fired]).toEqual([0, 3, []]); // queued, not sync
    await new Promise((r) => setTimeout(r, 0));
    expect(fired).toEqual([true]);
    el.setSelectionRange(0, 3); // unchanged
    el.select(); // unchanged
    await new Promise((r) => setTimeout(r, 0));
    expect(fired).toEqual([true]);
    el.setSelectionRange(1, 2);
    await new Promise((r) => setTimeout(r, 0));
    expect(fired).toEqual([true, true]);
    expect(() => input({ type: "email" }).select()).not.toThrow();
  });

  test("setRangeText modes (WPT textfieldselection/textfieldselection-setRangeText.html)", () => {
    const el = input({ value: "foobar" });
    el.setSelectionRange(1, 4);
    el.setRangeText("X");
    expect(el.value).toBe("fXar");
    expect([el.selectionStart, el.selectionEnd]).toEqual([1, 2]);
    el.setRangeText("YY", 0, 1, "select");
    expect([el.value, el.selectionStart, el.selectionEnd]).toEqual(["YYXar", 0, 2]);
    el.setRangeText("Z", 5, 5, "end");
    expect([el.value, el.selectionStart]).toEqual(["YYXarZ", 6]);
    el.setRangeText("", 0, 2, "start");
    expect([el.value, el.selectionStart, el.selectionEnd]).toEqual(["XarZ", 0, 0]);
    expect(() => el.setRangeText("q", 3, 1)).toThrow(expect.objectContaining({ name: "IndexSizeError" }));
  });
});

describe("valueAsNumber / valueAsDate — https://html.spec.whatwg.org/#dom-input-valueasnumber", () => {
  test("date: UTC milliseconds at midnight", () => {
    const el = input({ type: "date", value: "2024-03-05" });
    expect(el.valueAsNumber).toBe(Date.UTC(2024, 2, 5));
    expect(el.valueAsDate.toISOString()).toBe("2024-03-05T00:00:00.000Z");
    el.valueAsNumber = Date.UTC(2020, 0, 1);
    expect(el.value).toBe("2020-01-01");
  });

  test("month: months since 1970-01", () => {
    const el = input({ type: "month", value: "1971-02" });
    expect(el.valueAsNumber).toBe(13);
    el.valueAsDate = new Date(Date.UTC(2024, 5, 1));
    expect(el.value).toBe("2024-06");
  });

  test("time and week round-trip", () => {
    const t = input({ type: "time" });
    t.valueAsNumber = 3661500;
    expect(t.value).toBe("01:01:01.5");
    const w = input({ type: "week", value: "2024-W01" });
    expect(new Date(w.valueAsNumber).toISOString()).toBe("2024-01-01T00:00:00.000Z");
    w.valueAsNumber = Date.UTC(2021, 0, 3); // Sunday of 2020-W53
    expect(w.value).toBe("2020-W53");
  });

  test("non-numeric types: NaN / null on get; setters throw InvalidStateError", () => {
    const el = input();
    expect(el.valueAsNumber).toBeNaN();
    expect(el.valueAsDate).toBeNull();
    expect(() => (el.valueAsNumber = 1)).toThrow(expect.objectContaining({ name: "InvalidStateError" }));
    expect(() => (el.valueAsDate = new Date())).toThrow(expect.objectContaining({ name: "InvalidStateError" }));
    expect(() => (input({ type: "number" }).valueAsNumber = Infinity)).toThrow(TypeError);
  });
});

describe("stepUp/stepDown — https://html.spec.whatwg.org/#dom-input-stepup", () => {
  test("number: steps by step from the step base and clamps to min/max", () => {
    const el = input({ type: "number", min: "0", max: "10", step: "3", value: "0" });
    el.stepUp();
    expect(el.value).toBe("3");
    el.stepUp(5);
    expect(el.value).toBe("9");
    el.stepDown(10);
    expect(el.value).toBe("0");
  });

  test("a value off the step snaps to the next valid value in the step direction", () => {
    const el = input({ type: "number", step: "2" });
    el.value = "3"; // step base 0 (a value *attribute* of 3 would become the step base)
    el.stepUp();
    expect(el.value).toBe("4");
    el.value = "3";
    el.stepDown();
    expect(el.value).toBe("2");
  });

  test("decimal steps do not accumulate binary noise", () => {
    const el = input({ type: "number", step: "0.1", value: "0.2" });
    el.stepUp();
    expect(el.value).toBe("0.3");
  });

  test("date steps by days", () => {
    const el = input({ type: "date", value: "2024-02-28" });
    el.stepUp(2);
    expect(el.value).toBe("2024-03-01");
  });

  test("throws InvalidStateError for text inputs and step=any", () => {
    expect(() => input().stepUp()).toThrow(expect.objectContaining({ name: "InvalidStateError" }));
    expect(() => input({ type: "number", step: "any" }).stepUp()).toThrow(expect.objectContaining({ name: "InvalidStateError" }));
  });
});

describe("reflection — https://html.spec.whatwg.org/#the-input-element", () => {
  test("maxLength/minLength default -1; negative values throw IndexSizeError", () => {
    const el = input();
    expect(el.maxLength).toBe(-1);
    el.maxLength = 5;
    expect(el.getAttribute("maxlength")).toBe("5");
    expect(() => (el.maxLength = -2)).toThrow(expect.objectContaining({ name: "IndexSizeError" }));
  });

  test("size defaults to 20 and 0 throws IndexSizeError", () => {
    const el = input();
    expect(el.size).toBe(20);
    expect(() => (el.size = 0)).toThrow(expect.objectContaining({ name: "IndexSizeError" }));
  });

  test("formAction returns the document URL when missing; formMethod is '' when missing", () => {
    const el = input();
    expect(el.formAction).toBe(document.URL);
    expect(el.formMethod).toBe("");
    el.setAttribute("formmethod", "POST");
    expect(el.formMethod).toBe("post");
    el.setAttribute("formmethod", "bogus");
    expect(el.formMethod).toBe("get");
  });

  test("list returns the datalist with that id, only for types where list applies", () => {
    document.body!.innerHTML = "<datalist id=d></datalist><input list=d id=i>";
    const el = document.getElementById("i") as any;
    expect(el.list).toBe(document.getElementById("d"));
    el.type = "checkbox";
    expect(el.list).toBeNull();
  });

  test("files is a FileList only for type=file", () => {
    expect(input().files).toBeNull();
    const f = input({ type: "file" });
    expect(f.files.length).toBe(0);
    expect(Object.prototype.toString.call(f.files)).toBe("[object FileList]");
  });
});
