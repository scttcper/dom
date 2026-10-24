/**
 * The form element's API and the algorithms around it (reset, submission guards, the entry list
 * guard, the default button), listed/submittable categories, label/legend/fieldset form owners,
 * and select/option/datalist details — differential against jsdom.
 *
 * Spec: HTML Standard §4.10 Forms
 *   - categories:                https://html.spec.whatwg.org/#form-associated-element, https://html.spec.whatwg.org/#category-listed,
 *                                https://html.spec.whatwg.org/#category-submit
 *   - form IDL:                  https://html.spec.whatwg.org/#dom-form-length, https://html.spec.whatwg.org/#dom-form-nameditem,
 *                                https://html.spec.whatwg.org/#past-names-map, https://html.spec.whatwg.org/#dom-form-checkvalidity,
 *                                https://html.spec.whatwg.org/#dom-form-reportvalidity, https://html.spec.whatwg.org/#dom-form-reset,
 *                                https://html.spec.whatwg.org/#dom-form-submit
 *   - reset / submit guards:     https://html.spec.whatwg.org/#locked-for-reset, https://html.spec.whatwg.org/#firing-submission-events,
 *                                https://html.spec.whatwg.org/#constructing-entry-list
 *   - submit buttons:            https://html.spec.whatwg.org/#concept-submit-button, https://html.spec.whatwg.org/#default-button,
 *                                https://html.spec.whatwg.org/#attr-fs-method, https://html.spec.whatwg.org/#attr-fs-enctype
 *   - constraint validation:     https://html.spec.whatwg.org/#check-validity-steps, https://html.spec.whatwg.org/#interactively-validate-the-constraints,
 *                                https://html.spec.whatwg.org/#dom-cva-validity, https://html.spec.whatwg.org/#dom-cva-validationmessage
 *   - form owners:               https://html.spec.whatwg.org/#dom-fae-form, https://html.spec.whatwg.org/#dom-label-form,
 *                                https://html.spec.whatwg.org/#dom-legend-form, https://html.spec.whatwg.org/#the-legend-element,
 *                                https://html.spec.whatwg.org/#dom-label-control, https://html.spec.whatwg.org/#labeled-control
 *   - collections:               https://html.spec.whatwg.org/#dom-htmlformcontrolscollection-nameditem,
 *                                https://html.spec.whatwg.org/#dom-radionodelist-value
 *   - select:                    https://html.spec.whatwg.org/#dom-select-type, https://html.spec.whatwg.org/#dom-select-options,
 *                                https://html.spec.whatwg.org/#dom-select-item, https://html.spec.whatwg.org/#dom-select-nameditem,
 *                                https://html.spec.whatwg.org/#dom-select-add, https://html.spec.whatwg.org/#concept-select-option-list,
 *                                https://html.spec.whatwg.org/#the-select-element:selectedness-setting-algorithm
 *   - HTMLOptionsCollection:     https://html.spec.whatwg.org/#dom-htmloptionscollection-length,
 *                                https://html.spec.whatwg.org/#dom-htmloptionscollection-selectedindex,
 *                                https://html.spec.whatwg.org/#dom-htmloptionscollection-setter
 *   - option:                    https://html.spec.whatwg.org/#dom-option-value, https://html.spec.whatwg.org/#concept-option-disabled,
 *                                https://html.spec.whatwg.org/#option-element-nearest-ancestor-select,
 *                                https://html.spec.whatwg.org/#the-option-element:concept-element-attributes-change-ext,
 *                                https://html.spec.whatwg.org/#the-option-element:concept-node-clone-ext
 *   - datalist:                  https://html.spec.whatwg.org/#dom-datalist-options, https://html.spec.whatwg.org/#dom-input-list
 *   - textarea:                  https://html.spec.whatwg.org/#dom-textarea-defaultvalue, https://html.spec.whatwg.org/#concept-textarea-dirty,
 *                                https://html.spec.whatwg.org/#concept-fe-api-value
 *   - input reset:               https://html.spec.whatwg.org/#the-input-element:concept-form-reset-control,
 *                                https://html.spec.whatwg.org/#the-input-element:concept-input-checked-dirty-flag-2
 */
import { describe } from "vitest";
import { describeNode, differential, type AnyWindow } from "../../src/harness.ts";

const names = (list: ArrayLike<AnyWindow>) => Array.from(list, describeNode);

