/**
 * <dialog>, popover and <details> state machines: setup/cleanup steps, toggle event task
 * coalescing, closed-by state, focusing steps, popover validity and nesting, details groups.
 *
 * Spec: HTML Standard
 *   - the dialog element:                 https://html.spec.whatwg.org/#the-dialog-element
 *   - dialog setup / cleanup steps:       https://html.spec.whatwg.org/#dialog-setup-steps
 *                                         https://html.spec.whatwg.org/#dialog-cleanup-steps
 *   - queue a dialog toggle event task:   https://html.spec.whatwg.org/#queue-a-dialog-toggle-event-task
 *   - computed closed-by state:           https://html.spec.whatwg.org/#computed-closed-by-state
 *   - dialog request close:               https://html.spec.whatwg.org/#dialog-request-close
 *   - close the dialog:                   https://html.spec.whatwg.org/#close-the-dialog
 *   - dialog focusing steps:              https://html.spec.whatwg.org/#dialog-focusing-steps
 *   - the popover attribute:              https://html.spec.whatwg.org/#the-popover-attribute
 *   - check popover validity:             https://html.spec.whatwg.org/#check-popover-validity
 *   - queue a popover toggle event task:  https://html.spec.whatwg.org/#queue-a-popover-toggle-event-task
 *   - popover focusing steps:             https://html.spec.whatwg.org/#popover-focusing-steps
 *   - hide popover algorithm:             https://html.spec.whatwg.org/#hide-popover-algorithm
 *   - topmost popover ancestor:           https://html.spec.whatwg.org/#topmost-popover-ancestor
 *   - the details element:                https://html.spec.whatwg.org/#the-details-element
 *   - details name group:                 https://html.spec.whatwg.org/#details-name-group
 *
 * jsdom implements none of dialog's methods or popovers, so these assert the spec directly.
 * Modal/drawer/menu components (Radix Dialog, React Aria Popover, Headless UI Disclosure) are
 * built on exactly these transitions.
 */
import { beforeEach, describe, expect, test } from "vitest";
import { createWindow } from "@rtd/dom";

let win: any;
let doc: any;

beforeEach(() => {
  win = createWindow();
  doc = win.document;
});

const nextTask = () => new Promise((r) => setTimeout(r, 1));

function escape(target: any): void {
  target.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
}

function recordToggles(el: any): string[] {
  const log: string[] = [];
  for (const type of ["beforetoggle", "toggle"]) {
    el.addEventListener(type, (e: any) => log.push(`${type}:${e.oldState}->${e.newState}${e.cancelable ? " (cancelable)" : ""}`));
  }
  return log;
}

function dialog(html = ""): any {
  doc.body.innerHTML = `<dialog id=d>${html}</dialog>`;
  return doc.getElementById("d");
}

describe("returnValue and close the dialog — https://html.spec.whatwg.org/#close-the-dialog", () => {
  test("returnValue starts empty and is settable", () => {
    const d = dialog();
    expect(d.returnValue).toBe("");
    d.returnValue = 5;
    expect(d.returnValue).toBe("5");
  });

  test("step 9: close() without an argument keeps the previous returnValue; close(\"\") overwrites it", () => {
    const d = dialog();
    d.show();
    d.close("first");
    d.show();
    d.close();
    expect(d.returnValue).toBe("first");
    d.show();
    d.close("");
    expect(d.returnValue).toBe("");
  });

  test("step 1: closing a dialog without the open attribute does nothing (no events)", async () => {
    const d = dialog();
    const log = recordToggles(d);
    let closes = 0;
    d.addEventListener("close", () => closes++);
    d.close("x");
    await nextTask();
    expect(log).toEqual([]);
    expect(closes).toBe(0);
    expect(d.returnValue).toBe("");
  });

  test("step 2: beforetoggle on close is not cancelable; step 13: close fires in a later task, once", async () => {
    const d = dialog();
    d.show();
    await nextTask();
    const log = recordToggles(d);
    let closes = 0;
    d.addEventListener("close", () => closes++);
    d.close();
    expect(log).toEqual(["beforetoggle:open->closed"]);
    expect(closes).toBe(0);
    await nextTask();
    expect(log).toEqual(["beforetoggle:open->closed", "toggle:open->closed"]);
    expect(closes).toBe(1);
  });
});

