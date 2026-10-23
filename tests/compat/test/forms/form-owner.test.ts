/**
 * Form owners, form-associated element collections, labels and fieldset disabling —
 * differential against jsdom.
 *
 * Spec: HTML Standard
 *   - form owner / reset the form owner:   https://html.spec.whatwg.org/#form-owner
 *   - categories (listed, labelable, ...): https://html.spec.whatwg.org/#categories
 *   - form.elements / HTMLFormControlsCollection: https://html.spec.whatwg.org/#dom-form-elements
 *   - RadioNodeList:                       https://html.spec.whatwg.org/#radionodelist
 *   - form named properties (past names map): https://html.spec.whatwg.org/#the-form-element:supported-property-names
 *   - fieldset disabled / elements:        https://html.spec.whatwg.org/#the-fieldset-element
 *   - concept "actually disabled":         https://html.spec.whatwg.org/#concept-fe-disabled
 *   - label control / labels:              https://html.spec.whatwg.org/#the-label-element
 *   - document.forms:                      https://html.spec.whatwg.org/#dom-document-forms
 *
 * Testing Library's `getByLabelText`, jest-dom's `toHaveFormValues` and `toBeDisabled`, and
 * React form libraries all rely on these associations.
 */
import { describe } from "vitest";
import { differential, describeNode, type AnyWindow } from "../../src/harness.ts";

const list = (c: AnyWindow) => Array.from(c as ArrayLike<AnyWindow>).map(describeNode);

describe("form owner — https://html.spec.whatwg.org/#form-owner", () => {
  differential("ancestor form, form attribute, missing/non-form targets", (w) => {
    w.document.body.innerHTML = `
      <form id=f1><input id=a><input id=b form=f2><input id=c form=nope><input id=d form=div1></form>
      <form id=f2></form><div id=div1></div><input id=e form=f1><input id=f>`;
    return ["a", "b", "c", "d", "e", "f"].map((id) => [id, w.document.getElementById(id).form]);
  });

  differential("changing the form attribute and the target form's id re-resets the owner", (w) => {
    w.document.body.innerHTML = "<form id=f1></form><form id=f2></form><input id=i form=f1>";
    const i = w.document.getElementById("i");
    const first = i.form;
    i.setAttribute("form", "f2");
    const second = i.form;
    w.document.getElementById("f2").id = "renamed";
    const third = i.form;
    w.document.getElementById("f1").id = "f2";
    return { first, second, third, fourth: i.form };
  });

  differential("removing / moving a control resets its form owner", (w) => {
    w.document.body.innerHTML = "<form id=f1><input id=i></form><form id=f2></form>";
    const i = w.document.getElementById("i");
    i.remove();
    const detached = i.form;
    w.document.getElementById("f2").appendChild(i);
    return { detached, moved: i.form };
  });

  differential("nested forms built via the DOM: nearest ancestor form wins", (w) => {
    const outer = w.document.createElement("form");
    outer.id = "outer";
    const inner = w.document.createElement("form");
    inner.id = "inner";
    const input = w.document.createElement("input");
    inner.appendChild(input);
    outer.appendChild(inner);
    w.document.body.appendChild(outer);
    return { owner: input.form, innerLength: inner.elements.length, outerLength: outer.elements.length };
  });

  differential("form getter for every form-associated element type", (w) => {
    w.document.body.innerHTML =
      "<form id=f><button id=e1></button><fieldset id=e2></fieldset><input id=e3><object id=e4></object><output id=e5></output><select id=e6></select><textarea id=e7></textarea><img id=e8><label id=e9 for=e3></label><legend id=e10></legend></form>";
    return Array.from({ length: 10 }, (_, i) => {
      const el = w.document.getElementById(`e${i + 1}`);
      return [el.localName, el.form];
    });
  });
});

