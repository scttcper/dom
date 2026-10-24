/**
 * The microsyntaxes and number/string conversions behind each input type state: value
 * sanitization edge cases, valueAsNumber/valueAsDate round trips, the step base and allowed
 * value step, and the e-mail / URL / colour / pattern checks — differential against jsdom.
 *
 * Spec: HTML Standard §2.3 Common microsyntaxes — https://html.spec.whatwg.org/#common-microsyntaxes
 *   - floating-point numbers:   https://html.spec.whatwg.org/#valid-floating-point-number
 *   - dates:                    https://html.spec.whatwg.org/#valid-date-string, https://html.spec.whatwg.org/#parse-a-date-string,
 *                               https://html.spec.whatwg.org/#number-of-days-in-month-month-of-year-year
 *   - months:                   https://html.spec.whatwg.org/#valid-month-string, https://html.spec.whatwg.org/#parse-a-month-string
 *   - weeks:                    https://html.spec.whatwg.org/#valid-week-string, https://html.spec.whatwg.org/#parse-a-week-string,
 *                               https://html.spec.whatwg.org/#week-number-of-the-last-day
 *   - times:                    https://html.spec.whatwg.org/#valid-time-string, https://html.spec.whatwg.org/#parse-a-time-string
 *   - local date and time:      https://html.spec.whatwg.org/#valid-normalised-local-date-and-time-string,
 *                               https://html.spec.whatwg.org/#parse-a-local-date-and-time-string
 *   - colours:                  https://html.spec.whatwg.org/#valid-simple-colour
 *   - e-mail / URL:             https://html.spec.whatwg.org/#valid-e-mail-address, https://html.spec.whatwg.org/#valid-absolute-url
 * Spec: HTML Standard §4.10.5 The input element
 *   - string ⇄ number:          https://html.spec.whatwg.org/#concept-input-value-string-number,
 *                               https://html.spec.whatwg.org/#concept-input-value-number-string
 *   - step / step base:         https://html.spec.whatwg.org/#concept-input-step, https://html.spec.whatwg.org/#concept-input-min-zero
 *   - E-mail state:             https://html.spec.whatwg.org/#email-state-(type=email)
 *   - pattern:                  https://html.spec.whatwg.org/#compiled-pattern-regular-expression
 *   - value / dirty value flag: https://html.spec.whatwg.org/#concept-fe-value, https://html.spec.whatwg.org/#concept-input-value-dirty-flag,
 *                               https://html.spec.whatwg.org/#dom-input-value-value
 *   - checked IDL attribute:    https://html.spec.whatwg.org/#dom-input-checked
 *   - mutability / readonly:    https://html.spec.whatwg.org/#concept-fe-mutable, https://html.spec.whatwg.org/#the-readonly-attribute,
 *                               https://html.spec.whatwg.org/#the-readonly-attribute:barred-from-constraint-validation
 */
import { describe } from "vitest";
import { differential, differentialEach, validityFlags, type AnyWindow } from "../../src/harness.ts";

function input(w: AnyWindow, type: string, attrs: Record<string, string> = {}): AnyWindow {
  const el = w.document.createElement("input");
  el.type = type;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  w.document.body.appendChild(el);
  return el;
}

function sanitized(w: AnyWindow, type: string, value: string): { value: string; n: number } {
  const el = input(w, type);
  el.value = value;
  return { value: el.value, n: el.valueAsNumber };
}

describe("valid floating-point number — https://html.spec.whatwg.org/#valid-floating-point-number", () => {
  differentialEach(
    (v) => `type=number keeps only valid floating-point numbers: ${JSON.stringify(v)}`,
    ["1", "-1", "1.5", ".5", "1.", "+1", "1e3", "1E-2", "-0", " 1", "1 ", "0x10", "1e", "Infinity", "1_000", "00012", "1e400"],
    (w, v) => sanitized(w, "number", v),
  );
});

describe("string → number / number → string — https://html.spec.whatwg.org/#concept-input-value-string-number", () => {
  differentialEach(
    (c) => `type=${c.type}: valueAsNumber = ${c.n} serializes back (https://html.spec.whatwg.org/#concept-input-value-number-string)`,
    [
      { type: "number", n: 0.1 + 0.2 },
      { type: "number", n: 1e21 },
      { type: "number", n: -0 },
      { type: "number", n: 1 / 3 },
      { type: "range", n: 33 },
      { type: "date", n: -86_400_000 },
      { type: "week", n: 7 * 86_400_000 },
      { type: "time", n: 59_999 },
      { type: "time", n: 86_400_000 + 60_000 },
      { type: "datetime-local", n: 1_000 },
    ],
    (w, c) => {
      const el = input(w, c.type);
      el.valueAsNumber = c.n;
      return { value: el.value, back: el.valueAsNumber };
    },
  );
});

