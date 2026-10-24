/**
 * Event paths through shadow trees and slots, listener removal, legacy activation hooks and the
 * WebIDL conversions of event init dictionaries. Differential against jsdom (whose event code is
 * generated from WebIDL) where jsdom implements the feature.
 *
 * Spec: DOM Standard §2 "Events", Web IDL §3.2 "ECMAScript type mapping"
 *   - append to an event path: https://dom.spec.whatwg.org/#concept-event-path-append
 *   - composedPath / event path: https://dom.spec.whatwg.org/#dom-event-composedpath, https://dom.spec.whatwg.org/#event-path
 *   - touch target list and clearTargets: https://dom.spec.whatwg.org/#event-touch-target-list
 *   - event listener / remove an event listener / flatten more: https://dom.spec.whatwg.org/#concept-event-listener
 *   - legacy-pre-activation behavior: https://dom.spec.whatwg.org/#eventtarget-legacy-pre-activation-behavior
 *   - fire an event: https://dom.spec.whatwg.org/#concept-event-fire
 *   - long / short / unsigned / double / float conversions: https://webidl.spec.whatwg.org/#es-type-mapping
 *     (short: https://webidl.spec.whatwg.org/#es-short, unsigned long: https://webidl.spec.whatwg.org/#es-unsigned-long)
 */
import { describe, expect, test } from "vitest";
import { createWindow } from "@rtd/dom";
import { describeNode, differential, type AnyWindow } from "../../../../tests/compat/src/harness.ts";

const name = (t: AnyWindow) => (t === null ? "null" : t?.nodeType ? describeNode(t) : t?.document ? "window" : String(t));

/**
 * body > div#host (open or closed shadow: span#inner > slot) > b#slotted (light child of #host).
 */
function shadowSetup(w: AnyWindow, mode: "open" | "closed") {
  const d = w.document;
  const host = d.body.appendChild(d.createElement("div"));
  host.id = "host";
  const root = host.attachShadow({ mode });
  const inner = root.appendChild(d.createElement("span"));
  inner.id = "inner";
  const slot = inner.appendChild(d.createElement("slot"));
  const slotted = host.appendChild(d.createElement("b"));
  slotted.id = "slotted";
  return { d, host, root, inner, slot, slotted };
}

