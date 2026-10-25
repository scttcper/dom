/**
 * <select>, <option>, <optgroup>, HTMLOptionsCollection and the selectedness setting
 * algorithm — differential against jsdom.
 *
 * Spec: HTML Standard
 *   - the select element:                 https://html.spec.whatwg.org/#the-select-element
 *   - selectedness setting algorithm:     https://html.spec.whatwg.org/#selectedness-setting-algorithm
 *   - display size:                       https://html.spec.whatwg.org/#concept-select-size
 *   - HTMLOptionsCollection:              https://html.spec.whatwg.org/#the-htmloptionscollection-interface
 *   - the option element:                 https://html.spec.whatwg.org/#the-option-element
 *   - option text / label / value:        https://html.spec.whatwg.org/#dom-option-text
 *   - Option() legacy factory function:   https://html.spec.whatwg.org/#dom-option
 *   - reset algorithm for select:         https://html.spec.whatwg.org/#the-select-element:concept-form-reset-control
 *
 * user-event `selectOptions`, Testing Library `getByDisplayValue`/`getByRole('option', {selected})`
 * and jest-dom `toHaveValue`/`toHaveDisplayValue` depend on these.
 */
import { describe } from "vitest";
import { differential, type AnyWindow } from "../../src/harness.ts";

function state(select: AnyWindow) {
  return {
    selectedIndex: select.selectedIndex,
    value: select.value,
    selected: Array.from(select.options as ArrayLike<AnyWindow>).map((o) => o.selected),
    selectedOptions: select.selectedOptions.length,
    length: select.length,
  };
}

function sel(w: AnyWindow, html: string): AnyWindow {
  w.document.body.innerHTML = html;
  return w.document.querySelector("select");
}

describe("selectedness setting algorithm — https://html.spec.whatwg.org/#selectedness-setting-algorithm", () => {
  const markup: Array<[string, string]> = [
    ["first option selected by default", "<select><option>a<option>b</select>"],
    ["selected attribute wins", "<select><option>a<option selected>b</select>"],
    ["two selected attributes in a single select: last wins", "<select><option selected>a<option selected>b</select>"],
    ["disabled first option is skipped for the default", "<select><option disabled>a<option>b</select>"],
    ["all options disabled: none selected", "<select><option disabled>a<option disabled>b</select>"],
    ["multiple: no default selection", "<select multiple><option>a<option>b</select>"],
    [
      "multiple: several selected attributes",
      "<select multiple><option selected>a<option selected>b<option>c</select>",
    ],
    ["size>1: no default selection (display size)", "<select size=3><option>a<option>b</select>"],
    ["size=1 explicit behaves like default", "<select size=1><option>a<option>b</select>"],
    ["size=0 treated as default display size", "<select size=0><option>a<option>b</select>"],
    ["empty select", "<select></select>"],
    ["optgroup options participate", "<select><optgroup label=g><option>a<option>b</optgroup></select>"],
    [
      "options in a disabled optgroup are skipped for the default",
      "<select><optgroup disabled><option>a</optgroup><option>b</select>",
    ],
    ["option value attribute vs text", "<select><option value=x>Label X<option>  Plain   text  </select>"],
  ];
  for (const [name, html] of markup) {
    differential(name, (w) => state(sel(w, html)));
  }

  differential("removing the selected option selects the first remaining option", (w) => {
    const s = sel(w, "<select><option>a<option selected>b<option>c</select>");
    s.options[1].remove();
    return state(s);
  });

  differential("appending an option to an empty select selects it", (w) => {
    const s = sel(w, "<select></select>");
    const o = w.document.createElement("option");
    o.textContent = "new";
    s.appendChild(o);
    return state(s);
  });

  differential("appending a selected option deselects the current one (single)", (w) => {
    const s = sel(w, "<select><option>a<option>b</select>");
    const o = w.document.createElement("option");
    o.setAttribute("selected", "");
    o.textContent = "c";
    s.appendChild(o);
    return state(s);
  });

  differential("setting multiple to false keeps only one selection", (w) => {
    const s = sel(w, "<select multiple><option selected>a<option selected>b</select>");
    s.multiple = false;
    return state(s);
  });

  differential("option.selected = false on the only selected option of a single select", (w) => {
    const s = sel(w, "<select><option>a<option>b</select>");
    s.options[0].selected = false;
    return state(s);
  });
});

