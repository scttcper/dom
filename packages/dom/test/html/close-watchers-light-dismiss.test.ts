/**
 * Close watcher internals (cancel/close actions, enabled state, re-entrancy, destruction), light
 * dismiss bookkeeping for popovers and dialogs, popover hiding re-entrancy and method=dialog
 * submissions.
 *
 * Spec: HTML Standard
 *   - close watchers:      https://html.spec.whatwg.org/#close-watcher-cancel-action, https://html.spec.whatwg.org/#close-watcher-close-action,
 *                          https://html.spec.whatwg.org/#close-watcher-close, https://html.spec.whatwg.org/#close-watcher-destroy,
 *                          https://html.spec.whatwg.org/#close-watcher-get-enabled-state,
 *                          https://html.spec.whatwg.org/#close-watcher-is-running-cancel-action
 *   - light dismiss:       https://html.spec.whatwg.org/#run-light-dismiss-activities, https://html.spec.whatwg.org/#popover-pointerdown-target,
 *                          https://html.spec.whatwg.org/#topmost-clicked-popover, https://html.spec.whatwg.org/#dialog-pointerdown-target,
 *                          https://html.spec.whatwg.org/#nearest-clicked-dialog
 *   - popover hiding:      https://html.spec.whatwg.org/#hiding-popover-nesting-count
 *   - method=dialog:       https://html.spec.whatwg.org/#concept-fs-method
 *
 * jsdom has no close watchers, popovers or dialog methods; these assert the spec directly.
 */
import { beforeEach, describe, expect, test } from "vitest";
import { createWindow } from "@ctrl/dom";

/* eslint-disable @typescript-eslint/no-explicit-any */
let win: any;
let doc: any;
beforeEach(() => {
  win = createWindow();
  doc = win.document;
});

const $ = (id: string) => doc.getElementById(id);
const pointer = (target: any, type: string) => target.dispatchEvent(new win.PointerEvent(type, { bubbles: true, composed: true }));
const escape = (target: any) => target.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
const nextTask = () => new Promise((r) => setTimeout(r, 1));

function dialogLog(d: any): string[] {
  const log: string[] = [];
  for (const t of ["cancel", "close"]) d.addEventListener(t, () => log.push(t));
  return log;
}

describe("close watchers — https://html.spec.whatwg.org/#close-watcher-close", () => {
  test("cancel action fires cancel; canceling it keeps the dialog open, else the close action closes it (https://html.spec.whatwg.org/#close-watcher-cancel-action, https://html.spec.whatwg.org/#close-watcher-close-action)", async () => {
    doc.body.innerHTML = `<dialog id=d>d</dialog>`;
    const log = dialogLog($("d"));
    $("d").showModal();
    $("d").addEventListener("cancel", (e: any) => e.preventDefault(), { once: true });
    escape(doc.body);
    const kept = $("d").open;
    escape(doc.body);
    await nextTask();
    expect([kept, $("d").open, log]).toEqual([true, false, ["cancel", "cancel", "close"]]);
  });

  test("a close request from inside the cancel action does not re-enter it (https://html.spec.whatwg.org/#close-watcher-is-running-cancel-action)", () => {
    doc.body.innerHTML = `<dialog id=d>d</dialog>`;
    const log = dialogLog($("d"));
    $("d").showModal();
    $("d").addEventListener("cancel", () => $("d").requestClose(), { once: true });
    escape(doc.body);
    expect(log.filter((l) => l === "cancel")).toEqual(["cancel"]);
  });

  test("closing destroys the watcher: a later Escape fires nothing (https://html.spec.whatwg.org/#close-watcher-destroy)", async () => {
    doc.body.innerHTML = `<dialog id=d>d</dialog>`;
    $("d").showModal();
    $("d").close();
    await nextTask();
    const log = dialogLog($("d"));
    escape(doc.body);
    await nextTask();
    expect(log).toEqual([]);
  });

  test("closedby=none disables the watcher; switching to any enables it (https://html.spec.whatwg.org/#close-watcher-get-enabled-state)", () => {
    doc.body.innerHTML = `<dialog id=d closedby=none>d</dialog>`;
    const log = dialogLog($("d"));
    $("d").showModal();
    escape(doc.body);
    const disabled = [$("d").open, [...log]];
    $("d").setAttribute("closedby", "any");
    escape(doc.body);
    expect([disabled, $("d").open]).toEqual([[true, []], false]);
  });
});

