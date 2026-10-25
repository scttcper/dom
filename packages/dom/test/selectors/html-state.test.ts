/**
 * HTML-defined state behind selectors and computed style: :link, :disabled, :invalid, media
 * playback state, :dir() with dir=auto, :lang(), :target, :heading() with headingoffset, and the
 * UA `direction` rules.
 *
 * Specs:
 *   HTML §4.16.3 Pseudo-classes — https://html.spec.whatwg.org/#selector-link, https://html.spec.whatwg.org/#selector-disabled,
 *     https://html.spec.whatwg.org/#selector-invalid, https://html.spec.whatwg.org/#selector-playing,
 *     https://html.spec.whatwg.org/#selector-paused, https://html.spec.whatwg.org/#selector-muted
 *   HTML §3.2.6.4 the dir attribute — https://html.spec.whatwg.org/#auto-directionality,
 *     https://html.spec.whatwg.org/#auto-directionality-form-associated-elements,
 *     https://html.spec.whatwg.org/#contained-text-auto-directionality
 *   HTML §3.2.6.2 the lang attribute — https://html.spec.whatwg.org/#language
 *   HTML §7.4.6.4 the indicated part of the document — https://html.spec.whatwg.org/#the-indicated-part-of-the-document
 *   HTML §4.3.6 heading levels — https://html.spec.whatwg.org/#heading-levels-and-offsets, https://html.spec.whatwg.org/#heading-offset,
 *     https://html.spec.whatwg.org/#rules-for-parsing-non-negative-integers
 *   HTML §15.3.5 bidirectional text — https://html.spec.whatwg.org/#bidi-rendering
 *
 * Where jsdom's engine (@asamuzakjp/dom-selector) implements a pseudo-class, the same markup is
 * queried on it too, since suites were written against it.
 */
import { beforeEach, describe, expect, test } from "vitest";
import { JSDOM } from "jsdom";
import { createWindow } from "@ctrl/dom";

/* eslint-disable @typescript-eslint/no-explicit-any */
let win: any;
let doc: any;
beforeEach(() => {
  win = createWindow({ url: "https://example.com/page" } as any);
  doc = win.document;
});

const ids = (list: ArrayLike<any>) => Array.from(list, (e: any) => e.id);
const $$ = (sel: string) => ids(doc.querySelectorAll(sel));
const $ = (id: string) => doc.getElementById(id);

function same(html: string, sel: string, expected: string[]): void {
  doc.body.innerHTML = html;
  const jsdom = new JSDOM(`<!doctype html><body>${html}</body>`, { url: "https://example.com/page" }).window.document;
  expect({ "ctrl-dom": $$(sel), jsdom: ids(jsdom.querySelectorAll(sel)) }).toEqual({ "ctrl-dom": expected, jsdom: expected });
}

describe(":link — https://html.spec.whatwg.org/#selector-link", () => {
  test("a and area elements with an href, never :visited", () => {
    same(`<a id=a href=x>a</a><a id=b>b</a><area id=c href=y><link id=d href=z><a id=e href="">e</a>`, ":link", ["a", "c", "e"]);
    expect($$(":visited")).toEqual([]);
  });
});

describe(":disabled — https://html.spec.whatwg.org/#selector-disabled", () => {
  test("actually disabled controls, disabled optgroups/options and fieldsets; the first legend's content is exempt", () => {
    same(
      `<button id=b disabled></button><fieldset id=fs disabled><legend><input id=inLegend></legend><input id=inFs></fieldset><select><optgroup id=og disabled><option id=o1></option></optgroup><option id=o2 disabled></option></select><a id=a disabled href=x>a</a>`,
      ":disabled",
      ["b", "fs", "inFs", "og", "o1", "o2"],
    );
  });
});

describe(":invalid — https://html.spec.whatwg.org/#selector-invalid", () => {
  test("controls suffering from a violation and their form/fieldset ancestors; barred controls never match", () => {
    same(`<form id=f><input id=a type=email value=nope><input id=b required readonly><output id=o></output></form>`, ":invalid", ["f", "a"]);
  });
});