describe("categories — https://html.spec.whatwg.org/#form-associated-element", () => {
  differential("listed elements are in form.elements (image inputs excluded); submittable ones feed FormData (https://html.spec.whatwg.org/#category-listed, https://html.spec.whatwg.org/#category-submit)", (w) => {
    w.document.body.innerHTML = `<form id=f><fieldset id=fs name=fs></fieldset><object id=o name=o></object><output id=out name=out>x</output>
      <input id=i name=i value=1><input id=img type=image name=img><button id=b name=b value=2>b</button><select id=s name=s><option>3</option></select>
      <textarea id=t name=t>4</textarea><img id=pic name=pic></form>`;
    const f = w.document.getElementById("f");
    return { elements: names(f.elements), length: f.length, entries: [...new w.FormData(f).keys()] };
  });

  differential("every form-associated element exposes .form (https://html.spec.whatwg.org/#dom-fae-form)", (w) => {
    w.document.body.innerHTML = `<form id=f></form><input form=f id=a><output form=f id=b></output><fieldset form=f id=c></fieldset><object form=f id=d></object><img id=e>`;
    return ["a", "b", "c", "d"].map((id) => describeNode(w.document.getElementById(id).form)).concat(String("form" in w.document.getElementById("e")));
  });
});

describe("form IDL — https://html.spec.whatwg.org/#dom-form-length", () => {
  differential("length counts form.elements and indexed access follows it", (w) => {
    w.document.body.innerHTML = `<form id=f><input id=a><input type=image id=img><select id=s></select></form><input form=f id=b>`;
    const f = w.document.getElementById("f");
    return [f.length, describeNode(f[0]), describeNode(f[1]), describeNode(f[2]), describeNode(f[3])];
  });

  differential("named getter returns one element, a RadioNodeList for several, and the past names map after a rename (https://html.spec.whatwg.org/#dom-form-nameditem, https://html.spec.whatwg.org/#past-names-map)", (w) => {
    w.document.body.innerHTML = `<form id=f><input name=x id=a><input name=y id=b><input name=y id=c><img name=pic id=p></form>`;
    const f = w.document.getElementById("f");
    const before = { x: describeNode(f.x), y: f.y.constructor.name, yLen: f.y.length, pic: describeNode(f.pic) };
    const a = f.x;
    a.name = "renamed";
    return { before, oldName: describeNode(f.x), sameObject: f.x === a, renamed: describeNode(f.renamed) };
  }, {
    jsdomDeviation: {
      expected: { before: { x: "input#a[name=x]", y: "RadioNodeList", yLen: 2, pic: "img#p[name=pic]" }, oldName: "input#a[name=renamed]", sameObject: true, renamed: "input#a[name=renamed]" },
      spec: "https://html.spec.whatwg.org/#dom-form-nameditem (steps 2-5: one node, else a RadioNodeList; past names map entries)",
      reason: "jsdom returns undefined for a name shared by several controls",
    },
  });

  differential("checkValidity / reportValidity fire invalid at each invalid control, return false, and do not submit (https://html.spec.whatwg.org/#dom-form-checkvalidity, https://html.spec.whatwg.org/#dom-form-reportvalidity)", (w) => {
    w.document.body.innerHTML = `<form id=f><input id=a required><input id=b><select id=s required><option value="">-</option></select></form>`;
    const f = w.document.getElementById("f");
    const log: string[] = [];
    f.addEventListener("invalid", (e: AnyWindow) => log.push(`invalid@${describeNode(e.target)} bubbles=${e.bubbles} cancelable=${e.cancelable}`), true);
    f.addEventListener("submit", () => log.push("submit"));
    return [f.checkValidity(), f.reportValidity(), log];
  });

  differential("reset() restores controls and fires reset; submit() fires neither submit nor invalid (https://html.spec.whatwg.org/#dom-form-reset, https://html.spec.whatwg.org/#dom-form-submit)", (w) => {
    w.document.body.innerHTML = `<form id=f><input id=a value=v required><input id=c type=checkbox checked></form>`;
    const f = w.document.getElementById("f");
    const log: string[] = [];
    for (const t of ["reset", "submit", "invalid"]) f.addEventListener(t, () => log.push(t), true);
    const a = w.document.getElementById("a");
    const c = w.document.getElementById("c");
    a.value = "changed";
    c.checked = false;
    f.reset();
    a.value = "";
    f.submit();
    return { log, value: a.value, checked: c.checked };
  });
});

