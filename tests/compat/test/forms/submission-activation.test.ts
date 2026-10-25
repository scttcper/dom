/**
 * Form submission, reset, and activation behavior of form controls and labels — differential
 * against jsdom.
 *
 * Spec:
 *   - requestSubmit / submit:            https://html.spec.whatwg.org/#dom-form-requestsubmit
 *   - form submission algorithm (events, validation): https://html.spec.whatwg.org/#concept-form-submit
 *   - reset:                             https://html.spec.whatwg.org/#concept-form-reset
 *   - event dispatch with activation:    https://dom.spec.whatwg.org/#concept-event-dispatch (steps 4, 11, 13)
 *   - checkbox/radio activation:         https://html.spec.whatwg.org/#checkbox-state-(type=checkbox):legacy-pre-activation-behavior
 *   - button activation:                 https://html.spec.whatwg.org/#the-button-element:activation-behaviour
 *   - label activation:                  https://html.spec.whatwg.org/#the-label-element:activation-behaviour
 *   - click() on disabled form controls: https://html.spec.whatwg.org/#dom-click
 *
 * This is how `fireEvent.click(checkbox)`, `userEvent.click(submitButton)`, and React onChange
 * / onSubmit handlers come to life in tests.
 */
import { describe } from "vitest";
import { differential, recordEvents, type AnyWindow } from "../../src/harness.ts";

const EVENTS = ["click", "input", "change", "submit", "reset", "invalid"];

function setup(w: AnyWindow, html: string) {
  w.document.body.innerHTML = html;
  const log = recordEvents(w.document, EVENTS, (e) =>
    e.type === "submit" ? `submitter=${e.submitter?.id ?? "null"}` : "",
  );
  return { log, $: (id: string) => w.document.getElementById(id) };
}

describe("requestSubmit / submit — https://html.spec.whatwg.org/#dom-form-requestsubmit", () => {
  differential("requestSubmit() fires a bubbling, cancelable SubmitEvent with submitter null", (w) => {
    const { log, $ } = setup(w, "<form id=f><input name=a></form>");
    let info: unknown = null;
    $("f").addEventListener("submit", (e: AnyWindow) => {
      info = {
        bubbles: e.bubbles,
        cancelable: e.cancelable,
        isSubmitEvent: e instanceof w.SubmitEvent,
        trusted: e.isTrusted,
        composed: e.composed,
      };
      e.preventDefault();
    });
    $("f").requestSubmit();
    return { log, info };
  });

  differential("requestSubmit(button) passes the submitter; invalid submitters throw", (w) => {
    const { log, $ } = setup(
      w,
      "<form id=f><button id=b>go</button><input id=i><button id=bb type=button>x</button></form><form id=g><button id=other>o</button></form>",
    );
    $("f").addEventListener("submit", (e: AnyWindow) => e.preventDefault());
    $("f").requestSubmit($("b"));
    const errors: unknown[] = [];
    for (const id of ["i", "bb", "other"]) {
      try {
        $("f").requestSubmit($(id));
        errors.push("no throw");
      } catch (e) {
        errors.push((e as Error).name);
      }
    }
    return { log, errors };
  });

  differential("requestSubmit() on an invalid form fires invalid events and no submit", (w) => {
    const { log, $ } = setup(w, "<form id=f><input required id=a><input required id=b></form>");
    $("f").requestSubmit();
    return log;
  });

  differential(
    "novalidate and formnovalidate skip validation",
    (w) => {
      const { log, $ } = setup(
        w,
        "<form id=f novalidate><input required></form><form id=g><input required><button id=b formnovalidate>x</button></form>",
      );
      for (const id of ["f", "g"]) $(id).addEventListener("submit", (e: AnyWindow) => e.preventDefault());
      $("f").requestSubmit();
      $("g").requestSubmit($("b"));
      return log;
    },
    {
      jsdomDeviation: {
        expected: ["submit@form#f submitter=null", "submit@form#g submitter=b"],
        spec: "https://html.spec.whatwg.org/#concept-form-submit (skip validation when the submitter's no-validate state is true: https://html.spec.whatwg.org/#concept-fs-novalidate)",
        reason: "jsdom ignores formnovalidate on the submitter",
      },
    },
  );

  differential("submit() fires no submit event and does not validate", (w) => {
    const { log, $ } = setup(w, "<form id=f><input required></form>");
    $("f").submit();
    return log;
  });
});

