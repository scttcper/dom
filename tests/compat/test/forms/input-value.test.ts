/**
 * <input> value modes, value sanitization, type changes and the valueAs* / step APIs —
 * differential against jsdom.
 *
 * Spec: HTML Standard §4.10.5 The input element
 *   - value modes:            https://html.spec.whatwg.org/#dom-input-value
 *   - value sanitization:     https://html.spec.whatwg.org/#value-sanitization-algorithm
 *     (per type, e.g. https://html.spec.whatwg.org/#text-(type=text)-state-and-search-state-(type=search):value-sanitization-algorithm)
 *   - type change steps:      https://html.spec.whatwg.org/#input-type-change
 *   - dirty value flag:       https://html.spec.whatwg.org/#concept-fe-dirty
 *   - valueAsNumber/Date:     https://html.spec.whatwg.org/#dom-input-valueasnumber
 *   - stepUp/stepDown:        https://html.spec.whatwg.org/#dom-input-stepup
 *
 * React controlled inputs, `fireEvent.change`, user-event and jest-dom's `toHaveValue` all read
 * and write `input.value`, so every observable detail here matters.
 */
import { describe } from "vitest";
import { differential, differentialEach, type AnyWindow } from "../../src/harness.ts";

// oxfmt-ignore
const ALL_TYPES = [
  "text", "search", "tel", "url", "email", "password", "number", "range", "date", "month",
  "week", "time", "datetime-local", "color", "checkbox", "radio", "file", "hidden", "submit",
  "reset", "button", "image",
] as const;

function input(w: AnyWindow, type: string, attrs: Record<string, string> = {}): AnyWindow {
  const el = w.document.createElement("input");
  el.type = type;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  w.document.body.appendChild(el);
  return el;
}

function readValue(el: AnyWindow) {
  return { value: el.value, attr: el.getAttribute("value"), defaultValue: el.defaultValue };
}

describe("type IDL attribute — https://html.spec.whatwg.org/#attr-input-type (enumerated, invalid → text)", () => {
  differentialEach(
    (t) => `type=${JSON.stringify(t)} reflects as`,
    ["text", "TEXT", "CheckBox", "foo", "", "datetime", "  email", "datetime-local"],
    (w, t) => {
      const el = w.document.createElement("input");
      el.setAttribute("type", t);
      return el.type;
    },
  );
});

describe("value mode per type — https://html.spec.whatwg.org/#dom-input-value", () => {
  differentialEach(
    (t) => `type=${t}: initial value/defaultValue with value="  Hi there  " attribute`,
    ALL_TYPES,
    (w, t) => readValue(input(w, t, { value: "  Hi there  " })),
  );
  differentialEach(
    (t) => `type=${t}: initial value without a value attribute`,
    ALL_TYPES,
    (w, t) => readValue(input(w, t)),
  );
  differentialEach(
    (t) => `type=${t}: setting .value = "abc" (mode value/default/default-on/filename)`,
    ALL_TYPES,
    (w, t) => {
      const el = input(w, t);
      el.value = "abc";
      return readValue(el);
    },
  );
  differentialEach(
    (t) => `type=${t}: setting .value = "" (filename mode clears, others store "")`,
    ALL_TYPES,
    (w, t) => {
      const el = input(w, t, { value: "x" });
      el.value = "";
      return readValue(el);
    },
  );
  differentialEach(
    (t) => `type=${t}: .value = null stringifies per [LegacyNullToEmptyString]`,
    ALL_TYPES,
    (w, t) => {
      const el = input(w, t);
      el.value = null;
      return readValue(el);
    },
  );
});