differential(
  "type=month: valueAsNumber = -1 is one month before 1970-01 (https://html.spec.whatwg.org/#month-state-(type=month))",
  (w) => {
    const el = input(w, "month");
    el.valueAsNumber = -1;
    return { value: el.value, back: el.valueAsNumber };
  },
  {
    jsdomDeviation: {
      expected: { value: "1969-12", back: -1 },
      spec: "https://html.spec.whatwg.org/#month-state-(type=month) (number → string: the month that is the given number of months after January 1970)",
      reason: "jsdom floors the year before taking the month remainder for negative inputs and lands in 1968-12",
    },
  },
);

describe("dates — https://html.spec.whatwg.org/#valid-date-string, https://html.spec.whatwg.org/#parse-a-date-string", () => {
  differentialEach(
    (v) => `type=date: ${JSON.stringify(v)} (https://html.spec.whatwg.org/#number-of-days-in-month-month-of-year-year)`,
    ["2024-02-29", "2023-02-29", "1900-02-29", "2000-02-29", "2024-04-31", "0000-01-01", "0001-01-01", "275760-09-13", "2024-13-01", "2024-1-01", "2024-01-01T00:00", " 2024-01-01"],
    (w, v) => sanitized(w, "date", v),
  );
});

describe("months — https://html.spec.whatwg.org/#valid-month-string, https://html.spec.whatwg.org/#parse-a-month-string", () => {
  differentialEach(
    (v) => `type=month: ${JSON.stringify(v)}`,
    ["2024-01", "2024-12", "2024-00", "2024-13", "0000-01", "1969-12", "12345-06", "2024-1"],
    (w, v) => {
      const el = input(w, "month");
      el.value = v;
      return { value: el.value, n: el.valueAsNumber, date: el.valueAsDate };
    },
  );
});

describe("weeks — https://html.spec.whatwg.org/#valid-week-string, https://html.spec.whatwg.org/#parse-a-week-string", () => {
  differentialEach(
    (v) => `type=week: ${JSON.stringify(v)} (https://html.spec.whatwg.org/#week-number-of-the-last-day)`,
    ["2020-W53", "2021-W53", "2026-W53", "2015-W53", "2024-W01", "2024-W00", "2024-W1", "2024-w01", "1970-W01"],
    (w, v) => {
      const el = input(w, "week");
      el.value = v;
      return { value: el.value, n: el.valueAsNumber };
    },
  );
});

describe("times — https://html.spec.whatwg.org/#valid-time-string, https://html.spec.whatwg.org/#parse-a-time-string", () => {
  differentialEach(
    (v) => `type=time: ${JSON.stringify(v)}`,
    ["00:00", "23:59", "23:59:59", "23:59:59.999", "12:30:00.1", "24:00", "12:60", "12:30:60", "1:30", "12:3", "12:30:5", "12:30:00.", "12:30:00.1234"],
    (w, v) => sanitized(w, "time", v),
  );
});

describe("local date and time — https://html.spec.whatwg.org/#parse-a-local-date-and-time-string, https://html.spec.whatwg.org/#valid-normalised-local-date-and-time-string", () => {
  differentialEach(
    (v) => `type=datetime-local normalizes ${JSON.stringify(v)}`,
    ["2024-01-01T10:00", "2024-01-01 10:00", "2024-01-01T10:00:00", "2024-01-01T10:00:00.500", "2024-01-01T10:00:30.000", "2024-02-30T10:00", "2024-01-01t10:00", "2024-01-01T24:00"],
    (w, v) => sanitized(w, "datetime-local", v),
  );
});

describe("colours — https://html.spec.whatwg.org/#valid-simple-colour", () => {
  differentialEach(
    (v) => `type=color: ${JSON.stringify(v)}`,
    ["#abcdef", "#ABCDEF", "#abc", "abcdef", "#abcdeg", "", "#0000001"],
    (w, v) => {
      const el = input(w, "color");
      el.value = v;
      return el.value;
    },
  );
});