describe("reset — https://html.spec.whatwg.org/#concept-form-reset", () => {
  differential("reset() fires a bubbling cancelable reset event and restores every control", (w) => {
    const { log, $ } = setup(
      w,
      `<form id=f>
        <input id=t value=orig><input type=checkbox id=c checked><input type=radio name=r id=r1 checked><input type=radio name=r id=r2>
        <select id=s><option>a<option selected>b</select><textarea id=ta>txt</textarea><output id=o>out</output>
        <input type=number id=n value=5><input type=range id=rg value=20><input type=color id=col value=#112233>
      </form>`,
    );
    let info: unknown = null;
    $("f").addEventListener("reset", (e: AnyWindow) => {
      info = { bubbles: e.bubbles, cancelable: e.cancelable };
    });
    $("t").value = "changed";
    $("c").checked = false;
    $("r2").checked = true;
    $("s").selectedIndex = 0;
    $("ta").value = "changed";
    $("o").value = "changed output";
    $("n").value = "9";
    $("rg").value = "80";
    $("col").value = "#ffffff";
    $("f").reset();
    return {
      log,
      info,
      t: $("t").value,
      c: $("c").checked,
      r: [$("r1").checked, $("r2").checked],
      s: $("s").selectedIndex,
      ta: $("ta").value,
      o: [$("o").value, $("o").defaultValue],
      n: $("n").value,
      rg: $("rg").value,
      col: $("col").value,
    };
  });

  differential("preventDefault on reset keeps current values", (w) => {
    const { $ } = setup(w, "<form id=f><input id=t value=orig></form>");
    $("f").addEventListener("reset", (e: AnyWindow) => e.preventDefault());
    $("t").value = "changed";
    $("f").reset();
    return $("t").value;
  });

  differential("output.value and defaultValue (default value mode)", (w) => {
    const { $ } = setup(w, "<output id=o>initial</output>");
    const o = $("o");
    const start = [o.value, o.defaultValue];
    o.value = "v";
    const afterValue = [o.value, o.defaultValue, o.textContent];
    o.defaultValue = "d";
    return { start, afterValue, afterDefault: [o.value, o.defaultValue, o.textContent], type: o.type };
  });
});

