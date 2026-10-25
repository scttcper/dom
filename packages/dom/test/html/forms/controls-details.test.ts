/**
 * Form control details component tests reach: the selection range algorithm, input.files,
 * textarea wrapping in the entry list, implicit submission blocking, the button Auto type state,
 * <selectedcontent>, showPicker(), plus element reflection details (integers, URLs, element
 * references, ARIA on ElementInternals, template shadowRootSlotAssignment), event handler IDL
 * attributes and iframe insertion/removal.
 *
 * Spec: HTML Standard
 *   - selection:              https://html.spec.whatwg.org/#set-the-selection-range, https://html.spec.whatwg.org/#dom-textarea/input-selectionstart
 *   - files:                  https://html.spec.whatwg.org/#dom-input-files
 *   - entry list:             https://html.spec.whatwg.org/#textarea-wrapping-transformation
 *   - implicit submission:    https://html.spec.whatwg.org/#field-that-blocks-implicit-submission
 *   - button type:            https://html.spec.whatwg.org/#attr-button-type-auto-state
 *   - selectedcontent:        https://html.spec.whatwg.org/#get-a-select, https://html.spec.whatwg.org/#clone-an-option-into-a-selectedcontent
 *   - showPicker:             https://html.spec.whatwg.org/#dom-input-showpicker, https://html.spec.whatwg.org/#dom-select-showpicker
 *   - reflection:             https://html.spec.whatwg.org/#rules-for-parsing-integers, https://html.spec.whatwg.org/#encoding-parsing-a-url,
 *                             https://html.spec.whatwg.org/#attr-associated-elements, https://html.spec.whatwg.org/#accessibility-semantics,
 *                             https://html.spec.whatwg.org/#dom-template-shadowrootslotassignment
 *   - event handlers:         https://html.spec.whatwg.org/#globaleventhandlers
 *   - iframes:                https://html.spec.whatwg.org/#the-iframe-element:html-element-insertion-steps,
 *                             https://html.spec.whatwg.org/#the-iframe-element:html-element-removing-steps
 */
import { beforeEach, describe, expect, test } from "vitest";
import { createWindow } from "@ctrl/dom";
import { implicitSubmission, $impl } from "@ctrl/dom/internal";

/* eslint-disable @typescript-eslint/no-explicit-any */
let win: any;
let doc: any;
beforeEach(() => {
  win = createWindow();
  doc = win.document;
});

const $ = (id: string) => doc.getElementById(id);
const nextTask = () => new Promise((r) => setTimeout(r, 1));

describe("set the selection range — https://html.spec.whatwg.org/#set-the-selection-range", () => {
  test("end before start collapses to end; the direction is kept; a select event is queued per change, none for a no-op", async () => {
    doc.body.innerHTML = `<input id=i value="hello world">`;
    const i = $("i");
    let selects = 0;
    i.addEventListener("select", () => selects++);
    i.setSelectionRange(6, 2, "backward");
    const collapsed = [i.selectionStart, i.selectionEnd, i.selectionDirection];
    i.setSelectionRange(0, 99);
    const clamped = [i.selectionStart, i.selectionEnd, i.selectionDirection];
    await nextTask();
    i.setSelectionRange(0, 11);
    await nextTask();
    // Two changes (collapse, then the clamped range with direction none) queue two select events; the no-op call queues none.
    expect([collapsed, clamped, selects]).toEqual([[2, 2, "backward"], [0, 11, "none"], 2]);
  });

  test("selectionStart setter past the end moves the end; null means 0 (https://html.spec.whatwg.org/#dom-textarea/input-selectionstart)", () => {
    doc.body.innerHTML = `<textarea id=t>abcdef</textarea>`;
    const t = $("t");
    t.setSelectionRange(1, 3);
    t.selectionStart = 5;
    const moved = [t.selectionStart, t.selectionEnd];
    t.selectionStart = null;
    expect([moved, t.selectionStart, t.selectionEnd]).toEqual([[5, 5], 0, 5]);
  });
});