describe("value sanitization algorithm — https://html.spec.whatwg.org/#value-sanitization-algorithm", () => {
  const probes: Record<string, string[]> = {
    text: ["a\nb\r\nc\rd", "  padded  ", "tab\tkept", "\u0000nul"],
    search: ["a\nb", "  x  "],
    tel: ["+1 (555)\n123", " 5 "],
    password: ["sec\nret", " p "],
    url: ["  http://example.com/a b \n", "\nnot a url\r", "   "],
    email: ["  a@b.c  ", "a@b.c\n", " x , y ", "Foo@Bar.COM"],
    number: ["12", "1e3", "-0", " 5", "5 ", "abc", "1.", ".5", "+1", "Infinity", "0x10", "1,5", "-12.50", "1e400"],
    range: ["", "abc", "150", "-5", "33", "1e1"],
    date: [
      "2024-02-29",
      "2023-02-29",
      "2024-02-30",
      "2024-1-01",
      " 2024-01-01",
      "2024-01-01T00:00",
      "0000-01-01",
      "275760-09-13",
      "275760-09-14",
    ],
    month: ["2024-01", "2024-13", "2024-1", "1999-12"],
    week: ["2020-W53", "2021-W53", "2024-W01", "2024-w01", "2024-W1"],
    time: ["13:45", "13:60", "1:00", "13:45:30", "13:45:30.5", "13:45:30.123", "23:59:59.9999", "13:45:00"],
    "datetime-local": [
      "2024-01-01T10:00",
      "2024-01-01 10:00",
      "2024-01-01T10:00:00",
      "2024-01-01T10:00:30.500",
      "2024-01-01T25:00",
      "2024-01-01",
    ],
    color: ["#FFF", "#AbCdEf", "red", "#12345", "  #123456", "#1234567", ""],
  };
  for (const [type, values] of Object.entries(probes)) {
    differentialEach(
      (v) => `type=${type}: .value = ${JSON.stringify(v)}`,
      values,
      (w, v) => {
        const el = input(w, type);
        el.value = v;
        return { value: el.value, valueAsNumber: el.valueAsNumber };
      },
    );
    differentialEach(
      (v) => `type=${type}: value attribute ${JSON.stringify(v)} (not dirty)`,
      values,
      (w, v) => {
        const el = input(w, type, { value: v });
        return { value: el.value, attr: el.getAttribute("value") };
      },
    );
  }

  differentialEach(
    (c) => `type=email multiple: .value = ${JSON.stringify(c)}`,
    [" a@b.c , d@e.f ", "a@b.c,,x", "\na@b.c\n", "a@b.c, ,"],
    (w, v) => {
      const el = input(w, "email", { multiple: "" });
      el.value = v;
      return el.value;
    },
  );

  differentialEach(
    (c) => `type=range ${JSON.stringify(c.attrs)} value=${JSON.stringify(c.value)}`,
    [
      { attrs: { min: "10", max: "0" }, value: "5" },
      { attrs: { min: "-10", max: "10" }, value: "" },
      { attrs: { min: "0", max: "1", step: "any" }, value: "0.37" },
    ] as Array<{ attrs: Record<string, string>; value: string }>,
    (w, c) => {
      const el = input(w, "range", c.attrs);
      el.value = c.value;
      return el.value;
    },
  );

  // jsdom does not implement the step-rounding part of range sanitization; browsers do.
  // https://html.spec.whatwg.org/#range-state-(type=range):value-sanitization-algorithm
  // "When the element is suffering from a step mismatch, the user agent must round the
  // element's value to the nearest number for which the element would not suffer from a step
  // mismatch, and which is greater than or equal to the minimum, and [...] less than or equal
  // to the maximum".
  const rangeStepCases: Array<{ attrs: Record<string, string>; value: string; expected: string }> = [
    { attrs: { min: "0", max: "10", step: "3" }, value: "5", expected: "6" },
    { attrs: { min: "0", max: "10", step: "3" }, value: "10", expected: "9" },
    { attrs: { min: "0", max: "100", step: "0.5" }, value: "33.3", expected: "33.5" },
    { attrs: {}, value: "50.7", expected: "51" },
    { attrs: { min: "1", max: "9", step: "4" }, value: "8", expected: "9" },
  ];
  for (const c of rangeStepCases) {
    differential(
      `type=range ${JSON.stringify(c.attrs)} value=${JSON.stringify(c.value)} rounds to the nearest step`,
      (w) => {
        const el = input(w, "range", c.attrs);
        el.value = c.value;
        return el.value;
      },
      {
        jsdomDeviation: {
          expected: c.expected,
          spec: "https://html.spec.whatwg.org/#range-state-(type=range):value-sanitization-algorithm",
          reason: "jsdom skips step rounding during range sanitization",
        },
      },
    );
  }

  differential("type=range: changing min/max/step re-sanitizes the current value", (w) => {
    const el = input(w, "range");
    el.value = "80";
    const before = el.value;
    el.max = "50";
    const afterMax = el.value;
    el.min = "60";
    return { before, afterMax, afterMin: el.value };
  });
});

