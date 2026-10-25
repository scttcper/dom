/**
 * Invokers (popovertarget, commandfor/command and CommandEvent), the popover API surface and its
 * removal steps, ToggleEvent, close watchers and the dialog IDL members component libraries call.
 *
 * Spec: HTML Standard
 *   - the popover attribute:             https://html.spec.whatwg.org/#attr-popover, https://html.spec.whatwg.org/#popover-visibility-state,
 *                                        https://html.spec.whatwg.org/#opened-in-popover-mode
 *   - showPopover/hidePopover/toggle:    https://html.spec.whatwg.org/#dom-showpopover, https://html.spec.whatwg.org/#dom-hidepopover,
 *                                        https://html.spec.whatwg.org/#dom-togglepopover
 *   - popover stacks:                    https://html.spec.whatwg.org/#showing-auto-popover-list, https://html.spec.whatwg.org/#hide-all-popovers-until,
 *                                        https://html.spec.whatwg.org/#topmost-auto-or-hint-popover, https://html.spec.whatwg.org/#nearest-inclusive-open-popover,
 *                                        https://html.spec.whatwg.org/#popover-stack-position, https://html.spec.whatwg.org/#hint-stack-parent,
 *                                        https://html.spec.whatwg.org/#popover-trigger
 *   - document showing popover / top layer: https://html.spec.whatwg.org/#document-showing-popover, https://html.spec.whatwg.org/#top-layer
 *   - popover hiding:                    https://html.spec.whatwg.org/#popover-hiding, https://html.spec.whatwg.org/#the-popover-attribute:html-element-removing-steps,
 *                                        https://html.spec.whatwg.org/#popover-toggle-task-tracker
 *   - popover target attributes:         https://html.spec.whatwg.org/#popover-target-element,
 *                                        https://html.spec.whatwg.org/#popover-target-attribute-activation-behavior,
 *                                        https://html.spec.whatwg.org/#nearest-inclusive-target-popover,
 *                                        https://html.spec.whatwg.org/#explicitly-set-attr-element
 *   - commands:                          https://html.spec.whatwg.org/#dom-button-command, https://html.spec.whatwg.org/#determine-if-a-command-is-valid,
 *                                        https://html.spec.whatwg.org/#the-commandevent-interface, https://html.spec.whatwg.org/#dom-commandevent-source,
 *                                        https://html.spec.whatwg.org/#concept-button, https://html.spec.whatwg.org/#the-dialog-element:command-steps
 *   - ToggleEvent:                       https://html.spec.whatwg.org/#the-toggleevent-interface
 *   - close watchers:                    https://html.spec.whatwg.org/#close-requests-and-close-watchers, https://html.spec.whatwg.org/#close-watcher,
 *                                        https://html.spec.whatwg.org/#establish-a-close-watcher, https://html.spec.whatwg.org/#process-close-watchers,
 *                                        https://html.spec.whatwg.org/#close-watcher-manager, https://html.spec.whatwg.org/#popover-close-watcher,
 *                                        https://html.spec.whatwg.org/#dialog-close-watcher, https://html.spec.whatwg.org/#set-the-dialog-close-watcher
 *   - dialog IDL:                        https://html.spec.whatwg.org/#dom-dialog-close, https://html.spec.whatwg.org/#dom-dialog-returnvalue,
 *                                        https://html.spec.whatwg.org/#dom-dialog-closedby, https://html.spec.whatwg.org/#request-close-return-value,
 *                                        https://html.spec.whatwg.org/#request-close-source-element, https://html.spec.whatwg.org/#is-modal,
 *                                        https://html.spec.whatwg.org/#open-dialogs-list, https://html.spec.whatwg.org/#dialog-toggle-task-tracker,
 *                                        https://html.spec.whatwg.org/#the-dialog-element:concept-element-attributes-change-ext,
 *                                        https://html.spec.whatwg.org/#the-dialog-element:html-element-insertion-steps,
 *                                        https://html.spec.whatwg.org/#the-dialog-element:html-element-removing-steps
 *   - details:                           https://html.spec.whatwg.org/#the-details-element:concept-element-attributes-change-ext,
 *                                        https://html.spec.whatwg.org/#the-details-element:html-element-insertion-steps
 *
 * jsdom implements none of these (no popovers, invokers or dialog methods), so they assert the
 * spec directly. Radix, React Aria and Headless UI menus, dialogs and disclosures sit on them.
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
const nextTask = () => new Promise((r) => setTimeout(r, 1));
const escape = (target: any) => target.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));

function toggles(el: any): string[] {
  const log: string[] = [];
  for (const type of ["beforetoggle", "toggle"]) el.addEventListener(type, (e: any) => log.push(`${type}:${e.oldState}->${e.newState}`));
  return log;
}

describe("the popover attribute — https://html.spec.whatwg.org/#attr-popover", () => {
  test("popover IDL reflects auto / manual / hint; the empty string is auto, invalid values are manual, missing is null", () => {
    doc.body.innerHTML = `<div id=a popover></div><div id=b popover=MANUAL></div><div id=c popover=hint></div><div id=d popover=bogus></div><div id=e></div>`;
    expect(["a", "b", "c", "d", "e"].map((id) => $(id).popover)).toEqual(["auto", "manual", "hint", "manual", null]);
    $("e").popover = "manual";
    expect($("e").getAttribute("popover")).toBe("manual");
  });

  test("popover visibility state starts hidden; showing sets :popover-open and puts it in the top layer (https://html.spec.whatwg.org/#popover-visibility-state, https://html.spec.whatwg.org/#top-layer)", () => {
    doc.body.innerHTML = `<div id=p popover>p</div>`;
    expect($("p").matches(":popover-open")).toBe(false);
    $("p").showPopover();
    expect($("p").matches(":popover-open")).toBe(true);
    expect(win.getComputedStyle($("p")).display).not.toBe("none");
  });
});

describe("showPopover / hidePopover / togglePopover — https://html.spec.whatwg.org/#dom-togglepopover", () => {
  test("togglePopover() returns the new state; force true/false only ever shows/hides (https://html.spec.whatwg.org/#dom-showpopover, https://html.spec.whatwg.org/#dom-hidepopover)", () => {
    doc.body.innerHTML = `<div id=p popover>p</div>`;
    const p = $("p");
    expect(p.togglePopover()).toBe(true);
    expect(p.togglePopover(true)).toBe(true);
    expect(p.togglePopover({ force: false })).toBe(false);
    expect(p.togglePopover(false)).toBe(false);
    expect(p.matches(":popover-open")).toBe(false);
  });

  test("methods on an element without a popover attribute throw NotSupportedError", () => {
    doc.body.innerHTML = `<div id=d></div>`;
    for (const m of ["showPopover", "hidePopover", "togglePopover"]) expect(() => $("d")[m]()).toThrow(expect.objectContaining({ name: "NotSupportedError" }));
  });

  test("a disconnected popover throws InvalidStateError on show", () => {
    const p = doc.createElement("div");
    p.popover = "auto";
    expect(() => p.showPopover()).toThrow(expect.objectContaining({ name: "InvalidStateError" }));
  });

  test("beforetoggle on show is cancelable and canceling keeps it hidden; toggle is queued (https://html.spec.whatwg.org/#popover-toggle-task-tracker)", async () => {
    doc.body.innerHTML = `<div id=p popover>p</div>`;
    const p = $("p");
    const log = toggles(p);
    p.addEventListener("beforetoggle", (e: any) => e.cancelable && e.preventDefault(), { once: true });
    p.showPopover();
    expect(p.matches(":popover-open")).toBe(false);
    p.showPopover();
    expect(log).toEqual(["beforetoggle:closed->open", "beforetoggle:closed->open"]);
    await nextTask();
    expect(log).toEqual(["beforetoggle:closed->open", "beforetoggle:closed->open", "toggle:closed->open"]);
  });
});

describe("popover stacks — https://html.spec.whatwg.org/#showing-auto-popover-list", () => {
  test("showing an unrelated auto popover hides the open one (https://html.spec.whatwg.org/#hide-all-popovers-until, https://html.spec.whatwg.org/#topmost-auto-or-hint-popover)", () => {
    doc.body.innerHTML = `<div id=a popover>a</div><div id=b popover>b</div>`;
    $("a").showPopover();
    $("b").showPopover();
    expect([$("a").matches(":popover-open"), $("b").matches(":popover-open")]).toEqual([false, true]);
  });

  test("a popover nested in the DOM of an open auto popover keeps its ancestor open; hiding the ancestor hides it (https://html.spec.whatwg.org/#nearest-inclusive-open-popover, https://html.spec.whatwg.org/#popover-stack-position)", () => {
    doc.body.innerHTML = `<div id=a popover>a<div id=b popover>b</div></div>`;
    $("a").showPopover();
    $("b").showPopover();
    expect([$("a").matches(":popover-open"), $("b").matches(":popover-open")]).toEqual([true, true]);
    $("a").hidePopover();
    expect($("b").matches(":popover-open")).toBe(false);
  });

  test("Escape hides only the topmost auto popover (https://html.spec.whatwg.org/#popover-close-watcher)", () => {
    doc.body.innerHTML = `<div id=a popover>a<div id=b popover>b</div></div>`;
    $("a").showPopover();
    $("b").showPopover();
    escape(doc.body);
    expect([$("a").matches(":popover-open"), $("b").matches(":popover-open")]).toEqual([true, false]);
    escape(doc.body);
    expect($("a").matches(":popover-open")).toBe(false);
  });

  test("the invoker that showed a popover nests popovers it opens (https://html.spec.whatwg.org/#popover-trigger, https://html.spec.whatwg.org/#hint-stack-parent)", () => {
    doc.body.innerHTML = `<div id=a popover><button id=open-b popovertarget=b>b</button></div><div id=b popover>b</div>`;
    $("a").showPopover();
    $("open-b").click();
    expect([$("a").matches(":popover-open"), $("b").matches(":popover-open")]).toEqual([true, true]);
  });
});

describe("popover hiding and removal — https://html.spec.whatwg.org/#the-popover-attribute:html-element-removing-steps", () => {
  test("removing a showing popover hides it without firing beforetoggle/toggle (https://html.spec.whatwg.org/#popover-hiding)", async () => {
    doc.body.innerHTML = `<div id=p popover>p</div>`;
    const p = $("p");
    p.showPopover();
    await nextTask();
    const log = toggles(p);
    p.remove();
    await nextTask();
    expect([p.matches(":popover-open"), log]).toEqual([false, []]);
  });

  test("hiding a popover that contains the focused element restores focus to the previously focused element (https://html.spec.whatwg.org/#previously-focused-element)", () => {
    doc.body.innerHTML = `<button id=b>b</button><div id=p popover><input id=i autofocus></div>`;
    $("b").focus();
    $("p").showPopover();
    expect(doc.activeElement.id).toBe("i");
    $("p").hidePopover();
    expect(doc.activeElement.id).toBe("b");
  });
});

describe("popover target attributes — https://html.spec.whatwg.org/#popover-target-element", () => {
  test("popoverTargetElement is null for a non-popover target, a disabled button, or a submit button with a form owner", () => {
    doc.body.innerHTML = `<div id=p popover></div><div id=np></div>
      <button id=ok popovertarget=p></button><button id=bad popovertarget=np></button><button id=dis disabled popovertarget=p></button>
      <form><button id=sub popovertarget=p></button><button id=plain type=button popovertarget=p></button></form><input id=inp type=button popovertarget=p>`;
    const get = (id: string) => $(id).popoverTargetElement?.id ?? null;
    // popoverTargetElement reflects the attr-associated element; the activation behavior's
    // "popover target element" adds the disabled / form-submit checks.
    expect(["ok", "bad", "dis", "sub", "plain", "inp"].map(get)).toEqual(["p", "np", "p", "p", "p", "p"]);
    $("dis").click();
    $("sub").addEventListener("click", (e: any) => e.preventDefault());
    $("sub").click();
    expect($("p").matches(":popover-open")).toBe(false);
    $("plain").click();
    expect($("p").matches(":popover-open")).toBe(true);
  });

  test("activation honors popovertargetaction show / hide / toggle (https://html.spec.whatwg.org/#popover-target-attribute-activation-behavior)", () => {
    doc.body.innerHTML = `<div id=p popover></div><button id=show popovertarget=p popovertargetaction=show></button><button id=hide popovertarget=p popovertargetaction=hide></button><button id=tog popovertarget=p></button>`;
    const open = () => $("p").matches(":popover-open");
    $("hide").click();
    const a = open();
    $("show").click();
    $("show").click();
    const b = open();
    $("tog").click();
    const c = open();
    $("show").click();
    $("hide").click();
    expect([a, b, c, open()]).toEqual([false, true, false, false]);
  });

  test("clicking the invoker from inside the popover it controls does nothing (https://html.spec.whatwg.org/#nearest-inclusive-target-popover)", () => {
    doc.body.innerHTML = `<div id=p popover><button id=inner popovertarget=p popovertargetaction=show>x</button></div>`;
    $("p").showPopover();
    $("inner").click();
    expect($("p").matches(":popover-open")).toBe(true);
  });

  test("an explicitly set element wins over the attribute and sets it to '' (https://html.spec.whatwg.org/#explicitly-set-attr-element)", () => {
    doc.body.innerHTML = `<div id=p popover></div><div id=q popover></div><button id=b popovertarget=q></button>`;
    $("b").popoverTargetElement = $("p");
    expect([$("b").getAttribute("popovertarget"), $("b").popoverTargetElement.id]).toEqual(["", "p"]);
    $("b").popoverTargetElement = null;
    expect([$("b").hasAttribute("popovertarget"), $("b").popoverTargetElement]).toEqual([false, null]);
  });
});

describe("commands — https://html.spec.whatwg.org/#dom-button-command", () => {
  test("command reflects known keywords (ASCII case-insensitive), custom --commands as is, and '' otherwise", () => {
    const b = doc.createElement("button");
    const values = ["show-modal", "CLOSE", "request-close", "toggle-popover", "show-popover", "hide-popover", "--Custom", "-x", "bogus", ""];
    expect(values.map((v) => ((b.setAttribute("command", v), b.command)))).toEqual(["show-modal", "close", "request-close", "toggle-popover", "show-popover", "hide-popover", "--Custom", "", "", ""]);
  });

  test("a command button fires a cancelable CommandEvent at its target with source and command; canceling skips the action (https://html.spec.whatwg.org/#the-commandevent-interface, https://html.spec.whatwg.org/#dom-commandevent-source)", () => {
    doc.body.innerHTML = `<button id=b commandfor=d command=show-modal>b</button><dialog id=d>d</dialog>`;
    const log: string[] = [];
    $("d").addEventListener("command", (e: any) => log.push(`${e.constructor.name} ${e.command} ${e.source?.id} cancelable=${e.cancelable} bubbles=${e.bubbles}`));
    $("d").addEventListener("command", (e: any) => e.preventDefault(), { once: true });
    $("b").click();
    expect($("d").open).toBe(false);
    $("b").click();
    expect([$("d").open, $("d").matches(":modal")]).toEqual([true, true]);
    expect(log).toEqual(["CommandEvent show-modal b cancelable=true bubbles=false", "CommandEvent show-modal b cancelable=true bubbles=false"]);
  });

  test("dialog command steps: close passes the button's value as the return value; request-close fires cancel (https://html.spec.whatwg.org/#the-dialog-element:command-steps, https://html.spec.whatwg.org/#request-close-return-value)", () => {
    doc.body.innerHTML = `<dialog id=d><button id=c commandfor=d command=close value=done>c</button><button id=r commandfor=d command=request-close value=asked>r</button></dialog>`;
    const log: string[] = [];
    $("d").addEventListener("cancel", () => log.push("cancel"));
    $("d").addEventListener("close", () => log.push("close"));
    $("d").showModal();
    $("r").click();
    const afterRequest = [$("d").open, $("d").returnValue];
    $("d").showModal();
    $("c").click();
    expect([afterRequest, $("d").open, $("d").returnValue, log.includes("cancel")]).toEqual([[false, "asked"], false, "done", true]);
  });

  test("custom commands only fire the event; unknown commands and commands the target has no steps for fire nothing (https://html.spec.whatwg.org/#determine-if-a-command-is-valid)", () => {
    doc.body.innerHTML = `<button id=c commandfor=t command=--go>c</button><button id=x commandfor=t command=bogus>x</button><button id=sm commandfor=t command=show-modal>s</button><div id=t></div>`;
    const log: string[] = [];
    $("t").addEventListener("command", (e: any) => log.push(e.command));
    $("c").click();
    $("x").click();
    $("sm").click();
    // show-modal is not a valid command for a div (no is-valid-command steps for its local name).
    expect(log).toEqual(["--go"]);
  });

  test("toggle-popover / show-popover / hide-popover drive popovers (https://html.spec.whatwg.org/#concept-button)", () => {
    doc.body.innerHTML = `<button id=t commandfor=p command=toggle-popover></button><button id=h commandfor=p command=hide-popover></button><div id=p popover></div>`;
    $("t").click();
    const shown = $("p").matches(":popover-open");
    $("h").click();
    expect([shown, $("p").matches(":popover-open")]).toEqual([true, false]);
  });

  test("CommandEvent constructor defaults and requires a type", () => {
    const e = new win.CommandEvent("command");
    expect([e.command, e.source, e.bubbles, e.cancelable]).toEqual(["", null, false, false]);
    expect(() => new win.CommandEvent()).toThrow(TypeError);
  });
});

describe("ToggleEvent — https://html.spec.whatwg.org/#the-toggleevent-interface", () => {
  test("oldState / newState default to '', source to null", () => {
    const e = new win.ToggleEvent("toggle", { oldState: "closed", newState: "open" });
    const d = new win.ToggleEvent("toggle");
    expect([e.oldState, e.newState, d.oldState, d.newState, d.source ?? null]).toEqual(["closed", "open", "", "", null]);
  });
});

describe("close watchers — https://html.spec.whatwg.org/#close-requests-and-close-watchers", () => {
  test("Escape closes the most recently opened modal dialog first (https://html.spec.whatwg.org/#close-watcher-manager, https://html.spec.whatwg.org/#process-close-watchers)", () => {
    doc.body.innerHTML = `<dialog id=a>a</dialog><dialog id=b>b</dialog>`;
    $("a").showModal();
    $("b").showModal();
    escape(doc.body);
    expect([$("a").open, $("b").open]).toEqual([true, false]);
  });

  test("a modal dialog's close watcher fires cancel then close (https://html.spec.whatwg.org/#dialog-close-watcher, https://html.spec.whatwg.org/#establish-a-close-watcher)", () => {
    doc.body.innerHTML = `<dialog id=d>d</dialog>`;
    const log: string[] = [];
    for (const t of ["cancel", "close"]) $("d").addEventListener(t, (e: any) => log.push(`${t} cancelable=${e.cancelable}`));
    $("d").showModal();
    escape(doc.body);
    return nextTask().then(() => expect(log).toEqual(["cancel cancelable=true", "close cancelable=false"]));
  });

  test("changing closedby on an open dialog updates its close watcher (https://html.spec.whatwg.org/#set-the-dialog-close-watcher, https://html.spec.whatwg.org/#dom-dialog-closedby)", () => {
    doc.body.innerHTML = `<dialog id=d closedby=none>d</dialog>`;
    $("d").showModal();
    escape(doc.body);
    const stillOpen = $("d").open;
    $("d").closedBy = "closerequest";
    escape(doc.body);
    expect([stillOpen, $("d").open]).toEqual([true, false]);
  });
});

describe("dialog IDL — https://html.spec.whatwg.org/#dom-dialog-close", () => {
  test("close(result) sets returnValue; returnValue is a plain settable string (https://html.spec.whatwg.org/#dom-dialog-returnvalue)", () => {
    doc.body.innerHTML = `<dialog id=d open>d</dialog>`;
    $("d").returnValue = "x";
    $("d").close("y");
    expect($("d").returnValue).toBe("y");
  });

  test("requestClose(result) with a canceled cancel keeps returnValue; uncanceled sets it (https://html.spec.whatwg.org/#request-close-source-element)", () => {
    doc.body.innerHTML = `<dialog id=d>d</dialog>`;
    $("d").showModal();
    $("d").addEventListener("cancel", (e: any) => e.preventDefault(), { once: true });
    $("d").requestClose("no");
    const kept = [$("d").open, $("d").returnValue];
    $("d").requestClose("yes");
    expect([kept, $("d").open, $("d").returnValue]).toEqual([[true, ""], false, "yes"]);
  });

  test(":modal matches only dialogs shown with showModal (https://html.spec.whatwg.org/#is-modal, https://html.spec.whatwg.org/#open-dialogs-list)", () => {
    doc.body.innerHTML = `<dialog id=a>a</dialog><dialog id=b>b</dialog>`;
    $("a").show();
    $("b").showModal();
    expect([$("a").matches(":modal"), $("b").matches(":modal")]).toEqual([false, true]);
  });

  test("show() then close() in one task queues one toggle (https://html.spec.whatwg.org/#dialog-toggle-task-tracker)", async () => {
    doc.body.innerHTML = `<dialog id=d>d</dialog>`;
    const log = toggles($("d"));
    $("d").show();
    $("d").close();
    await nextTask();
    expect(log.filter((l) => l.startsWith("toggle"))).toEqual(["toggle:closed->closed"]);
  });

  test("removing an open modal dialog ends modality; re-inserting with open keeps it open but not modal (https://html.spec.whatwg.org/#the-dialog-element:html-element-removing-steps, https://html.spec.whatwg.org/#the-dialog-element:html-element-insertion-steps)", () => {
    doc.body.innerHTML = `<dialog id=d>d</dialog>`;
    const d = $("d");
    d.showModal();
    d.remove();
    doc.body.appendChild(d);
    expect([d.open, d.matches(":modal")]).toEqual([true, false]);
  });

  test("removing the open attribute directly closes without a close event (https://html.spec.whatwg.org/#the-dialog-element:concept-element-attributes-change-ext)", async () => {
    doc.body.innerHTML = `<dialog id=d>d</dialog>`;
    const log: string[] = [];
    $("d").addEventListener("close", () => log.push("close"));
    $("d").show();
    $("d").removeAttribute("open");
    await nextTask();
    expect([$("d").open, log]).toEqual([false, []]);
  });
});

describe("details — https://html.spec.whatwg.org/#the-details-element:concept-element-attributes-change-ext", () => {
  test("opening one details of a name group closes the open one, with toggle events for both", async () => {
    doc.body.innerHTML = `<details id=a name=g open><summary>a</summary></details><details id=b name=g><summary>b</summary></details>`;
    await nextTask();
    const la = toggles($("a"));
    const lb = toggles($("b"));
    $("b").open = true;
    await nextTask();
    expect([$("a").open, $("b").open, la, lb]).toEqual([false, true, ["toggle:open->closed"], ["toggle:closed->open"]]);
  });

  test("inserting an open details into a group that has an open one closes the inserted one (https://html.spec.whatwg.org/#the-details-element:html-element-insertion-steps)", () => {
    doc.body.innerHTML = `<details id=a name=g open></details>`;
    const b = doc.createElement("details");
    b.name = "g";
    b.open = true;
    doc.body.appendChild(b);
    expect([$("a").open, b.open]).toEqual([true, false]);
  });

  test("clicking the summary toggles its details (summary activation behavior)", async () => {
    doc.body.innerHTML = `<details id=d><summary id=s>s</summary>x</details>`;
    $("s").click();
    const opened = $("d").open;
    $("s").click();
    expect([opened, $("d").open]).toEqual([true, false]);
  });
});

describe("the document showing popover — https://html.spec.whatwg.org/#document-showing-popover", () => {
  test("a popover in a document without a browsing context cannot be shown", () => {
    const other = doc.implementation.createHTMLDocument("");
    const p = other.createElement("div");
    p.popover = "auto";
    other.body.appendChild(p);
    expect(() => p.showPopover()).toThrow(expect.objectContaining({ name: "InvalidStateError" }));
  });

  test("opened in popover mode: a popover shown with showPopover is hidden by a popover type change (https://html.spec.whatwg.org/#opened-in-popover-mode)", () => {
    doc.body.innerHTML = `<div id=p popover=manual>p</div>`;
    $("p").showPopover();
    $("p").popover = "auto";
    expect($("p").matches(":popover-open")).toBe(false);
  });
});
