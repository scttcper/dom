/**
 * Form-associated elements, the form element, submission, reset and FormData.
 *
 * Spec: HTML Standard §4.10.3 "The form element", §4.10.17 "Association of controls and forms",
 * §4.10.21 "Form submission", §4.10.22 "Resetting a form"; XHR Standard "FormData".
 *   form owner             https://html.spec.whatwg.org/#reset-the-form-owner
 *   form.elements          https://html.spec.whatwg.org/#dom-form-elements
 *   requestSubmit          https://html.spec.whatwg.org/#dom-form-requestsubmit
 *   submit algorithm       https://html.spec.whatwg.org/#concept-form-submit
 *   reset                  https://html.spec.whatwg.org/#concept-form-reset
 *   implicit submission    https://html.spec.whatwg.org/#implicit-submission
 *   entry list             https://html.spec.whatwg.org/#constructing-the-form-data-set
 *   FormData constructor   https://xhr.spec.whatwg.org/#dom-formdata
 *   labels                 https://html.spec.whatwg.org/#the-label-element
 *   form owner scope       https://html.spec.whatwg.org/#form-owner
 *   disabled               https://html.spec.whatwg.org/#concept-fe-disabled
 */
import { beforeEach, describe, expect, test, vi } from "vitest";
import { createWindow, type Document } from "@ctrl/dom";
import { implicitSubmission } from "../../../src/html/forms/index.ts";
import { isActuallyDisabled } from "../../../src/html/forms/form-associated.ts";
import { $impl } from "../../../src/keys.ts";

// biome-ignore lint: untyped DOM surface in tests
let window: any;
let document: Document;
// biome-ignore lint: untyped DOM surface in tests
const $ = (id: string): any => document.getElementById(id);

beforeEach(() => {
  window = createWindow();
  document = window.document;
});

describe("form owner — https://html.spec.whatwg.org/#reset-the-form-owner", () => {
  test("nearest ancestor form", () => {
    document.body!.innerHTML = "<form id=f><div><input id=i></div></form>";
    expect($("i").form).toBe($("f"));
  });

  test("the form attribute wins over ancestors when connected; a non-form target gives null", () => {
    document.body!.innerHTML = "<form id=f1><input id=i form=f2></form><form id=f2></form><div id=d></div>";
    expect($("i").form).toBe($("f2"));
    $("i").setAttribute("form", "d");
    expect($("i").form).toBeNull();
  });

  test("label.form is its control's form owner; legend.form is its fieldset's", () => {
    document.body!.innerHTML =
      "<form id=f><fieldset><legend id=l>x</legend><label id=lb>a <input id=i></label></fieldset></form>";
    expect($("lb").form).toBe($("f"));
    expect($("lb").control).toBe($("i"));
    expect($("l").form).toBe($("f"));
  });
});

describe("form.elements — https://html.spec.whatwg.org/#dom-form-elements", () => {
  test("listed elements in tree order, excluding image buttons, including form= associations", () => {
    document.body!.innerHTML =
      "<input id=before form=f><form id=f><input id=a name=a><input type=image id=img><fieldset id=fs></fieldset><output id=o></output><select id=s></select></form>";
    const ids = [...$("f").elements].map((e: any) => e.id);
    expect(ids).toEqual(["before", "a", "fs", "o", "s"]);
    expect($("f").length).toBe(5);
    expect($("f").elements[1]).toBe($("a"));
  });

  test("named access returns an element, or a RadioNodeList for several matches", () => {
    document.body!.innerHTML =
      "<form id=f><input name=user id=u><input type=radio name=r value=1><input type=radio name=r value=2 checked></form>";
    const els = $("f").elements;
    expect(els.user).toBe($("u"));
    expect(els.namedItem("user")).toBe($("u"));
    const list = els.r;
    expect(Object.prototype.toString.call(list)).toBe("[object RadioNodeList]");
    expect(list.length).toBe(2);
    expect(list.value).toBe("2");
    list.value = "1";
    expect(list[0].checked).toBe(true);
  });
});

