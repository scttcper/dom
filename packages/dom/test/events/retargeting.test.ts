/**
 * Event paths through shadow trees: retargeting, relatedTarget, composed, composedPath.
 *
 * Spec: DOM Standard §2.9 "Dispatching events", §4.8 shadow trees
 *   https://dom.spec.whatwg.org/#retarget
 *   https://dom.spec.whatwg.org/#get-the-parent (ShadowRoot)
 *   https://dom.spec.whatwg.org/#concept-event-dispatch
 *   https://dom.spec.whatwg.org/#dom-event-composedpath
 *
 * Ported from WPT dom/events/relatedTarget.window.js, dom/events/Event-dispatch-listener-order.window.js
 * and shadow-dom/event-composed-path.html / event-inside-shadow-tree.html (basics).
 */
import { beforeEach, describe, expect, test } from "vitest";
import { CustomEvent, Event, EventTarget, FocusEvent, MouseEvent, type Document, type Element, type ShadowRoot, type Window } from "@rtd/dom";
import { setup } from "./helpers.ts";

let window: Window;
let document: Document;

beforeEach(() => {
  ({ window, document } = setup());
});

describe("retargeting — https://dom.spec.whatwg.org/#retarget", () => {
  // https://github.com/web-platform-tests/wpt/blob/master/dom/events/Event-dispatch-listener-order.window.js
  test("listener order through a closed shadow root (composed event)", () => {
    const hostParent = document.createElement("section");
    const host = hostParent.appendChild(document.createElement("div"));
    const shadowRoot = host.attachShadow({ mode: "closed" });
    const targetParent = shadowRoot.appendChild(document.createElement("p"));
    const target = targetParent.appendChild(document.createElement("span"));
    const path = [hostParent, host, shadowRoot, targetParent, target];
    const expected: string[] = [];
    const result: string[] = [];
    path.forEach((node, index) => {
      expected.splice(index, 0, "capturing " + node.nodeName);
      expected.splice(index + 1, 0, "bubbling " + node.nodeName);
    });
    for (const node of path) {
      node.addEventListener("test", () => result.push("bubbling " + node.nodeName));
      node.addEventListener("test", () => result.push("capturing " + node.nodeName), true);
    }
    target.dispatchEvent(new CustomEvent("test", { detail: {}, bubbles: true, composed: true }));
    expect(result).toEqual(expected);
  });

  test("listeners outside the shadow tree see the host as target; inside see the real target", () => {
    const host = document.body!.appendChild(document.createElement("div"));
    const root = host.attachShadow({ mode: "open" });
    const inner = root.appendChild(document.createElement("button"));
    const seen: [string, unknown][] = [];
    inner.addEventListener("click", (e) => seen.push(["inner", e.target]));
    root.addEventListener("click", (e) => seen.push(["root", e.target]));
    host.addEventListener("click", (e) => seen.push(["host", e.target]));
    document.addEventListener("click", (e) => seen.push(["document", e.target]));
    const ev = new MouseEvent("click", { bubbles: true, composed: true });
    inner.dispatchEvent(ev);
    expect(seen).toEqual([
      ["inner", inner],
      ["root", inner],
      ["host", host],
      ["document", host],
    ]);
    // After dispatch the target is the last retargeted value (host is in the document tree).
    expect(ev.target).toBe(host);
  });

  test("ShadowRoot get the parent: non-composed events stop at the shadow root", () => {
    const host = document.body!.appendChild(document.createElement("div"));
    const root = host.attachShadow({ mode: "open" });
    const inner = root.appendChild(document.createElement("span"));
    let path: unknown[] = [];
    inner.addEventListener("x", (e) => (path = e.composedPath()));
    let reachedHost = false;
    host.addEventListener("x", () => (reachedHost = true));
    const ev = new Event("x", { bubbles: true });
    inner.dispatchEvent(ev);
    expect(path).toEqual([inner, root]);
    expect(reachedHost).toBe(false);
    // clearTargets: the target was in a shadow tree.
    expect(ev.target).toBeNull();
  });

  test("composedPath hides closed shadow trees from listeners outside them", () => {
    const host = document.body!.appendChild(document.createElement("div"));
    const root = host.attachShadow({ mode: "closed" });
    const inner = root.appendChild(document.createElement("span"));
    let insidePath: unknown[] = [];
    let outsidePath: unknown[] = [];
    inner.addEventListener("x", (e) => (insidePath = e.composedPath()));
    document.body!.addEventListener("x", (e) => (outsidePath = e.composedPath()));
    inner.dispatchEvent(new Event("x", { bubbles: true, composed: true }));
    expect(insidePath).toEqual([inner, root, host, document.body, document.documentElement, document, window]);
    expect(outsidePath).toEqual([host, document.body, document.documentElement, document, window]);
  });
});

