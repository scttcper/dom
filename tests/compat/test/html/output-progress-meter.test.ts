/**
 * <output>, <progress> and <meter> — differential against jsdom.
 *
 * Spec: HTML Standard §4.10.12–14
 *   - the output element:                 https://html.spec.whatwg.org/#the-output-element
 *   - output default value override:      https://html.spec.whatwg.org/#concept-output-default-value-override
 *   - output value / defaultValue:        https://html.spec.whatwg.org/#dom-output-value
 *                                         https://html.spec.whatwg.org/#dom-output-defaultvalue
 *   - output reset algorithm:             https://html.spec.whatwg.org/#the-output-element:concept-form-reset-control
 *   - the progress element:               https://html.spec.whatwg.org/#the-progress-element
 *   - progress value / max / position:    https://html.spec.whatwg.org/#dom-progress-value
 *                                         https://html.spec.whatwg.org/#dom-progress-max
 *                                         https://html.spec.whatwg.org/#dom-progress-position
 *   - the meter element:                  https://html.spec.whatwg.org/#the-meter-element
 *   - rules for parsing floating-point number values:
 *                                         https://html.spec.whatwg.org/#rules-for-parsing-floating-point-number-values
 *
 * Components render `<output>` for computed form values (React Aria's NumberField/Slider
 * outputs), `<progress>`/`<meter>` for ProgressBar/Meter; jest-dom `toHaveValue`,
 * `toHaveTextContent` and Testing Library's `getByRole("progressbar"|"meter")` read these.
 */
import { describe } from "vitest";
import { differential, type AnyWindow } from "../../src/harness.ts";

function output(w: AnyWindow, html: string): AnyWindow {
  w.document.body.innerHTML = html;
  return w.document.querySelector("output");
}

function outputState(o: AnyWindow) {
  return { value: o.value, defaultValue: o.defaultValue, text: o.textContent, children: o.childNodes.length };
}

describe("the output element — https://html.spec.whatwg.org/#the-output-element", () => {
  differential('type is "output"; value and defaultValue start as the descendant text content', (w) => {
    const o = output(w, "<output>a<b>b</b>c</output>");
    return { type: o.type, ...outputState(o) };
  });

  differential("value setter step 1: the default value override is set to the current default value", (w) => {
    const o = output(w, "<output>initial</output>");
    o.value = "changed";
    return outputState(o);
  });

  differential("value setter step 2: descendants are replaced by a single Text node", (w) => {
    const o = output(w, "<output><b>x</b><i>y</i></output>");
    o.value = "z";
    return { ...outputState(o), first: o.firstChild.nodeType };
  });

  differential("defaultValue setter: with no override, it replaces the descendant text content", (w) => {
    const o = output(w, "<output>initial</output>");
    o.defaultValue = "new default";
    return outputState(o);
  });

  differential("defaultValue setter: with an override, only the override changes", (w) => {
    const o = output(w, "<output>initial</output>");
    o.value = "shown";
    o.defaultValue = "new default";
    return outputState(o);
  });

  differential("reset algorithm: text content becomes the default value and the override is cleared", (w) => {
    const o = output(w, "<form><output>initial</output></form>");
    o.value = "shown";
    w.document.querySelector("form").reset();
    const afterReset = outputState(o);
    // With the override cleared, defaultValue tracks the text content again.
    o.textContent = "typed";
    return { afterReset, afterTextChange: outputState(o) };
  });

  differential("value setter stringifies its argument", (w) => {
    const o = output(w, "<output></output>");
    o.value = 42;
    const a = o.value;
    o.value = null;
    return { a, b: o.value };
  });

  differential("htmlFor is a DOMTokenList reflecting for; name reflects; form is the form owner", (w) => {
    const o = output(w, '<form id=f><input id=a><input id=b><output for="a b" name=total></output></form>');
    o.htmlFor.add("c");
    return {
      tokens: Array.from(o.htmlFor),
      forAttr: o.getAttribute("for"),
      name: o.name,
      form: o.form,
      formElements: w.document.forms[0].elements.length,
    };
  });

  differential("output is always barred from constraint validation; setCustomValidity still sets customError", (w) => {
    const o = output(w, "<form><output></output></form>");
    o.setCustomValidity("bad");
    return {
      willValidate: o.willValidate,
      valid: o.validity.valid,
      customError: o.validity.customError,
      checkValidity: o.checkValidity(),
      formValid: w.document.forms[0].checkValidity(),
      message: o.validationMessage,
    };
  });
});

function prog(w: AnyWindow, attrs: string): AnyWindow {
  w.document.body.innerHTML = `<progress ${attrs}></progress>`;
  const p = w.document.querySelector("progress");
  return { value: p.value, max: p.max, position: p.position };
}

