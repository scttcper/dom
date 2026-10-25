/**
 * Constraint validation API — differential against jsdom.
 *
 * Spec: HTML Standard §4.10.20 Constraints
 *   - constraint validation / barred:       https://html.spec.whatwg.org/#barred-from-constraint-validation
 *   - validity states:                      https://html.spec.whatwg.org/#validity-states
 *   - suffering from being missing:         https://html.spec.whatwg.org/#suffering-from-being-missing
 *   - pattern attribute (v flag):           https://html.spec.whatwg.org/#the-pattern-attribute
 *   - min/max/step:                         https://html.spec.whatwg.org/#the-min-and-max-attributes
 *   - minlength/maxlength (user edits only): https://html.spec.whatwg.org/#setting-minimum-input-length-requirements:-the-minlength-attribute
 *   - email/url type mismatch:              https://html.spec.whatwg.org/#e-mail-state-(type=email)
 *   - the constraint validation API:        https://html.spec.whatwg.org/#the-constraint-validation-api
 *   - statically validate the constraints:  https://html.spec.whatwg.org/#statically-validate-the-constraints
 *
 * jest-dom's `toBeInvalid`/`toBeValid`/`toBeRequired`, Testing Library `getByRole` with
 * `aria-invalid` fallbacks, and form libraries calling `checkValidity()` depend on this.
 */
import { describe } from "vitest";
import { differential, differentialEach, validityFlags, recordEvents, type AnyWindow } from "../../src/harness.ts";

function make(w: AnyWindow, html: string): AnyWindow {
  w.document.body.innerHTML = html;
  return w.document.body.firstElementChild;
}

function report(el: AnyWindow) {
  return {
    willValidate: el.willValidate,
    ...validityFlags(el),
    hasMessage: el.validationMessage !== "",
    checkValidity: el.checkValidity(),
  };
}

describe("willValidate / barred from constraint validation — https://html.spec.whatwg.org/#barred-from-constraint-validation", () => {
  differentialEach(
    (html) => `willValidate for ${html}`,
    [
      "<input>",
      "<input disabled>",
      "<input readonly>",
      "<input type=hidden>",
      "<input type=button>",
      "<input type=reset>",
      "<input type=submit>",
      "<input type=image>",
      "<input type=checkbox readonly>",
      "<button>",
      "<button type=button>",
      "<button type=reset>",
      "<select>",
      "<textarea>",
      "<textarea readonly>",
      "<output>",
      "<fieldset>",
      "<object>",
      "<datalist><input id=x></datalist>",
    ],
    (w, html) => {
      const root = make(w, html);
      const el = root.localName === "datalist" ? root.firstElementChild : root;
      return el.willValidate;
    },
  );
});

describe("valueMissing — https://html.spec.whatwg.org/#suffering-from-being-missing", () => {
  differentialEach(
    (html) => `required ${html}`,
    [
      "<input required>",
      "<input required value=x>",
      "<input required readonly>",
      "<input required disabled>",
      "<input type=checkbox required>",
      "<input type=checkbox required checked>",
      "<input type=file required>",
      "<input type=number required value=abc>",
      "<input type=email required value='  '>",
      "<input type=date required>",
      "<input type=range required>",
      "<input type=color required>",
      "<input type=hidden required>",
      "<textarea required></textarea>",
      "<textarea required>x</textarea>",
      "<select required><option value=''>pick<option>a</select>",
      "<select required><option>a</select>",
      "<select required multiple><option>a</select>",
      "<select required size=2><option value=''>a</select>",
      "<select required><option value='' disabled>pick<option>a</select>",
    ],
    (w, html) => report(make(w, html)),
  );

  differential("required radio group: missing for every radio until one is checked", (w) => {
    w.document.body.innerHTML =
      "<form><input type=radio name=g id=a required><input type=radio name=g id=b><input type=radio name=h id=c></form>";
    const ids = ["a", "b", "c"];
    const before = ids.map((id) => w.document.getElementById(id).validity.valueMissing);
    w.document.getElementById("b").checked = true;
    const after = ids.map((id) => w.document.getElementById(id).validity.valueMissing);
    return { before, after };
  });
});

