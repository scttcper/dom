/**
 * Popovers — web-platform-tests html/semantics/popovers, run unmodified through
 * test/wpt/harness.ts (test_driver files run from packages/user-event).
 *
 * Spec: HTML Standard §6.12 "The popover attribute" — https://html.spec.whatwg.org/#the-popover-attribute
 *   - show / hide popover: https://html.spec.whatwg.org/#show-popover
 *   - hide popover stack until: https://html.spec.whatwg.org/#hide-popover-stack-until
 *   - topmost popover ancestor: https://html.spec.whatwg.org/#topmost-popover-ancestor
 *   - popover target attributes: https://html.spec.whatwg.org/#the-popover-target-attributes
 *   - commandfor / command: https://html.spec.whatwg.org/#the-button-element:attr-button-commandfor
 * Original tests: https://github.com/web-platform-tests/wpt/tree/master/html/semantics/popovers
 */
import { defineWPT } from "../wpt/harness.ts";

defineWPT("html/semantics/popovers/button-type-popovertarget.html");
defineWPT("html/semantics/popovers/hide-other-popover-side-effects.html");
defineWPT("html/semantics/popovers/imperative-invokers.html");
defineWPT("html/semantics/popovers/input-type-popovertarget.html");
defineWPT("html/semantics/popovers/popover-active-document.html");
defineWPT("html/semantics/popovers/popover-beforetoggle-opening-event.html");
defineWPT("html/semantics/popovers/popover-events.html", "hiding display:none content is not deferred to the next rendering update, so the autofocus target is no longer focusable");
defineWPT("html/semantics/popovers/popover-light-dismiss-on-scroll.html");
defineWPT("html/semantics/popovers/popover-manual-hide-does-not-close-auto.html");
defineWPT("html/semantics/popovers/popover-nested-in-button.html", "declarative shadow roots in the markup are not attached by the harness");
defineWPT("html/semantics/popovers/popover-open-overflow-display-2.html");
defineWPT("html/semantics/popovers/popover-removal-2.html");
defineWPT("html/semantics/popovers/popover-removal-hides.html");
defineWPT("html/semantics/popovers/popover-removal.html");
defineWPT("html/semantics/popovers/popover-stacking.html");
defineWPT("html/semantics/popovers/popover-target-element-disabled.html");
defineWPT("html/semantics/popovers/popover-toggle-source.html");
defineWPT("html/semantics/popovers/popover-types.html");
defineWPT("html/semantics/popovers/popovertarget-disabled-fieldset.html");
defineWPT("html/semantics/popovers/togglePopover.html");
defineWPT("html/semantics/popovers/toggleevent-interface.html", "ToggleEvent.source is not retargeted (events area)");