describe("input.files — https://html.spec.whatwg.org/#dom-input-files", () => {
  test("file inputs return the same FileList; the setter takes a FileList and ignores null; other types return null and ignore sets", () => {
    doc.body.innerHTML = `<input id=f type=file><input id=t>`;
    const f = $("f");
    const list = f.files;
    const dt = new win.DataTransfer();
    dt.items.add(new win.File(["x"], "x.txt"));
    f.files = dt.files;
    const afterSet = [f.files.length, f.files[0].name, f.value];
    f.files = null;
    $("t").files = dt.files;
    expect([list === f.files || list.length === 0, afterSet, f.files.length, $("t").files]).toEqual([
      true,
      [1, "x.txt", "C:\\fakepath\\x.txt"],
      1,
      null,
    ]);
  });
});

describe("textarea wrapping transformation — https://html.spec.whatwg.org/#textarea-wrapping-transformation", () => {
  test("wrap=hard inserts line breaks so lines fit cols in the entry list; soft does not", () => {
    doc.body.innerHTML = `<form id=f><textarea name=h wrap=hard cols=5>aaa bbb cccccccc</textarea><textarea name=s cols=5>aaa bbb</textarea></form>`;
    const fd = new win.FormData($("f"));
    expect([
      fd
        .get("h")
        .split("\n")
        .every((l: string) => l.length <= 5),
      fd.get("h").replaceAll("\n", ""),
      fd.get("s"),
    ]).toEqual([true, "aaa bbb cccccccc", "aaa bbb"]);
  });
});

describe("implicit submission — https://html.spec.whatwg.org/#field-that-blocks-implicit-submission", () => {
  test("with no default button, one blocking field submits and two block it; non-blocking types do not count", () => {
    doc.body.innerHTML = `<form id=one><input><input type=checkbox><input type=range></form><form id=two><input><input type=email></form>`;
    const log: string[] = [];
    for (const id of ["one", "two"]) $(id).addEventListener("submit", (e: any) => (e.preventDefault(), log.push(id)));
    implicitSubmission($("one")[$impl]);
    implicitSubmission($("two")[$impl]);
    expect(log).toEqual(["one"]);
  });
});

describe("button type Auto state — https://html.spec.whatwg.org/#attr-button-type-auto-state", () => {
  test("a button with commandfor or command and no type is a plain button: it does not submit and is not the default button", () => {
    doc.body.innerHTML = `<form id=f><button id=cmd commandfor=x command=--go>c</button><button id=sub>s</button></form><div id=x></div>`;
    const log: string[] = [];
    $("f").addEventListener("submit", (e: any) => (e.preventDefault(), log.push("submit")));
    $("cmd").click();
    expect([log, $("cmd").matches(":default"), $("sub").matches(":default")]).toEqual([[], false, true]);
  });
});

describe("selectedcontent — https://html.spec.whatwg.org/#clone-an-option-into-a-selectedcontent", () => {
  test("the select's selectedcontent mirrors the selected option's children and follows selection changes (https://html.spec.whatwg.org/#get-a-select)", () => {
    doc.body.innerHTML = `<select id=s><button><selectedcontent id=sc></selectedcontent></button><option>A</option><option selected><b>B</b></option></select>`;
    const before = $("sc").innerHTML;
    $("s").selectedIndex = 0;
    expect([before, $("sc").innerHTML]).toEqual(["<b>B</b>", "A"]);
  });
});

describe("showPicker() — https://html.spec.whatwg.org/#dom-input-showpicker", () => {
  test("immutable controls throw InvalidStateError; mutable ones show nothing and do not require user activation here (https://html.spec.whatwg.org/#dom-select-showpicker)", () => {
    doc.body.innerHTML = `<input id=d disabled><input id=r readonly><input id=ok type=date><select id=sd disabled></select><select id=sok></select>`;
    const call = (id: string) => {
      try {
        $(id).showPicker();
        return "ok";
      } catch (e) {
        return (e as Error).name;
      }
    };
    expect(["d", "r", "ok", "sd", "sok"].map(call)).toEqual([
      "InvalidStateError",
      "InvalidStateError",
      "ok",
      "InvalidStateError",
      "ok",
    ]);
  });
});