describe("reset and submission guards — https://html.spec.whatwg.org/#locked-for-reset, https://html.spec.whatwg.org/#firing-submission-events", () => {
  differential("reset() from a reset listener is ignored while the form is locked for reset", (w) => {
    w.document.body.innerHTML = `<form id=f><input id=a value=v></form>`;
    const f = w.document.getElementById("f");
    let resets = 0;
    f.addEventListener("reset", () => {
      resets++;
      f.reset();
    });
    f.reset();
    return resets;
  }, {
    jsdomDeviation: {
      expected: 1,
      spec: "https://html.spec.whatwg.org/#concept-form-reset (step 1: return if form is locked for reset)",
      reason: "jsdom has no locked-for-reset flag and recurses until the stack overflows",
    },
  });

  differential("requestSubmit() from a submit listener is ignored while firing submission events", (w) => {
    w.document.body.innerHTML = `<form id=f></form>`;
    const f = w.document.getElementById("f");
    let submits = 0;
    f.addEventListener("submit", (e: AnyWindow) => {
      submits++;
      f.requestSubmit();
      e.preventDefault();
    });
    f.requestSubmit();
    return submits;
  }, {
    jsdomDeviation: {
      expected: 1,
      spec: "https://html.spec.whatwg.org/#concept-form-submit (step 5.1: return if firing submission events is true)",
      reason: "jsdom has no firing-submission-events flag and recurses until the stack overflows",
    },
  });

  differential("new FormData(form) from a formdata listener throws InvalidStateError (https://html.spec.whatwg.org/#constructing-entry-list)", (w) => {
    w.document.body.innerHTML = `<form id=f><input name=a value=1></form>`;
    const f = w.document.getElementById("f");
    let inner = "";
    f.addEventListener("formdata", () => {
      try {
        new w.FormData(f);
        inner = "ok";
      } catch (e) {
        inner = (e as Error).name;
      }
    });
    return [[...new w.FormData(f).entries()], inner];
  }, {
    jsdomDeviation: {
      expected: [[["a", "1"]], "InvalidStateError"],
      spec: "https://xhr.spec.whatwg.org/#dom-formdata (a null entry list throws InvalidStateError; https://html.spec.whatwg.org/#constructing-entry-list)",
      reason: "jsdom does not run formdata listeners for an entry list constructed by new FormData(form)",
    },
  });
});

describe("submit buttons — https://html.spec.whatwg.org/#concept-submit-button, https://html.spec.whatwg.org/#default-button", () => {
  differential("the default button is the first submit button in tree order whose form owner is the form", (w) => {
    w.document.body.innerHTML = `<form id=f><button type=button id=b0>0</button><input type=reset id=r><input type=image id=img><button id=b1>1</button></form><button form=f id=out>o</button>`;
    return [w.document.querySelector(":default")?.id, names(w.document.querySelectorAll("#f :default, #out:default"))];
  });

  differential("formMethod / formEnctype reflect with missing value '' and invalid value 'get' / urlencoded (https://html.spec.whatwg.org/#attr-fs-method, https://html.spec.whatwg.org/#attr-fs-enctype)", (w) => {
    const b = w.document.createElement("button");
    const before = [b.formMethod, b.formEnctype];
    b.setAttribute("formmethod", "POST");
    b.setAttribute("formenctype", "TEXT/PLAIN");
    const set = [b.formMethod, b.formEnctype];
    b.setAttribute("formmethod", "put");
    b.setAttribute("formenctype", "bogus");
    const f = w.document.createElement("form");
    return { before, set, invalid: [b.formMethod, b.formEnctype], form: [f.method, f.enctype, f.encoding] };
  }, {
    jsdomDeviation: {
      expected: { before: ["", ""], set: ["post", "text/plain"], invalid: ["get", "application/x-www-form-urlencoded"], form: ["get", "application/x-www-form-urlencoded", "application/x-www-form-urlencoded"] },
      spec: "https://html.spec.whatwg.org/#attr-fs-method (formmethod: no missing value default, invalid value default GET; https://html.spec.whatwg.org/#dom-fs-encoding)",
      reason: "jsdom 30 has no formMethod/formEnctype/encoding (window/compat.ts lists them)",
    },
  });
});