describe("dirty value flag — https://html.spec.whatwg.org/#concept-fe-dirty", () => {
  differential("value attribute changes are reflected until .value is set", (w) => {
    const el = input(w, "text", { value: "a" });
    el.setAttribute("value", "b");
    const beforeDirty = el.value;
    el.value = "typed";
    el.setAttribute("value", "c");
    return { beforeDirty, afterDirty: el.value, defaultValue: el.defaultValue };
  });

  differential("setting .value to the same string still marks it dirty", (w) => {
    const el = input(w, "text", { value: "same" });
    el.value = "same";
    el.setAttribute("value", "changed");
    return el.value;
  });

  differential("defaultValue setter writes the value attribute and is visible while clean", (w) => {
    const el = input(w, "text");
    el.defaultValue = "dv";
    const clean = { value: el.value, attr: el.getAttribute("value") };
    el.value = "x";
    el.defaultValue = "dv2";
    return { clean, dirty: el.value, attr: el.getAttribute("value") };
  });

  differential("cloneNode copies value and dirty flag (cloning steps)", (w) => {
    const el = input(w, "text", { value: "attr" });
    el.value = "dirty";
    const clone = el.cloneNode();
    clone.setAttribute("value", "new attr");
    return { cloneValue: clone.value, cloneAttr: clone.getAttribute("value") };
  });

  differential("maxlength does not truncate programmatic values", (w) => {
    const el = input(w, "text", { maxlength: "2" });
    el.value = "abcdef";
    return el.value;
  });

  differential("removing the value attribute of a clean text input empties it", (w) => {
    const el = input(w, "text", { value: "a" });
    el.removeAttribute("value");
    return el.value;
  });
});

describe("type change steps — https://html.spec.whatwg.org/#input-type-change", () => {
  const transitions: Array<[string, string, Record<string, string>, string | null]> = [
    ["text", "checkbox", {}, "typed"],
    ["text", "hidden", { value: "attr" }, "typed"],
    ["text", "hidden", {}, ""],
    ["checkbox", "text", { value: "attr" }, null],
    ["checkbox", "text", {}, null],
    ["text", "number", {}, "abc"],
    ["text", "number", {}, "42"],
    ["number", "text", {}, "42"],
    ["text", "file", {}, "typed"],
    ["file", "text", { value: "attr" }, null],
    ["text", "email", {}, "  a@b.c  "],
    ["text", "color", {}, "#ABCDEF"],
    ["hidden", "text", { value: "attr" }, "typed"],
    ["text", "range", {}, ""],
    ["date", "text", {}, "2024-01-01"],
  ];
  for (const [from, to, attrs, typed] of transitions) {
    differential(`${from} → ${to} (attrs ${JSON.stringify(attrs)}, set .value ${JSON.stringify(typed)})`, (w) => {
      const el = input(w, from, attrs);
      if (typed !== null) el.value = typed;
      el.type = to;
      const afterChange = { value: el.value, attr: el.getAttribute("value") };
      el.setAttribute("value", "later");
      return { afterChange, afterAttr: el.value };
    });
  }

  differential("value lost to number sanitization stays lost after switching back to text", (w) => {
    const el = input(w, "text");
    el.value = "abc";
    el.type = "number";
    el.type = "text";
    return el.value;
  });
});

describe("valueAsNumber — https://html.spec.whatwg.org/#dom-input-valueasnumber", () => {
  differentialEach(
    (c) => `type=${c.type}: valueAsNumber of ${JSON.stringify(c.value)}`,
    [
      { type: "number", value: "3.25" },
      { type: "range", value: "40" },
      { type: "date", value: "2024-03-01" },
      { type: "month", value: "2024-03" },
      { type: "week", value: "2024-W10" },
      { type: "time", value: "01:30:15.5" },
      { type: "datetime-local", value: "2024-03-01T12:30" },
      { type: "text", value: "5" },
      { type: "number", value: "" },
    ],
    (w, c) => {
      const el = input(w, c.type);
      el.value = c.value;
      return el.valueAsNumber;
    },
  );

  differentialEach(
    (c) => `type=${c.type}: valueAsNumber = ${String(c.n)}`,
    [
      { type: "number", n: 7.5 },
      { type: "number", n: Number.NaN },
      { type: "number", n: Number.POSITIVE_INFINITY },
      { type: "date", n: 0 },
      { type: "date", n: 86_400_000 * 365.5 },
      { type: "month", n: 12 },
      { type: "time", n: 3_600_000 + 1500 },
      { type: "datetime-local", n: 1_700_000_000_000 },
      { type: "week", n: 0 },
      { type: "text", n: 5 },
      { type: "checkbox", n: 5 },
    ],
    (w, c) => {
      const el = input(w, c.type);
      el.valueAsNumber = c.n;
      return el.value;
    },
  );
});