describe("queue a dialog toggle event task — https://html.spec.whatwg.org/#queue-a-dialog-toggle-event-task", () => {
  test("step 1: show() then close() in one task fires one toggle with the original old state", async () => {
    const d = dialog();
    const log = recordToggles(d);
    d.show();
    d.close();
    await nextTask();
    expect(log).toEqual(["beforetoggle:closed->open (cancelable)", "beforetoggle:open->closed", "toggle:closed->closed"]);
  });

  test("showModal() fires a cancelable beforetoggle; canceling leaves the dialog closed and queues no toggle", async () => {
    const d = dialog();
    const log = recordToggles(d);
    d.addEventListener("beforetoggle", (e: any) => e.preventDefault(), { once: true });
    d.showModal();
    await nextTask();
    expect(d.open).toBe(false);
    expect(log).toEqual(["beforetoggle:closed->open (cancelable)"]);
  });
});

describe("show() and showModal() preconditions — https://html.spec.whatwg.org/#dom-dialog-show", () => {
  test("show() step 1: on an open non-modal dialog it is a no-op (no beforetoggle)", () => {
    const d = dialog();
    d.show();
    const log = recordToggles(d);
    d.show();
    expect(log).toEqual([]);
  });

  test("show() step 2: on an open modal dialog it throws InvalidStateError", () => {
    const d = dialog();
    d.showModal();
    expect(() => d.show()).toThrow(expect.objectContaining({ name: "InvalidStateError" }));
  });

  test("showModal() step 1: on an already modal dialog it is a no-op", () => {
    const d = dialog();
    d.showModal();
    const log = recordToggles(d);
    d.showModal();
    expect(log).toEqual([]);
    expect(d.matches(":modal")).toBe(true);
  });

  test("showModal() step 5: a dialog that is a showing popover throws InvalidStateError", () => {
    const d = dialog();
    d.setAttribute("popover", "manual");
    d.showPopover();
    expect(() => d.showModal()).toThrow(expect.objectContaining({ name: "InvalidStateError" }));
  });

  test("check popover validity step 3: showPopover() on a modal dialog throws InvalidStateError; a non-modal open one may show", () => {
    const d = dialog();
    d.setAttribute("popover", "manual");
    d.showModal();
    expect(() => d.showPopover()).toThrow(expect.objectContaining({ name: "InvalidStateError" }));
    d.close();
    d.show();
    d.showPopover();
    expect(d.matches(":popover-open")).toBe(true);
  });

  test("show() steps 8–10: showing a dialog hides showing auto popovers it is not nested in", () => {
    doc.body.innerHTML = "<div popover id=p>p</div><dialog id=d></dialog>";
    const p = doc.getElementById("p");
    p.showPopover();
    doc.getElementById("d").show();
    expect(p.matches(":popover-open")).toBe(false);
  });

  test("show() steps 8–10: a dialog inside a showing popover keeps it open", () => {
    doc.body.innerHTML = "<div popover id=p><dialog id=d></dialog></div>";
    const p = doc.getElementById("p");
    p.showPopover();
    doc.getElementById("d").show();
    expect(p.matches(":popover-open")).toBe(true);
  });
});

describe("computed closed-by state — https://html.spec.whatwg.org/#computed-closed-by-state", () => {
  test("Auto state: \"none\" while not modal, \"closerequest\" while modal", () => {
    const d = dialog();
    expect(d.closedBy).toBe("none");
    d.show();
    expect(d.closedBy).toBe("none");
    d.close();
    d.showModal();
    expect(d.closedBy).toBe("closerequest");
  });

  test("keywords are ASCII case-insensitive; invalid values are the Auto state; the setter writes the attribute", () => {
    const d = dialog();
    d.setAttribute("closedby", "ANY");
    expect(d.closedBy).toBe("any");
    d.setAttribute("closedby", "CloseRequest");
    expect(d.closedBy).toBe("closerequest");
    d.setAttribute("closedby", "sometimes");
    expect(d.closedBy).toBe("none");
    d.closedBy = "none";
    expect(d.getAttribute("closedby")).toBe("none");
  });

  test("a non-modal dialog with closedby=closerequest is closed by a close request", () => {
    const d = dialog();
    d.setAttribute("closedby", "closerequest");
    d.show();
    escape(d);
    expect(d.open).toBe(false);
  });

  test("a non-modal dialog in the Auto state ignores close requests", () => {
    const d = dialog();
    d.show();
    escape(d);
    expect(d.open).toBe(true);
  });
});