// formControls walks only an ID-less form's subtree (formOwnerScope); each case checks
// form.elements against every listed element's own `.form`.
describe("form owner scope — https://html.spec.whatwg.org/#form-owner", () => {
  const LISTED = "input:not([type=image]), button, select, textarea, fieldset, output, object";
  const check = () => {
    const all = [...document.querySelectorAll(LISTED)] as any[];
    for (const form of document.querySelectorAll("form") as any)
      expect([...form.elements]).toEqual(all.filter((el) => el.form === form));
  };

  test("an ID-less form owns its descendants, but not those naming another form", () => {
    document.body!.innerHTML =
      "<input name=x><form><input name=a><div><select></select><input form=g></div></form>" +
      "<form id=g><button></button></form><input form=g><textarea></textarea>";
    check();
  });

  test("a form with an ID also owns controls naming it from outside, and loses them when the ID changes", () => {
    document.body!.innerHTML = "<input form=f id=out><form id=f><input></form><output form=f></output>";
    check();
    $("f").removeAttribute("id");
    check();
    expect($("out").form).toBeNull();
  });

  test("a control the parser associated from outside the form is listed", () => {
    // Document parsing only: fragment parsing never uses the form element pointer.
    window = createWindow({ html: "<div><form id=p></div><input id=after><input type=radio name=r id=r1>" });
    document = window.document;
    expect($("after").form).toBe($("p"));
    $("p").removeAttribute("id");
    check();
  });

  test("radio groups of an ID-less form stay within the form", () => {
    document.body!.innerHTML =
      "<form><input type=radio name=r id=a checked><input type=radio name=r id=b></form><input type=radio name=r id=c checked>";
    $("b").checked = true;
    expect([$("a").checked, $("b").checked, $("c").checked]).toEqual([false, true, true]);
    $("c").checked = true;
    expect([$("a").checked, $("b").checked, $("c").checked]).toEqual([false, true, true]);
  });

  test("a click inside a form reads no named property of the form", () => {
    document.body!.innerHTML = "<form><input name=a><span id=s>x</span></form>";
    const spy = vi.spyOn(window.HTMLFormElement.prototype, "_namedProperty");
    $("s").click();
    $("s").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("form named properties — https://html.spec.whatwg.org/#the-form-element:supported-property-names", () => {
  test("form.name and form[i] return controls; the past names map survives a rename", () => {
    document.body!.innerHTML =
      "<form id=f><input name=email id=e><img name=logo id=i><input type=radio name=r><input type=radio name=r></form>";
    const f = $("f");
    expect(f.email).toBe($("e"));
    expect(f.logo).toBe($("i"));
    expect(f[0]).toBe($("e"));
    expect(f.r.length).toBe(2);
    $("e").name = "renamed";
    expect(f.email).toBe($("e"));
    expect(f.renamed).toBe($("e"));
    expect("email" in f).toBe(true);
    expect(f.action).toBe(document.URL); // built-ins are never shadowed
  });

  test("the form wrapper is the same object everywhere", () => {
    document.body!.innerHTML = "<form id=f><input id=i></form>";
    expect($("i").form).toBe($("f"));
    expect(document.querySelector("form")).toBe($("f"));
  });

  // https://webidl.spec.whatwg.org/#legacy-platform-object-getownproperty step 2: a name is only
  // visible when neither the object nor its prototype chain has the property, whatever its value.
  test("an own or inherited property wins over a control of the same name, even when undefined", () => {
    document.body!.innerHTML = "<form id=f><input name=a><input name=inherited><input name=action></form>";
    const f = $("f");
    f.own = undefined; // an expando first (a visible name refuses [[Set]]), then a control takes the name
    f.elements[0].name = "own";
    window.HTMLFormElement.prototype.inherited = undefined;
    try {
      expect(f.own).toBeUndefined();
      expect(f.inherited).toBeUndefined();
      expect("inherited" in f).toBe(true);
      expect(Object.getOwnPropertyDescriptor(f, "inherited")).toBeUndefined();
      expect(f.action).toBe(document.URL);
      expect(f.elements.own).toBe(f.elements[0]); // the collection still sees them
    } finally {
      delete window.HTMLFormElement.prototype.inherited;
    }
  });

  // https://webidl.spec.whatwg.org/#legacy-platform-object-set: no indexed or named setter, so an
  // expando is an ordinary data property; a supported index or visible name refuses (jsdom and
  // browsers agree on the indexed half, jsdom has no named getter).
  test("[[Set]] creates and updates expandos (React's __reactFiber$/__reactProps$), refuses indices and visible names", () => {
    document.body!.innerHTML = "<form id=f><input name=email></form>";
    const f = $("f");
    f.__reactProps$ = { a: 1 };
    expect(Object.getOwnPropertyDescriptor(f, "__reactProps$")).toEqual({
      value: { a: 1 },
      writable: true,
      enumerable: true,
      configurable: true,
    });
    f.__reactProps$ = { a: 2 };
    expect(f.__reactProps$).toEqual({ a: 2 });
    expect(Reflect.set(f, "email", 1)).toBe(false);
    expect(() => {
      "use strict";
      f.email = 1;
    }).toThrow(TypeError);
    expect(f.email).toBe(f.elements[0]);
    expect(Reflect.set(f, "0", 1)).toBe(false);
    expect(Reflect.set(f, "99", 1)).toBe(false); // https://webidl.spec.whatwg.org/#legacy-platform-object-defineownproperty step 1
    expect(Object.hasOwn(f, "99")).toBe(false);
    expect(Reflect.defineProperty(f, "99", { value: 1, configurable: true })).toBe(false);
    expect(Reflect.defineProperty(f, "email", { value: 1, configurable: true })).toBe(false);
    expect(Reflect.deleteProperty(f, "email")).toBe(false);
    expect(Reflect.deleteProperty(f, "0")).toBe(false);
    expect(Reflect.deleteProperty(f, "99")).toBe(true);
    // An existing expando keeps winning once a control takes its name.
    f.k = 1;
    f.elements[0].name = "k";
    expect(Reflect.set(f, "k", 2)).toBe(true);
    expect(f.k).toBe(2);
    // Non-writable own data properties refuse; an inheriting object gets its own copy.
    Object.defineProperty(f, "ro", { value: 1, writable: false, configurable: true });
    expect(Reflect.set(f, "ro", 2)).toBe(false);
    const o = Object.create(f);
    o.z = 5;
    expect([Object.hasOwn(o, "z"), Object.hasOwn(f, "z")]).toEqual([true, false]);
    expect(Reflect.set(o, "0", 5)).toBe(false); // the index is a non-writable own descriptor of the form
    expect(Reflect.set(o, "5", 5)).toBe(true);
  });

  test("accessors run with the form (the proxy) as `this`, including spies on prototype getters", () => {
    document.body!.innerHTML = "<form id=f><input name=email></form>";
    const f = $("f");
    const seen: unknown[] = [];
    Object.defineProperty(f, "ownAcc", {
      get() {
        return this;
      },
      set(v: unknown) {
        seen.push(this, v);
      },
      configurable: true,
    });
    Object.defineProperty(window.HTMLFormElement.prototype, "protoAcc", {
      get() {
        return this;
      },
      set(v: unknown) {
        seen.push(this, v);
      },
      configurable: true,
    });
    const nodeName = vi.spyOn(window.Node.prototype, "nodeName", "get").mockImplementation(function (this: unknown) {
      return this === f ? "SPIED" : "WRONG THIS";
    });
    try {
      expect(f.ownAcc).toBe(f);
      expect(f.protoAcc).toBe(f);
      f.ownAcc = 1;
      f.protoAcc = 2;
      expect(seen).toEqual([f, 1, f, 2]);
      expect(f.nodeName).toBe("SPIED");
      expect(nodeName).toHaveBeenCalledTimes(1);
    } finally {
      nodeName.mockRestore();
      delete window.HTMLFormElement.prototype.protoAcc;
    }
    expect(f.nodeName).toBe("FORM");
  });
});

describe("disabled — https://html.spec.whatwg.org/#concept-fe-disabled", () => {
  test("a disabled fieldset disables descendants except inside its first legend", () => {
    document.body!.innerHTML =
      "<fieldset disabled><legend><input id=inlegend></legend><input id=a><legend><input id=second></legend></fieldset>";
    expect(isActuallyDisabled($("inlegend")[$impl])).toBe(false);
    expect(isActuallyDisabled($("a")[$impl])).toBe(true);
    expect(isActuallyDisabled($("second")[$impl])).toBe(true);
    expect($("a").matches(":disabled")).toBe(true);
  });

  test("options inside a disabled optgroup are disabled", () => {
    document.body!.innerHTML = "<select><optgroup disabled><option id=o>x</option></optgroup></select>";
    expect(isActuallyDisabled($("o")[$impl])).toBe(true);
  });
});

describe("requestSubmit / submit — https://html.spec.whatwg.org/#concept-form-submit", () => {
  test("requestSubmit() fires a bubbling, cancelable SubmitEvent with submitter null", () => {
    document.body!.innerHTML = "<form id=f></form>";
    const seen: any[] = [];
    document.addEventListener("submit", (e: any) =>
      seen.push([e.constructor.name, e.bubbles, e.cancelable, e.submitter]),
    );
    $("f").requestSubmit();
    expect(seen).toEqual([["SubmitEvent", true, true, null]]);
  });

  test("requestSubmit(button) passes the submitter; non-submit buttons throw TypeError, foreign ones NotFoundError", () => {
    document.body!.innerHTML =
      "<form id=f><button id=b>go</button><button id=n type=button></button></form><form id=g><button id=o></button></form>";
    let submitter: unknown;
    $("f").addEventListener("submit", (e: any) => (submitter = e.submitter));
    $("f").requestSubmit($("b"));
    expect(submitter).toBe($("b"));
    expect(() => $("f").requestSubmit($("n"))).toThrow(TypeError);
    expect(() => $("f").requestSubmit($("o"))).toThrow(expect.objectContaining({ name: "NotFoundError" }));
  });

  // Deviation (docs/deviations.md): "report the problems" moves no focus, like jsdom/happy-dom.
  test("an invalid form fires invalid events and no submit (focus stays put); novalidate skips validation", () => {
    document.body!.innerHTML = "<form id=f><input id=i required></form>";
    const events: string[] = [];
    $("i").addEventListener("invalid", () => events.push("invalid"));
    $("f").addEventListener("submit", () => events.push("submit"));
    $("f").requestSubmit();
    expect(events).toEqual(["invalid"]);
    expect($("i").matches(":focus")).toBe(false);
    $("f").noValidate = true;
    $("f").requestSubmit();
    expect(events).toEqual(["invalid", "submit"]);
  });

  // https://html.spec.whatwg.org/#statically-validate-the-constraints steps 3-6: the result is
  // negative whenever an invalid control exists; canceling `invalid` only keeps it out of the
  // "unhandled" list (no problem report). React Aria's useFormValidation cancels it.
  test("canceling every invalid event still blocks submission and checkValidity() stays false", () => {
    document.body!.innerHTML = "<form id=f><input id=i required></form>";
    const events: string[] = [];
    $("i").addEventListener("invalid", (e: Event) => (e.preventDefault(), events.push("invalid")));
    $("f").addEventListener("submit", () => events.push("submit"));
    $("f").requestSubmit();
    expect(events).toEqual(["invalid"]);
    expect($("i").matches(":focus")).toBe(false);
    expect($("f").checkValidity()).toBe(false);
    expect($("f").reportValidity()).toBe(false);
    expect(events).toEqual(["invalid", "invalid", "invalid"]);
  });

  test("submit() fires no events; disconnected forms never submit", () => {
    document.body!.innerHTML = "<form id=f><input required></form>";
    let n = 0;
    $("f").addEventListener("submit", () => n++);
    $("f").submit();
    const detached = document.createElement("form") as any;
    detached.addEventListener("submit", () => n++);
    detached.requestSubmit();
    expect(n).toBe(0);
  });

  test("implicit submission clicks the default button, or submits when only one field blocks", () => {
    document.body!.innerHTML =
      "<form id=f><input id=t><button id=b>go</button></form><form id=g><input></form><form id=h><input><input></form>";
    const log: string[] = [];
    $("b").addEventListener("click", () => log.push("click"));
    for (const id of ["f", "g", "h"])
      $(id).addEventListener("submit", (e: any) => (e.preventDefault(), log.push("submit:" + id)));
    implicitSubmission($("f")[$impl]);
    implicitSubmission($("g")[$impl]);
    implicitSubmission($("h")[$impl]);
    expect(log).toEqual(["click", "submit:f", "submit:g"]);
  });
});

describe("reset — https://html.spec.whatwg.org/#concept-form-reset", () => {
  test("reset() fires reset and runs every control's reset algorithm", () => {
    document.body!.innerHTML =
      "<form id=f><input id=t value=a><input id=c type=checkbox checked><textarea id=ta>x</textarea><select id=s><option>1<option selected>2</select><output id=o>d</output></form>";
    $("t").value = "b";
    $("c").checked = false;
    $("ta").value = "y";
    $("s").selectedIndex = 0;
    $("o").value = "v";
    let fired = 0;
    $("f").addEventListener("reset", () => fired++);
    $("f").reset();
    expect([fired, $("t").value, $("c").checked, $("ta").value, $("s").selectedIndex, $("o").value]).toEqual([
      1,
      "a",
      true,
      "x",
      1,
      "d",
    ]);
  });

  test("a canceled reset keeps the current values", () => {
    document.body!.innerHTML = "<form id=f><input id=t value=a></form>";
    $("t").value = "b";
    $("f").addEventListener("reset", (e: any) => e.preventDefault());
    $("f").reset();
    expect($("t").value).toBe("b");
  });
});

describe("FormData — https://html.spec.whatwg.org/#constructing-the-form-data-set", () => {
  test("constructs the entry list in tree order with the browser's skip rules", () => {
    document.body!.innerHTML = `<form id=f>
      <input name=t value=hello><input name="" value=skip><input value=noname>
      <input type=checkbox name=c1 checked><input type=checkbox name=c2>
      <input type=radio name=r value=x><input type=radio name=r value=y checked>
      <select name=s multiple><option selected>a<option>b<option selected disabled>c</select>
      <textarea name=ta>line1\nline2</textarea>
      <input name=dis disabled value=d><fieldset disabled><input name=fsd value=e></fieldset>
      <button name=btn value=v>b</button><input type=hidden name=_charset_ value=x>
    </form>`;
    const fd = new window.FormData($("f"));
    expect([...fd]).toEqual([
      ["t", "hello"],
      ["c1", "on"],
      ["r", "y"],
      ["s", "a"],
      ["ta", "line1\nline2"],
      ["_charset_", "UTF-8"],
    ]);
  });

  test("the submitter is included; an image submitter adds name.x/name.y", () => {
    document.body!.innerHTML =
      "<form id=f><button id=b name=go value=1></button><input type=image id=i name=pos></form>";
    expect([...new window.FormData($("f"), $("b"))]).toEqual([["go", "1"]]);
    expect([...new window.FormData($("f"), $("i"))]).toEqual([
      ["pos.x", "0"],
      ["pos.y", "0"],
    ]);
  });

  // https://html.spec.whatwg.org/#image-button-state-(type=image): activation selects the click's
  // coordinate (offsetX/offsetY, = clientX/Y without layout, as in jsdom); step 5.2 of
  // https://html.spec.whatwg.org/#constructing-the-form-data-set appends it. React Router's
  // data-browser-router "submitter value(s) in tree order" test
  // (downstream/react-router/repros/image-button-selected-coordinate.test.ts).
  test("an image submitter's name.x/name.y are the coordinate the activating click selected", () => {
    document.body!.innerHTML =
      "<form id=f><input name=a value=1><input type=image id=i name=pos><input type=image id=n></form>";
    const submitted: string[][][] = [];
    $("f").addEventListener("submit", (e: any) => {
      e.preventDefault();
      submitted.push([...new window.FormData($("f"), e.submitter)]);
    });
    $("i").dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, clientX: 1, clientY: 2 }));
    $("n").dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, clientX: 3, clientY: 4 }));
    // click()'s synthetic click is at (0,0): the earlier coordinate does not stick.
    $("i").click();
    expect(submitted).toEqual([
      [
        ["a", "1"],
        ["pos.x", "1"],
        ["pos.y", "2"],
      ],
      [
        ["a", "1"],
        ["x", "3"],
        ["y", "4"],
      ],
      [
        ["a", "1"],
        ["pos.x", "0"],
        ["pos.y", "0"],
      ],
    ]);
  });

  // https://html.spec.whatwg.org/#concept-form-submit step 9.3: method=dialog returns "x,y".
  test("an image button submitting a method=dialog form returns its selected coordinate", () => {
    document.body!.innerHTML = "<dialog id=d open><form method=dialog><input type=image id=i></form></dialog>";
    $("i").dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, clientX: 5, clientY: 6 }));
    expect($("d").returnValue).toBe("5,6");
  });

  test("a file input with no selection contributes an empty application/octet-stream File", () => {
    document.body!.innerHTML = "<form id=f><input type=file name=f></form>";
    const [[name, file]] = [...new window.FormData($("f"))] as [string, File][];
    expect([name, file.name, file.type, file.size]).toEqual(["f", "", "application/octet-stream", 0]);
  });

  test("fires formdata at the form; listeners can append", () => {
    document.body!.innerHTML = "<form id=f><input name=a value=1></form>";
    $("f").addEventListener("formdata", (e: any) => e.formData.append("extra", "2"));
    expect([...new window.FormData($("f"))]).toEqual([
      ["a", "1"],
      ["extra", "2"],
    ]);
  });

  test("is still Node's FormData (fetch accepts it)", () => {
    const fd = new window.FormData();
    fd.append("k", "v");
    expect(fd instanceof globalThis.FormData).toBe(true);
  });
});