describe("select IDL attributes — https://html.spec.whatwg.org/#the-select-element", () => {
  differential(
    "value setter selects the first option with that value",
    (w) => {
      const s = sel(w, "<select><option>a<option value=b>B<option value=b>B2</select>");
      s.value = "b";
      return state(s);
    },
    {
      jsdomFix: {
        fix: (o: { selected: boolean[]; selectedOptions: number }) => ({
          ...o,
          selected: [false, true, false],
          selectedOptions: 1,
        }),
        spec: "https://html.spec.whatwg.org/#dom-select-value (deselect all, then select the FIRST option whose value matches)",
        reason: "jsdom selects every matching option in a single select",
      },
    },
  );

  differential("value setter with no match deselects everything", (w) => {
    const s = sel(w, "<select><option>a<option>b</select>");
    s.value = "zzz";
    return state(s);
  });

  differential("selectedIndex setter, out of range, and -1", (w) => {
    const s = sel(w, "<select><option>a<option>b</select>");
    s.selectedIndex = 1;
    const one = state(s);
    s.selectedIndex = 7;
    const seven = state(s);
    s.selectedIndex = -1;
    return { one, seven, minusOne: state(s) };
  });

  differential("multiple: option.selected toggles independently", (w) => {
    const s = sel(w, "<select multiple><option>a<option>b<option>c</select>");
    s.options[0].selected = true;
    s.options[2].selected = true;
    return { ...state(s), selectedOptions: Array.from(s.selectedOptions as ArrayLike<AnyWindow>).map((o) => o.value) };
  });

  differential("multiple: value setter selects only matching options", (w) => {
    const s = sel(w, "<select multiple><option selected>a<option selected>b<option>c</select>");
    s.value = "c";
    return state(s);
  });

  differential("type, length, item(), namedItem(), indexed access", (w) => {
    const s = sel(w, "<select><option id=x>a<option name=y>b</select>");
    const multiple = w.document.createElement("select");
    multiple.multiple = true;
    return {
      type: s.type,
      multipleType: multiple.type,
      length: s.length,
      item1: s.item(1),
      namedX: s.namedItem("x"),
      namedY: s.namedItem("y"),
      index0: s[0],
      outOfRange: s[5],
    };
  });

  differential("selectedOptions is live", (w) => {
    const s = sel(w, "<select multiple><option>a<option>b</select>");
    const live = s.selectedOptions;
    const before = live.length;
    s.options[1].selected = true;
    return { before, after: live.length, same: live === s.selectedOptions };
  });

  differential("required + placeholder label option → valueMissing", (w) => {
    const s = sel(w, '<select required><option value="">Choose…<option>a</select>');
    const missing = s.validity.valueMissing;
    s.selectedIndex = 1;
    return { missing, afterChoice: s.validity.valueMissing };
  });
});

describe("HTMLOptionsCollection — https://html.spec.whatwg.org/#the-htmloptionscollection-interface", () => {
  differential("add(option), add(option, index), add(option, beforeElement)", (w) => {
    const s = sel(w, "<select><option>a</select>");
    const mk = (t: string) => {
      const o = w.document.createElement("option");
      o.text = t;
      return o;
    };
    s.add(mk("end"));
    s.add(mk("first"), 0);
    s.add(mk("beforeEnd"), s.options[2]);
    s.options.add(mk("viaOptions"), null);
    return Array.from(s.options as ArrayLike<AnyWindow>).map((o) => o.text);
  });

  differential("remove(index), remove() of out-of-range index is a no-op", (w) => {
    const s = sel(w, "<select><option>a<option>b<option>c</select>");
    s.remove(1);
    s.remove(10);
    s.options.remove(-1);
    return Array.from(s.options as ArrayLike<AnyWindow>).map((o) => o.text);
  });

  differential("length setter truncates and pads with empty options", (w) => {
    const s = sel(w, "<select><option>a<option>b<option>c</select>");
    s.options.length = 1;
    const truncated = s.options.length;
    s.length = 3;
    return { truncated, padded: Array.from(s.options as ArrayLike<AnyWindow>).map((o) => [o.text, o.value]) };
  });

  differential("indexed setter: options[i] = option replaces / appends; = null removes", (w) => {
    const s = sel(w, "<select><option>a<option>b</select>");
    const o = w.document.createElement("option");
    o.text = "z";
    s.options[1] = o;
    const o2 = w.document.createElement("option");
    o2.text = "far";
    s.options[4] = o2;
    const afterSet = Array.from(s.options as ArrayLike<AnyWindow>).map((x) => x.text);
    s.options[0] = null;
    return { afterSet, afterNull: Array.from(s.options as ArrayLike<AnyWindow>).map((x) => x.text) };
  });

  differential("options.selectedIndex mirrors select.selectedIndex", (w) => {
    const s = sel(w, "<select><option>a<option>b</select>");
    s.options.selectedIndex = 1;
    return [s.selectedIndex, s.options.selectedIndex];
  });

  differential("add() of an ancestor throws HierarchyRequestError", (w) => {
    const s = sel(w, "<select><optgroup><option>a</optgroup></select>");
    s.add(s);
    return "no throw";
  });
});