describe("append to an event path — https://dom.spec.whatwg.org/#concept-event-path-append", () => {
  differential("a slotted node's event goes through its slot and the shadow tree before reaching the host (open)", (w) => {
    const { slotted } = shadowSetup(w, "open");
    let path: string[] = [];
    slotted.addEventListener("x", (e: AnyWindow) => (path = e.composedPath().map(name)));
    slotted.dispatchEvent(new w.Event("x", { bubbles: true }));
    return path;
  });

  differential("listeners outside a closed shadow tree see the path without its internals; the slotted node itself sees them", (w) => {
    const { d, host, slotted, slot } = shadowSetup(w, "closed");
    const seen: Record<string, string[]> = {};
    for (const [label, t] of [
      ["slotted", slotted],
      ["slot", slot],
      ["host", host],
      ["document", d],
    ] as const) {
      t.addEventListener("x", (e: AnyWindow) => (seen[label] = e.composedPath().map(name)));
    }
    slotted.dispatchEvent(new w.Event("x", { bubbles: true }));
    return seen;
  });

  differential("composed: false stops at the shadow root; composed: true continues to the host and window", (w) => {
    const { inner, host } = shadowSetup(w, "open");
    const log: string[] = [];
    host.addEventListener("x", (e: AnyWindow) => log.push(`host ${e.composed} target=${name(e.target)}`));
    w.addEventListener("x", (e: AnyWindow) => log.push(`window ${e.composed}`));
    inner.dispatchEvent(new w.Event("x", { bubbles: true }));
    inner.dispatchEvent(new w.Event("x", { bubbles: true, composed: true }));
    return log;
  });

  differential("composedPath is empty before and after dispatch (https://dom.spec.whatwg.org/#event-path)", (w) => {
    const { inner } = shadowSetup(w, "open");
    const e = new w.Event("x", { composed: true });
    const before = e.composedPath().length;
    let during = 0;
    inner.addEventListener("x", () => (during = e.composedPath().length));
    inner.dispatchEvent(e);
    return { before, during, after: e.composedPath().length, target: name(e.target), currentTarget: e.currentTarget, phase: e.eventPhase };
  });

  differential("after dispatch from inside a shadow tree, target and relatedTarget are cleared (dispatch step 12, clearTargets)", (w) => {
    const { inner, host } = shadowSetup(w, "open");
    const e = new w.FocusEvent("focus", { relatedTarget: host, composed: true });
    inner.dispatchEvent(e);
    const light = new w.Event("y");
    host.dispatchEvent(light);
    return { shadow: [name(e.target), name(e.relatedTarget)], light: name(light.target) };
  });

  test("touch target list: touch targets are retargeted against each path entry, so a Touch inside a shadow tree does not clear a light target (https://dom.spec.whatwg.org/#event-touch-target-list)", () => {
    // Dispatch steps 6.10–6.11 look at the touch targets of the last struct with a shadow-adjusted
    // target, after "retarget touchTarget against target": an inner node becomes its host there.
    const window = createWindow();
    const document = window.document;
    const host = document.body!.appendChild(document.createElement("div"));
    const inner = host.attachShadow({ mode: "open" }).appendChild(document.createElement("span"));
    const light = document.body!.appendChild(document.createElement("p"));
    const W = window as unknown as Record<string, any>;
    const touchOn = (target: unknown, composed = true) => new W.TouchEvent("touchstart", { touches: [new W.Touch({ identifier: 1, target })], bubbles: true, composed });
    const shadowTouch = touchOn(inner);
    light.dispatchEvent(shadowTouch);
    expect(shadowTouch.target).toBe(light);
    // Composed from inside, the last shadow-adjusted target is the host: kept as the host.
    const composed = touchOn(inner);
    inner.dispatchEvent(composed);
    expect(composed.target).toBe(host);
    // Not composed, the path ends at the shadow root and the target stays inside it: cleared (step 11).
    const contained = touchOn(inner, false);
    inner.dispatchEvent(contained);
    expect(contained.target).toBeNull();
  });
});