describe("E-mail state — https://html.spec.whatwg.org/#email-state-(type=email), https://html.spec.whatwg.org/#valid-e-mail-address", () => {
  differentialEach(
    (c) => `${c.multiple ? "multiple " : ""}${JSON.stringify(c.value)}`,
    [
      { value: "a@b", multiple: false },
      { value: " a@b.c ", multiple: false },
      { value: "a@b\n.c", multiple: false },
      { value: "a@-b.c", multiple: false },
      { value: "a.b+c@d-e.f", multiple: false },
      { value: "a@b,c@d", multiple: false },
      { value: " a@b , c@d ", multiple: true },
      { value: "a@b,,c@d", multiple: true },
      { value: "a@b, x", multiple: true },
      { value: "", multiple: true },
    ],
    (w, c) => {
      const el = input(w, "email", c.multiple ? { multiple: "" } : {});
      el.value = c.value;
      return { value: el.value, typeMismatch: el.validity.typeMismatch };
    },
  );
});

describe("URL state — https://html.spec.whatwg.org/#valid-absolute-url", () => {
  differentialEach(
    (v) => `type=url typeMismatch for ${JSON.stringify(v)}`,
    ["http://example.com", "foo", "mailto:a@b", " http://x ", "//x", "a:b"],
    (w, v) => {
      const el = input(w, "url");
      el.value = v;
      return { value: el.value, typeMismatch: el.validity.typeMismatch };
    },
  );
});

describe("pattern — https://html.spec.whatwg.org/#compiled-pattern-regular-expression", () => {
  differentialEach(
    (c) => `pattern=${JSON.stringify(c.pattern)} value=${JSON.stringify(c.value)}`,
    [
      { pattern: "[a-z]+", value: "abc" },
      { pattern: "[a-z]+", value: "abc1" },
      { pattern: "a|b", value: "ab" },
      { pattern: "a|b", value: "b" },
      { pattern: "[", value: "[" },
      { pattern: "\\p{L}+", value: "éß" },
      { pattern: "[\\p{L}--[a-z]]+", value: "ÉB" },
      { pattern: "[\\p{L}--[a-z]]+", value: "Éb" },
      { pattern: "[(]", value: "(" },
      { pattern: "abc", value: "" },
    ],
    (w, c) => {
      const el = input(w, "text", { pattern: c.pattern });
      el.value = c.value;
      return el.validity.patternMismatch;
    },
  );

  differential("each value of a multiple email input must match the pattern on its own", (w) => {
    const el = input(w, "email", { multiple: "", pattern: "[a-z]@[a-z]" });
    el.value = "a@b,c@d";
    const ok = el.validity.patternMismatch;
    el.value = "a@b,cc@d";
    return [ok, el.validity.patternMismatch];
  });
});

describe("allowed value step — https://html.spec.whatwg.org/#concept-input-step, https://html.spec.whatwg.org/#concept-input-min-zero", () => {
  differentialEach(
    (c) => `type=${c.type} ${JSON.stringify(c.attrs)} value=${JSON.stringify(c.value)} → stepMismatch`,
    [
      // Step base: min, else the value content attribute, else the default step base (0).
      { type: "number", attrs: { min: "1", step: "2" }, value: "4" },
      { type: "number", attrs: { min: "1", step: "2" }, value: "5" },
      { type: "number", attrs: { value: "0.5", step: "1" }, value: "2.5" },
      { type: "number", attrs: { value: "0.5", step: "1" }, value: "2" },
      { type: "number", attrs: { step: "0" }, value: "1.5" },
      { type: "number", attrs: { step: "-1" }, value: "1.5" },
      { type: "number", attrs: { step: "any" }, value: "1.5" },
      { type: "number", attrs: { step: "0.1" }, value: "0.3" },
      { type: "range", attrs: { min: "0", max: "10", step: "3" }, value: "9" },
      { type: "date", attrs: {}, value: "2024-01-02" },
      { type: "date", attrs: { step: "2", min: "2024-01-01" }, value: "2024-01-02" },
      { type: "time", attrs: {}, value: "10:00:30" },
      { type: "time", attrs: { step: "1" }, value: "10:00:30" },
      { type: "month", attrs: { step: "3", min: "2024-01" }, value: "2024-03" },
      { type: "week", attrs: { step: "2", min: "2024-W01" }, value: "2024-W02" },
      // Week default step base is -259,200,000 (1970-W01's Monday).
      { type: "week", attrs: {}, value: "1970-W02" },
      { type: "datetime-local", attrs: {}, value: "2024-01-01T10:00:01" },
    ] as Array<{ type: string; attrs: Record<string, string>; value: string }>,
    (w, c) => {
      const el = input(w, c.type, c.attrs);
      el.value = c.value;
      return el.validity.stepMismatch;
    },
  );

  differentialEach(
    (c) => `type=${c.type} ${JSON.stringify(c.attrs)} value=${JSON.stringify(c.value)} ${c.op}`,
    [
      { type: "number", attrs: { min: "0.5" }, value: "1", op: "stepUp" },
      { type: "time", attrs: { step: "900" }, value: "10:07", op: "stepUp" },
      { type: "time", attrs: {}, value: "23:59", op: "stepUp" },
      { type: "week", attrs: {}, value: "2024-W52", op: "stepUp" },
      { type: "month", attrs: { max: "2024-06" }, value: "2024-06", op: "stepUp" },
      { type: "datetime-local", attrs: {}, value: "2024-01-01T23:59", op: "stepUp" },
      { type: "date", attrs: { min: "2024-01-10" }, value: "2024-01-01", op: "stepDown" },
      { type: "number", attrs: { min: "0", max: "10", step: "3" }, value: "10", op: "stepUp" },
      { type: "color", attrs: {}, value: "#000000", op: "stepUp" },
    ] as Array<{ type: string; attrs: Record<string, string>; value: string; op: "stepUp" | "stepDown" }>,
    (w, c) => {
      const el = input(w, c.type, c.attrs);
      el.value = c.value;
      el[c.op]();
      return el.value;
    },
  );
});