describe("constraint validation API — https://html.spec.whatwg.org/#check-validity-steps", () => {
  differential("checkValidity fires a cancelable non-bubbling invalid event and returns false for an invalid candidate", (w) => {
    w.document.body.innerHTML = `<input id=a required>`;
    const a = w.document.getElementById("a");
    const log: string[] = [];
    a.addEventListener("invalid", (e: AnyWindow) => log.push(`${e.bubbles}/${e.cancelable}/${e.isTrusted}`));
    return [a.checkValidity(), log];
  });

  differential("validity is the same live object; validationMessage is '' when barred or valid (https://html.spec.whatwg.org/#dom-cva-validity, https://html.spec.whatwg.org/#dom-cva-validationmessage)", (w) => {
    w.document.body.innerHTML = `<input id=a required><input id=b required disabled>`;
    const a = w.document.getElementById("a");
    const b = w.document.getElementById("b");
    const v = a.validity;
    const before = v.valueMissing;
    a.value = "x";
    return { same: a.validity === v, before, after: v.valueMissing, okMessage: a.validationMessage, barredMessage: b.validationMessage, barredMissing: b.validity.valueMissing };
  });

  differential("requestSubmit on an invalid form: invalid events, no submit, focus stays (https://html.spec.whatwg.org/#interactively-validate-the-constraints)", (w) => {
    w.document.body.innerHTML = `<form id=f><input id=a required><button id=go>go</button></form>`;
    const f = w.document.getElementById("f");
    const go = w.document.getElementById("go");
    go.focus();
    const log: string[] = [];
    f.addEventListener("invalid", (e: AnyWindow) => log.push(`invalid@${describeNode(e.target)}`), true);
    f.addEventListener("submit", () => log.push("submit"));
    f.requestSubmit(go);
    return { log, active: describeNode(w.document.activeElement) };
  });
});

describe("form owners of labels and legends — https://html.spec.whatwg.org/#dom-label-form, https://html.spec.whatwg.org/#dom-legend-form", () => {
  differential("label.form is its labeled control's form owner; legend.form is its fieldset's (https://html.spec.whatwg.org/#the-legend-element)", (w) => {
    w.document.body.innerHTML = `<form id=f1><fieldset id=fs><legend id=lg>l</legend></fieldset></form><form id=f2></form>
      <label id=l1 for=c>x</label><input id=c form=f2><label id=l2>y</label><legend id=loose>z</legend><fieldset form=f2><legend id=lg2>q</legend></fieldset>`;
    const $ = (id: string) => w.document.getElementById(id);
    return ["lg", "l1", "l2", "loose", "lg2"].map((id) => describeNode($(id).form));
  });

  differential("label.control: for= must point at a labelable element; otherwise the first labelable descendant (https://html.spec.whatwg.org/#dom-label-control, https://html.spec.whatwg.org/#labeled-control)", (w) => {
    w.document.body.innerHTML = `<label id=a for=d>a</label><div id=d></div><label id=b><span><meter id=m></meter></span><input id=i></label>
      <label id=c for=h>c</label><input type=hidden id=h><label id=e>e<input type=hidden id=h2><output id=o></output></label>`;
    const $ = (id: string) => w.document.getElementById(id);
    return ["a", "b", "c", "e"].map((id) => describeNode($(id).control));
  });
});

describe("form controls collection — https://html.spec.whatwg.org/#dom-htmlformcontrolscollection-nameditem", () => {
  differential("namedItem by id or name; RadioNodeList.value reads the checked radio and checks by value (https://html.spec.whatwg.org/#dom-radionodelist-value)", (w) => {
    w.document.body.innerHTML = `<form id=f><input type=radio name=r value=a><input type=radio name=r value=b checked><input type=radio name=r id=noval><input id=x></form>`;
    const els = w.document.getElementById("f").elements;
    const r = els.namedItem("r");
    const before = r.value;
    r.value = "a";
    const afterA = [...r].map((e: AnyWindow) => e.checked);
    r.value = "on";
    return { before, afterA, afterOn: [...r].map((e: AnyWindow) => e.checked), x: describeNode(els.namedItem("x")), missing: els.namedItem("nope") };
  });
});