describe("labels — https://html.spec.whatwg.org/#dom-lfe-labels", () => {
  test("labels lists for= and ancestor labels in tree order, and is live", () => {
    document.body!.innerHTML = "<label id=l1 for=i>a</label><label id=l2>b <input id=i></label>";
    const labels = $("i").labels;
    expect([...labels]).toEqual([$("l1"), $("l2")]);
    $("l1").remove();
    expect(labels.length).toBe(1);
    expect(labels[0]).toBe($("l2"));
  });

  test("hidden inputs have no labels; for= pointing at a non-labelable element gives no control", () => {
    document.body!.innerHTML = "<label id=l for=d></label><div id=d></div><input type=hidden id=h>";
    expect($("h").labels).toBeNull();
    expect($("l").control).toBeNull();
  });

  // labelsFor finds ancestor labels and the document's index of `for` labels instead of walking the
  // tree; `labels` must stay the labels whose `control` is the element.
  const expectLabelsMatchControls = (selector: string) => {
    const labels = [...document.querySelectorAll("label")] as any[];
    for (const el of document.querySelectorAll(selector) as any)
      expect([...el.labels]).toEqual(labels.filter((l) => l.control === el));
  };

  test("a control without an ID is labelled only by ancestor labels whose first labelable descendant it is", () => {
    document.body!.innerHTML =
      "<label id=o>Outer <label id=n>Inner <button></button></label></label>" +
      "<label id=f for=t><button></button></label><input id=t>" +
      "<label id=w><input type=hidden><output></output><meter></meter></label>";
    const [a, b] = document.querySelectorAll("button") as any;
    expect([...a.labels]).toEqual([$("o"), $("n")]);
    expect([...b.labels]).toEqual([]);
    expect([...(document.querySelector("output") as any).labels]).toEqual([$("w")]);
    expect([...(document.querySelector("meter") as any).labels]).toEqual([]);
    expect([...$("t").labels]).toEqual([$("f")]);
    document.body!.innerHTML =
      "<label>A <input><input></label><label for=x>B <button></button></label><select id=x></select>" +
      "<label>C <span><textarea></textarea></span></label><label><label for=''>D <meter></meter></label></label>";
    expectLabelsMatchControls("input, button, select, textarea, meter");
  });

  test("labels track for= labels through insertion, removal, for/id changes and moves", () => {
    const check = () => expectLabelsMatchControls("input, button");
    document.body!.innerHTML = "<div id=box><input id=x><button id=y></button></div><label id=a for=x>A</label>";
    check();
    const b = document.createElement("label") as any;
    b.htmlFor = "x";
    document.body!.prepend(b);
    check();
    $("a").htmlFor = "y";
    check();
    $("a").removeAttribute("for");
    check();
    $("a").append($("x"));
    check();
    b.setAttribute("for", "y");
    $("y").id = "x";
    check();
    const twin = document.createElement("input");
    twin.id = "y";
    document.body!.prepend(twin);
    check();
    b.remove();
    check();
    document.body!.append(b);
    check();
    $("box").moveBefore(b, null);
    check();
    document.body!.append($("box"));
    check();
  });

  test("a for= label in a shadow tree names only controls of that tree", () => {
    document.body!.innerHTML = "<input id=x><div id=host></div>";
    const shadow = $("host").attachShadow({ mode: "open" });
    shadow.innerHTML = "<label for=x>S</label><input id=x>";
    expect([...$("x").labels]).toEqual([]);
    expect([...shadow.getElementById("x").labels]).toEqual([shadow.querySelector("label")]);
  });
});