describe("dialog setup and cleanup steps — https://html.spec.whatwg.org/#dialog-setup-steps", () => {
  test("attribute change step 6: adding open directly establishes the close watcher (closedby=any closes on Escape)", () => {
    const d = dialog();
    d.setAttribute("closedby", "any");
    d.setAttribute("open", "");
    let cancels = 0;
    d.addEventListener("cancel", () => cancels++);
    escape(d);
    expect(d.open).toBe(false);
    expect(cancels).toBe(1);
  });

  test("insertion steps: a parsed <dialog open> gets a close watcher", () => {
    doc.body.innerHTML = "<dialog open closedby=any id=d></dialog>";
    const d = doc.getElementById("d");
    escape(d);
    expect(d.open).toBe(false);
  });

  test("attribute change step 3: removing open runs the cleanup steps (no close event, close requests ignored)", async () => {
    const d = dialog();
    d.setAttribute("closedby", "any");
    d.show();
    let events = 0;
    d.addEventListener("cancel", () => events++);
    d.addEventListener("close", () => events++);
    d.removeAttribute("open");
    escape(d);
    await nextTask();
    expect(events).toBe(0);
    // Re-opening establishes a fresh close watcher.
    d.show();
    escape(d);
    expect(d.open).toBe(false);
  });

  test("dialog request close step 2: requestClose() on a disconnected open dialog does nothing", () => {
    const d = doc.createElement("dialog");
    d.setAttribute("open", "");
    let cancels = 0;
    d.addEventListener("cancel", () => cancels++);
    d.requestClose("x");
    expect(d.open).toBe(true);
    expect(cancels).toBe(0);
  });

  test("removing steps: removing an open modal dialog unblocks the document", () => {
    doc.body.innerHTML = "<button id=b>b</button><dialog id=d></dialog>";
    const d = doc.getElementById("d");
    const b = doc.getElementById("b");
    d.showModal();
    b.focus();
    expect(doc.activeElement).not.toBe(b);
    d.remove();
    b.focus();
    expect(doc.activeElement).toBe(b);
  });
});

describe("dialog request close — https://html.spec.whatwg.org/#dialog-request-close", () => {
  test("steps 4–7: a request canceled from cancel keeps the dialog open and returnValue unchanged", () => {
    const d = dialog();
    d.showModal();
    d.addEventListener("cancel", (e: any) => e.preventDefault(), { once: true });
    d.requestClose("ignored");
    expect(d.open).toBe(true);
    expect(d.returnValue).toBe("");
  });

  test("close the dialog step 10: closing resets the request close return value, so a later Escape closes without one", () => {
    const d = dialog();
    d.showModal();
    d.requestClose("first");
    expect(d.returnValue).toBe("first");
    d.returnValue = "";
    d.showModal();
    escape(d);
    expect(d.open).toBe(false);
    expect(d.returnValue).toBe("");
  });

  test("requestClose() without an argument leaves returnValue alone", () => {
    const d = dialog();
    d.returnValue = "kept";
    d.showModal();
    d.requestClose();
    expect(d.open).toBe(false);
    expect(d.returnValue).toBe("kept");
  });
});

describe("dialog focusing steps — https://html.spec.whatwg.org/#dialog-focusing-steps", () => {
  test("step 2: a dialog with autofocus is focused itself", () => {
    const d = dialog("<input id=i>");
    d.setAttribute("autofocus", "");
    d.showModal();
    expect(doc.activeElement).toBe(d);
  });

  test("step 3: the focus delegate prefers an autofocus descendant over the first focusable one", () => {
    const d = dialog("<input id=a><input id=b autofocus>");
    d.showModal();
    expect(doc.activeElement.id).toBe("b");
  });

  test("step 3: without autofocus, the first focusable descendant in tree order", () => {
    const d = dialog("<p>text</p><button id=a disabled>a</button><a href=#x id=b>b</a><input id=c>");
    d.show();
    expect(doc.activeElement.id).toBe("b");
  });

  test("step 4: with nothing focusable inside, the dialog itself is focused", () => {
    const d = dialog("<p>only text</p>");
    d.showModal();
    expect(doc.activeElement).toBe(d);
  });
});

