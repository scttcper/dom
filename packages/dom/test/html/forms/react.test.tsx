/**
 * React 19 controlled form controls on @rtd/dom.
 *
 * React's inputValueTracking wraps the `value`/`checked` property descriptors from
 * HTMLInputElement/HTMLTextAreaElement.prototype and fires onChange only when the DOM value
 * differs from the tracked one. These tests pin that contract:
 *   https://html.spec.whatwg.org/#dom-input-value (accessors on the prototype)
 *   https://html.spec.whatwg.org/#the-input-element:activation-behaviour (click → input/change)
 *   https://html.spec.whatwg.org/#the-select-element (select value / change)
 */
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createWindow, installGlobals } from "@rtd/dom";
import { act, useState } from "react";
import type { Root } from "react-dom/client";
import { setUIValue } from "../../../src/html/forms/ui.ts";

// react-dom feature-detects the DOM (`canUseDOM`, `'oninput' in document`) when it is first
// evaluated, so it must load after a window is installed as the global — as in a jsdom/rtd
// vitest environment.
const bootstrap = installGlobals(createWindow());
const { createRoot } = await import("react-dom/client");
bootstrap();

// biome-ignore lint: untyped DOM surface in tests
let window: any;
let uninstall: () => void;
let root: Root;
let container: any;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  window = createWindow();
  // TODO(html-elements): remove once HTMLIFrameElement is exposed (react-dom's getActiveElementDeep uses it).
  uninstall = installGlobals(window);
  const g = globalThis as { HTMLIFrameElement?: unknown };
  if (typeof g.HTMLIFrameElement !== "function") g.HTMLIFrameElement = class HTMLIFrameElement {};
  container = window.document.createElement("div");
  window.document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  uninstall();
});

function render(node: React.ReactNode): void {
  act(() => root.render(node));
}

/** What user-event does for typing: set the UI value, then dispatch a bubbling input event. */
function type(el: any, value: string): void {
  act(() => {
    setUIValue(el, value);
    el.dispatchEvent(new window.InputEvent("input", { bubbles: true }));
  });
}

describe("controlled inputs — https://html.spec.whatwg.org/#dom-input-value", () => {
  test("text input: onChange fires for a UI edit and the controlled value sticks", () => {
    const seen: string[] = [];
    function C() {
      const [v, setV] = useState("a");
      return <input value={v} onChange={(e) => (seen.push(e.target.value), setV(e.target.value.toUpperCase()))} />;
    }
    render(<C />);
    const el = container.firstChild;
    expect(el.value).toBe("a");
    type(el, "ab");
    expect(seen).toEqual(["ab"]);
    expect(el.value).toBe("AB");
  });

  test("a rejected change is reverted to the controlled value", () => {
    function C() {
      return <input value="fixed" onChange={() => {}} />;
    }
    render(<C />);
    const el = container.firstChild;
    type(el, "other");
    expect(el.value).toBe("fixed");
  });

  test("checkbox: click toggles, onChange fires, controlled state wins", () => {
    const seen: boolean[] = [];
    function C() {
      const [on, setOn] = useState(false);
      return <input type="checkbox" checked={on} onChange={(e) => (seen.push(e.target.checked), setOn(e.target.checked))} />;
    }
    render(<C />);
    const el = container.firstChild;
    act(() => el.click());
    expect(seen).toEqual([true]);
    expect(el.checked).toBe(true);
    act(() => el.click());
    expect(el.checked).toBe(false);
  });

  test("radios: onChange fires for the clicked radio and the group stays exclusive", () => {
    const seen: string[] = [];
    function C() {
      const [v, setV] = useState("a");
      return (
        <div>
          {["a", "b"].map((x) => (
            <input key={x} type="radio" name="g" value={x} checked={v === x} onChange={(e) => (seen.push(e.target.value), setV(x))} />
          ))}
        </div>
      );
    }
    render(<C />);
    const [a, b] = container.querySelectorAll("input");
    act(() => b.click());
    expect(seen).toEqual(["b"]);
    expect([a.checked, b.checked]).toEqual([false, true]);
  });

  test("select: change event updates the controlled value", () => {
    function C() {
      const [v, setV] = useState("2");
      return (
        <select value={v} onChange={(e) => setV(e.target.value)}>
          <option value="1">one</option>
          <option value="2">two</option>
        </select>
      );
    }
    render(<C />);
    const el = container.firstChild;
    expect(el.value).toBe("2");
    act(() => {
      el.options[0].selected = true;
      el.dispatchEvent(new window.Event("change", { bubbles: true }));
    });
    expect(el.value).toBe("1");
    expect(el.selectedIndex).toBe(0);
  });

  test("textarea: onChange fires for a UI edit", () => {
    const seen: string[] = [];
    function C() {
      const [v, setV] = useState("x");
      return <textarea value={v} onChange={(e) => (seen.push(e.target.value), setV(e.target.value))} />;
    }
    render(<C />);
    const el = container.firstChild;
    expect(el.value).toBe("x");
    type(el, "xy");
    expect(seen).toEqual(["xy"]);
    expect(el.value).toBe("xy");
  });

  test("form onSubmit receives the submitter and FormData sees controlled values", () => {
    let entries: [string, unknown][] = [];
    function C() {
      return (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            entries = [...new window.FormData(e.currentTarget)];
          }}
        >
          <input name="user" defaultValue="ann" />
          <button>go</button>
        </form>
      );
    }
    render(<C />);
    act(() => container.querySelector("button").click());
    expect(entries).toEqual([["user", "ann"]]);
  });
});
