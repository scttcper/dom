/**
 * The dispatch algorithm's light-DOM fast paths: the per-struct state it keeps lazily, the
 * listener arrays it reuses between the capturing and bubbling passes, the inlined "get the
 * parent" and the activation-behavior tag gate.
 *
 * Spec: DOM Standard §2.9 "Dispatching events", §2.6 "Interface EventTarget"
 *   https://dom.spec.whatwg.org/#concept-event-dispatch (steps 5-6: the path; 6.4-6.5, 6.9.5.1: activation target)
 *   https://dom.spec.whatwg.org/#concept-event-listener-invoke (steps 1-3: target/relatedTarget per struct; 6: the listener list clone)
 *   https://dom.spec.whatwg.org/#get-the-parent
 * HTML: https://html.spec.whatwg.org/#user-validity (set by a `change` dispatched at the control)
 *
 * Differential where jsdom implements the behavior: the scenario runs on both windows and the
 * observable log must match.
 */
import { beforeEach, describe, expect, test } from "vitest";
import { JSDOM } from "jsdom";
import { Event, MouseEvent, type Document, type Element, type Window } from "@ctrl/dom";
import { setup } from "./helpers.ts";

/** A window with its event constructors (ours and jsdom's are cast to it). */
type EventWindow = Window & { Event: typeof Event; MouseEvent: typeof MouseEvent };

let window: EventWindow;
let document: Document;

beforeEach(() => {
  const fixture = setup();
  window = fixture.window as EventWindow;
  document = fixture.document;
});

/** A window-agnostic scenario: builds its fixture from `document`, returns what it observed. */
type Scenario = (w: EventWindow, d: Document) => unknown;

function differential(scenario: Scenario): void {
  const ours = scenario(window, document);
  const dom = new JSDOM("");
  const theirs = scenario(dom.window as unknown as EventWindow, dom.window.document as unknown as Document);
  expect(ours).toEqual(theirs);
}

describe("listener lists are read per invoke — https://dom.spec.whatwg.org/#concept-event-listener-invoke", () => {
  test("step 6: a listener added during the capturing pass to a later item that had none runs in the bubbling pass", () => {
    differential((w, d) => {
      const log: string[] = [];
      const form = d.body!.appendChild(d.createElement("form"));
      const span = form.appendChild(d.createElement("span"));
      d.body!.addEventListener(
        "click",
        () => {
          log.push("body capture");
          // The form had no listener array at all when the path was built.
          form.addEventListener("click", () => log.push("form bubble (added mid-dispatch)"));
          d.addEventListener("click", () => log.push("document bubble (added mid-dispatch)"));
        },
        true,
      );
      span.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
      // Nothing added: the second dispatch runs the already-present listeners only once each.
      span.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
      return log;
    });
  });

  test("step 6: a listener added by a bubbling listener to a later item that had none still runs for the same event", () => {
    differential((w, d) => {
      const log: string[] = [];
      const outer = d.body!.appendChild(d.createElement("div"));
      const inner = outer.appendChild(d.createElement("div"));
      inner.addEventListener("x", () => {
        log.push("inner");
        outer.addEventListener("x", () => log.push("outer (added mid-dispatch)"));
      });
      inner.dispatchEvent(new w.Event("x", { bubbles: true }));
      return log;
    });
  });

  test("step 6: listeners removed from a later item during the capturing pass do not run (removed flag)", () => {
    differential((w, d) => {
      const log: string[] = [];
      const outer = d.body!.appendChild(d.createElement("div"));
      const inner = outer.appendChild(d.createElement("div"));
      const bubble = () => log.push("outer bubble");
      outer.addEventListener("x", bubble);
      outer.addEventListener(
        "x",
        () => {
          log.push("outer capture");
          outer.removeEventListener("x", bubble);
        },
        true,
      );
      inner.dispatchEvent(new w.Event("x", { bubbles: true }));
      return log;
    });
  });

  test("an event type nothing has ever listened for still runs activation behavior and reaches event.target", () => {
    const checkbox = document.body!.appendChild(document.createElement("input"));
    checkbox.setAttribute("type", "checkbox");
    const event = new MouseEvent("click", { bubbles: true });
    // "click" has listeners elsewhere in this process; use a path with none for this document
    // and an event type with a unique name for the no-listener pass itself.
    expect(checkbox.dispatchEvent(event)).toBe(true);
    expect((checkbox as unknown as { checked: boolean }).checked).toBe(true);
    expect(event.target).toBe(checkbox);
    const never = new window.Event("never-listened-for-anywhere-" + Math.random(), { bubbles: true });
    expect(checkbox.dispatchEvent(never)).toBe(true);
    expect(never.target).toBe(checkbox);
    expect(never.eventPhase).toBe(0);
  });
});

