/**
 * Checkbox/radio checkedness, the dirty checkedness flag, indeterminate, and radio button
 * groups — differential against jsdom.
 *
 * Spec: HTML Standard §4.10.5
 *   - checkedness / dirty checkedness flag: https://html.spec.whatwg.org/#concept-input-checked-dirty-flag
 *   - checked content attribute:            https://html.spec.whatwg.org/#attr-input-checked
 *   - indeterminate IDL attribute:          https://html.spec.whatwg.org/#dom-input-indeterminate
 *   - radio button group:                   https://html.spec.whatwg.org/#radio-button-group
 *   - radio checkedness phenomena:          https://html.spec.whatwg.org/#radio-button-state-(type=radio)
 *   - cloning steps:                        https://html.spec.whatwg.org/#the-input-element:concept-node-clone-ext
 *
 * jest-dom `toBeChecked`, Testing Library `getByRole('checkbox', {checked})` and React's
 * controlled checkboxes/radios observe all of this.
 */
import { describe } from "vitest";
import { differential, type AnyWindow } from "../../src/harness.ts";

const radios = (w: AnyWindow) =>
  Array.from(w.document.querySelectorAll("input[type=radio]") as ArrayLike<AnyWindow>).map(
    (r) => `${r.id}:${r.checked}`,
  );

describe("checked content attribute and dirty checkedness — https://html.spec.whatwg.org/#concept-input-checked-dirty-flag", () => {
  differential("checked attribute sets initial checkedness; defaultChecked reflects it", (w) => {
    w.document.body.innerHTML = "<input type=checkbox id=a checked><input type=checkbox id=b>";
    const a = w.document.getElementById("a");
    const b = w.document.getElementById("b");
    return { a: [a.checked, a.defaultChecked], b: [b.checked, b.defaultChecked] };
  });

  differential("adding/removing the checked attribute changes checkedness while not dirty", (w) => {
    const el = w.document.createElement("input");
    el.type = "checkbox";
    el.setAttribute("checked", "");
    const added = el.checked;
    el.removeAttribute("checked");
    return { added, removed: el.checked };
  });

  differential("after .checked is set, the attribute no longer affects checkedness", (w) => {
    const el = w.document.createElement("input");
    el.type = "checkbox";
    el.checked = false;
    el.setAttribute("checked", "");
    const afterAdd = el.checked;
    el.checked = true;
    el.removeAttribute("checked");
    return { afterAdd, afterRemove: el.checked, attr: el.hasAttribute("checked") };
  });

  differential("defaultChecked setter writes the attribute (and checkedness while clean)", (w) => {
    const el = w.document.createElement("input");
    el.type = "checkbox";
    el.defaultChecked = true;
    return { checked: el.checked, attr: el.getAttribute("checked") };
  });

  differential("cloneNode copies checkedness and the dirty flag", (w) => {
    const el = w.document.createElement("input");
    el.type = "checkbox";
    el.checked = true;
    const clone = el.cloneNode();
    clone.setAttribute("checked", "");
    clone.removeAttribute("checked");
    return { cloneChecked: clone.checked };
  });

  differential("checkedness survives a type change to text and back", (w) => {
    const el = w.document.createElement("input");
    el.type = "checkbox";
    el.checked = true;
    el.type = "text";
    const asText = el.checked;
    el.type = "checkbox";
    return { asText, back: el.checked };
  });

  differential(".checked on a text input is settable and readable (checkedness exists for all inputs)", (w) => {
    const el = w.document.createElement("input");
    el.checked = true;
    return el.checked;
  });
});

describe("indeterminate — https://html.spec.whatwg.org/#dom-input-indeterminate", () => {
  differential("indeterminate is independent of checkedness and not reflected", (w) => {
    const el = w.document.createElement("input");
    el.type = "checkbox";
    el.indeterminate = true;
    return { indeterminate: el.indeterminate, checked: el.checked, attrs: el.getAttributeNames() };
  });

  differential("click() clears indeterminate (legacy-pre-activation behavior)", (w) => {
    const el = w.document.createElement("input");
    el.type = "checkbox";
    w.document.body.appendChild(el);
    el.indeterminate = true;
    el.click();
    return { indeterminate: el.indeterminate, checked: el.checked };
  });

  differential("canceled click restores indeterminate and checkedness", (w) => {
    const el = w.document.createElement("input");
    el.type = "checkbox";
    w.document.body.appendChild(el);
    el.indeterminate = true;
    el.addEventListener("click", (e: AnyWindow) => e.preventDefault());
    el.click();
    return { indeterminate: el.indeterminate, checked: el.checked };
  });
});