describe("type mismatch, pattern, ranges and steps — https://html.spec.whatwg.org/#validity-states", () => {
  differentialEach(
    (c) => `${c.html} with value ${JSON.stringify(c.value)}`,
    [
      { html: "<input type=email>", value: "foo" },
      { html: "<input type=email>", value: "a@b" },
      { html: "<input type=email>", value: "a@b.c" },
      { html: "<input type=email>", value: "a b@c.d" },
      { html: "<input type=email>", value: "a@-b.c" },
      { html: "<input type=email>", value: "ünicode@b.c" },
      { html: "<input type=email multiple>", value: "a@b.c,x" },
      { html: "<input type=email multiple>", value: "a@b.c, d@e.f" },
      { html: "<input type=url>", value: "foo" },
      { html: "<input type=url>", value: "http://x" },
      { html: "<input type=url>", value: "mailto:a@b.c" },
      { html: "<input type=url>", value: "//relative" },
      { html: "<input pattern='[0-9]+'>", value: "12a" },
      { html: "<input pattern='[0-9]+'>", value: "123" },
      { html: "<input pattern='[0-9]+'>", value: "" },
      { html: "<input pattern='a|b'>", value: "ab" },
      { html: "<input pattern='[a-z]'>", value: "A" },
      { html: "<input pattern='(invalid'>", value: "x" },
      { html: "<input pattern='[\\p{L}]+'>", value: "héllo" },
      { html: "<input pattern='[a-z--[aeiou]]+'>", value: "bcd" },
      { html: "<input type=email multiple pattern='.+@x\\.com'>", value: "a@x.com,b@y.com" },
      { html: "<input type=number max=3>", value: "5" },
      { html: "<input type=number min=10>", value: "5" },
      { html: "<input type=number step=2>", value: "3" },
      { html: "<input type=number step=2 min=1>", value: "3" },
      { html: "<input type=number step=any>", value: "3.14159" },
      { html: "<input type=number step=0.1>", value: "0.3" },
      { html: "<input type=number step=0.01>", value: "1.005" },
      { html: "<input type=number min=5 max=1>", value: "3" },
      { html: "<input type=date min=2024-01-10>", value: "2024-01-01" },
      { html: "<input type=date step=7>", value: "1970-01-03" },
      { html: "<input type=time min=09:00 max=17:00>", value: "18:00" },
      { html: "<input type=time min=22:00 max=02:00>", value: "23:00" },
      { html: "<input type=month max=2024-01>", value: "2024-02" },
      { html: "<input type=range min=0 max=10>", value: "50" },
      { html: "<input maxlength=2>", value: "abcd" },
      { html: "<input minlength=5>", value: "ab" },
      { html: "<textarea maxlength=2></textarea>", value: "abcd" },
    ],
    (w, c) => {
      const el = make(w, c.html);
      el.value = c.value;
      return report(el);
    },
  );
});

describe("custom validity and the API — https://html.spec.whatwg.org/#the-constraint-validation-api", () => {
  differential("setCustomValidity sets customError and validationMessage; '' clears it", (w) => {
    const el = make(w, "<input>");
    el.setCustomValidity("Nope");
    const set = { ...validityFlags(el), message: el.validationMessage };
    el.setCustomValidity("");
    return { set, cleared: { ...validityFlags(el), message: el.validationMessage } };
  });

  differential("custom validity on a barred element: validity reflects it but willValidate is false", (w) => {
    const el = make(w, "<input disabled>");
    el.setCustomValidity("x");
    return {
      willValidate: el.willValidate,
      customError: el.validity.customError,
      message: el.validationMessage,
      check: el.checkValidity(),
    };
  });

  differential("checkValidity fires a cancelable, non-bubbling invalid event", (w) => {
    w.document.body.innerHTML = "<form id=f><input required id=i></form>";
    const i = w.document.getElementById("i");
    const seen: unknown[] = [];
    i.addEventListener("invalid", (e: AnyWindow) =>
      seen.push({ bubbles: e.bubbles, cancelable: e.cancelable, trusted: e.isTrusted, type: e.type }),
    );
    let formSaw = 0;
    w.document.getElementById("f").addEventListener("invalid", () => formSaw++);
    const result = i.checkValidity();
    return { result, seen, formSaw };
  });

  differential("form.checkValidity fires invalid on each invalid control in tree order", (w) => {
    w.document.body.innerHTML =
      "<form id=f><input required id=a><input id=b><textarea required id=c></textarea><select required id=d><option value=''>x</select></form>";
    const log = recordEvents(w.document, ["invalid"]);
    const result = w.document.getElementById("f").checkValidity();
    return { result, log };
  });

  differential("reportValidity behaves like checkValidity without UI", (w) => {
    w.document.body.innerHTML = "<form id=f><input required id=a></form>";
    const log = recordEvents(w.document, ["invalid"]);
    return {
      input: w.document.getElementById("a").reportValidity(),
      form: w.document.getElementById("f").reportValidity(),
      log,
    };
  });

  differential("validity is a live object of type ValidityState", (w) => {
    const el = make(w, "<input required>");
    const v = el.validity;
    const before = v.valueMissing;
    el.value = "x";
    return { before, after: v.valueMissing, same: v === el.validity, tag: Object.prototype.toString.call(v) };
  });

  differential("output, fieldset and object never validate", (w) => {
    w.document.body.innerHTML = "<output id=o></output><fieldset id=f></fieldset><object id=ob></object>";
    return ["o", "f", "ob"].map((id) => {
      const el = w.document.getElementById(id);
      el.setCustomValidity?.("x");
      return { id, willValidate: el.willValidate, check: el.checkValidity(), custom: el.validity.customError };
    });
  });

  differential("submit button with custom validity makes the form invalid", (w) => {
    w.document.body.innerHTML = "<form id=f><button id=b>go</button></form>";
    w.document.getElementById("b").setCustomValidity("bad");
    return w.document.getElementById("f").checkValidity();
  });
});
