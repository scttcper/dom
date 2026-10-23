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
 *   disabled               https://html.spec.whatwg.org/#concept-fe-disabled
 */
import { beforeEach, describe, expect, test } from "vitest";
import { createWindow, type Document } from "@rtd/dom";
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
    document.body!.innerHTML = "<form id=f><fieldset><legend id=l>x</legend><label id=lb>a <input id=i></label></fieldset></form>";
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
    document.body!.innerHTML = "<form id=f><input name=user id=u><input type=radio name=r value=1><input type=radio name=r value=2 checked></form>";
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

describe("form named properties — https://html.spec.whatwg.org/#the-form-element:supported-property-names", () => {
  test("form.name and form[i] return controls; the past names map survives a rename", () => {
    document.body!.innerHTML = "<form id=f><input name=email id=e><img name=logo id=i><input type=radio name=r><input type=radio name=r></form>";
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
    document.addEventListener("submit", (e: any) => seen.push([e.constructor.name, e.bubbles, e.cancelable, e.submitter]));
    $("f").requestSubmit();
    expect(seen).toEqual([["SubmitEvent", true, true, null]]);
  });

  test("requestSubmit(button) passes the submitter; non-submit buttons throw TypeError, foreign ones NotFoundError", () => {
    document.body!.innerHTML = "<form id=f><button id=b>go</button><button id=n type=button></button></form><form id=g><button id=o></button></form>";
    let submitter: unknown;
    $("f").addEventListener("submit", (e: any) => (submitter = e.submitter));
    $("f").requestSubmit($("b"));
    expect(submitter).toBe($("b"));
    expect(() => $("f").requestSubmit($("n"))).toThrow(TypeError);
    expect(() => $("f").requestSubmit($("o"))).toThrow(expect.objectContaining({ name: "NotFoundError" }));
  });

  test("an invalid form fires invalid events and no submit; novalidate skips validation", () => {
    document.body!.innerHTML = "<form id=f><input id=i required></form>";
    const events: string[] = [];
    $("i").addEventListener("invalid", () => events.push("invalid"));
    $("f").addEventListener("submit", () => events.push("submit"));
    $("f").requestSubmit();
    expect(events).toEqual(["invalid"]);
    $("f").noValidate = true;
    $("f").requestSubmit();
    expect(events).toEqual(["invalid", "submit"]);
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
    document.body!.innerHTML = "<form id=f><input id=t><button id=b>go</button></form><form id=g><input></form><form id=h><input><input></form>";
    const log: string[] = [];
    $("b").addEventListener("click", () => log.push("click"));
    for (const id of ["f", "g", "h"]) $(id).addEventListener("submit", (e: any) => (e.preventDefault(), log.push("submit:" + id)));
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
    expect([fired, $("t").value, $("c").checked, $("ta").value, $("s").selectedIndex, $("o").value]).toEqual([1, "a", true, "x", 1, "d"]);
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
    document.body!.innerHTML = "<form id=f><button id=b name=go value=1></button><input type=image id=i name=pos></form>";
    expect([...new window.FormData($("f"), $("b"))]).toEqual([["go", "1"]]);
    expect([...new window.FormData($("f"), $("i"))]).toEqual([["pos.x", "0"], ["pos.y", "0"]]);
  });

  test("a file input with no selection contributes an empty application/octet-stream File", () => {
    document.body!.innerHTML = "<form id=f><input type=file name=f></form>";
    const [[name, file]] = [...new window.FormData($("f"))] as [string, File][];
    expect([name, file.name, file.type, file.size]).toEqual(["f", "", "application/octet-stream", 0]);
  });

  test("fires formdata at the form; listeners can append", () => {
    document.body!.innerHTML = "<form id=f><input name=a value=1></form>";
    $("f").addEventListener("formdata", (e: any) => e.formData.append("extra", "2"));
    expect([...new window.FormData($("f"))]).toEqual([["a", "1"], ["extra", "2"]]);
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
});
