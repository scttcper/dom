/**
 * Element tasks (toggle events of <details>, popovers and dialogs, dialog `close`) are queued on
 * the element's window, i.e. through the timers of the global the window is installed on — the
 * test file's virtual clock or fake timers — never on the host realm's own `setTimeout`.
 *
 * Specs: HTML Standard
 *   - Queue an element task: https://html.spec.whatwg.org/#queue-an-element-task
 *   - Details toggle event task: https://html.spec.whatwg.org/#queue-a-details-toggle-event-task
 *   - Popover toggle event task: https://html.spec.whatwg.org/#queue-a-popover-toggle-event-task
 *   - Dialog close steps (step 13): https://html.spec.whatwg.org/#close-the-dialog
 *   - Close a browsing context (no tasks run afterwards): https://html.spec.whatwg.org/#close-a-browsing-context
 *
 * Under @ctrl/dom-jest-environment @ctrl/dom is loaded outside the test file's vm global; tasks on the
 * host realm's real timers raced user-event's waits on the file's virtual clock (Sentry's
 * CollapsibleContent "fires onToggle" saw no `toggle` after `await user.click()`).
 */
import { afterEach, describe, expect, test } from "vitest";
import { createWindow, installGlobals, type Window } from "@ctrl/dom";

type Pending = { fn: () => void; cleared: boolean };

/** A scratch global whose setTimeout only records (nothing runs until `flush`). */
function fakeGlobal() {
  const pending: Pending[] = [];
  const global: Record<PropertyKey, unknown> = {
    setTimeout(fn: () => void) {
      const p = { fn, cleared: false };
      pending.push(p);
      return p;
    },
    clearTimeout(p: Pending) {
      if (p) p.cleared = true;
    },
  };
  const flush = () => {
    for (const p of pending.splice(0)) if (!p.cleared) p.fn();
  };
  return { global, pending, flush };
}

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
});

function setup() {
  const fake = fakeGlobal();
  const window: Window = createWindow();
  const uninstall = installGlobals(window, fake.global);
  cleanup = () => {
    uninstall();
    window.close();
  };
  return { ...fake, window, document: window.document as any };
}

describe("queue an element task — https://html.spec.whatwg.org/#queue-an-element-task", () => {
  test("<details> toggle is scheduled through the window's global's setTimeout", () => {
    const { pending, flush, document } = setup();
    document.body.innerHTML = "<details><summary>s</summary>body</details>";
    const details = document.querySelector("details");
    const seen: string[] = [];
    details.addEventListener("toggle", (e: { newState: string }) => seen.push(e.newState));
    details.querySelector("summary").click();
    expect(details.open).toBe(true);
    expect(seen).toEqual([]);
    expect(pending.length).toBe(1);
    flush();
    expect(seen).toEqual(["open"]);
  });

  test("popover toggle and dialog close are scheduled the same way", () => {
    const { pending, flush, document } = setup();
    document.body.innerHTML = "<div popover id=p>p</div><dialog id=d open>d</dialog>";
    const seen: string[] = [];
    const p = document.getElementById("p");
    const d = document.getElementById("d");
    p.addEventListener("toggle", (e: { newState: string }) => seen.push(`popover ${e.newState}`));
    d.addEventListener("close", () => seen.push("dialog close"));
    p.showPopover();
    d.close();
    expect(seen).toEqual([]);
    expect(pending.length).toBeGreaterThanOrEqual(2);
    flush();
    expect(seen).toEqual(["popover open", "dialog close"]);
  });

  test("window.close() cancels pending element tasks — https://html.spec.whatwg.org/#close-a-browsing-context", () => {
    const { flush, window, document } = setup();
    document.body.innerHTML = "<details><summary>s</summary>body</details>";
    const details = document.querySelector("details");
    let fired = false;
    details.addEventListener("toggle", () => (fired = true));
    details.open = true;
    window.close();
    flush();
    expect(fired).toBe(false);
  });
});
