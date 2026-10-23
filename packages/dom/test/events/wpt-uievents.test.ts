/**
 * UI Events — web-platform-tests uievents, run unmodified through test/wpt/harness.ts.
 *
 * Spec: UI Events — https://w3c.github.io/uievents/
 *   - interfaces and constructors: https://w3c.github.io/uievents/#idl-uievent,
 *     https://w3c.github.io/uievents/#idl-keyboardevent, https://w3c.github.io/uievents/#idl-inputevent
 *   - getModifierState / EventModifierInit: https://w3c.github.io/uievents/#dom-keyboardevent-getmodifierstate
 *   - legacy initializers: https://w3c.github.io/uievents/#legacy-interfaces
 *   - focus event order: https://w3c.github.io/uievents/#events-focusevent-event-order
 *   - WebIDL constructor `length`: https://webidl.spec.whatwg.org/#es-interface-call
 * Original tests: https://github.com/web-platform-tests/wpt/tree/master/uievents
 *
 * Only synthetic-dispatch tests are vendored: click/mouse/keyboard/wheel tests that need real
 * input through test_driver (trusted events, hit testing, layout) are out of scope, as is
 * idlharness.window.js (needs WebIDLParser) and the pseudoTarget tentative member (jsdom lacks
 * it; adding it would change the event object shape).
 */
import { defineWPT } from "../wpt/harness.ts";

for (const file of [
  "uievents/constructors/event-getmodifierstate.html",
  "uievents/constructors/inputevent-constructor.html",
  "uievents/focusevents/blur-relatedTarget.html",
  "uievents/getModifierState.html",
  "uievents/historical.html",
  "uievents/interface/click-event.htm",
  "uievents/keyboard/keyboardevent-legacy.html",
  "uievents/legacy/Event-subclasses-init.html",
  "uievents/legacy-domevents-tests/approved/stopImmediatePropagation.effect.html",
  "uievents/legacy-domevents-tests/approved/stopPropagation.deferred.effect.html",
  "uievents/legacy-domevents-tests/submissions/Microsoft/converted/EventListener.dispatch.new.event.html",
]) {
  defineWPT(file);
}
defineWPT(
  "uievents/order-of-events/focus-events/focus-automated-blink-webkit.html",
  "focusing an element of another document (iframe) does not blur the outer document's focused element first (html focus area)",
);
