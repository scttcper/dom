/**
 * jsdom's "Not implemented" diagnostics under the jsdom compat profiles: the same Error (message
 * and `type`) at the same points as the real jsdom of each profile, observed differentially.
 *
 * Oracles: jsdom 26.1.0 (`jsdom-26`) and 30.1.3 (`jsdom`), each with a VirtualConsole whose
 * "jsdomError" events are collected (lib/jsdom/browser/not-implemented.js). @ctrl/dom: a window of
 * the matching profile with setNotImplementedHandler collecting (window/not-implemented.ts).
 *
 * Where jsdom reports, per the spec algorithms it stops short of:
 *   - navigate:            https://html.spec.whatwg.org/#navigate (anything beyond a fragment change)
 *   - Location#reload:     https://html.spec.whatwg.org/#dom-location-reload
 *   - following hyperlinks https://html.spec.whatwg.org/#following-hyperlinks-2 (in a task)
 *   - form submission:     https://html.spec.whatwg.org/#concept-form-submit (after the submit event)
 *   - user prompts:        https://html.spec.whatwg.org/#user-prompts (alert, confirm, prompt, print)
 *   - window.open, focus, blur, moveTo/By, resizeTo/By, scroll/To/By (CSSOM View)
 *   - HTMLMediaElement:    https://html.spec.whatwg.org/#dom-media-play (play, pause, load, addTextTrack)
 *   - getComputedStyle with a pseudo-element: https://drafts.csswg.org/cssom/#dom-window-getcomputedstyle
 */
import { createRequire } from "node:module";
import { afterEach, describe, expect, test } from "vitest";
import { createWindow } from "@ctrl/dom";
import { setNotImplementedHandler } from "@ctrl/dom/internal";

const require = createRequire(import.meta.url);
const ORACLES = { "jsdom-26": require("jsdom-26"), "jsdom-30": require("jsdom") } as const;
type Profile = keyof typeof ORACLES;
type AnyWindow = any;
type Reported = { message: string; type: string };
type Scenario = (window: AnyWindow) => void;

const URL_ = "http://localhost/start";
const HTML = `<!doctype html><body>
<a id=other href="/other">other</a><a id=frag href="#section">frag</a><a id=self-url href="/start">self</a>
<a id=blank href="/other" target="_blank">blank</a><a id=top href="/other" target="_top">top</a>
<a id=download href="/file.txt" download>download</a><a id=js href="javascript:void 0">js</a><a id=nohref>none</a>
<form id=f action="/submit"><input name=q value=1><button id=submit>Go</button></form>
<form id=invalid><input required name=r><button id=submit-invalid>Go</button></form>
<form id=canceled><button id=submit-canceled>Go</button></form>
<audio id=audio></audio><div id=box></div></body>`;

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

async function onJsdom(profile: Profile, scenario: Scenario): Promise<Reported[]> {
  const { JSDOM, VirtualConsole } = ORACLES[profile];
  const reported: Reported[] = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (e: Error & { type: string }) => reported.push({ message: e.message, type: e.type }));
  const { window } = new JSDOM(HTML, { url: URL_, pretendToBeVisual: true, virtualConsole });
  scenario(window);
  await settle();
  window.close();
  return reported;
}

async function onCtrlDom(profile: Profile | "modern", scenario: Scenario): Promise<Reported[]> {
  const reported: Reported[] = [];
  setNotImplementedHandler((e) => reported.push({ message: e.message, type: e.type }));
  const window = createWindow({ html: HTML, url: URL_, compat: profile });
  scenario(window);
  await settle();
  window.close();
  return reported;
}

afterEach(() => setNotImplementedHandler(null));

const click =
  (id: string, init: Record<string, unknown> = {}) =>
  (w: AnyWindow) =>
    w.document
      .getElementById(id)
      .dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true, ...init }));
const quietly =
  (fn: Scenario): Scenario =>
  (w) => {
    try {
      fn(w);
    } catch {
      // Behavior beyond the report may differ (documented in docs/deviations.md); only reports are compared here.
    }
  };

