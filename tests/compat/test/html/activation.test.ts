/**
 * HTMLElement.click() and activation behavior — differential against jsdom.
 *
 * Spec:
 *   - click():                            https://html.spec.whatwg.org/#dom-click
 *   - click in progress flag:             https://html.spec.whatwg.org/#click-in-progress-flag
 *   - activation behavior:                https://html.spec.whatwg.org/#activation-behaviour
 *   - legacy-pre-activation behavior:     https://html.spec.whatwg.org/#legacy-pre-activation-behavior
 *   - the input element's activation:     https://html.spec.whatwg.org/#the-input-element:activation-behaviour
 *   - the a element's activation:         https://html.spec.whatwg.org/#the-a-element:activation-behaviour
 *   - the summary element's activation:   https://html.spec.whatwg.org/#the-summary-element:activation-behaviour
 *   - DOM dispatch, activation target:    https://dom.spec.whatwg.org/#concept-event-dispatch (steps 5.4, 6, 11)
 *
 * Testing Library's `fireEvent.click` and user-event's `click` dispatch at descendants of
 * interactive elements (an icon inside a button, text inside a label), so the activation target
 * search and nesting rules decide what actually happens.
 */
import { describe } from "vitest";
import { describeNode, differential, type AnyWindow } from "../../src/harness.ts";

function record(w: AnyWindow): string[] {
  const log: string[] = [];
  for (const type of ["click", "input", "change", "submit", "reset", "toggle"]) {
    w.document.addEventListener(type, (e: AnyWindow) => log.push(`${type}@${describeNode(e.target)}`), true);
  }
  return log;
}

describe("click() — https://html.spec.whatwg.org/#dom-click", () => {
  differential("step 3: fires a synthetic pointer event click: untrusted, bubbling, cancelable, composed, with zeroed MouseEvent fields", (w) => {
    w.document.body.innerHTML = "<div id=d></div>";
    let seen: AnyWindow = null;
    const d = w.document.getElementById("d");
    d.addEventListener("click", (e: AnyWindow) => {
      seen = { isTrusted: e.isTrusted, bubbles: e.bubbles, cancelable: e.cancelable, composed: e.composed, mouse: e instanceof w.MouseEvent, button: e.button, buttons: e.buttons, clientX: e.clientX, screenX: e.screenX, view: e.view === w };
    });
    d.click();
    return seen;
  });

  differential("step 1: click() on a disabled form control does nothing", (w) => {
    w.document.body.innerHTML = "<fieldset disabled><button id=b>b</button><input type=checkbox id=c></fieldset>";
    const log = record(w);
    w.document.getElementById("b").click();
    w.document.getElementById("c").click();
    return { log, checked: w.document.getElementById("c").checked };
  });

  differential("click() works on disconnected elements (checkbox toggles)", (w) => {
    const c = w.document.createElement("input");
    c.type = "checkbox";
    let clicks = 0;
    c.addEventListener("click", () => clicks++);
    c.click();
    return { clicks, checked: c.checked };
  });

  differential("click in progress flag: a click() from inside a click listener on the same element is ignored", (w) => {
    w.document.body.innerHTML = "<input type=checkbox id=c>";
    const c = w.document.getElementById("c");
    let clicks = 0;
    c.addEventListener("click", () => {
      clicks++;
      c.click();
    });
    c.click();
    return { clicks, checked: c.checked };
  });
});

describe("activation target — https://dom.spec.whatwg.org/#concept-event-dispatch", () => {
  differential("step 5.4/6: a click on a descendant activates the nearest ancestor with activation behavior", (w) => {
    w.document.body.innerHTML = "<form id=f><button id=b><span id=icon>i</span></button></form>";
    const log = record(w);
    w.document.getElementById("f").addEventListener("submit", (e: AnyWindow) => e.preventDefault());
    w.document.getElementById("icon").click();
    return log;
  });

  // (Where the followed fragment link lands differs by timing — jsdom follows hyperlinks in a
  // task — so only the absence of a submission is compared.)
  differential("nested activation behaviors: the innermost wins (a link inside a submit button does not submit)", (w) => {
    w.document.body.innerHTML = '<form id=f><button id=b><a id=a href="#inner">x</a></button></form>';
    const log = record(w);
    w.document.getElementById("f").addEventListener("submit", (e: AnyWindow) => e.preventDefault());
    w.document.getElementById("a").click();
    return log;
  });

  differential("a checkbox inside a link toggles; the link is not followed", (w) => {
    w.document.body.innerHTML = '<a href="#followed"><input type=checkbox id=c></a>';
    const log = record(w);
    w.document.getElementById("c").click();
    return { log, checked: w.document.getElementById("c").checked, hash: w.location.hash };
  });

  differential("a plain Event named click (not a MouseEvent) runs no activation behavior", (w) => {
    w.document.body.innerHTML = "<input type=checkbox id=c>";
    const c = w.document.getElementById("c");
    c.dispatchEvent(new w.Event("click", { bubbles: true }));
    return c.checked;
  });

  differential("a non-bubbling MouseEvent click on a descendant does not activate the ancestor", (w) => {
    w.document.body.innerHTML = "<label><input type=checkbox id=c><span id=s>text</span></label>";
    w.document.getElementById("s").dispatchEvent(new w.MouseEvent("click", { bubbles: false }));
    return w.document.getElementById("c").checked;
  });
});

