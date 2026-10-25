/**
 * Constructing the entry list: `new FormData(form, submitter)` — differential against jsdom.
 *
 * Spec:
 *   - constructing the entry list:   https://html.spec.whatwg.org/#constructing-the-form-data-set
 *   - FormData constructor:          https://xhr.spec.whatwg.org/#dom-formdata
 *   - formdata event:                https://html.spec.whatwg.org/#the-formdataevent-interface
 *   - dirname attribute:             https://html.spec.whatwg.org/#attr-fe-dirname
 *
 * React forms commonly read values with `new FormData(event.currentTarget)` inside onSubmit,
 * and jest-dom's `toHaveFormValues` mirrors this algorithm.
 */
import { describe } from "vitest";
import { differential, type AnyWindow } from "../../src/harness.ts";

function entries(fd: AnyWindow): unknown[] {
  const out: unknown[] = [];
  for (const [name, value] of fd.entries()) {
    if (typeof value === "string") out.push([name, value]);
    else out.push([name, { file: value.name, type: value.type, size: value.size }]);
  }
  return out;
}

function formData(w: AnyWindow, html: string, submitterId?: string): unknown {
  w.document.body.innerHTML = html;
  const form = w.document.querySelector("form");
  const submitter = submitterId ? w.document.getElementById(submitterId) : undefined;
  return entries(submitter ? new w.FormData(form, submitter) : new w.FormData(form));
}

describe("constructing the entry list — https://html.spec.whatwg.org/#constructing-the-form-data-set", () => {
  differential("text-like controls, hidden, password, textarea, and unnamed controls", (w) =>
    formData(
      w,
      `<form>
        <input name=t value="a b">
        <input type=hidden name=h value=hid>
        <input type=password name=p value=pw>
        <input type=search name=s>
        <input value=unnamed>
        <input name="" value=emptyname>
        <textarea name=ta>line1
line2</textarea>
      </form>`,
    ),
  );

  differential("checkboxes and radios: only checked ones, default value 'on'", (w) =>
    formData(
      w,
      `<form>
        <input type=checkbox name=c1 checked>
        <input type=checkbox name=c2 value=yes checked>
        <input type=checkbox name=c3>
        <input type=radio name=r value=a>
        <input type=radio name=r value=b checked>
        <input type=radio name=r2 checked>
      </form>`,
    ),
  );

  differential(
    "selects: single, multiple, none selected, disabled options",
    (w) =>
      formData(
        w,
        `<form>
        <select name=one><option>a<option selected>b</select>
        <select name=many multiple><option selected>x<option>y<option selected value=zv>z</select>
        <select name=none multiple><option>q</select>
        <select name=dis><option disabled selected>d<option>e</select>
        <select name=empty></select>
      </form>`,
      ),
    {
      jsdomFix: {
        fix: (entries: unknown[][]) => entries.filter(([name]) => name !== "dis"),
        spec: "https://html.spec.whatwg.org/#constructing-the-form-data-set (select: options whose selectedness is true and that are not disabled)",
        reason: "jsdom submits selected options even when they are disabled",
      },
    },
  );

  differential("disabled controls, disabled fieldsets and datalist descendants are skipped", (w) =>
    formData(
      w,
      `<form>
        <input name=a value=1 disabled>
        <fieldset disabled><input name=b value=2><legend><input name=c value=3></legend></fieldset>
        <datalist><input name=d value=4></datalist>
        <input name=e value=5>
      </form>`,
    ),
  );

  differential("buttons and submit/reset/button/image inputs are excluded without a submitter", (w) =>
    formData(
      w,
      `<form>
        <button name=b1 value=v1>B</button>
        <input type=submit name=s value=S>
        <input type=reset name=r value=R>
        <input type=button name=bt value=BT>
        <input type=image name=img>
        <input name=keep value=k>
      </form>`,
    ),
  );

  differential("the submitter is included (button, submit input)", (w) => ({
    button: formData(w, "<form><input name=a value=1><button id=b name=go value=yes>Go</button></form>", "b"),
    input: formData(w, "<form><input type=submit id=s name=sub value=Send><input name=a value=1></form>", "s"),
  }));

  differential("image submitter contributes name.x / name.y", (w) =>
    formData(w, "<form><input type=image id=i name=pos><input name=a value=1></form>", "i"),
  );

  differential("file input with no selection contributes an empty File", (w) =>
    formData(w, "<form><input type=file name=f><input type=file name=g multiple></form>"),
  );

  differential("controls associated with form= outside the form, in tree order", (w) =>
    formData(
      w,
      "<input name=before value=b form=f><form id=f><input name=inside value=i></form><input name=after value=a form=f>",
    ),
  );

  differential("dirname adds a direction entry", (w) =>
    formData(w, "<form><input name=t value=hello dirname=t.dir><textarea name=ta dirname=ta.dir>x</textarea></form>"),
  );

  differential(
    "_charset_ hidden input gets the encoding name (value ignored)",
    (w) => formData(w, "<form><input type=hidden name=_charset_><input type=hidden name=_CHARSET_ value=keep></form>"),
    {
      jsdomDeviation: {
        expected: [
          ["_charset_", "UTF-8"],
          ["_CHARSET_", "UTF-8"],
        ],
        spec: "https://html.spec.whatwg.org/#constructing-the-form-data-set (Hidden state, name ASCII case-insensitively _charset_)",
        reason: "jsdom submits the input's value instead of the encoding name",
      },
    },
  );

  differential("object and output elements are not submittable", (w) =>
    formData(w, "<form><output name=o>out</output><object name=ob></object><input name=a value=1></form>"),
  );

  differential("textarea newlines and CR are normalized in the entry list", (w) => {
    w.document.body.innerHTML = "<form><textarea name=t></textarea><input name=i></form>";
    w.document.querySelector("textarea").value = "a\r\nb\rc";
    return entries(new w.FormData(w.document.querySelector("form")));
  });
});