describe("radio button groups — https://html.spec.whatwg.org/#radio-button-group", () => {
  differential("checking one radio unchecks the others in the same form and name", (w) => {
    w.document.body.innerHTML =
      "<form><input type=radio name=g id=a checked><input type=radio name=g id=b><input type=radio name=h id=c checked></form>";
    w.document.getElementById("b").checked = true;
    return radios(w);
  });

  differential("radios with the same name in different forms are independent", (w) => {
    w.document.body.innerHTML =
      "<form><input type=radio name=g id=a checked></form><form><input type=radio name=g id=b></form>";
    w.document.getElementById("b").checked = true;
    return radios(w);
  });

  differential("a radio in a form and one outside any form with the same name are different groups", (w) => {
    w.document.body.innerHTML = "<form><input type=radio name=g id=a checked></form><input type=radio name=g id=b>";
    w.document.getElementById("b").checked = true;
    return radios(w);
  });

  differential("form-less radios in the same tree with the same name form a group", (w) => {
    w.document.body.innerHTML =
      "<div><input type=radio name=g id=a checked></div><p><input type=radio name=g id=b></p>";
    w.document.getElementById("b").checked = true;
    return radios(w);
  });

  differential("names are compared case-sensitively", (w) => {
    w.document.body.innerHTML = "<input type=radio name=g id=a checked><input type=radio name=G id=b>";
    w.document.getElementById("b").checked = true;
    return radios(w);
  });

  differential("radios without a name are never grouped", (w) => {
    w.document.body.innerHTML = "<input type=radio id=a checked><input type=radio id=b>";
    w.document.getElementById("b").checked = true;
    return radios(w);
  });

  differential("form attribute association determines the group", (w) => {
    w.document.body.innerHTML =
      "<form id=f><input type=radio name=g id=a checked></form><input type=radio name=g id=b form=f>";
    w.document.getElementById("b").checked = true;
    return radios(w);
  });

  differential("parsing two checked radios of one group leaves only the last checked", (w) => {
    w.document.body.innerHTML = "<input type=radio name=g id=a checked><input type=radio name=g id=b checked>";
    return radios(w);
  });

  differential("inserting a checked radio into a group unchecks the existing checked one (becomes connected)", (w) => {
    w.document.body.innerHTML = "<input type=radio name=g id=a checked>";
    const b = w.document.createElement("input");
    b.type = "radio";
    b.name = "g";
    b.id = "b";
    b.checked = true;
    w.document.body.appendChild(b);
    return radios(w);
  });

  differential("setting name to join a group unchecks the others if the joining radio is checked", (w) => {
    w.document.body.innerHTML = "<input type=radio name=g id=a checked><input type=radio name=other id=b checked>";
    w.document.getElementById("b").name = "g";
    return radios(w);
  });

  differential("changing type to radio while checked unchecks the group", (w) => {
    w.document.body.innerHTML = "<input type=radio name=g id=a checked><input type=checkbox name=g id=b checked>";
    w.document.getElementById("b").type = "radio";
    return radios(w);
  });

  differential("detached radios in the same detached subtree are grouped", (w) => {
    const div = w.document.createElement("div");
    div.innerHTML = "<input type=radio name=g id=a checked><input type=radio name=g id=b>";
    div.lastChild.checked = true;
    return Array.from(div.children as ArrayLike<AnyWindow>).map((r) => `${r.id}:${r.checked}`);
  });

  differential("a detached radio is not grouped with connected radios", (w) => {
    w.document.body.innerHTML = "<input type=radio name=g id=a checked>";
    const b = w.document.createElement("input");
    b.type = "radio";
    b.name = "g";
    b.checked = true;
    return { a: w.document.getElementById("a").checked, b: b.checked };
  });

  differential("setting checked=false never checks another radio", (w) => {
    w.document.body.innerHTML = "<input type=radio name=g id=a checked><input type=radio name=g id=b>";
    w.document.getElementById("a").checked = false;
    return radios(w);
  });

  differential("moving a checked radio into another form unchecks that form's group", (w) => {
    w.document.body.innerHTML =
      "<form id=f1><input type=radio name=g id=a checked></form><form id=f2><input type=radio name=g id=b checked></form>";
    w.document.getElementById("f2").appendChild(w.document.getElementById("a"));
    return radios(w);
  });
});
