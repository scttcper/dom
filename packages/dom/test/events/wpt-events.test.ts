/**
 * Events — web-platform-tests dom/events, dom/abort and the shadow-dom event tests, run
 * unmodified through test/wpt/harness.ts.
 *
 * Specs:
 *   - DOM Standard §2 "Events" — https://dom.spec.whatwg.org/#events
 *     - dispatching: https://dom.spec.whatwg.org/#concept-event-dispatch
 *     - inner invoke / listener order: https://dom.spec.whatwg.org/#concept-event-listener-inner-invoke
 *     - retargeting / composed path: https://dom.spec.whatwg.org/#retarget,
 *       https://dom.spec.whatwg.org/#dom-event-composedpath
 *     - add/remove listeners (once, passive, signal): https://dom.spec.whatwg.org/#add-an-event-listener
 *   - DOM Standard §3.1–3.2 "Aborting ongoing activities" — https://dom.spec.whatwg.org/#aborting-ongoing-activities
 *   - HTML: event handlers (https://html.spec.whatwg.org/#event-handler-attributes), window.event
 *     (https://dom.spec.whatwg.org/#dom-window-event), activation behavior
 *     (https://html.spec.whatwg.org/#activation-behaviour)
 *   - Shadow DOM event paths: https://dom.spec.whatwg.org/#get-the-parent (ShadowRoot)
 * Original tests: https://github.com/web-platform-tests/wpt/tree/master/dom/events,
 * https://github.com/web-platform-tests/wpt/tree/master/dom/abort,
 * https://github.com/web-platform-tests/wpt/tree/master/shadow-dom
 *
 * Not vendored (out of scope or harness-limited; see the events area report): CSS animation /
 * transition driven tests (EventListener-invoke-legacy, handler-count, webkit-*-event,
 * Event-dispatch-on-disabled-elements), real input via test_driver (click-on-absolute-pseudo,
 * focus-event-document-move, pointer-event-document-move, Event-dispatch-redispatch,
 * no-focus-events-at-clicking-editable-content-in-link, *-related-target with drag/wheel),
 * cross-realm / iframe-global tests (*-cross-realm*, Event-dispatch-throwing-multiple-globals,
 * event-global-extra, event-global-is-still-set-*, event-listener-not-fully-active-*,
 * abort-signal-timeout, reason-constructor), inline event handler content attributes
 * (Event-dispatch-single-activation-behavior), layout (mouse-event-retarget), XMLHttpRequest
 * (relatedTarget.window.js), window.event as an own [Replaceable] property
 * (event-global-replaceable), coarsened timestamps (Event-timestamp-safe-resolution) and the
 * 2 s AbortSignal.any.js wait.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { defineWPT, defineWPTDirectory, FIXTURES, JS_TEST } from "../wpt/harness.ts";
import { createWindow, AnimationEvent, TransitionEvent } from "../../src/index.ts";

/** `.any.js` / `.window.js` tests of a vendored directory (defineWPTDirectory registers `.html` only). */
function defineJSTests(dir: string): void {
  for (const f of readdirSync(join(FIXTURES, dir)).sort()) if (JS_TEST.test(f)) defineWPT(`${dir}/${f}`);
}

const INLINE_HANDLERS = "inline event handler content attributes are not compiled (docs/deviations.md Scripting)";
const NODE_EVENT_TARGETS = "AbortSignal and Performance are Node's own EventTargets, which reject our Event objects (window area)";

defineWPTDirectory(
  "dom/events",
  {
    "Body-FrameSet-Event-Handlers.html": INLINE_HANDLERS,
    "EventTarget-dispatchEvent.html": "DeviceMotionEvent / DeviceOrientationEvent are not implemented (no device sensors)",
    "event-global.html": "window.event is a prototype accessor, not an own property, and there is no XMLHttpRequest (window area)",
    "event-global-event-targets.html": NODE_EVENT_TARGETS,
    "passive-by-default-non-node.html": NODE_EVENT_TARGETS,
  },
  {
    // Every subtest but one is synchronous; the `<a href="javascript:...">` one never completes.
    "Event-dispatch-click.html": "registered below with a short timeout",
  },
);
defineWPT("dom/events/Event-dispatch-click.html", "javascript: URLs never run (no script execution, no navigation)", { timeout: 300 });
defineJSTests("dom/events");
defineWPTDirectory("dom/events/non-cancelable-when-passive", {}, {});
defineJSTests("dom/abort");

// Only the event files of shadow-dom/ (other areas own the rest of that directory).
defineWPTDirectory("shadow-dom", {}, {}, (file) => /^shadow-dom\/(capturing-and-bubbling-event-listeners-across-shadow-trees|event-[^/]*|slotchange-event)\.html$/.test(file));
for (const dir of ["", "/event-dispatch", "/event-retargeting", "/retargeting-focus-events", "/retargeting-relatedtarget"]) {
  defineWPTDirectory(`shadow-dom/untriaged/events${dir}`, {}, {});
}

describe("HTML §8.1.8.2 Event handlers on elements, Document objects, and Window objects (https://html.spec.whatwg.org/#event-handlers-on-elements,-document-objects,-and-window-objects)", () => {
  // Pins the fix behind WPT dom/events/webkit-*-event.html "dispatchEvent of a webkit… event does
  // trigger a prefixed event handler or listener" (the rest of those files need CSS animations).
  test.each([
    ["onwebkitanimationend", "webkitAnimationEnd", AnimationEvent],
    ["onwebkitanimationiteration", "webkitAnimationIteration", AnimationEvent],
    ["onwebkitanimationstart", "webkitAnimationStart", AnimationEvent],
    ["onwebkittransitionend", "webkitTransitionEnd", TransitionEvent],
  ] as const)("%s's event handler event type is the camel-cased %s", (handler, type, Ctor) => {
    const div = createWindow().document.createElement("div") as unknown as Record<string, unknown> & { dispatchEvent(e: unknown): boolean };
    let calls = 0;
    div[handler] = () => calls++;
    div.dispatchEvent(new Ctor(type));
    div.dispatchEvent(new Ctor(type.toLowerCase()));
    expect(calls).toBe(1);
  });
});