differential(
  "type=range: valueAsNumber = 1000 is clamped to max by sanitization",
  (w) => {
    const el = w.document.createElement("input");
    el.type = "range";
    el.valueAsNumber = 1000;
    return el.value;
  },
  {
    jsdomDeviation: {
      expected: "100",
      spec: "https://html.spec.whatwg.org/#range-state-(type=range):value-sanitization-algorithm (the value of a range input is always sanitized)",
      reason: "jsdom's valueAsNumber setter bypasses range sanitization; browsers clamp",
    },
  },
);

describe("valueAsDate — https://html.spec.whatwg.org/#dom-input-valueasdate", () => {
  differentialEach(
    (c) => `type=${c.type}: valueAsDate of ${JSON.stringify(c.value)}`,
    [
      { type: "date", value: "2024-03-01" },
      { type: "month", value: "2024-03" },
      { type: "week", value: "2024-W10" },
      { type: "time", value: "10:15" },
      { type: "datetime-local", value: "2024-03-01T10:15" },
      { type: "number", value: "5" },
      { type: "date", value: "" },
    ],
    (w, c) => {
      const el = input(w, c.type);
      el.value = c.value;
      return el.valueAsDate;
    },
  );

  differentialEach(
    (type) => `type=${type}: valueAsDate = new Date(Date.UTC(2024, 4, 6, 7, 8, 9))`,
    ["date", "month", "week", "time", "number", "text"],
    (w, type) => {
      const el = input(w, type);
      el.valueAsDate = new Date(Date.UTC(2024, 4, 6, 7, 8, 9));
      return el.value;
    },
  );

  differential("type=date: valueAsDate = null clears the value", (w) => {
    const el = input(w, "date");
    el.value = "2024-01-01";
    el.valueAsDate = null;
    return el.value;
  });
});

describe("stepUp / stepDown — https://html.spec.whatwg.org/#dom-input-stepup", () => {
  differentialEach(
    (c) => `type=${c.type} ${JSON.stringify(c.attrs)} value=${JSON.stringify(c.value)} ${c.op}(${c.n ?? ""})`,
    [
      { type: "number", attrs: {}, value: "5", op: "stepUp" },
      { type: "number", attrs: {}, value: "", op: "stepUp" },
      { type: "number", attrs: {}, value: "", op: "stepDown" },
      { type: "number", attrs: { step: "2", min: "1" }, value: "5", op: "stepUp" },
      { type: "number", attrs: { step: "2", min: "1" }, value: "4", op: "stepUp" },
      { type: "number", attrs: { step: "2", min: "1" }, value: "4", op: "stepDown" },
      { type: "number", attrs: { max: "10" }, value: "9", op: "stepUp", n: 5 },
      { type: "number", attrs: { min: "0" }, value: "1", op: "stepDown", n: 5 },
      { type: "number", attrs: { step: "any" }, value: "1", op: "stepUp" },
      { type: "number", attrs: { step: "0.1" }, value: "0.2", op: "stepUp" },
      { type: "range", attrs: {}, value: "50", op: "stepUp", n: 10 },
      { type: "date", attrs: {}, value: "2024-02-28", op: "stepUp", n: 2 },
      { type: "time", attrs: {}, value: "10:00", op: "stepUp" },
      { type: "month", attrs: {}, value: "2024-12", op: "stepUp" },
      { type: "text", attrs: {}, value: "1", op: "stepUp" },
      { type: "number", attrs: { min: "5", max: "1" }, value: "", op: "stepUp" },
    ] as Array<{ type: string; attrs: Record<string, string>; value: string; op: "stepUp" | "stepDown"; n?: number }>,
    (w, c) => {
      const el = input(w, c.type, c.attrs);
      el.value = c.value;
      if (c.n === undefined) el[c.op]();
      else el[c.op](c.n);
      return el.value;
    },
  );
});

describe("file inputs — https://html.spec.whatwg.org/#file-upload-state-(type=file)", () => {
  differential("files is an empty FileList; setting a non-empty value throws InvalidStateError", (w) => {
    const el = input(w, "file");
    const files = { length: el.files.length, isFileList: Object.prototype.toString.call(el.files) };
    let threw: string | null = null;
    try {
      el.value = "C:\\fakepath\\x.txt";
    } catch (e) {
      threw = (e as Error).name;
    }
    return { files, threw, value: el.value };
  });

  differential("files is null for non-file inputs", (w) => input(w, "text").files);
});