describe("form.elements — https://html.spec.whatwg.org/#dom-form-elements", () => {
  differential("listed elements in tree order, excluding image inputs, including form= associated", (w) => {
    w.document.body.innerHTML = `
      <input id=before form=f>
      <form id=f><input id=a><input type=image id=img><button id=b></button><fieldset id=fs><select id=s></select></fieldset><object id=o></object><output id=out></output><textarea id=t></textarea><img id=im name=pic><label id=l>x</label></form>
      <input id=after form=f>`;
    const f = w.document.getElementById("f");
    return { elements: list(f.elements), length: f.length, fsElements: list(w.document.getElementById("fs").elements) };
  });

  differential("namedItem: id/name lookup, RadioNodeList for duplicates", (w) => {
    w.document.body.innerHTML = `<form id=f>
      <input name=user id=u>
      <input type=radio name=color value=red>
      <input type=radio name=color value=blue checked>
      <input id=color2 name=other>
    </form>`;
    const f = w.document.getElementById("f");
    const color = f.elements.namedItem("color");
    return {
      user: f.elements.namedItem("user"),
      byId: f.elements.namedItem("u"),
      colorIsRadioNodeList: Object.prototype.toString.call(color),
      colorLength: color.length,
      colorValue: color.value,
      missing: f.elements.namedItem("nope"),
      named: f.elements.user,
    };
  });

  differential("RadioNodeList.value setter checks the radio with that value", (w) => {
    w.document.body.innerHTML = `<form id=f>
      <input type=radio name=c value=a id=ra>
      <input type=radio name=c id=rb>
    </form>`;
    const rnl = w.document.getElementById("f").elements.namedItem("c");
    rnl.value = "on";
    const on = [w.document.getElementById("ra").checked, w.document.getElementById("rb").checked];
    rnl.value = "a";
    return { on, a: [w.document.getElementById("ra").checked, w.document.getElementById("rb").checked], value: rnl.value };
  });

  differential("form element named properties and the past names map", (w) => {
    w.document.body.innerHTML = '<form id=f><input name=email id=e><img name=logo id=i></form>';
    const f = w.document.getElementById("f");
    const email = f.email;
    const logo = f.logo;
    const indexed = f[0];
    w.document.getElementById("e").name = "renamed";
    return { email, logo, indexed, afterRename: f.email, renamed: f.renamed, length: f.length };
  }, {
    // Node descriptions are taken after the scenario returns, so the input shows its final name.
    jsdomDeviation: {
      expected: {
        email: "<input#e[name=renamed]>",
        logo: "<img#i[name=logo]>",
        indexed: "<input#e[name=renamed]>",
        afterRename: "<input#e[name=renamed]>",
        renamed: "<input#e[name=renamed]>",
        length: 1,
      },
      spec: "https://html.spec.whatwg.org/#the-form-element:supported-property-names (named getter + past names map)",
      reason: "jsdom does not implement HTMLFormElement's named property getter; React onSubmit handlers commonly read `event.currentTarget.email.value`",
    },
  });

  differential("document.forms collection", (w) => {
    w.document.body.innerHTML = "<form id=a name=first></form><div><form id=b></form></div>";
    return { length: w.document.forms.length, first: w.document.forms.first, b: w.document.forms.namedItem("b"), zero: w.document.forms[0] };
  });
});