describe("legacy-pre-activation behavior — https://html.spec.whatwg.org/#legacy-pre-activation-behavior", () => {
  differential("checkbox: checkedness and indeterminate flip before listeners run and are restored on cancel", (w) => {
    w.document.body.innerHTML = "<input type=checkbox id=c>";
    const c = w.document.getElementById("c");
    c.indeterminate = true;
    const during: unknown[] = [];
    c.addEventListener("click", (e: AnyWindow) => {
      during.push({ checked: c.checked, indeterminate: c.indeterminate });
      e.preventDefault();
    });
    const log = record(w);
    c.click();
    return { during, after: { checked: c.checked, indeterminate: c.indeterminate }, log };
  });

  differential("radio: the group is updated before listeners run and restored on cancel", (w) => {
    w.document.body.innerHTML = "<input type=radio name=g id=a checked><input type=radio name=g id=b>";
    const a = w.document.getElementById("a");
    const b = w.document.getElementById("b");
    const during: unknown[] = [];
    b.addEventListener("click", (e: AnyWindow) => {
      during.push({ a: a.checked, b: b.checked });
      e.preventDefault();
    });
    b.click();
    return { during, after: { a: a.checked, b: b.checked } };
  });

  differential("legacy-canceled-activation behavior: every canceled click restores the old checkedness", (w) => {
    w.document.body.innerHTML = "<input type=checkbox id=c>";
    const c = w.document.getElementById("c");
    c.addEventListener("click", (e: AnyWindow) => {
      e.preventDefault();
    });
    c.click();
    c.click();
    return c.checked;
  });
});

describe("summary activation behavior — https://html.spec.whatwg.org/#the-summary-element:activation-behaviour", () => {
  differential("clicking the summary for its parent details toggles open; other summaries do nothing", (w) => {
    w.document.body.innerHTML = "<details id=d><summary id=s1>a</summary><summary id=s2>b</summary></details>";
    const d = w.document.getElementById("d");
    w.document.getElementById("s1").click();
    const afterFirst = d.open;
    w.document.getElementById("s2").click();
    return { afterFirst, afterSecond: d.open };
  });

  differential("clicking interactive content inside the summary does not toggle", (w) => {
    w.document.body.innerHTML = "<details id=d><summary><button id=b>b</button><span id=s>s</span></summary></details>";
    const d = w.document.getElementById("d");
    w.document.getElementById("b").click();
    const viaButton = d.open;
    w.document.getElementById("s").click();
    return { viaButton, viaSpan: d.open };
  });
});

describe("button and input activation — https://html.spec.whatwg.org/#the-button-element:activation-behaviour", () => {
  differential("type=reset buttons and input type=reset reset the form; type=button does nothing", (w) => {
    w.document.body.innerHTML = '<form id=f><input id=t value=init><button type=reset id=r>r</button><input type=reset id=ir><button type=button id=n>n</button></form>';
    const t = w.document.getElementById("t");
    const out: string[] = [];
    for (const id of ["n", "r", "ir"]) {
      t.value = "changed";
      w.document.getElementById(id).click();
      out.push(`${id}:${t.value}`);
    }
    return out;
  });

  differential("input type=submit and type=image submit with themselves as submitter", (w) => {
    w.document.body.innerHTML = '<form id=f><input type=submit id=s><input type=image id=i alt=go></form>';
    const submitters: string[] = [];
    w.document.getElementById("f").addEventListener("submit", (e: AnyWindow) => {
      submitters.push(describeNode(e.submitter));
      e.preventDefault();
    });
    w.document.getElementById("s").click();
    w.document.getElementById("i").click();
    return submitters;
  });

  differential("a button's form attribute picks the form it submits", (w) => {
    w.document.body.innerHTML = '<form id=a></form><form id=b><button form=a id=btn>x</button></form>';
    const seen: string[] = [];
    for (const id of ["a", "b"]) w.document.getElementById(id).addEventListener("submit", (e: AnyWindow) => (seen.push(id), e.preventDefault()));
    w.document.getElementById("btn").click();
    return seen;
  });
});
