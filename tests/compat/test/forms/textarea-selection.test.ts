/**
 * <textarea> raw/API value and the text selection APIs of input and textarea — differential
 * against jsdom.
 *
 * Spec: HTML Standard
 *   - the textarea element (raw value, API value, default value): https://html.spec.whatwg.org/#the-textarea-element
 *   - textarea reset algorithm:            https://html.spec.whatwg.org/#the-textarea-element:concept-form-reset-control
 *   - APIs for text control selections:    https://html.spec.whatwg.org/#textFieldSelection
 *   - setRangeText:                        https://html.spec.whatwg.org/#dom-textarea/input-setrangetext
 *   - which input types apply selection:   https://html.spec.whatwg.org/#do-not-apply
 *
 * user-event types into inputs by moving the selection and editing around it; React's
 * controlled inputs restore selection after re-render. Both depend on these semantics.
 */
import { describe } from "vitest";
import { differential, differentialEach, type AnyWindow } from "../../src/harness.ts";

function sel(el: AnyWindow) {
  return { start: el.selectionStart, end: el.selectionEnd, dir: el.selectionDirection };
}

describe("textarea value — https://html.spec.whatwg.org/#the-textarea-element", () => {
  differential("defaultValue comes from child text; value follows while clean", (w) => {
    w.document.body.innerHTML = "<textarea>hello <b>x</b> world</textarea>";
    const t = w.document.querySelector("textarea");
    const initial = { value: t.value, defaultValue: t.defaultValue, textLength: t.textLength };
    t.textContent = "changed";
    return { initial, afterTextChange: t.value };
  });

  differential("parser drops a single leading newline", (w) => {
    w.document.body.innerHTML = "<textarea>\nfirst\n</textarea><textarea>\n\nsecond</textarea>";
    return Array.from(w.document.querySelectorAll("textarea") as ArrayLike<AnyWindow>).map((t) => t.value);
  });

  differential("value setter normalizes CRLF and CR to LF; textLength counts code units", (w) => {
    const t = w.document.createElement("textarea");
    t.value = "a\r\nb\rc\nd😀";
    return { value: t.value, textLength: t.textLength, length: t.value.length };
  });

  differential("once dirty, child text changes do not affect value", (w) => {
    w.document.body.innerHTML = "<textarea>a</textarea>";
    const t = w.document.querySelector("textarea");
    t.value = "typed";
    t.textContent = "b";
    return { value: t.value, defaultValue: t.defaultValue };
  });

  differential("defaultValue setter replaces children with a text node", (w) => {
    w.document.body.innerHTML = "<textarea><b>a</b></textarea>";
    const t = w.document.querySelector("textarea");
    t.defaultValue = "new\ndefault";
    return { childNodes: t.childNodes.length, html: t.innerHTML, value: t.value };
  });

  differential("form.reset() restores the default value and clears dirtiness", (w) => {
    w.document.body.innerHTML = "<form><textarea>orig</textarea></form>";
    const t = w.document.querySelector("textarea");
    t.value = "typed";
    w.document.querySelector("form").reset();
    const afterReset = t.value;
    t.textContent = "tracked again";
    return { afterReset, tracksAgain: t.value };
  });

  differential("maxlength does not truncate programmatic values; type is 'textarea'", (w) => {
    const t = w.document.createElement("textarea");
    t.maxLength = 2;
    t.value = "abcdef";
    return { value: t.value, tooLong: t.validity.tooLong, type: t.type };
  });

  differential("cloneNode copies the raw value and dirty flag", (w) => {
    w.document.body.innerHTML = "<textarea>def</textarea>";
    const t = w.document.querySelector("textarea");
    t.value = "dirty";
    const clone = t.cloneNode(true);
    clone.textContent = "x";
    return clone.value;
  });
});

