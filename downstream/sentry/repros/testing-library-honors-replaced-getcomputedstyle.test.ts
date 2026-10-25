/**
 * Downstream repro (Sentry: tabs.spec.tsx "activates an overflowing tab when selected from the
 * menu", and every test whose target is hidden by an Emotion stylesheet rule; see TRIAGE.md).
 *
 * Sentry's tests/js/setup.ts replaces `window.getComputedStyle` with `(el) => el.style`
 * ("The full jsdom CSS cascade is too slow"), so stylesheet rules never hide anything from
 * stock Testing Library: `isInaccessible()` (and dom-accessibility-api) call
 * `element.ownerDocument.defaultView.getComputedStyle`. @ctrl/dom/testing-library's ByRole filter
 * (role-helpers `isInaccessibleImpl`) reads @ctrl/dom's cascade directly and ignores the
 * replaced function, so an element hidden by a stylesheet `display: none` is excluded and
 * `getByRole` fails where stock Testing Library (jsdom or @ctrl/dom) finds it.
 *
 * The internal fast path is fine; it should only be taken while `window.getComputedStyle` is
 * still the window's own implementation (fall back to calling the replaced function, as
 * upstream does, when user code has swapped it).
 *
 * Upstream: https://github.com/testing-library/dom-testing-library/blob/main/src/role-helpers.js
 *           (isSubtreeInaccessible: `window.getComputedStyle(element).display === 'none'`)
 * Owner: testing-library (+ aria for the accessible-name / jest-dom toBeVisible equivalents).
 */
import { expect, test } from "vitest";
import { differential, requireFromReact, withGlobals } from "./engines.ts";
import * as ours from "../../../packages/testing-library/src/index.ts";

const stock = requireFromReact("@testing-library/dom") as typeof ours;

differential("ByRole honours a user-replaced window.getComputedStyle", (make, engine) => {
  test("stylesheet display:none is ignored when getComputedStyle returns element.style", async () => {
    const window = make();
    const { document } = window;
    document.head.innerHTML = "<style>.overflow { display: none }</style>";
    document.body.innerHTML = '<ul role="tablist"><li role="tab">Details</li><li role="tab" class="overflow">Attachments</li></ul>';
    window.getComputedStyle = (el: any) => el.style;
    // jsdom: stock Testing Library (Sentry's baseline); ctrl-dom: @ctrl/dom/testing-library (ctrl-dom-full).
    const lib = engine === "jsdom" ? stock : ours;
    const names = await withGlobals(window, engine, () => lib.queryAllByRole(document.body, "tab").map((t: any) => t.textContent));
    expect(names).toEqual(["Details", "Attachments"]);
  });
});
