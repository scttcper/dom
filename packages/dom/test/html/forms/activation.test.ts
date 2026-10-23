/**
 * Activation behavior of form controls (driven by the DOM dispatch algorithm).
 *
 * Spec: HTML Standard
 *   input activation        https://html.spec.whatwg.org/#the-input-element:activation-behaviour
 *   legacy-pre-activation   https://html.spec.whatwg.org/#the-input-element:legacy-pre-activation-behavior
 *   canceled activation     https://html.spec.whatwg.org/#the-input-element:legacy-canceled-activation-behavior
 *   button activation       https://html.spec.whatwg.org/#the-button-element:activation-behaviour
 *   label activation        https://html.spec.whatwg.org/#the-label-element:activation-behaviour
 * DOM Standard dispatch steps 11–13: https://dom.spec.whatwg.org/#concept-event-dispatch
 */
import { beforeEach, describe, expect, test } from "vitest";
import { createWindow, type Document } from "@rtd/dom";

// biome-ignore lint: untyped DOM surface in tests
let window: any;
let document: Document;
// biome-ignore lint: untyped DOM surface in tests
const $ = (id: string): any => document.getElementById(id);

beforeEach(() => {
  window = createWindow();
  document = window.document;
});

function record(el: any, types: string[], log: string[]): void {
  for (const t of types) el.addEventListener(t, () => log.push(`${t}:${el.checked}`));
}

describe("checkbox and radio — https://html.spec.whatwg.org/#the-input-element:activation-behaviour", () => {
  test("click(): toggled before listeners, then input and change bubble", () => {
    document.body!.innerHTML = "<input type=checkbox id=c>";
    const log: string[] = [];
    record($("c"), ["click", "input", "change"], log);
    $("c").click();
    expect(log).toEqual(["click:true", "input:true", "change:true"]);
  });

  test("a canceled click restores checkedness and indeterminate and fires no input/change", () => {
    document.body!.innerHTML = "<input type=checkbox id=c>";
    const c = $("c");
    c.indeterminate = true;
    const log: string[] = [];
    record(c, ["input", "change"], log);
    c.addEventListener("click", (e: any) => e.preventDefault());
    c.click();
    expect([c.checked, c.indeterminate, log]).toEqual([false, true, []]);
  });

  test("radio: clicking an unchecked radio fires input/change; an already checked one fires nothing", () => {
    document.body!.innerHTML = "<input type=radio name=r id=a checked><input type=radio name=r id=b>";
    const log: string[] = [];
    record($("b"), ["change"], log);
    $("b").click();
    expect([$("a").checked, $("b").checked]).toEqual([false, true]);
    $("b").click();
    expect(log).toEqual(["change:true"]);
  });

  test("a canceled radio click restores the previously checked radio", () => {
    document.body!.innerHTML = "<input type=radio name=r id=a checked><input type=radio name=r id=b>";
    $("b").addEventListener("click", (e: any) => e.preventDefault());
    $("b").click();
    expect([$("a").checked, $("b").checked]).toEqual([true, false]);
  });
});

describe("submit and reset buttons — https://html.spec.whatwg.org/#the-button-element:activation-behaviour", () => {
  test("clicking a submit button fires submit with the button as submitter", () => {
    document.body!.innerHTML = "<form id=f><button id=b>go</button><input type=submit id=s></form>";
    const submitters: unknown[] = [];
    $("f").addEventListener("submit", (e: any) => (e.preventDefault(), submitters.push(e.submitter)));
    $("b").click();
    $("s").click();
    expect(submitters).toEqual([$("b"), $("s")]);
  });

  test("canceling the click prevents submission; type=button never submits", () => {
    document.body!.innerHTML = "<form id=f><button id=b>go</button><button type=button id=n></button></form>";
    let n = 0;
    $("f").addEventListener("submit", () => n++);
    $("b").addEventListener("click", (e: any) => e.preventDefault());
    $("b").click();
    $("n").click();
    expect(n).toBe(0);
  });

  test("reset buttons reset their form", () => {
    document.body!.innerHTML = "<form id=f><input id=t value=a><input type=reset id=r></form>";
    $("t").value = "b";
    $("r").click();
    expect($("t").value).toBe("a");
  });
});

describe("labels — https://html.spec.whatwg.org/#the-label-element:activation-behaviour", () => {
  test("clicking a label forwards one click to its control", () => {
    document.body!.innerHTML = "<label id=l>text <input type=checkbox id=c></label><label for=c id=l2>other</label>";
    let clicks = 0;
    $("c").addEventListener("click", () => clicks++);
    $("l").click();
    expect([$("c").checked, clicks]).toEqual([true, 1]);
    $("l2").click();
    expect([$("c").checked, clicks]).toEqual([false, 2]);
  });

  test("clicking the control inside its label, or interactive content in the label, does not forward", () => {
    document.body!.innerHTML = "<label id=l><input type=checkbox id=c><a href=# id=a>link</a></label>";
    let clicks = 0;
    $("c").addEventListener("click", () => clicks++);
    $("c").click();
    expect(clicks).toBe(1);
    $("a").click();
    expect([clicks, $("c").checked]).toEqual([1, true]);
  });
});