// https://github.com/web-platform-tests/wpt/blob/master/dom/events/relatedTarget.window.js
// (XMLHttpRequest replaced by a plain EventTarget: also a non-node target.)
describe("relatedTarget retargeting — https://dom.spec.whatwg.org/#concept-event-dispatch", () => {
  let host: Element;
  let shadow: ShadowRoot;
  let slot: Element;

  beforeEach(() => {
    host = document.createElement("div");
    host.appendChild(document.createElement("p"));
    shadow = host.attachShadow({ mode: "closed" });
    slot = shadow.appendChild(document.createElement("slot"));
  });

  test("reset if target pointed to a shadow tree", () => {
    for (const target of [shadow, slot]) {
      for (const relatedTarget of [new EventTarget(), window, host]) {
        const event = new FocusEvent("demo", { relatedTarget: relatedTarget as never });
        target.dispatchEvent(event);
        expect(event.target).toBeNull();
        expect(event.relatedTarget).toBeNull();
      }
    }
  });

  test("retarget a shadow-tree relatedTarget", () => {
    for (const relatedTarget of [shadow, slot]) {
      // Intentional difference: WPT also lists `host` as a target here. Retargeting the
      // relatedTarget against host yields host itself, so dispatch step 6 is skipped and, per
      // the spec text (and jsdom), target/relatedTarget are never updated. See the early-return
      // test below.
      for (const target of [new EventTarget(), window]) {
        const event = new FocusEvent("demo", { relatedTarget });
        target.dispatchEvent(event);
        expect(event.target).toBe(target);
        expect(event.relatedTarget).toBe(host);
      }
    }
  });

  test("reset if target pointed to a shadow tree pre-dispatch", () => {
    const shadowChild = shadow.appendChild(document.createElement("div"));
    shadowChild.addEventListener("demo", () => document.body!.appendChild(shadowChild));
    const event = new FocusEvent("demo", { relatedTarget: new EventTarget() as never });
    shadowChild.dispatchEvent(event);
    expect(shadowChild.parentNode).toBe(document.body);
    expect(event.target).toBeNull();
    expect(event.relatedTarget).toBeNull();
  });

  test("retarget a shadow-tree relatedTarget, part 2", () => {
    const shadowChild = shadow.appendChild(document.createElement("div"));
    document.body!.addEventListener("demo", () => document.body!.appendChild(shadowChild));
    const event = new FocusEvent("demo", { relatedTarget: shadowChild });
    document.body!.dispatchEvent(event);
    expect(shadowChild.parentNode).toBe(document.body);
    expect(event.target).toBe(document.body);
    expect(event.relatedTarget).toBe(host);
  });

  test("early return (target === retargeted relatedTarget): no listeners run, dispatch flag cleared", () => {
    const event = new FocusEvent("heya", { relatedTarget: shadow, cancelable: true });
    let called = false;
    host.addEventListener("heya", () => (called = true));
    event.preventDefault();
    expect(event.defaultPrevented).toBe(true);
    expect(host.dispatchEvent(event)).toBe(false);
    expect(called).toBe(false);
    expect(event.target).toBeNull();
    // Intentional difference from the WPT file: it also expects relatedTarget to be reset to
    // null, which the spec text (and jsdom) do not do when step 6 is skipped. We follow the spec.
    event.initEvent("x");
    expect(event.type).toBe("x");
  });

  test("mouseover relatedTarget inside the same shadow tree is not retargeted for inner listeners", () => {
    const root = document.body!.appendChild(document.createElement("div")).attachShadow({ mode: "open" });
    const a = root.appendChild(document.createElement("a"));
    const b = root.appendChild(document.createElement("b"));
    let inner: unknown;
    let outer: unknown;
    b.addEventListener("mouseover", (e) => (inner = (e as MouseEvent).relatedTarget));
    document.addEventListener("mouseover", (e) => (outer = (e as MouseEvent).relatedTarget));
    b.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, composed: true, relatedTarget: a }));
    expect(inner).toBe(a);
    // Outside the shadow tree target and relatedTarget both retarget to the host, so the event
    // stops at the host (step 6.9.6) and never reaches the document.
    expect(outer).toBeUndefined();
  });
});