describe("check popover validity — https://html.spec.whatwg.org/#check-popover-validity", () => {
  test("step 1: hidePopover() on a popover that is not showing is a no-op (no events, no throw)", () => {
    doc.body.innerHTML = "<div popover id=p></div>";
    const p = doc.getElementById("p");
    const log = recordToggles(p);
    p.hidePopover();
    expect(log).toEqual([]);
  });

  test("step 1: showPopover() on a showing popover is a no-op", () => {
    doc.body.innerHTML = "<div popover id=p></div>";
    const p = doc.getElementById("p");
    p.showPopover();
    const log = recordToggles(p);
    p.showPopover();
    expect(log).toEqual([]);
  });

  test("step 3: a popover in a document without a browsing context throws InvalidStateError", () => {
    const other = doc.implementation.createHTMLDocument("");
    const p = other.body.appendChild(other.createElement("div"));
    p.setAttribute("popover", "");
    expect(() => p.showPopover()).toThrow(expect.objectContaining({ name: "InvalidStateError" }));
  });
});

describe("queue a popover toggle event task — https://html.spec.whatwg.org/#queue-a-popover-toggle-event-task", () => {
  test("show then hide in one task coalesces into one toggle with the original old state", async () => {
    doc.body.innerHTML = "<div popover id=p></div>";
    const p = doc.getElementById("p");
    const log = recordToggles(p);
    p.showPopover();
    p.hidePopover();
    await nextTask();
    expect(log).toEqual(["beforetoggle:closed->open (cancelable)", "beforetoggle:open->closed", "toggle:closed->closed"]);
  });
});

describe("popover attribute changes — https://html.spec.whatwg.org/#the-popover-attribute:concept-element-attributes-change-ext", () => {
  test("changing the popover state of a showing popover hides it", () => {
    doc.body.innerHTML = "<div popover=auto id=p></div>";
    const p = doc.getElementById("p");
    p.showPopover();
    p.setAttribute("popover", "manual");
    expect(p.matches(":popover-open")).toBe(false);
  });

  test("an attribute change that keeps the same state (auto → \"\") leaves it showing", () => {
    doc.body.innerHTML = "<div popover=auto id=p></div>";
    const p = doc.getElementById("p");
    p.showPopover();
    p.setAttribute("popover", "");
    expect(p.matches(":popover-open")).toBe(true);
  });

  test("removing the popover attribute hides a showing popover", () => {
    doc.body.innerHTML = "<div popover=manual id=p></div>";
    const p = doc.getElementById("p");
    p.showPopover();
    p.removeAttribute("popover");
    expect(p.matches(":popover-open")).toBe(false);
  });
});

describe("popover stacks — https://html.spec.whatwg.org/#topmost-popover-ancestor", () => {
  test("manual popovers are independent of auto popovers", () => {
    doc.body.innerHTML = "<div popover=manual id=m></div><div popover id=a></div>";
    const m = doc.getElementById("m");
    m.showPopover();
    doc.getElementById("a").showPopover();
    expect(m.matches(":popover-open")).toBe(true);
  });

  test("an auto popover opened by an invoker inside another auto popover is nested in it", () => {
    doc.body.innerHTML = '<div popover id=outer><button popovertarget=inner id=btn>i</button></div><div popover id=inner></div>';
    const outer = doc.getElementById("outer");
    const inner = doc.getElementById("inner");
    outer.showPopover();
    doc.getElementById("btn").click();
    expect(inner.matches(":popover-open")).toBe(true);
    expect(outer.matches(":popover-open")).toBe(true);
    // Hiding the ancestor hides its descendants in the stack.
    outer.hidePopover();
    expect(inner.matches(":popover-open")).toBe(false);
  });

  test("showPopover({ source }) nests the popover under the source's popover", () => {
    doc.body.innerHTML = '<div popover id=outer><span id=src></span></div><div popover id=inner></div>';
    const outer = doc.getElementById("outer");
    const inner = doc.getElementById("inner");
    outer.showPopover();
    inner.showPopover({ source: doc.getElementById("src") });
    expect(outer.matches(":popover-open")).toBe(true);
    expect(inner.matches(":popover-open")).toBe(true);
  });

  test("hint popovers: showing one keeps open auto popovers; showing an unrelated auto popover hides it", () => {
    doc.body.innerHTML = "<div popover id=a></div><div popover=hint id=h></div><div popover id=b></div>";
    const a = doc.getElementById("a");
    const h = doc.getElementById("h");
    a.showPopover();
    h.showPopover();
    expect(a.matches(":popover-open")).toBe(true);
    expect(h.matches(":popover-open")).toBe(true);
    doc.getElementById("b").showPopover();
    expect(h.matches(":popover-open")).toBe(false);
    expect(a.matches(":popover-open")).toBe(false);
  });
});