const SCENARIOS: Record<string, Scenario> = {
  // Window methods jsdom stubs (browser/Window.js notImplementedMethodWrapper).
  "window.alert()": (w) => w.alert("hi"),
  "window.confirm()": (w) => w.confirm("sure?"),
  "window.prompt()": (w) => w.prompt("name?"),
  "window.print()": (w) => w.print(),
  "window.open()": (w) => w.open("/popup"),
  "window.focus() and blur()": (w) => (w.focus(), w.blur()),
  "window.moveTo() and moveBy()": (w) => (w.moveTo(1, 2), w.moveBy(1, 2)),
  "window.resizeTo() and resizeBy()": (w) => (w.resizeTo(800, 600), w.resizeBy(10, 10)),
  "window.scroll(), scrollTo(), scrollBy()": (w) => (w.scroll(0, 10), w.scrollTo({ top: 5 }), w.scrollBy(0, 1)),
  // getComputedStyle: only a non-empty pseudo-element is reported.
  "getComputedStyle(el, '::before')": (w) => w.getComputedStyle(w.document.getElementById("box"), "::before"),
  "getComputedStyle(el, '') and (el, null)": (w) => {
    const box = w.document.getElementById("box");
    w.getComputedStyle(box, "");
    w.getComputedStyle(box, null);
    w.getComputedStyle(box);
  },
  // Location: anything beyond a fragment change navigates to another document.
  "location.href = '/other'": (w) => (w.location.href = "/other"),
  "location.assign() with a query": (w) => w.location.assign("http://localhost/start?q=1"),
  "location.replace() another path": (w) => w.location.replace("/elsewhere"),
  "location.search and pathname setters": (w) => ((w.location.search = "?a=1"), (w.location.pathname = "/p")),
  "location.reload()": (w) => w.location.reload(),
  "fragment-only changes (href, hash, assign)": (w) => {
    w.location.href = "#a";
    w.location.hash = "b";
    w.location.assign("/start#c");
  },
  "location.href set to itself": (w) => (w.location.href = w.location.href),
  // Hyperlinks: followed in a task when the target is "", _self, _parent or _top.
  "click a link to another page": click("other"),
  "click a link with modifier keys": click("other", { metaKey: true, ctrlKey: true }),
  "click a fragment link": click("frag"),
  "click a link to the current URL": click("self-url"),
  "click a link with target=_blank": click("blank"),
  "click a link with target=_top": click("top"),
  "click a download link": click("download"),
  "click a javascript: link": click("js"),
  "click an <a> without href": click("nohref"),
  "a.click() on a disconnected link": (w) => {
    const a = w.document.createElement("a");
    a.href = "/detached";
    a.click();
  },
  "click a link under <base target=_blank>": (w) => {
    const base = w.document.createElement("base");
    base.target = "_blank";
    w.document.head.append(base);
    w.document.getElementById("other").click();
  },
  "click a link whose click is canceled": (w) => {
    w.document.getElementById("other").addEventListener("click", (e: AnyWindow) => e.preventDefault());
    w.document.getElementById("other").click();
  },
  // Form submission.
  "form.submit()": (w) => w.document.getElementById("f").submit(),
  "form.submit() on a disconnected form": (w) => w.document.createElement("form").submit(),
  "form.requestSubmit()": (w) => w.document.getElementById("f").requestSubmit(),
  "click a submit button": click("submit"),
  "submit an invalid form": click("submit-invalid"),
  "submit a form whose submit event is canceled": (w) => {
    w.document.getElementById("canceled").addEventListener("submit", (e: AnyWindow) => e.preventDefault());
    w.document.getElementById("submit-canceled").click();
  },
  // Media.
  "audio.play(), pause(), load()": (w) => {
    const audio = w.document.getElementById("audio");
    audio.play()?.catch?.(() => {});
    audio.pause();
    audio.load();
  },
  "audio.addTextTrack()": quietly((w) => w.document.getElementById("audio").addTextTrack("subtitles")),
};

/** The scenarios jsdom reports anything for (so an empty-on-both-sides pass cannot hide a broken oracle). */
const REPORTED = new Set([
  "window.alert()",
  "window.confirm()",
  "window.prompt()",
  "window.print()",
  "window.open()",
  "window.focus() and blur()",
  "window.moveTo() and moveBy()",
  "window.resizeTo() and resizeBy()",
  "window.scroll(), scrollTo(), scrollBy()",
  "getComputedStyle(el, '::before')",
  "location.href = '/other'",
  "location.assign() with a query",
  "location.replace() another path",
  "location.search and pathname setters",
  "location.reload()",
  "click a link to another page",
  "click a link with modifier keys",
  "click a link with target=_top",
  "click a download link",
  "a.click() on a disconnected link",
  "form.submit()",
  "form.submit() on a disconnected form",
  "form.requestSubmit()",
  "click a submit button",
  "audio.play(), pause(), load()",
  "audio.addTextTrack()",
]);

for (const profile of ["jsdom-26", "jsdom-30"] as const) {
  describe(`"${profile}" profile: reports what jsdom ${profile.slice(6)} reports — https://html.spec.whatwg.org/#navigate`, () => {
    for (const [name, scenario] of Object.entries(SCENARIOS)) {
      test(`${name}: ${REPORTED.has(name) ? "the" : "no"} "Not implemented" errors jsdom reports`, async () => {
        const expected = await onJsdom(profile, scenario);
        expect(expected.length > 0).toBe(REPORTED.has(name));
        expect(await onCtrlDom(profile, scenario)).toEqual(expected);
      });
    }
  });
}

describe("other configurations — https://html.spec.whatwg.org/#navigate", () => {
  test('"modern" reports nothing', async () => {
    for (const scenario of Object.values(SCENARIOS)) expect(await onCtrlDom("modern", scenario)).toEqual([]);
  });

  test("without a handler nothing is reported (and nothing throws)", async () => {
    setNotImplementedHandler(null);
    const window = createWindow({ html: HTML, url: URL_, compat: "jsdom-30" });
    expect(() => {
      window.alert("x");
      window.location.reload();
      (window.document.getElementById("other") as unknown as { click(): void }).click();
    }).not.toThrow();
    await settle();
    window.close();
  });
});