describe("select — https://html.spec.whatwg.org/#dom-select-type", () => {
  differential("type, options, item(), namedItem() and add() with a before element/index (https://html.spec.whatwg.org/#dom-select-options, https://html.spec.whatwg.org/#dom-select-item, https://html.spec.whatwg.org/#dom-select-nameditem, https://html.spec.whatwg.org/#dom-select-add)", (w) => {
    w.document.body.innerHTML = `<select id=s><option id=a>A</option><optgroup><option name=bn id=b>B</option></optgroup></select><select id=m multiple></select>`;
    const s = w.document.getElementById("s");
    const c = w.document.createElement("option");
    c.id = "c";
    s.add(c, 1);
    const d = w.document.createElement("option");
    d.id = "d";
    s.add(d, w.document.getElementById("a"));
    return {
      types: [s.type, w.document.getElementById("m").type],
      options: names(s.options),
      sameOptions: s.options === s.options,
      item: describeNode(s.item(1)),
      named: describeNode(s.namedItem("bn")),
      outOfRange: s.item(99),
    };
  });

  differential("the list of options: option children and options in optgroup children only (https://html.spec.whatwg.org/#concept-select-option-list)", (w) => {
    w.document.body.innerHTML = `<select id=s><option id=a>A</option><optgroup><option id=b>B</option><optgroup><option id=deep>D</option></optgroup></optgroup><hr><option id=c>C</option></select>`;
    return names(w.document.getElementById("s").options);
  });

  differential("selectedness setting algorithm on insertion/removal (https://html.spec.whatwg.org/#the-select-element:selectedness-setting-algorithm)", (w) => {
    w.document.body.innerHTML = `<select id=s><option id=a>A</option><option id=b selected>B</option></select>`;
    const s = w.document.getElementById("s");
    const out: unknown[] = [s.selectedIndex];
    w.document.getElementById("b").remove();
    out.push(s.selectedIndex);
    const opt = w.document.createElement("option");
    opt.selected = true;
    s.appendChild(opt);
    out.push(s.selectedIndex);
    s.textContent = "";
    out.push(s.selectedIndex, s.value);
    return out;
  });
});

describe("HTMLOptionsCollection — https://html.spec.whatwg.org/#dom-htmloptionscollection-length", () => {
  differential("length setter pads with new options and truncates; selectedIndex mirrors the select (https://html.spec.whatwg.org/#dom-htmloptionscollection-selectedindex)", (w) => {
    w.document.body.innerHTML = `<select id=s><option>A</option></select>`;
    const s = w.document.getElementById("s");
    s.options.length = 3;
    const padded = [s.options.length, s.options[2].outerHTML];
    s.options.selectedIndex = 2;
    const sel = [s.selectedIndex, s.options.selectedIndex];
    s.options.length = 1;
    return { padded, sel, after: [s.options.length, s.selectedIndex] };
  });

  differential("indexed setter replaces, appends with padding, and null removes (https://html.spec.whatwg.org/#dom-htmloptionscollection-setter)", (w) => {
    w.document.body.innerHTML = `<select id=s><option id=a>A</option><option id=b>B</option></select>`;
    const s = w.document.getElementById("s");
    const mk = (id: string) => Object.assign(w.document.createElement("option"), { id });
    s.options[0] = mk("x");
    s.options[4] = mk("y");
    const grown = s.options.length;
    s.options[1] = null;
    return { grown, after: names(s.options) };
  });
});