describe("light dismiss — https://html.spec.whatwg.org/#run-light-dismiss-activities", () => {
  test("pointerdown inside and pointerup outside does not dismiss: both must hit the same topmost clicked popover (https://html.spec.whatwg.org/#popover-pointerdown-target, https://html.spec.whatwg.org/#topmost-clicked-popover)", () => {
    doc.body.innerHTML = `<div id=out>o</div><div id=p popover><span id=in>i</span></div>`;
    $("p").showPopover();
    pointer($("in"), "pointerdown");
    pointer($("out"), "pointerup");
    const afterDrag = $("p").matches(":popover-open");
    pointer($("out"), "pointerdown");
    pointer($("out"), "pointerup");
    expect([afterDrag, $("p").matches(":popover-open")]).toEqual([true, false]);
  });

  test("a click on an invoker inside a nested popover keeps the chain open (the target popover outranks the clicked one)", () => {
    doc.body.innerHTML = `<div id=a popover><button id=btn popovertarget=b>b</button></div><div id=b popover>b</div>`;
    $("a").showPopover();
    $("btn").click();
    pointer($("btn"), "pointerdown");
    pointer($("btn"), "pointerup");
    expect([$("a").matches(":popover-open"), $("b").matches(":popover-open")]).toEqual([true, true]);
  });

  test("closedby=any dialogs close on a pointerdown/pointerup pair outside them, not when the pair straddles (https://html.spec.whatwg.org/#dialog-pointerdown-target, https://html.spec.whatwg.org/#nearest-clicked-dialog)", async () => {
    doc.body.innerHTML = `<div id=out>o</div><dialog id=d closedby=any><span id=in>i</span></dialog>`;
    $("d").show();
    pointer($("in"), "pointerdown");
    pointer($("out"), "pointerup");
    const straddle = $("d").open;
    pointer($("out"), "pointerdown");
    pointer($("out"), "pointerup");
    expect([straddle, $("d").open]).toEqual([true, false]);
  });
});

describe("popover hiding nesting — https://html.spec.whatwg.org/#hiding-popover-nesting-count", () => {
  test("showing a popover from a beforetoggle listener while another one is hiding throws InvalidStateError", () => {
    doc.body.innerHTML = `<div id=a popover=manual>a</div><div id=b popover=manual>b</div>`;
    $("a").showPopover();
    let thrown = "";
    $("a").addEventListener("beforetoggle", (e: any) => {
      if (e.newState !== "closed") return;
      try {
        $("b").showPopover();
      } catch (err) {
        thrown = (err as Error).name;
      }
    });
    $("a").hidePopover();
    expect([thrown, $("b").matches(":popover-open")]).toEqual(["InvalidStateError", false]);
  });
});

describe("method=dialog — https://html.spec.whatwg.org/#concept-fs-method", () => {
  test("submitting a method=dialog form closes its dialog with the submitter's value; formmethod=dialog overrides", async () => {
    doc.body.innerHTML = `<dialog id=d><form method=dialog><button id=ok value=yes>ok</button></form></dialog><dialog id=e><form method=post><button id=over formmethod=dialog value=over>o</button></form></dialog>`;
    $("d").showModal();
    $("ok").click();
    $("e").show();
    $("over").click();
    expect([$("d").open, $("d").returnValue, $("e").open, $("e").returnValue]).toEqual([false, "yes", false, "over"]);
  });

  test("a method=dialog form outside any dialog submits nothing and does not navigate", () => {
    doc.body.innerHTML = `<form id=f method=dialog><button id=go>go</button></form>`;
    const log: string[] = [];
    $("f").addEventListener("submit", () => log.push("submit"));
    $("go").click();
    expect(log).toEqual(["submit"]);
  });
});