describe("disabled state — https://html.spec.whatwg.org/#concept-fe-disabled", () => {
  differential("fieldset disabled propagates except into its first legend", (w) => {
    w.document.body.innerHTML = `
      <fieldset disabled id=fs>
        <legend><input id=inLegend><button id=legendButton></button></legend>
        <legend><input id=inSecondLegend></legend>
        <input id=plain><select id=s></select><textarea id=t></textarea><button id=b></button>
        <fieldset id=inner><input id=nested></fieldset>
        <output id=o></output><object id=obj></object>
      </fieldset>`;
    const ids = ["inLegend", "legendButton", "inSecondLegend", "plain", "s", "t", "b", "inner", "nested", "o", "obj"];
    return ids.map((id) => {
      const el = w.document.getElementById(id);
      return { id, disabledIdl: el.disabled ?? null, matches: el.matches(":disabled"), willValidate: el.willValidate ?? null };
    });
  });

  differential("toggling fieldset.disabled updates descendants", (w) => {
    w.document.body.innerHTML = "<fieldset id=fs><input id=i></fieldset>";
    const fs = w.document.getElementById("fs");
    const i = w.document.getElementById("i");
    const before = i.matches(":disabled");
    fs.disabled = true;
    const after = i.matches(":disabled");
    fs.disabled = false;
    return { before, after, again: i.matches(":disabled") };
  });

  differential("fieldset.type, name, form, validity", (w) => {
    w.document.body.innerHTML = "<form id=f><fieldset name=n id=fs><input required></fieldset></form>";
    const fs = w.document.getElementById("fs");
    return { type: fs.type, name: fs.name, form: fs.form, willValidate: fs.willValidate, checkValidity: fs.checkValidity(), valid: fs.validity.valid };
  });
});

describe("labels — https://html.spec.whatwg.org/#the-label-element", () => {
  differential("label.control via for= and via first labelable descendant", (w) => {
    w.document.body.innerHTML = `
      <label id=l1 for=a>A</label><input id=a>
      <label id=l2>B <span><input id=b></span><input id=b2></label>
      <label id=l3 for=missing>C</label>
      <label id=l4 for=d>D</label><div id=d></div>
      <label id=l5 for=h>H</label><input type=hidden id=h>
      <label id=l6><input type=hidden id=h2><select id=s></select></label>
      <label id=l7 for=m>M</label><meter id=m></meter>
      <label id=l8 for=o>O</label><output id=o></output>
      <label id=l9 for=p>P</label><progress id=p></progress>
      <label id=l10 for=bt>Bt</label><button id=bt></button>`;
    return Array.from({ length: 10 }, (_, i) => {
      const l = w.document.getElementById(`l${i + 1}`);
      return [l.id, l.control];
    });
  });

  differential("input.labels in tree order, including wrapping and for= labels", (w) => {
    w.document.body.innerHTML = `
      <label id=l0 for=x>first</label>
      <label id=l1>wrap <input id=x></label>
      <label id=l2 for=x>third</label>
      <label id=l3 for=x><input id=y></label>`;
    const x = w.document.getElementById("x");
    const y = w.document.getElementById("y");
    return { x: list(x.labels), y: list(y.labels), hidden: (() => {
      const h = w.document.createElement("input");
      h.type = "hidden";
      return h.labels;
    })() };
  });

  differential("labels is live and the same object", (w) => {
    w.document.body.innerHTML = "<input id=x>";
    const x = w.document.getElementById("x");
    const labels = x.labels;
    const before = labels.length;
    const l = w.document.createElement("label");
    l.htmlFor = "x";
    w.document.body.appendChild(l);
    return { before, after: labels.length, same: labels === x.labels };
  });

  differential("label.form is the control's form owner", (w) => {
    w.document.body.innerHTML = "<form id=f><input id=i></form><label id=l for=i>x</label><label id=l2>none</label>";
    return [w.document.getElementById("l").form, w.document.getElementById("l2").form];
  });

  differential("labels for every labelable element type", (w) => {
    w.document.body.innerHTML = `
      <label>a <button id=e1></button></label><label>b <input id=e2></label><label>c <meter id=e3></meter></label>
      <label>d <output id=e4></output></label><label>e <progress id=e5></progress></label><label>f <select id=e6></select></label>
      <label>g <textarea id=e7></textarea></label><label>h <fieldset id=e8></fieldset></label>`;
    return Array.from({ length: 8 }, (_, i) => {
      const el = w.document.getElementById(`e${i + 1}`);
      return [el.localName, el.labels ? el.labels.length : "no labels property"];
    });
  });
});
