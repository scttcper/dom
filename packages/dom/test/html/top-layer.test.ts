/**
 * Top layer user input: popover / dialog light dismiss, close requests, and focus fixup.
 *
 * Spec: HTML Standard
 *   - Popover light dismiss: https://html.spec.whatwg.org/#popover-light-dismiss
 *   - Dialog light dismiss: https://html.spec.whatwg.org/#dialog-light-dismiss
 *   - Close requests / close watchers: https://html.spec.whatwg.org/#close-requests
 *   - Focus fixup in update the rendering: https://html.spec.whatwg.org/#update-the-rendering
 *
 * Dispatched events (trusted or not) count as user input (docs/deviations.md), so these pin the
 * behavior user-event and fireEvent get.
 */
import { beforeEach, describe, expect, test } from "vitest";
import { createWindow, type Document } from "@rtd/dom";

let doc: any;
let win: any;

beforeEach(() => {
  win = createWindow();
  doc = win.document as Document;
});

function pointer(target: any, type: string): void {
  target.dispatchEvent(new win.PointerEvent(type, { bubbles: true, composed: true }));
}

function click(target: any): void {
  pointer(target, "pointerdown");
  pointer(target, "pointerup");
}

function escape(target: any): boolean {
  return target.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
}

describe("light dismiss open popovers — https://html.spec.whatwg.org/#light-dismiss-open-popovers", () => {
  test("pointerdown + pointerup outside hides an auto popover", () => {
    doc.body.innerHTML = `<div id=out>out</div><div popover id=p><span id=in>in</span></div>`;
    const p = doc.getElementById("p");
    p.showPopover();
    click(doc.getElementById("in"));
    expect(p.matches(":popover-open")).toBe(true);
    click(doc.getElementById("out"));
    expect(p.matches(":popover-open")).toBe(false);
  });

  test("manual popovers are not light dismissed", () => {
    doc.body.innerHTML = `<div id=out>out</div><div popover=manual id=p>p</div>`;
    const p = doc.getElementById("p");
    p.showPopover();
    click(doc.getElementById("out"));
    expect(p.matches(":popover-open")).toBe(true);
  });

  test("step 6: pointerdown and pointerup on different popover ancestors do not dismiss", () => {
    doc.body.innerHTML = `<div id=out>out</div><div popover id=p><span id=in>in</span></div>`;
    const p = doc.getElementById("p");
    p.showPopover();
    pointer(doc.getElementById("in"), "pointerdown");
    pointer(doc.getElementById("out"), "pointerup");
    expect(p.matches(":popover-open")).toBe(true);
  });

  test("clicking the invoker of a showing popover (topmost clicked popover) keeps it open until its activation", () => {
    doc.body.innerHTML = `<button popovertarget=p id=b>b</button><div popover id=p>p</div>`;
    const p = doc.getElementById("p");
    p.showPopover();
    click(doc.getElementById("b"));
    expect(p.matches(":popover-open")).toBe(true);
  });
});

describe("close requests — https://html.spec.whatwg.org/#close-requests", () => {
  test("an Escape keydown hides the topmost auto popover only", () => {
    doc.body.innerHTML = `<div popover id=a><div popover id=b>b</div></div>`;
    const a = doc.getElementById("a");
    const b = doc.getElementById("b");
    a.showPopover();
    b.showPopover();
    escape(doc.body);
    expect(b.matches(":popover-open")).toBe(false);
    expect(a.matches(":popover-open")).toBe(true);
  });

  test("a canceled Escape keydown is not a close request", () => {
    doc.body.innerHTML = `<div popover id=p>p</div>`;
    const p = doc.getElementById("p");
    p.showPopover();
    doc.addEventListener("keydown", (e: any) => e.preventDefault());
    escape(doc.body);
    expect(p.matches(":popover-open")).toBe(true);
  });

  test("Escape fires cancel then closes a modal dialog; preventDefault on cancel keeps it open", () => {
    doc.body.innerHTML = `<dialog id=d><button>x</button></dialog>`;
    const d = doc.getElementById("d");
    d.showModal();
    let cancels = 0;
    const prevent = (e: any) => {
      cancels++;
      e.preventDefault();
    };
    d.addEventListener("cancel", prevent);
    escape(d);
    expect(d.open).toBe(true);
    d.removeEventListener("cancel", prevent);
    d.addEventListener("cancel", () => cancels++);
    escape(d);
    expect(d.open).toBe(false);
    expect(cancels).toBe(2);
  });

  test("closedby=none: the dialog's disabled close watcher swallows the request", () => {
    doc.body.innerHTML = `<dialog id=d closedby=none>d</dialog>`;
    const d = doc.getElementById("d");
    d.showModal();
    escape(d);
    expect(d.open).toBe(true);
    // requestClose() still works: https://html.spec.whatwg.org/#enable-close-watcher-for-request-close
    d.requestClose("r");
    expect(d.open).toBe(false);
    expect(d.returnValue).toBe("r");
  });
});

describe("dialog light dismiss — https://html.spec.whatwg.org/#light-dismiss-open-dialogs", () => {
  test("closedby=any closes on a click outside, not inside", () => {
    doc.body.innerHTML = `<div id=out>out</div><dialog id=d closedby=any><span id=in>in</span></dialog>`;
    const d = doc.getElementById("d");
    d.show();
    click(doc.getElementById("in"));
    expect(d.open).toBe(true);
    click(doc.getElementById("out"));
    expect(d.open).toBe(false);
  });
});

describe("focus fixup — https://html.spec.whatwg.org/#update-the-rendering", () => {
  test("a focused element that becomes disabled loses focus (with blur) on the next animation frame", async () => {
    doc.body.innerHTML = `<button id=b>b</button>`;
    const b = doc.getElementById("b");
    b.focus();
    let blurred = false;
    b.addEventListener("blur", () => (blurred = true));
    b.disabled = true;
    expect(doc.activeElement).toBe(b);
    await new Promise((r) => win.requestAnimationFrame(r));
    expect(doc.activeElement).toBe(doc.body);
    expect(blurred).toBe(true);
  });

  test("showModal() moves focus out of content the dialog makes inert", () => {
    doc.body.innerHTML = `<input id=i><dialog id=d inert><input autofocus></dialog>`;
    doc.getElementById("i").focus();
    doc.getElementById("d").showModal();
    expect(doc.activeElement).toBe(doc.body);
  });
});
