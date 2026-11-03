/**
 * Radio button groups, differential against jsdom: each scenario runs on both, and every radio's
 * checkedness (and recorded validity) must agree.
 *
 * Spec: HTML §4.10.5.1.18 Radio Button state.
 *   radio button group     https://html.spec.whatwg.org/#radio-button-group
 *   insertion steps        https://html.spec.whatwg.org/#the-input-element:html-element-insertion-steps
 *   setting checkedness    https://html.spec.whatwg.org/#concept-fe-checked
 *   valueMissing (radio)   https://html.spec.whatwg.org/#radio-button-state-(type=radio):suffering-from-being-missing
 *
 * A connected radio finds its group in Document[$radios] (by name, kept by the input's connected,
 * disconnected and name/type change steps) instead of walking the tree. An inserted subtree runs
 * every node's insertion steps with the whole subtree in place, so its first checked radio in tree
 * order must win over later ones that reach the index after it.
 */
import { describe, expect, test } from "vitest";
import { JSDOM } from "jsdom";
import { createWindow } from "@ctrl/dom";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Doc = any;

const scenarios: Record<string, (d: Doc) => void> = {
  "insert subtree, two checked": (d) => {
    const div = d.createElement("div");
    div.innerHTML = "<input type=radio name=a checked id=x1><span><input type=radio name=a checked id=x2></span>";
    d.body.innerHTML = "<input type=radio name=a checked id=p>";
    d.body.append(div);
  },
  "insert fragment, two top-level checked": (d) => {
    d.body.innerHTML = "<input type=radio name=a checked id=p>";
    const f = d.createDocumentFragment();
    for (const id of ["f1", "f2"]) {
      const r = d.createElement("input");
      r.type = "radio";
      r.name = "a";
      r.id = id;
      r.checked = true;
      f.append(r);
    }
    d.body.append(f);
  },
  "insert unchecked then checked": (d) => {
    d.body.innerHTML = "<input type=radio name=a checked id=p>";
    const div = d.createElement("div");
    div.innerHTML = "<input type=radio name=a id=u><input type=radio name=a checked id=c>";
    d.body.append(div);
  },
  "insert into form vs outside": (d) => {
    d.body.innerHTML =
      "<form id=f><input type=radio name=a checked id=in></form><input type=radio name=a checked id=out>";
    const div = d.createElement("div");
    div.innerHTML = "<input type=radio name=a checked id=new>";
    d.getElementById("f").append(div);
  },
  "form attribute membership": (d) => {
    d.body.innerHTML =
      "<form id=f></form><input type=radio name=a form=f checked id=fa><input type=radio name=a checked id=nf>";
    d.getElementById("nf").setAttribute("form", "f");
    d.getElementById("fa").checked = true;
  },
  "name change": (d) => {
    d.body.innerHTML = "<input type=radio name=a checked id=a1><input type=radio name=b checked id=b1>";
    d.getElementById("b1").name = "a";
    d.getElementById("a1").name = "";
    d.getElementById("a1").checked = true;
    d.getElementById("b1").checked = true;
  },
  "type change": (d) => {
    d.body.innerHTML = "<input type=radio name=a checked id=r><input type=checkbox name=a checked id=c>";
    d.getElementById("c").type = "radio";
    d.getElementById("r").type = "text";
    d.getElementById("r").type = "radio";
    d.getElementById("r").checked = true;
  },
  "remove and reinsert": (d) => {
    d.body.innerHTML = "<input type=radio name=a checked id=r1><div id=box><input type=radio name=a id=r2></div>";
    const r1 = d.getElementById("r1");
    r1.remove();
    d.getElementById("r2").checked = true;
    d.getElementById("box").append(r1);
  },
  "detached group": (d) => {
    const div = d.createElement("div");
    div.innerHTML = "<input type=radio name=a id=d1><input type=radio name=a id=d2>";
    d.body.innerHTML = "<input type=radio name=a checked id=p>";
    div.firstChild.checked = true;
    div.lastChild.checked = true;
    d.body.append(div);
  },
  "shadow tree group": (d) => {
    d.body.innerHTML = "<input type=radio name=a checked id=p><div id=h></div>";
    const sr = d.getElementById("h").attachShadow({ mode: "open" });
    sr.innerHTML = "<input type=radio name=a checked><input type=radio name=a checked>";
    sr.lastChild.checked = true;
  },
  "nested insert, checked deep first": (d) => {
    d.body.innerHTML = "";
    const div = d.createElement("div");
    div.innerHTML =
      "<section><input type=radio name=a checked id=deep></section><input type=radio name=a checked id=after>";
    d.body.append(div);
  },
  "validity after insert": (d) => {
    d.body.innerHTML = "<input type=radio name=q required id=q1>";
    const div = d.createElement("div");
    div.innerHTML = "<input type=radio name=q id=q2>";
    d.body.append(div);
    d.getElementById("q2").setAttribute("data-valid", String(d.getElementById("q1").validity.valid));
    d.getElementById("q2").checked = true;
    d.getElementById("q1").setAttribute("data-valid", String(d.getElementById("q1").validity.valid));
  },
};
const state = (d: Doc) => {
  const out: string[] = [];
  const walk = (r: Doc) => {
    for (const el of r.querySelectorAll("input"))
      out.push(`${el.id || "?"}:${el.checked ? 1 : 0}${el.dataset.valid ? "v" + el.dataset.valid : ""}`);
    for (const h of r.querySelectorAll("*")) if (h.shadowRoot) walk(h.shadowRoot);
  };
  walk(d);
  return out.join(" ");
};

describe("radio button group — https://html.spec.whatwg.org/#radio-button-group (differential: jsdom)", () => {
  for (const [name, run] of Object.entries(scenarios)) {
    test(name, () => {
      const jsdom = new JSDOM("<!doctype html><body></body>").window;
      run(jsdom.document);
      const ours = createWindow({ url: "http://localhost/" });
      run(ours.document);
      expect(state(ours.document)).toBe(state(jsdom.document));
    });
  }
});