describe("FormData constructor errors — https://xhr.spec.whatwg.org/#dom-formdata", () => {
  differential("submitter that is not a submit button throws TypeError", (w) => {
    w.document.body.innerHTML = "<form><input id=i></form>";
    return new w.FormData(w.document.querySelector("form"), w.document.getElementById("i"));
  });

  differential("submitter of another form throws NotFoundError", (w) => {
    w.document.body.innerHTML = "<form id=a></form><form id=b><button id=btn>x</button></form>";
    return new w.FormData(w.document.getElementById("a"), w.document.getElementById("btn"));
  });

  differential("FormData() with no form is empty; append/get/getAll/has/delete/set work", (w) => {
    const fd = new w.FormData();
    fd.append("a", "1");
    fd.append("a", "2");
    fd.set("b", "3");
    fd.append("c", "x");
    fd.delete("c");
    return { a: fd.get("a"), all: fd.getAll("a"), has: fd.has("b"), missing: fd.get("zz"), entries: entries(fd) };
  });
});

describe("formdata event — https://html.spec.whatwg.org/#constructing-the-form-data-set (step 6)", () => {
  differential(
    "constructing fires formdata at the form; listeners can append",
    (w) => {
      w.document.body.innerHTML = "<form><input name=a value=1></form>";
      const form = w.document.querySelector("form");
      const seen: unknown[] = [];
      form.addEventListener("formdata", (e: AnyWindow) => {
        seen.push({ type: e.type, bubbles: e.bubbles, cancelable: e.cancelable, hasFormData: !!e.formData });
        e.formData.append("extra", "x");
      });
      return { seen, entries: entries(new w.FormData(form)) };
    },
    {
      jsdomDeviation: {
        expected: {
          seen: [{ type: "formdata", bubbles: true, cancelable: false, hasFormData: true }],
          entries: [
            ["a", "1"],
            ["extra", "x"],
          ],
        },
        spec: "https://html.spec.whatwg.org/#constructing-the-form-data-set (fire formdata with bubbles true) via https://xhr.spec.whatwg.org/#dom-formdata",
        reason: "jsdom does not fire formdata when constructing FormData from a form",
      },
    },
  );
});