differential(
  "stepUp from an empty value aligns 0 up to the step base taken from the value content attribute",
  (w) => {
    const el = input(w, "number", { value: "0.5" });
    el.value = "";
    el.stepUp();
    return el.value;
  },
  {
    jsdomDeviation: {
      expected: "0.5",
      spec: "https://html.spec.whatwg.org/#dom-input-stepup (step 7: the nearest value above that is an integral multiple of the step from the step base, https://html.spec.whatwg.org/#concept-input-min-zero)",
      reason: "jsdom aligns with Decimal ROUND_UP (away from zero), so 0 - 0.5 rounds to -1 and the step is abandoned",
    },
  },
);

describe("value / dirty value flag — https://html.spec.whatwg.org/#concept-fe-value, https://html.spec.whatwg.org/#concept-input-value-dirty-flag", () => {
  differential("value mode 'value': setting the IDL value sets the dirty value flag and leaves the attribute alone (https://html.spec.whatwg.org/#dom-input-value-value)", (w) => {
    const el = input(w, "text", { value: "a" });
    el.value = "b";
    el.setAttribute("value", "c");
    return [el.value, el.getAttribute("value"), el.defaultValue];
  });

  differential("value mode 'default': hidden inputs write the value content attribute", (w) => {
    const el = input(w, "hidden");
    el.value = "x";
    return [el.value, el.getAttribute("value")];
  });

  differential("value mode 'default/on': checkbox value is 'on' without an attribute and writes the attribute", (w) => {
    const el = input(w, "checkbox");
    const before = el.value;
    el.value = "yes";
    return [before, el.value, el.getAttribute("value")];
  });

  differential("value mode 'filename': only the empty string can be set", (w) => {
    const el = input(w, "file");
    el.value = "";
    let threw = "";
    try {
      el.value = "C:\\x";
    } catch (e) {
      threw = (e as Error).name;
    }
    return [el.value, threw];
  });

  differential("checked IDL attribute sets dirty checkedness (https://html.spec.whatwg.org/#dom-input-checked)", (w) => {
    const el = input(w, "checkbox");
    el.checked = true;
    el.removeAttribute("checked");
    el.setAttribute("checked", "");
    el.checked = false;
    return [el.checked, el.defaultChecked];
  });
});

describe("mutability and readonly — https://html.spec.whatwg.org/#concept-fe-mutable, https://html.spec.whatwg.org/#the-readonly-attribute", () => {
  differentialEach(
    (type) => `type=${type} readonly: barred from constraint validation where readonly applies (https://html.spec.whatwg.org/#the-readonly-attribute:barred-from-constraint-validation)`,
    ["text", "number", "date", "email", "password"],
    (w, type) => {
      const el = input(w, type, { readonly: "", required: "" });
      return { willValidate: el.willValidate, ...validityFlags(el), readOnly: el.readOnly, matchesReadOnly: el.matches(":read-only") };
    },
  );

  differential("readonly inputs still have their value set by script and can stepUp", (w) => {
    const el = input(w, "number", { readonly: "", value: "1" });
    el.value = "2";
    el.stepUp();
    return el.value;
  });
});