describe("activation behavior — https://dom.spec.whatwg.org/#concept-event-dispatch", () => {
  differential("checkbox.click(): click → input → change, toggled before listeners run", (w) => {
    const { log, $ } = setup(w, "<input type=checkbox id=c>");
    let checkedInListener: unknown = null;
    $("c").addEventListener("click", () => (checkedInListener = $("c").checked));
    $("c").click();
    return { log, checkedInListener, checked: $("c").checked };
  });

  differential("canceled checkbox click restores checkedness and fires no input/change", (w) => {
    const { log, $ } = setup(w, "<input type=checkbox id=c>");
    $("c").addEventListener("click", (e: AnyWindow) => e.preventDefault());
    $("c").click();
    return { log, checked: $("c").checked };
  });

  differential(
    "input and change event flags for checkbox activation",
    (w) => {
      const { $ } = setup(w, "<input type=checkbox id=c>");
      const flags: unknown[] = [];
      for (const type of ["input", "change"]) {
        $("c").addEventListener(type, (e: AnyWindow) =>
          flags.push({
            type,
            bubbles: e.bubbles,
            cancelable: e.cancelable,
            composed: e.composed,
            isInputEvent: e instanceof w.InputEvent,
          }),
        );
      }
      $("c").click();
      return flags;
    },
    {
      jsdomFix: {
        spec: "https://html.spec.whatwg.org/#checkbox-state-(type=checkbox):activation-behaviour",
        reason: "jsdom fires the activation input event without composed=true",
        fix: (flags: Array<{ type: string; composed: boolean }>) =>
          flags.map((f) => (f.type === "input" ? { ...f, composed: true } : f)),
      },
    },
  );

  differential("radio click: unchecked fires input/change, already checked fires nothing", (w) => {
    const { log, $ } = setup(w, "<input type=radio name=g id=a><input type=radio name=g id=b checked>");
    $("a").click();
    const first = log.splice(0);
    $("a").click();
    return { first, second: log, a: $("a").checked, b: $("b").checked };
  });

  differential("canceled radio click restores the previously checked radio", (w) => {
    const { log, $ } = setup(w, "<input type=radio name=g id=a><input type=radio name=g id=b checked>");
    $("a").addEventListener("click", (e: AnyWindow) => e.preventDefault());
    $("a").click();
    return { log, a: $("a").checked, b: $("b").checked };
  });

  differential("dispatching a synthetic MouseEvent click activates; a plain Event('click') does not", (w) => {
    const { log, $ } = setup(w, "<input type=checkbox id=c><input type=checkbox id=d>");
    $("c").dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true }));
    $("d").dispatchEvent(new w.Event("click", { bubbles: true, cancelable: true }));
    return { log, c: $("c").checked, d: $("d").checked };
  });

  differential("click() on disabled controls does nothing (no events)", (w) => {
    const { log, $ } = setup(
      w,
      "<input type=checkbox id=c disabled><form id=f><button id=b disabled>x</button></form><fieldset disabled><input type=checkbox id=fc></fieldset>",
    );
    $("c").click();
    $("b").click();
    $("fc").click();
    return { log, c: $("c").checked, fc: $("fc").checked };
  });

  differential(
    "dispatchEvent(click) on a disabled checkbox still fires listeners? (spec: click events on disabled form controls)",
    (w) => {
      const { log, $ } = setup(w, "<input type=checkbox id=c disabled>");
      $("c").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
      return { log, checked: $("c").checked };
    },
  );

  differential("submit button click: click then submit with submitter", (w) => {
    const { log, $ } = setup(
      w,
      "<form id=f><input name=a><button id=b>Go</button><input type=submit id=s><input type=image id=img><button type=button id=plain>x</button><button type=reset id=r>r</button></form>",
    );
    $("f").addEventListener("submit", (e: AnyWindow) => e.preventDefault());
    for (const id of ["b", "s", "img", "plain", "r"]) $(id).click();
    return log;
  });

  differential("canceling the click on a submit button prevents submission", (w) => {
    const { log, $ } = setup(w, "<form id=f><button id=b>Go</button></form>");
    $("b").addEventListener("click", (e: AnyWindow) => e.preventDefault());
    $("b").click();
    return log;
  });

  differential("button with form= submits that form; button outside any form does nothing", (w) => {
    const { log, $ } = setup(w, "<form id=f></form><button id=b form=f>x</button><button id=loose>y</button>");
    $("f").addEventListener("submit", (e: AnyWindow) => e.preventDefault());
    $("b").click();
    $("loose").click();
    return log;
  });

  differential("submit button click on an invalid form fires invalid, no submit", (w) => {
    const { log, $ } = setup(w, "<form id=f><input required id=i><button id=b>go</button></form>");
    $("b").click();
    return log;
  });
});

describe("label activation — https://html.spec.whatwg.org/#the-label-element:activation-behaviour", () => {
  differential("label.click() forwards a click to the for= control", (w) => {
    const { log, $ } = setup(w, "<label id=l for=c>L</label><input type=checkbox id=c>");
    $("l").click();
    return { log, checked: $("c").checked };
  });

  differential("clicking a wrapping label toggles its nested checkbox once", (w) => {
    const { log, $ } = setup(w, "<label id=l><span id=s>text</span><input type=checkbox id=c></label>");
    $("s").click();
    return { log, checked: $("c").checked };
  });

  differential("clicking the control inside its label does not re-dispatch", (w) => {
    const { log, $ } = setup(w, "<label id=l><input type=checkbox id=c></label>");
    $("c").click();
    return { log, checked: $("c").checked };
  });

  differential("clicking interactive content inside a label does not activate the control", (w) => {
    const { log, $ } = setup(
      w,
      "<label id=l><input type=checkbox id=c><button id=b type=button>b</button><a id=a href=#x>a</a></label>",
    );
    $("b").click();
    $("a").click();
    return { log, checked: $("c").checked };
  });

  differential("canceling the label click prevents activation", (w) => {
    const { log, $ } = setup(w, "<label id=l for=c>L</label><input type=checkbox id=c>");
    $("l").addEventListener("click", (e: AnyWindow) => e.preventDefault());
    $("l").click();
    return { log, checked: $("c").checked };
  });

  differential("label click focuses a text input (no click forwarded side effects on value)", (w) => {
    const { log, $ } = setup(w, "<label id=l for=t>L</label><input id=t>");
    $("l").click();
    return { log, active: w.document.activeElement };
  });

  differential("label for a disabled control: click forwarded? control unchanged", (w) => {
    const { log, $ } = setup(w, "<label id=l for=c>L</label><input type=checkbox id=c disabled>");
    $("l").click();
    return { log, checked: $("c").checked };
  });
});