describe("per-struct relatedTarget — https://dom.spec.whatwg.org/#concept-event-listener-invoke", () => {
  test("steps 1-3: every item's listener sees the relatedTarget; an event without one dispatched next sees null on every item", () => {
    differential((w, d) => {
      const log: string[] = [];
      const a = d.body!.appendChild(d.createElement("div"));
      const b = a.appendChild(d.createElement("div"));
      const c = b.appendChild(d.createElement("span"));
      const other = d.body!.appendChild(d.createElement("p"));
      for (const [name, el] of [
        ["window", w],
        ["document", d],
        ["a", a],
        ["b", b],
        ["c", c],
      ] as const) {
        el.addEventListener("mouseover", (e) =>
          log.push(`${name}: ${String((e as unknown as { relatedTarget: Element | null }).relatedTarget?.localName)}`),
        );
        el.addEventListener("mouseover", (e) =>
          log.push(
            `${name} capture: ${String((e as unknown as { relatedTarget: Element | null }).relatedTarget?.localName)}`,
          ),
        );
      }
      c.dispatchEvent(new w.MouseEvent("mouseover", { bubbles: true, relatedTarget: other }));
      c.dispatchEvent(new w.MouseEvent("mouseover", { bubbles: true }));
      return log;
    });
  });

  test("steps 1-3: a path deeper than any dispatched before reads null, not undefined, for relatedTarget and touch targets", () => {
    let leaf: Element = document.body!;
    const deepen = (n: number) => {
      for (let i = 0; i < n; i++) leaf = leaf.appendChild(document.createElement("div"));
    };
    let seen: unknown = "not run";
    document.addEventListener("x", (e) => (seen = (e as unknown as { relatedTarget: unknown }).relatedTarget));
    // A plain Event first grows the path stack to this depth, then a MouseEvent reads it.
    deepen(200);
    leaf.dispatchEvent(new window.Event("x", { bubbles: true }));
    let mouse = new MouseEvent("x", { bubbles: true });
    leaf.dispatchEvent(mouse);
    expect(seen).toBe(null);
    expect(mouse.relatedTarget).toBe(null);
    // And a MouseEvent growing it itself.
    deepen(100);
    seen = "not run";
    mouse = new MouseEvent("x", { bubbles: true });
    leaf.dispatchEvent(mouse);
    expect(seen).toBe(null);
    expect(mouse.relatedTarget).toBe(null);
  });

  test("after dispatch event.target is the target even when no listener ran (bubbling and not)", () => {
    const el = document.body!.appendChild(document.createElement("div"));
    for (const bubbles of [true, false]) {
      const event = new window.Event("y", { bubbles });
      el.dispatchEvent(event);
      expect(event.target).toBe(el);
      expect(event.currentTarget).toBe(null);
    }
  });
});

describe("get the parent — https://dom.spec.whatwg.org/#get-the-parent", () => {
  test("a Document's parent is its Window except for load; a Window's is null (the only non-inlined hooks)", () => {
    differential((w, d) => {
      const log: string[] = [];
      w.addEventListener("load", () => log.push("window load"));
      w.addEventListener("z", () => log.push("window z"));
      d.addEventListener("load", () => log.push("document load"));
      d.addEventListener("z", () => log.push("document z"));
      d.body!.dispatchEvent(new w.Event("load", { bubbles: true }));
      d.body!.dispatchEvent(new w.Event("z", { bubbles: true }));
      w.dispatchEvent(new w.Event("z", { bubbles: true }));
      return log;
    });
  });

  test("a change event dispatched at a form control sets its user validity before listeners run (https://html.spec.whatwg.org/#user-validity)", () => {
    document.body!.innerHTML = `<form><input id=i required><select id=s required><option id=o value="">-</option></select><textarea id=t required></textarea></form>`;
    const byId = (id: string) => document.getElementById(id)!;
    const seen: Record<string, boolean> = {};
    for (const id of ["i", "s", "t"]) {
      byId(id).addEventListener("change", () => (seen[id] = byId(id).matches(":user-invalid")));
      byId(id).dispatchEvent(new window.Event("change", { bubbles: true }));
    }
    expect(seen).toEqual({ i: true, s: true, t: true });
    // Only the target: a change at the <option> passes through the <select> as a parent.
    document.body!.innerHTML = `<select id=s required><option id=o value="">-</option></select>`;
    byId("o").dispatchEvent(new window.Event("change", { bubbles: true }));
    expect(byId("s").matches(":user-invalid")).toBe(false);
  });
});

describe("activation target — https://dom.spec.whatwg.org/#concept-event-dispatch", () => {
  test("steps 6.5 and 6.9.5.1: the hook is only read on elements that can have activation behavior", () => {
    // A <div> cannot have activation behavior in HTML; a hook installed on one is never read.
    const div = document.body!.appendChild(document.createElement("div"));
    let activated = 0;
    Object.defineProperty(div, "_hasActivationBehavior", { value: true });
    Object.defineProperty(div, "_activationBehavior", { value: () => activated++ });
    div.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    div.appendChild(document.createElement("span")).dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(activated).toBe(0);
    // A <form> is a Proxy for its named controls: a click through it must not look the hook up
    // as a control name either.
    const form = document.body!.appendChild(document.createElement("form"));
    const input = form.appendChild(document.createElement("input"));
    input.setAttribute("name", "_hasActivationBehavior");
    expect(
      form.appendChild(document.createElement("span")).dispatchEvent(new MouseEvent("click", { bubbles: true })),
    ).toBe(true);
  });

  test("step 6.9.5.1: a label inside a form still activates (nearest activation-capable ancestor)", () => {
    differential((w, d) => {
      const form = d.body!.appendChild(d.createElement("form"));
      const label = form.appendChild(d.createElement("label"));
      const checkbox = label.appendChild(d.createElement("input"));
      checkbox.setAttribute("type", "checkbox");
      const text = label.appendChild(d.createElement("span"));
      text.textContent = "Toggle";
      text.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true }));
      return (checkbox as unknown as { checked: boolean }).checked;
    });
  });
});
