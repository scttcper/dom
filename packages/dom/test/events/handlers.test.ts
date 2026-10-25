/**
 * Event handler IDL attributes.
 *
 * Spec: HTML §8.1.8 "Events" — event handlers
 *   https://html.spec.whatwg.org/#event-handler-attributes
 *   https://html.spec.whatwg.org/#event-handler-idl-attributes
 *   https://html.spec.whatwg.org/#the-event-handler-processing-algorithm
 *   https://html.spec.whatwg.org/#determining-the-target-of-an-event-handler
 *
 * Related WPT: html/webappapis/scripting/events/event-handler-processing-algorithm*.html,
 * dom/events/Event-dispatch-handlers-changed.html. Content attributes are not compiled
 * (docs/deviations.md), so only the IDL half is tested.
 */
import { beforeEach, describe, expect, test } from "vitest";
import { ErrorEvent, Event, type Document, type Window } from "@ctrl/dom";
import { setup } from "./helpers.ts";

let window: Window;
let document: Document;

type WithHandlers = Record<string, unknown>;

beforeEach(() => {
  ({ window, document } = setup());
});

describe("event handler IDL attributes — https://html.spec.whatwg.org/#event-handler-idl-attributes", () => {
  test("getter defaults to null; setter stores functions; non-objects become null", () => {
    const el = document.createElement("div") as unknown as WithHandlers & EventTarget;
    expect(el.onclick).toBeNull();
    const fn = () => {};
    el.onclick = fn;
    expect(el.onclick).toBe(fn);
    el.onclick = "alert(1)";
    expect(el.onclick).toBeNull();
    el.onclick = 5;
    expect(el.onclick).toBeNull();
  });

  test("handlers are invoked with this = currentTarget and the event", () => {
    const el = document.createElement("button") as unknown as WithHandlers & HTMLLike;
    let self: unknown;
    let arg: unknown;
    el.onclick = function (this: unknown, e: Event) {
      self = this;
      arg = e;
    };
    const ev = new Event("click");
    el.dispatchEvent(ev);
    expect(self).toBe(el);
    expect(arg).toBe(ev);
  });

  test("activation: the listener keeps its original position when the handler value changes", () => {
    const el = document.createElement("div") as unknown as WithHandlers & HTMLLike;
    const calls: string[] = [];
    el.onclick = () => calls.push("handler1");
    el.addEventListener("click", () => calls.push("listener"));
    el.onclick = () => calls.push("handler2");
    el.dispatchEvent(new Event("click"));
    expect(calls).toEqual(["handler2", "listener"]);
  });

  test("deactivation: setting null removes the listener; setting again appends a new one", () => {
    const el = document.createElement("div") as unknown as WithHandlers & HTMLLike;
    const calls: string[] = [];
    el.onclick = () => calls.push("handler");
    el.addEventListener("click", () => calls.push("listener"));
    el.onclick = null;
    el.dispatchEvent(new Event("click"));
    expect(calls).toEqual(["listener"]);
    calls.length = 0;
    el.onclick = () => calls.push("handler");
    el.dispatchEvent(new Event("click"));
    expect(calls).toEqual(["listener", "handler"]);
  });

  test("processing step 5: returning false cancels the event (true does not)", () => {
    const el = document.createElement("a") as unknown as WithHandlers & HTMLLike;
    el.onclick = () => false;
    expect(el.dispatchEvent(new Event("click", { cancelable: true }))).toBe(false);
    el.onclick = () => true;
    expect(el.dispatchEvent(new Event("click", { cancelable: true }))).toBe(true);
  });

  test("special error event handling on Window: onerror(message, source, lineno, colno, error); true cancels", () => {
    const w = window as unknown as WithHandlers & HTMLLike;
    let args: unknown[] = [];
    w.onerror = (...a: unknown[]) => {
      args = a;
      return true;
    };
    const error = new Error("x");
    const ev = new ErrorEvent("error", { cancelable: true, message: "m", filename: "f", lineno: 1, colno: 2, error });
    expect(w.dispatchEvent(ev)).toBe(false);
    expect(args).toEqual(["m", "f", 1, 2, error]);
  });

  test("onerror on elements receives the event (no special handling)", () => {
    const img = document.createElement("img") as unknown as WithHandlers & HTMLLike;
    let arg: unknown;
    img.onerror = (e: unknown) => {
      arg = e;
    };
    const ev = new ErrorEvent("error", { message: "m" });
    img.dispatchEvent(ev);
    expect(arg).toBe(ev);
  });

  test("body/frameset reflect WindowEventHandlers and blur/error/focus/load/resize/scroll from the Window", () => {
    const body = document.body as unknown as WithHandlers;
    const fn = () => {};
    body.onload = fn;
    expect((window as unknown as WithHandlers).onload).toBe(fn);
    body.onhashchange = fn;
    expect((window as unknown as WithHandlers).onhashchange).toBe(fn);
    body.onclick = fn;
    expect((window as unknown as WithHandlers).onclick).toBeNull();
  });

  test("handlers exist on HTMLElement, SVGElement, Document and Window prototypes", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    for (const target of [document.createElement("div"), svg, document, window]) {
      expect("onclick" in target, String(target)).toBe(true);
      expect("oninput" in target).toBe(true);
      expect("onpointerdown" in target).toBe(true);
      expect("ontouchstart" in target).toBe(true);
    }
    expect("onpopstate" in window).toBe(true);
    expect("onreadystatechange" in document).toBe(true);
    expect("onpopstate" in document.createElement("div")).toBe(false);
  });
});

interface HTMLLike {
  addEventListener(type: string, fn: (e: Event) => void): void;
  dispatchEvent(e: Event): boolean;
}
type EventTarget = HTMLLike;