describe("media playback state — https://html.spec.whatwg.org/#selector-playing", () => {
  test(":paused before play(), :playing after, :paused again after pause() (https://html.spec.whatwg.org/#selector-paused)", async () => {
    doc.body.innerHTML = `<video id=v></video><audio id=a muted></audio><div id=d></div>`;
    const before = [$$(":paused"), $$(":playing")];
    await $("v").play();
    const playing = [$$(":paused"), $$(":playing")];
    $("v").pause();
    expect([before, playing, $$(":paused")]).toEqual([[["v", "a"], []], [["a"], ["v"]], ["v", "a"]]);
  });

  test(":muted follows the muted IDL attribute (https://html.spec.whatwg.org/#selector-muted)", () => {
    doc.body.innerHTML = `<video id=v></video><audio id=a muted></audio>`;
    const before = $$(":muted");
    $("v").muted = true;
    $("a").muted = false;
    expect([before, $$(":muted")]).toEqual([["a"], ["v"]]);
  });
});

describe(":dir() with dir=auto — https://html.spec.whatwg.org/#auto-directionality", () => {
  test("the first strong character of the contained text decides; neutral text inherits from the parent (https://html.spec.whatwg.org/#contained-text-auto-directionality)", () => {
    doc.body.innerHTML = `<div dir=rtl><p id=n dir=auto>123 ...</p></div><p id=h dir=auto>1 שלום abc</p><p id=l dir=auto><bdi>שלום</bdi>abc</p><p id=s dir=auto><script>שלום</script>abc</p>`;
    expect(["n", "h", "l", "s"].map((id) => ($(id).matches(":dir(rtl)") ? "rtl" : "ltr"))).toEqual(["rtl", "rtl", "ltr", "ltr"]);
  });

  test("text controls with dir=auto use their value (https://html.spec.whatwg.org/#auto-directionality-form-associated-elements)", () => {
    doc.body.innerHTML = `<input id=i dir=auto value="שלום"><textarea id=t dir=auto>abc</textarea><input id=e dir=auto>`;
    const before = ["i", "t", "e"].map((id) => $(id).matches(":dir(rtl)"));
    $("i").value = "abc";
    $("t").value = "שלום";
    expect([before, $("i").matches(":dir(rtl)"), $("t").matches(":dir(rtl)")]).toEqual([[true, false, false], false, true]);
  });

  test("the UA direction rules apply to elements with a dir attribute (https://html.spec.whatwg.org/#bidi-rendering)", () => {
    doc.body.innerHTML = `<p id=a dir=rtl>x</p><p id=b dir=auto>שלום</p><p id=c>x</p><bdi id=d>שלום</bdi>`;
    expect(["a", "b", "c", "d"].map((id) => win.getComputedStyle($(id)).direction)).toEqual(["rtl", "rtl", "ltr", "rtl"]);
  });
});

describe(":lang() — https://html.spec.whatwg.org/#language", () => {
  test("lang is inherited from the nearest ancestor with a lang attribute; the empty string means unknown", () => {
    same(`<div id=d lang=en-US><p id=a>a</p><p id=b lang="">b</p></div><p id=c lang=fr>c</p>`, ":lang(en)", ["d", "a"]);
    expect($$(":lang(fr)")).toEqual(["c"]);
  });
});

describe(":target — https://html.spec.whatwg.org/#the-indicated-part-of-the-document", () => {
  test("the element whose id is the fragment, else the first a[name] with that name", () => {
    doc.body.innerHTML = `<a id=n name=sec>named</a><div id=sec2>d</div>`;
    win.location.hash = "#sec";
    const named = $$(":target");
    win.location.hash = "#sec2";
    expect([named, $$(":target")]).toEqual([["n"], ["sec2"]]);
  });
});

describe(":heading() — https://html.spec.whatwg.org/#heading-levels-and-offsets", () => {
  test("headingoffset on ancestors adds up (parsed as non-negative integers), headingreset stops it, and levels cap at 9 (https://html.spec.whatwg.org/#heading-offset, https://html.spec.whatwg.org/#rules-for-parsing-non-negative-integers)", () => {
    doc.body.innerHTML = `<section headingoffset=" +2"><h1 id=a>a</h1><div headingoffset=9><h3 id=b>b</h3></div><div headingreset headingoffset=1><h1 id=c>c</h1></div><div headingoffset=-1><h2 id=d>d</h2></div></section>`;
    expect([$$(":heading(3)"), $$(":heading(9)"), $$(":heading(2)"), $$(":heading(4)")]).toEqual([["a"], ["b"], ["c"], ["d"]]);
  });
});