describe("the progress element — https://html.spec.whatwg.org/#the-progress-element", () => {
  const cases: Array<[string, string]> = [
    ["no value: indeterminate (position -1), value 0, max 1", ""],
    ["value within the default max", 'value="0.25"'],
    ["value above max is clamped to max", 'value="5" max="2"'],
    ["negative value parses but the current value is 0", 'value="-3"'],
    ["unparsable value: current value 0, but still determinate", 'value="abc"'],
    ["max of zero or less falls back to 1", 'value="0.5" max="0"'],
    ["negative max falls back to 1", 'value="0.5" max="-4"'],
    ["unparsable max falls back to 1", 'value="0.5" max="x"'],
    ["floating-point parsing allows exponents and leading whitespace", 'value=" 2e1" max="40"'],
    ["floating-point parsing stops at trailing garbage", 'value="3px" max="6"'],
  ];
  for (const [name, attrs] of cases) differential(name, (w) => prog(w, attrs));

  differential("value and max setters write the best floating-point representation", (w) => {
    const p = w.document.createElement("progress");
    p.value = 0.5;
    p.max = 10;
    return { value: p.getAttribute("value"), max: p.getAttribute("max"), position: p.position };
  });

  differential("setting max to zero or a negative number is ignored", (w) => {
    const p = w.document.createElement("progress");
    p.max = 0;
    const a = p.getAttribute("max");
    p.max = -1;
    return { a, b: p.getAttribute("max"), max: p.max };
  });

  differential("non-finite values throw TypeError", (w) => {
    const p = w.document.createElement("progress");
    const errors: string[] = [];
    for (const v of [NaN, Infinity]) {
      try {
        p.value = v;
      } catch (e) {
        errors.push((e as Error).name);
      }
    }
    return errors;
  });

  differential("removing the value attribute makes it indeterminate again", (w) => {
    const p = w.document.createElement("progress");
    p.value = 0.3;
    const before = p.position;
    p.removeAttribute("value");
    return { before, after: p.position };
  });
});

function meter(w: AnyWindow, attrs: string): AnyWindow {
  w.document.body.innerHTML = `<meter ${attrs}></meter>`;
  const m = w.document.querySelector("meter");
  return { min: m.min, max: m.max, value: m.value, low: m.low, high: m.high, optimum: m.optimum };
}

describe("the meter element — https://html.spec.whatwg.org/#the-meter-element", () => {
  const cases: Array<[string, string]> = [
    ["defaults: min 0, max 1, value 0, low/high at the bounds, optimum at the midpoint", ""],
    ["max below min is raised to min", 'min="5" max="2"'],
    ["value below min is clamped to min", 'min="1" max="3" value="0"'],
    ["value above max is clamped to max", 'max="3" value="10"'],
    ["low below min is clamped to min, high above max to max", 'min="2" max="8" low="1" high="9"'],
    ["high below low is raised to low", 'max="10" low="6" high="4"'],
    ["low above max is clamped to max", 'max="10" low="20"'],
    ["optimum outside the range is clamped", 'min="0" max="10" optimum="-5"'],
    ["optimum above max is clamped to max", 'min="0" max="10" optimum="50"'],
    ["unparsable attributes use their defaults", 'min="a" max="b" value="c" low="d" high="e" optimum="f"'],
    ["value parsing ignores trailing garbage", 'max="100" value="42%"'],
  ];
  for (const [name, attrs] of cases) differential(name, (w) => meter(w, attrs));

  differential("setters write the best floating-point representation and reject non-finite values", (w) => {
    const m = w.document.createElement("meter");
    m.min = 1;
    m.max = 2.5;
    m.value = 2;
    m.low = 1.25;
    m.high = 2.25;
    m.optimum = 1.5;
    let threw = "";
    try {
      m.value = Infinity;
    } catch (e) {
      threw = (e as Error).name;
    }
    return { attrs: Array.from(m.attributes as ArrayLike<AnyWindow>).map((a) => `${a.name}=${a.value}`), threw };
  });
});

describe("labelable elements — https://html.spec.whatwg.org/#category-label", () => {
  differential("output, progress and meter are labelable: labels lists the associated labels", (w) => {
    w.document.body.innerHTML =
      "<label for=o>O</label><output id=o></output><label>P <progress></progress></label><label for=m>M</label><meter id=m></meter>";
    const d = w.document;
    return {
      output: d.querySelector("output").labels.length,
      progress: d.querySelector("progress").labels.length,
      meter: d.querySelector("meter").labels.length,
      controlOfFirstLabel: d.querySelector("label").control,
    };
  });
});