describe("event listeners — https://dom.spec.whatwg.org/#concept-event-listener", () => {
  differential("removeEventListener matches type, callback and capture only (flatten more ignores once/passive/signal) (https://dom.spec.whatwg.org/#event-flatten-more)", (w) => {
    const t = new w.EventTarget();
    const log: string[] = [];
    const cb = (e: AnyWindow) => log.push(`${e.type}:${e.eventPhase}`);
    t.addEventListener("x", cb, { capture: true, once: false, passive: true });
    t.removeEventListener("x", cb, { capture: false } as never);
    t.dispatchEvent(new w.Event("x"));
    t.removeEventListener("x", cb, { capture: true, passive: false, once: true } as never);
    t.dispatchEvent(new w.Event("x"));
    t.addEventListener("y", cb, true);
    t.removeEventListener("y", cb, true);
    t.dispatchEvent(new w.Event("y"));
    t.addEventListener("z", cb);
    t.removeEventListener("Z", cb);
    t.removeEventListener("z", () => {});
    t.removeEventListener("z", null as never);
    t.dispatchEvent(new w.Event("z"));
    return log;
  });

  differential("a listener removed during dispatch is not invoked, even though the listener list was cloned (removed flag) (https://dom.spec.whatwg.org/#dom-eventtarget-removeeventlistener)", (w) => {
    const d = w.document;
    const el = d.body.appendChild(d.createElement("div"));
    const log: string[] = [];
    const second = () => log.push("second");
    const parentListener = () => log.push("parent");
    el.addEventListener("x", () => {
      log.push("first");
      el.removeEventListener("x", second);
      d.body.removeEventListener("x", parentListener);
    });
    el.addEventListener("x", second);
    d.body.addEventListener("x", parentListener);
    el.addEventListener("x", () => el.addEventListener("x", () => log.push("added during dispatch")));
    el.dispatchEvent(new w.Event("x", { bubbles: true }));
    return log;
  });

  differential("stopPropagation lets the remaining listeners on the current target run but no further targets (https://dom.spec.whatwg.org/#dom-event-stoppropagation)", (w) => {
    const d = w.document;
    const el = d.body.appendChild(d.createElement("div"));
    const log: string[] = [];
    d.body.addEventListener("x", () => log.push("body capture"), true);
    el.addEventListener("x", (e: AnyWindow) => {
      log.push("target 1");
      e.stopPropagation();
    });
    el.addEventListener("x", () => log.push("target 2"));
    d.body.addEventListener("x", () => log.push("body bubble"));
    const e = new w.Event("x", { bubbles: true });
    el.dispatchEvent(e);
    return { log, cancelBubble: e.cancelBubble };
  });

  differential("srcElement is the target, kept for compatibility (https://dom.spec.whatwg.org/#dom-event-srcelement)", (w) => {
    const { inner, host } = shadowSetup(w, "open");
    const log: string[] = [];
    host.addEventListener("x", (e: AnyWindow) => log.push(`${name(e.srcElement)} ${e.srcElement === e.target}`));
    inner.dispatchEvent(new w.Event("x", { composed: true, bubbles: true }));
    return log;
  });

  differential("initCustomEvent sets type and detail, and does nothing while the event is being dispatched (https://dom.spec.whatwg.org/#dom-customevent-initcustomevent)", (w) => {
    const e = new w.CustomEvent("a", { detail: 1 });
    e.initCustomEvent("b", true, true, { n: 2 });
    const before = [e.type, e.bubbles, e.cancelable, e.detail];
    const t = new w.EventTarget();
    let during: unknown[] = [];
    t.addEventListener("b", () => {
      e.initCustomEvent("c", false, false, 3);
      during = [e.type, e.bubbles, e.detail];
    });
    t.dispatchEvent(e);
    const defaults = new w.CustomEvent("d");
    defaults.initCustomEvent("e");
    return { before, during, defaults: [defaults.type, defaults.bubbles, defaults.detail] };
  });
});

describe("legacy activation hooks — https://dom.spec.whatwg.org/#eventtarget-legacy-pre-activation-behavior", () => {
  differential("checkbox: checked flips before click listeners run (legacy-pre-activation behavior); preventDefault restores it (legacy-canceled-activation behavior)", (w) => {
    const d = w.document;
    const input = d.body.appendChild(d.createElement("input"));
    input.type = "checkbox";
    const log: string[] = [];
    input.addEventListener("click", (e: AnyWindow) => {
      log.push(`listener sees ${input.checked}`);
      if (input.dataset.cancel) e.preventDefault();
    });
    input.addEventListener("change", () => log.push("change"));
    input.addEventListener("input", () => log.push("input"));
    input.click();
    log.push(`after ${input.checked}`);
    input.dataset.cancel = "1";
    input.click();
    log.push(`after canceled ${input.checked}`);
    return log;
  });

  differential("radio: the previously checked radio of the group is restored when the click is canceled (https://dom.spec.whatwg.org/#eventtarget-legacy-canceled-activation-behavior)", (w) => {
    const d = w.document;
    d.body.innerHTML = '<input type="radio" name="g" id="r1" checked><input type="radio" name="g" id="r2">';
    const [r1, r2] = [d.getElementById("r1"), d.getElementById("r2")];
    const log: string[] = [];
    r2.addEventListener("click", (e: AnyWindow) => {
      log.push(`during r1=${r1.checked} r2=${r2.checked}`);
      e.preventDefault();
    });
    r2.click();
    log.push(`after r1=${r1.checked} r2=${r2.checked}`);
    return log;
  });

  differential("activation behavior runs only for the activation target found while building the path (a click on a label's descendant activates the label)", (w) => {
    const d = w.document;
    d.body.innerHTML = '<label><span id="s">text</span><input type="checkbox" id="c"></label>';
    const c = d.getElementById("c");
    d.getElementById("s").click();
    return c.checked;
  });
});

