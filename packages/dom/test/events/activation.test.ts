/**
 * Activation behavior hooks in the dispatch algorithm.
 *
 * Spec: DOM Standard §2.9 "Dispatching events" (activation target, legacy-pre-activation,
 *       legacy-canceled-activation)
 *   https://dom.spec.whatwg.org/#concept-event-dispatch (steps 6.4-6.5, 6.9.5.1, 6.9.7, 6.12, 12)
 *   https://dom.spec.whatwg.org/#eventtarget-activation-behavior
 * HTML: https://html.spec.whatwg.org/#fire-a-synthetic-pointer-event
 *
 * The hooks are implemented by html-elements/html-forms (src/events/activation.ts documents
 * the contract). These tests install the hooks on plain elements so they pin the dispatch
 * side of the contract independently of any element implementation.
 * Related WPT: dom/events/Event-dispatch-single-activation-behavior.html,
 * dom/events/legacy-pre-activation-behavior.window.js.
 */
import { beforeEach, describe, expect, test } from "vitest";
import { Event, MouseEvent, PointerEvent, type Document, type Element } from "@ctrl/dom";
import { fireSyntheticPointerEvent } from "@ctrl/dom/internal";
import { setup } from "./helpers.ts";

let document: Document;

beforeEach(() => {
  ({ document } = setup());
});

interface Log {
  calls: string[];
}

function activatable(el: Element, name: string, log: Log, opts: { pre?: boolean; canceled?: boolean } = {}): Element {
  // Own data properties shadow whatever the element class defines (anchors, inputs, ...).
  const def = (k: string, value: unknown) => Object.defineProperty(el, k, { value, writable: true, configurable: true });
  def("_hasActivationBehavior", true);
  def("_activationBehavior", (e: Event) => log.calls.push(`activate ${name} phase=${e.eventPhase} target=${(e.target as Element | null)?.localName}`));
  def("_legacyPreActivationBehavior", opts.pre ? () => log.calls.push(`pre ${name}`) : undefined);
  def("_legacyCanceledActivationBehavior", opts.canceled ? () => log.calls.push(`canceled ${name}`) : undefined);
  return el;
}

describe("activation target — https://dom.spec.whatwg.org/#concept-event-dispatch", () => {
  test("step 6.5: the target's own activation behavior runs after dispatch, with phase NONE", () => {
    const log: Log = { calls: [] };
    const a = activatable(document.createElement("a"), "a", log);
    a.addEventListener("click", (e) => log.calls.push(`listener phase=${e.eventPhase}`));
    expect(a.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))).toBe(true);
    expect(log.calls).toEqual(["listener phase=2", "activate a phase=0 target=a"]);
  });

  test("step 6.9.5.1: for bubbling clicks the nearest ancestor with activation behavior is used", () => {
    const log: Log = { calls: [] };
    const outer = activatable(document.createElement("label"), "outer", log);
    const inner = activatable(outer.appendChild(document.createElement("a")), "inner", log);
    const span = inner.appendChild(document.createElement("span"));
    span.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(log.calls).toEqual(["activate inner phase=0 target=span"]);
  });

  test("non-bubbling clicks only consider the target", () => {
    const log: Log = { calls: [] };
    const outer = activatable(document.createElement("a"), "outer", log);
    const span = outer.appendChild(document.createElement("span"));
    span.dispatchEvent(new MouseEvent("click", { bubbles: false }));
    expect(log.calls).toEqual([]);
  });

  test("step 6.4: only MouseEvents (incl. PointerEvent) of type click are activation events", () => {
    const log: Log = { calls: [] };
    const a = activatable(document.createElement("a"), "a", log);
    a.dispatchEvent(new Event("click", { bubbles: true }));
    a.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    expect(log.calls).toEqual([]);
    a.dispatchEvent(new PointerEvent("click", { bubbles: true }));
    expect(log.calls).toEqual(["activate a phase=0 target=a"]);
  });

  test("_hasActivationBehavior must be strictly true", () => {
    const log: Log = { calls: [] };
    const a = activatable(document.createElement("a"), "a", log);
    Object.defineProperty(a, "_hasActivationBehavior", { value: 1 });
    a.dispatchEvent(new MouseEvent("click"));
    expect(log.calls).toEqual([]);
  });

  test("steps 6.12 and 12: pre-activation runs before listeners; canceled events run legacy-canceled instead", () => {
    const log: Log = { calls: [] };
    const input = activatable(document.createElement("input"), "input", log, { pre: true, canceled: true });
    input.addEventListener("click", () => log.calls.push("listener"));
    input.dispatchEvent(new MouseEvent("click", { cancelable: true }));
    expect(log.calls).toEqual(["pre input", "listener", "activate input phase=0 target=input"]);
    log.calls = [];
    input.addEventListener("click", (e) => e.preventDefault());
    expect(input.dispatchEvent(new MouseEvent("click", { cancelable: true }))).toBe(false);
    expect(log.calls).toEqual(["pre input", "listener", "canceled input"]);
  });

  test("activation behavior runs after the dispatch flag is cleared (the event can be re-dispatched)", () => {
    const a = document.createElement("x-a");
    let redispatched: boolean | null = null;
    Object.defineProperty(a, "_hasActivationBehavior", { value: true });
    (a as unknown as Record<string, unknown>)._activationBehavior = (e: Event) => {
      try {
        document.createElement("b").dispatchEvent(e);
        redispatched = true;
      } catch {
        redispatched = false;
      }
    };
    a.dispatchEvent(new MouseEvent("click"));
    expect(redispatched).toBe(true);
  });
});

describe("fire a synthetic pointer event — https://html.spec.whatwg.org/#fire-a-synthetic-pointer-event", () => {
  test("click(): untrusted PointerEvent, bubbles/cancelable/composed, view = window, pointerId -1", () => {
    const el = document.body!.appendChild(document.createElement("div"));
    let seen: PointerEvent | null = null;
    document.addEventListener("click", (e) => (seen = e as PointerEvent));
    expect(fireSyntheticPointerEvent("click", el, true)).toBe(true);
    const e = seen! as PointerEvent;
    expect(e).toBeInstanceOf(PointerEvent);
    expect([e.bubbles, e.cancelable, e.composed, e.isTrusted]).toEqual([true, true, true, false]);
    expect(e.view).toBe(document.defaultView);
    expect(e.pointerId).toBe(-1);
    expect(e.target).toBe(el);
  });
});
