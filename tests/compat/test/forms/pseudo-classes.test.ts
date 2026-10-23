/**
 * Form-related selector pseudo-classes, evaluated through `matches()` — differential against
 * jsdom.
 *
 * Spec:
 *   - HTML pseudo-class definitions:  https://html.spec.whatwg.org/#pseudo-classes
 *   - Selectors 4 input pseudo-classes: https://drafts.csswg.org/selectors-4/#input-pseudos
 *
 * Testing Library users write `container.querySelector('input:checked')`, styled-components
 * use `:disabled`/`:invalid` in rules that `toBeVisible`/`toHaveStyle` evaluate, and user-event
 * checks `:disabled`-equivalent state.
 */
import { describe } from "vitest";
import { differential, type AnyWindow, type DifferentialOptions } from "../../src/harness.ts";

/**
 * jsdom matches :valid on elements that are barred from constraint validation (disabled,
 * readonly, hidden inputs, reset inputs, type=button buttons). Per spec, :valid/:invalid only
 * match candidates for constraint validation (plus form/fieldset); browsers agree.
 */
function barred(...ids: string[]): DifferentialOptions {
  return {
    jsdomFix: {
      spec: "https://html.spec.whatwg.org/#selector-valid",
      reason: "jsdom matches :valid/:invalid on elements barred from constraint validation",
      fix: (obs: Record<string, string[]>) => {
        for (const id of ids) obs[id] = obs[id].filter((p) => p !== ":valid" && p !== ":invalid");
        return obs;
      },
    },
  };
}

const PSEUDOS = [
  ":checked", ":default", ":disabled", ":enabled", ":required", ":optional", ":read-only",
  ":read-write", ":valid", ":invalid", ":in-range", ":out-of-range", ":indeterminate",
  ":placeholder-shown",
];

function matrix(w: AnyWindow, html: string, ids: string[]): Record<string, string[]> {
  w.document.body.innerHTML = html;
  const out: Record<string, string[]> = {};
  for (const id of ids) {
    const el = w.document.getElementById(id);
    out[id] = PSEUDOS.filter((p) => {
      try {
        return el.matches(p);
      } catch {
        return false;
      }
    });
  }
  return out;
}

describe("input pseudo-classes — https://html.spec.whatwg.org/#pseudo-classes", () => {
  differential("text-like inputs", (w) =>
    matrix(
      w,
      `<input id=plain><input id=req required><input id=ro readonly><input id=dis disabled>
       <input id=ph placeholder=hint><input id=phv placeholder=hint value=x><input id=email type=email value=bad>
       <input id=hidden type=hidden><input id=num type=number min=1 max=5 value=9><input id=numok type=number min=1 max=5 value=3>
       <input id=numempty type=number min=1 max=5><input id=range type=range min=0 max=10>`,
      ["plain", "req", "ro", "dis", "ph", "phv", "email", "hidden", "num", "numok", "numempty", "range"],
    ),
    {
      jsdomFix: {
        spec: "https://html.spec.whatwg.org/#selector-valid and https://html.spec.whatwg.org/#range-state-(type=range) (default value is the midpoint, 5, which is in range)",
        reason: "jsdom matches :valid on barred controls, and reports a value-less range input with min=0 max=10 as invalid/out-of-range",
        fix: (obs: Record<string, string[]>) => {
          const fixed = barred("ro", "dis", "hidden").jsdomFix!.fix(obs) as Record<string, string[]>;
          fixed.range = fixed.range.map((p) => (p === ":invalid" ? ":valid" : p === ":out-of-range" ? ":in-range" : p));
          return fixed;
        },
      },
    },
  );

  differential("checkboxes, radios and buttons", (w) => {
    const result = matrix(
      w,
      `<form><input type=checkbox id=cb><input type=checkbox id=cbc checked><input type=checkbox id=cbi>
       <input type=radio name=g id=r1><input type=radio name=g id=r2>
       <input type=radio name=h id=h1 checked><input type=radio name=h id=h2>
       <button id=b1>first submit</button><button id=b2>second</button><input type=submit id=s>
       <button type=button id=bb>plain</button><input type=reset id=rs></form>`,
      ["cb", "cbc", "cbi", "r1", "r2", "h1", "h2", "b1", "b2", "s", "bb", "rs"],
    );
    return result;
  }, barred("bb", "rs"));

  differential("indeterminate checkbox and progress", (w) => {
    w.document.body.innerHTML = "<input type=checkbox id=c><progress id=p></progress><progress id=pv value=3></progress>";
    w.document.getElementById("c").indeterminate = true;
    return ["c", "p", "pv"].map((id) => [id, w.document.getElementById(id).matches(":indeterminate")]);
  });

  differential("select, option, optgroup, textarea", (w) =>
    matrix(
      w,
      `<select id=s><option id=o1>a<option id=o2 selected>b</select>
       <select id=sr required><option id=empty value="">x</select>
       <select id=sd disabled><option id=od>d</select>
       <select id=m multiple><optgroup id=og disabled><option id=ogo>z</optgroup></select>
       <textarea id=t></textarea><textarea id=tr required></textarea><textarea id=tro readonly></textarea><textarea id=tph placeholder=p></textarea>`,
      ["s", "o1", "o2", "sr", "empty", "sd", "od", "m", "og", "ogo", "t", "tr", "tro", "tph"],
    ),
    barred("sd", "tro"),
  );

  differential("form and fieldset :valid/:invalid reflect their controls", (w) =>
    matrix(
      w,
      `<form id=f><fieldset id=fs><input required id=i></fieldset></form><form id=g><input id=j></form>`,
      ["f", "fs", "g"],
    ),
  );

  differential(":read-write on contenteditable and non-form elements", (w) =>
    matrix(w, `<div id=ce contenteditable>x</div><div id=d>y</div><p id=cef contenteditable=false>z</p>`, ["ce", "d", "cef"]),
  );

  differential("pseudo-classes update after state changes", (w) => {
    w.document.body.innerHTML = "<input id=i required><input type=checkbox id=c>";
    const i = w.document.getElementById("i");
    const c = w.document.getElementById("c");
    const before = [i.matches(":invalid"), c.matches(":checked")];
    i.value = "x";
    c.checked = true;
    return { before, after: [i.matches(":invalid"), c.matches(":checked")], qsa: w.document.querySelectorAll(":checked").length };
  });
});