describe("fire an event — https://dom.spec.whatwg.org/#concept-event-fire", () => {
  differential("events the platform fires (focus, input/change on activation) are trusted; dispatchEvent and click() are not", (w) => {
    const d = w.document;
    const input = d.body.appendChild(d.createElement("input"));
    input.type = "checkbox";
    const log: string[] = [];
    for (const type of ["focus", "focusin", "click", "input", "change", "custom"]) input.addEventListener(type, (e: AnyWindow) => log.push(`${type} trusted=${e.isTrusted} composed=${e.composed} bubbles=${e.bubbles}`));
    input.focus();
    input.click();
    input.dispatchEvent(new w.Event("custom"));
    return log;
  }, {
    jsdomFix: {
      fix: (log) => log.map((entry: string) => (entry.startsWith("input ") ? entry.replace("composed=false", "composed=true") : entry)),
      spec: "https://html.spec.whatwg.org/#checkbox-state-(type=checkbox)",
      reason: "the checkbox activation behavior fires input with bubbles and composed true (change only bubbles); jsdom fires input uncomposed",
    },
  });
});

describe("ECMAScript type mapping of event init members — https://webidl.spec.whatwg.org/#es-type-mapping", () => {
  differential("long and short wrap modulo 2^32 / 2^16 into the signed range (https://webidl.spec.whatwg.org/#es-long)", (w) => {
    const ui = new w.UIEvent("x", { detail: 2 ** 32 + 5 });
    const neg = new w.UIEvent("x", { detail: 2 ** 31 });
    const button = new w.MouseEvent("x", { button: 65536 + 2 });
    const negButton = new w.MouseEvent("x", { button: 40000 });
    const fraction = new w.UIEvent("x", { detail: -3.9 });
    return [ui.detail, neg.detail, button.button, negButton.button, fraction.detail, new w.UIEvent("x", { detail: "12abc" as never }).detail, new w.UIEvent("x", { detail: Number.NaN }).detail];
  });

  differential("unsigned short and unsigned long wrap into the unsigned range (https://webidl.spec.whatwg.org/#es-unsigned-short)", (w) => {
    const buttons = new w.MouseEvent("x", { buttons: -1 });
    const loc = new w.KeyboardEvent("x", { location: -1 });
    const mode = new w.WheelEvent("x", { deltaMode: 2 ** 32 + 1 });
    return [buttons.buttons, loc.location, mode.deltaMode];
  });

  differential("double rejects NaN and Infinity with TypeError; strings and booleans convert through ToNumber (https://webidl.spec.whatwg.org/#es-double)", (w) => {
    const tryName = (f: () => unknown) => {
      try {
        return f();
      } catch (e) {
        return `throws ${(e as Error).name}`;
      }
    };
    return [
      tryName(() => new w.MouseEvent("x", { clientX: Number.NaN }).clientX),
      tryName(() => new w.MouseEvent("x", { screenY: Infinity }).screenY),
      tryName(() => new w.WheelEvent("x", { deltaY: -Infinity }).deltaY),
      new w.MouseEvent("x", { clientX: "12.5" as never }).clientX,
      new w.MouseEvent("x", { clientY: true as never }).clientY,
      new w.MouseEvent("x", { clientX: undefined }).clientX,
    ];
  });

  test("float rounds to single precision and rejects non-finite values (https://webidl.spec.whatwg.org/#es-float)", () => {
    const window = createWindow() as unknown as Record<string, any>;
    const e = new window.PointerEvent("x", { pressure: 0.1, tangentialPressure: 1 / 3 });
    expect(e.pressure).toBe(Math.fround(0.1));
    expect(e.tangentialPressure).toBe(Math.fround(1 / 3));
    expect(() => new window.PointerEvent("x", { pressure: Number.NaN })).toThrow(TypeError);
    expect(() => new window.PointerEvent("x", { pressure: 3.5e38 })).toThrow(TypeError);
  });

  differential("DOMString members stringify their values (https://webidl.spec.whatwg.org/#es-DOMString)", (w) => {
    const k = new w.KeyboardEvent("x", { key: 5 as never, code: null as never });
    return [k.key, k.code, new w.InputEvent("x", { data: null }).data, new w.InputEvent("x", { inputType: 1 as never }).inputType];
  });
});