describe("the option element — https://html.spec.whatwg.org/#the-option-element", () => {
  differential("text strips and collapses ASCII whitespace; label and value fall back to text", (w) => {
    const s = sel(
      w,
      "<select><option>  a \n\t b  </option><option label=L value=V>t</option><option label=''>x</option></select>",
    );
    return Array.from(s.options as ArrayLike<AnyWindow>).map((o) => ({
      text: o.text,
      label: o.label,
      value: o.value,
      textContent: o.textContent,
    }));
  });

  differential("text excludes script descendants", (w) => {
    const s = sel(w, "<select><option>a<script>bad</script>b</option></select>");
    return s.options[0].text;
  });

  differential("text setter replaces children", (w) => {
    const s = sel(w, "<select><option><b>x</b></option></select>");
    s.options[0].text = "new";
    return s.options[0].innerHTML;
  });

  differential("index, form, disabled (own and via optgroup)", (w) => {
    w.document.body.innerHTML =
      "<form id=f><select><option id=a>a<optgroup disabled><option id=b>b</optgroup><option id=c disabled>c</select></form><option id=d>loose</option>";
    const ids = ["a", "b", "c", "d"];
    return ids.map((id) => {
      const o = w.document.getElementById(id);
      return { id, index: o.index, form: o.form, disabled: o.disabled, matchesDisabled: o.matches(":disabled") };
    });
  });

  differential("defaultSelected reflects selected; dirtiness stops attribute tracking", (w) => {
    const s = sel(w, "<select multiple><option>a<option>b</select>");
    const a = s.options[0];
    a.defaultSelected = true;
    const viaAttr = a.selected;
    a.selected = false;
    a.setAttribute("selected", "");
    return { viaAttr, afterDirty: a.selected, defaultSelected: a.defaultSelected };
  });

  differentialOption();

  differential("an option outside any select keeps its own selectedness", (w) => {
    const o = w.document.createElement("option");
    const before = o.selected;
    o.selected = true;
    return { before, after: o.selected, index: o.index };
  });
});

function differentialOption() {
  differential("Option(text, value, defaultSelected, selected) legacy factory", (w) => {
    const a = new w.Option();
    const b = new w.Option("Text", "val", true, false);
    const c = new w.Option("T2", undefined, false, true);
    return [a, b, c].map((o: AnyWindow) => ({
      text: o.text,
      value: o.value,
      defaultSelected: o.defaultSelected,
      selected: o.selected,
      localName: o.localName,
      isOption: o instanceof w.HTMLOptionElement,
    }));
  });
}

describe("reset algorithm — https://html.spec.whatwg.org/#the-select-element:concept-form-reset-control", () => {
  differential("form.reset() restores defaultSelected state", (w) => {
    w.document.body.innerHTML = "<form><select><option>a<option selected>b<option>c</select></form>";
    const s = w.document.querySelector("select");
    s.selectedIndex = 2;
    w.document.querySelector("form").reset();
    return state(s);
  });

  differential("form.reset() with no defaultSelected selects the first option", (w) => {
    w.document.body.innerHTML = "<form><select><option>a<option>b</select></form>";
    const s = w.document.querySelector("select");
    s.selectedIndex = 1;
    w.document.querySelector("form").reset();
    return state(s);
  });

  differential("form.reset() on a multiple select restores each option", (w) => {
    w.document.body.innerHTML = "<form><select multiple><option selected>a<option>b<option selected>c</select></form>";
    const s = w.document.querySelector("select");
    s.value = "b";
    w.document.querySelector("form").reset();
    return state(s);
  });
});