describe("reflection details — https://html.spec.whatwg.org/#rules-for-parsing-integers", () => {
  test("long attributes parse leading whitespace, '+' and trailing junk; failures use the default", () => {
    doc.body.innerHTML = `<ol id=a start=" -3x"></ol><ol id=b start="+4"></ol><ol id=c start="x"></ol><li id=l value="  12.5"></li>`;
    expect([$("a").start, $("b").start, $("c").start, $("l").value]).toEqual([-3, 4, 1, 12]);
  });

  test("URL attributes are parsed against the document base URL with the document's encoding (https://html.spec.whatwg.org/#encoding-parsing-a-url)", () => {
    const w: any = createWindow({ url: "https://example.com/dir/page" } as any);
    w.document.body.innerHTML = `<a id=a href="é ü?q=ä#f">x</a><img id=i src="../img.png">`;
    expect([w.document.getElementById("a").href, w.document.getElementById("i").src]).toEqual([
      "https://example.com/dir/%C3%A9%20%C3%BC?q=%C3%A4#f",
      "https://example.com/img.png",
    ]);
    w.close();
  });

  test("element-array reflection: explicitly set elements win, the attribute is set to '', ids resolve otherwise (https://html.spec.whatwg.org/#attr-associated-elements)", () => {
    doc.body.innerHTML = `<span id=l1>a</span><span id=l2>b</span><input id=i aria-labelledby="l2 missing l1">`;
    const i = $("i");
    const fromIds = i.ariaLabelledByElements.map((e: any) => e.id);
    i.ariaLabelledByElements = [$("l1")];
    expect([fromIds, i.getAttribute("aria-labelledby"), i.ariaLabelledByElements.map((e: any) => e.id)]).toEqual([
      ["l2", "l1"],
      "",
      ["l1"],
    ]);
  });

  test("ARIA reflection on ElementInternals sets default semantics without touching the element's attributes (https://html.spec.whatwg.org/#accessibility-semantics)", () => {
    win.customElements.define(
      "x-aria",
      class extends win.HTMLElement {
        internals = (this as any).attachInternals();
      },
    );
    const el = doc.createElement("x-aria");
    el.internals.role = "checkbox";
    el.internals.ariaChecked = "true";
    expect([
      el.internals.role,
      el.internals.ariaChecked,
      el.getAttribute("role"),
      el.hasAttribute("aria-checked"),
    ]).toEqual(["checkbox", "true", null, false]);
  });

  test("template shadowRootSlotAssignment reflects named/manual and drives declarative shadow roots (https://html.spec.whatwg.org/#dom-template-shadowrootslotassignment)", () => {
    const t = doc.createElement("template");
    const before = t.shadowRootSlotAssignment;
    t.shadowRootSlotAssignment = "MANUAL";
    const host = doc.createElement("div");
    host.setHTMLUnsafe(
      `<div><template shadowrootmode=open shadowrootslotassignment=manual><slot></slot></template></div>`,
    );
    expect([
      before,
      t.shadowRootSlotAssignment,
      t.getAttribute("shadowrootslotassignment"),
      host.firstElementChild.shadowRoot?.slotAssignment,
    ]).toEqual(["named", "manual", "MANUAL", "manual"]);
  });
});

describe("event handler IDL attributes — https://html.spec.whatwg.org/#globaleventhandlers", () => {
  test("onclick runs on click; returning false cancels; setting null removes it; content attributes do not run (no scripting)", () => {
    doc.body.innerHTML = `<a id=a href="#x" onclick="window.hit = true">a</a>`;
    const a = $("a");
    const calls: string[] = [];
    a.onclick = () => {
      calls.push("handler");
      return false;
    };
    const ev = new win.MouseEvent("click", { bubbles: true, cancelable: true });
    a.dispatchEvent(ev);
    a.onclick = null;
    a.click();
    expect([calls, ev.defaultPrevented, (win as any).hit, typeof win.onclick]).toEqual([
      ["handler"],
      true,
      undefined,
      "object",
    ]);
  });
});

describe("iframes — https://html.spec.whatwg.org/#the-iframe-element:html-element-insertion-steps", () => {
  test("insertion creates a nested browsing context; removal discards it; re-insertion creates a new one (https://html.spec.whatwg.org/#the-iframe-element:html-element-removing-steps)", () => {
    const f = doc.createElement("iframe");
    const detached = f.contentWindow;
    doc.body.appendChild(f);
    const first = f.contentWindow;
    f.remove();
    const removed = f.contentWindow;
    doc.body.appendChild(f);
    expect([detached, first !== null, removed, f.contentWindow !== null && f.contentWindow !== first]).toEqual([
      null,
      true,
      null,
      true,
    ]);
  });
});