describe("selection APIs — https://html.spec.whatwg.org/#textFieldSelection", () => {
  differential("setting value moves the cursor to the end with direction none", (w) => {
    const el = w.document.createElement("input");
    w.document.body.appendChild(el);
    el.value = "hello";
    return sel(el);
  });

  differential("setting the same value leaves the selection alone", (w) => {
    const el = w.document.createElement("input");
    w.document.body.appendChild(el);
    el.value = "hello";
    el.setSelectionRange(1, 3);
    el.value = "hello";
    return sel(el);
  });

  differentialEach(
    (args) => `setSelectionRange(${args.map((a) => JSON.stringify(a)).join(", ")}) on "hello"`,
    [
      [1, 3],
      [3, 1],
      [0, 100],
      [-1, 2],
      [2, 4, "backward"],
      [2, 4, "forward"],
      [2, 4, "sideways"],
      [5, 5],
    ] as unknown[][],
    (w, args) => {
      const el = w.document.createElement("input");
      el.value = "hello";
      el.setSelectionRange(...args);
      return sel(el);
    },
  );

  differential("select() selects everything", (w) => {
    const el = w.document.createElement("textarea");
    el.value = "abc\ndef";
    el.select();
    return sel(el);
  });

  differential("selectionStart setter past selectionEnd moves the end", (w) => {
    const el = w.document.createElement("input");
    el.value = "hello";
    el.setSelectionRange(1, 2);
    el.selectionStart = 4;
    const a = sel(el);
    el.selectionEnd = 1;
    const b = sel(el);
    el.selectionDirection = "backward";
    return { a, b, c: sel(el) };
  });

  differentialEach(
    (type) => `type=${type}: selection API applies or returns null / throws InvalidStateError`,
    [
      "text",
      "search",
      "url",
      "tel",
      "password",
      "email",
      "number",
      "date",
      "checkbox",
      "hidden",
      "range",
      "color",
      "file",
      "submit",
    ],
    (w, type) => {
      const el = w.document.createElement("input");
      el.type = type;
      let threw: string | null = null;
      try {
        el.setSelectionRange(0, 0);
      } catch (e) {
        threw = (e as Error).name;
      }
      let setterThrew: string | null = null;
      try {
        el.selectionStart = 0;
      } catch (e) {
        setterThrew = (e as Error).name;
      }
      return { start: el.selectionStart, end: el.selectionEnd, dir: el.selectionDirection, threw, setterThrew };
    },
  );

  differentialEach(
    (c) => `setRangeText(${JSON.stringify(c.args)}) with selection [${c.sel}] on "0123456789"`,
    [
      { args: ["XY"], sel: [2, 5] },
      { args: ["XY", 1, 3], sel: [0, 0] },
      { args: ["XY", 1, 3, "select"], sel: [0, 0] },
      { args: ["XY", 1, 3, "start"], sel: [0, 0] },
      { args: ["XY", 1, 3, "end"], sel: [0, 0] },
      { args: ["XY", 1, 3, "preserve"], sel: [4, 6] },
      { args: ["XY", 1, 3, "preserve"], sel: [2, 2] },
      { args: ["", 0, 10], sel: [3, 3] },
      { args: ["XY", 5, 2], sel: [0, 0] },
      { args: ["XY", 20, 30], sel: [0, 0] },
    ] as Array<{ args: unknown[]; sel: [number, number] }>,
    (w, c) => {
      const el = w.document.createElement("input");
      el.value = "0123456789";
      el.setSelectionRange(c.sel[0], c.sel[1]);
      el.setRangeText(...c.args);
      return { value: el.value, ...sel(el) };
    },
  );

  differential("changing type from text to number drops selection support; back to text restores it", (w) => {
    const el = w.document.createElement("input");
    el.value = "12";
    el.setSelectionRange(1, 2);
    el.type = "number";
    const asNumber = el.selectionStart;
    el.type = "text";
    return { asNumber, back: sel(el) };
  });

  differential(
    "selection is clamped when value gets shorter via defaultValue on a clean input",
    (w) => {
      const el = w.document.createElement("input");
      el.defaultValue = "long value";
      el.setSelectionRange(8, 10);
      el.defaultValue = "ab";
      return sel(el);
    },
    {
      jsdomDeviation: {
        expected: { start: 2, end: 2, dir: "none" },
        spec: "https://html.spec.whatwg.org/#textFieldSelection (selection offsets are positions within the relevant value)",
        reason: "jsdom keeps stale offsets beyond the new value's length; browsers move the cursor to the end",
      },
    },
  );
});