describe("popover focusing steps — https://html.spec.whatwg.org/#popover-focusing-steps", () => {
  test("an autofocus descendant is focused when the popover shows; hiding restores focus to the previously focused element", () => {
    doc.body.innerHTML = '<button id=opener>o</button><div popover id=p><input id=a><input id=b autofocus></div>';
    const opener = doc.getElementById("opener");
    opener.focus();
    const p = doc.getElementById("p");
    p.showPopover();
    expect(doc.activeElement.id).toBe("b");
    p.hidePopover();
    expect(doc.activeElement).toBe(opener);
  });

  test("without autofocus, showing a popover does not move focus", () => {
    doc.body.innerHTML = '<button id=opener>o</button><div popover id=p><input id=a></div>';
    const opener = doc.getElementById("opener");
    opener.focus();
    doc.getElementById("p").showPopover();
    expect(doc.activeElement).toBe(opener);
  });

  test("hide popover: focus is not restored when it moved outside the popover meanwhile", () => {
    doc.body.innerHTML = '<button id=opener>o</button><button id=other>x</button><div popover id=p><input autofocus></div>';
    doc.getElementById("opener").focus();
    const p = doc.getElementById("p");
    p.showPopover();
    const other = doc.getElementById("other");
    other.focus();
    p.hidePopover();
    expect(doc.activeElement).toBe(other);
  });
});

describe("popoverTargetAction — https://html.spec.whatwg.org/#attr-popovertargetaction", () => {
  test("enumerated with toggle as the missing and invalid value default", () => {
    const b = doc.createElement("button");
    expect(b.popoverTargetAction).toBe("toggle");
    b.setAttribute("popovertargetaction", "SHOW");
    expect(b.popoverTargetAction).toBe("show");
    b.setAttribute("popovertargetaction", "bogus");
    expect(b.popoverTargetAction).toBe("toggle");
  });
});

describe("details name groups — https://html.spec.whatwg.org/#details-name-group", () => {
  test("insertion steps: an inserted open details is closed when its group already has an open one", () => {
    doc.body.innerHTML = '<details name=g open id=a><summary>a</summary></details>';
    const b = doc.createElement("details");
    b.name = "g";
    b.open = true;
    doc.body.appendChild(b);
    expect(doc.getElementById("a").open).toBe(true);
    expect(b.open).toBe(false);
  });

  test("groups are per tree root and per name (case-sensitive)", () => {
    doc.body.innerHTML = '<details name=g open id=a></details><details name=G id=b></details>';
    doc.getElementById("b").open = true;
    expect(doc.getElementById("a").open).toBe(true);
    const detached = doc.createElement("details");
    detached.name = "g";
    detached.open = true;
    expect(doc.getElementById("a").open).toBe(true);
  });

  test("attribute change: setting open fires toggle in a later task, coalesced", async () => {
    doc.body.innerHTML = "<details id=d></details>";
    const d = doc.getElementById("d");
    const log = recordToggles(d);
    d.open = true;
    d.open = false;
    d.open = true;
    expect(log).toEqual([]);
    await nextTask();
    expect(log).toEqual(["toggle:closed->open"]);
  });
});