describe("option — https://html.spec.whatwg.org/#dom-option-value", () => {
  differential("value falls back to the stripped and collapsed text; label falls back to text", (w) => {
    w.document.body.innerHTML = `<select><option id=a>  x   y </option><option id=b value=" v ">t</option><option id=c label="L">t</option></select>`;
    const $ = (id: string) => w.document.getElementById(id);
    return ["a", "b", "c"].map((id) => [$(id).value, $(id).label, $(id).text]);
  });

  differential("disabled via its own attribute or a disabled optgroup parent only (https://html.spec.whatwg.org/#concept-option-disabled)", (w) => {
    w.document.body.innerHTML = `<select><optgroup disabled><option id=a>a</option></optgroup><option id=b disabled>b</option><option id=c>c</option></select><select disabled><option id=d>d</option></select>`;
    return names(w.document.querySelectorAll("option:disabled"));
  });

  differential("selected content attribute changes selectedness until the option is dirty (https://html.spec.whatwg.org/#the-option-element:concept-element-attributes-change-ext)", (w) => {
    w.document.body.innerHTML = `<select multiple id=s><option id=a>a</option></select>`;
    const a = w.document.getElementById("a");
    a.setAttribute("selected", "");
    const one = a.selected;
    a.removeAttribute("selected");
    const two = a.selected;
    a.selected = true;
    a.removeAttribute("selected");
    return [one, two, a.selected];
  });

  differential("cloning copies selectedness and dirtiness (https://html.spec.whatwg.org/#the-option-element:concept-node-clone-ext)", (w) => {
    const o = w.document.createElement("option");
    o.selected = true;
    const c = o.cloneNode();
    c.setAttribute("selected", "");
    c.removeAttribute("selected");
    return [c.selected, c.defaultSelected];
  }, {
    jsdomDeviation: {
      expected: [true, false],
      spec: "https://html.spec.whatwg.org/#the-option-element:concept-node-clone-ext (copy selectedness and dirtiness)",
      reason: "jsdom does not copy selectedness or dirtiness when cloning an option",
    },
  });

  differential("form and index come from the nearest ancestor select / datalist (https://html.spec.whatwg.org/#option-element-nearest-ancestor-select)", (w) => {
    w.document.body.innerHTML = `<form id=f><select><optgroup><option id=a>a</option></optgroup><option id=b>b</option></select><datalist><option id=c>c</option></datalist></form><option id=d>d</option>`;
    const $ = (id: string) => w.document.getElementById(id);
    return ["a", "b", "c", "d"].map((id) => [describeNode($(id).form), $(id).index]);
  }, {
    jsdomDeviation: {
      expected: [["form#f", 0], ["form#f", 1], ["null", 0], ["null", 0]],
      spec: "https://html.spec.whatwg.org/#dom-option-form (the option element nearest ancestor select's form owner, else null; https://html.spec.whatwg.org/#option-element-nearest-ancestor-select)",
      reason: "jsdom returns the form owner of an option inside a datalist",
    },
  });
});

describe("datalist — https://html.spec.whatwg.org/#dom-datalist-options", () => {
  differential("options are the option descendants (live); input.list resolves the datalist (https://html.spec.whatwg.org/#dom-input-list)", (w) => {
    w.document.body.innerHTML = `<input id=i list=dl><datalist id=dl><option value=a></option><div><option value=b></option></div></datalist>`;
    const dl = w.document.getElementById("dl");
    const opts = dl.options;
    dl.appendChild(w.document.createElement("option"));
    return { len: opts.length, list: describeNode(w.document.getElementById("i").list), hiddenType: (w.document.getElementById("i").type = "hidden", describeNode(w.document.getElementById("i").list)) };
  });

  differential("options inside a datalist are barred from constraint validation and never submitted", (w) => {
    w.document.body.innerHTML = `<form id=f><datalist><input id=x name=x required></datalist></form>`;
    const x = w.document.getElementById("x");
    return [x.willValidate, [...new w.FormData(w.document.getElementById("f")).keys()]];
  });
});

describe("textarea — https://html.spec.whatwg.org/#dom-textarea-defaultvalue", () => {
  differential("defaultValue is the child text; value follows it until the dirty flag is set (https://html.spec.whatwg.org/#concept-textarea-dirty, https://html.spec.whatwg.org/#concept-fe-api-value)", (w) => {
    w.document.body.innerHTML = `<textarea id=t>a\r\nb</textarea>`;
    const t = w.document.getElementById("t");
    const out: unknown[] = [t.defaultValue, t.value];
    t.appendChild(w.document.createTextNode("c"));
    out.push(t.value);
    t.value = "x\ry";
    t.defaultValue = "z";
    out.push(t.value, t.defaultValue, t.textLength);
    return out;
  });
});

describe("input reset — https://html.spec.whatwg.org/#the-input-element:concept-form-reset-control", () => {
  differential("reset clears the dirty value and dirty checkedness flags, then follows the attributes again (https://html.spec.whatwg.org/#the-input-element:concept-input-checked-dirty-flag-2)", (w) => {
    w.document.body.innerHTML = `<form id=f><input id=t value=a><input id=c type=checkbox></form>`;
    const t = w.document.getElementById("t");
    const c = w.document.getElementById("c");
    t.value = "typed";
    c.checked = true;
    w.document.getElementById("f").reset();
    const after = [t.value, c.checked];
    t.setAttribute("value", "b");
    c.setAttribute("checked", "");
    return [after, t.value, c.checked];
  });
});
