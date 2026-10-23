/**
 * Downstream repro (Sentry: thinkingBlock.spec.tsx ×2 "collapses when endTime arrives", and
 * every React Aria Disclosure/Accordion collapse asserted synchronously).
 *
 * React Aria's useDisclosure picks its code path by feature-probing:
 *   if (first render || typeof panel.getAnimations !== 'function') {
 *     // "On initial render (and in tests), set attributes without animation."
 *     panel.setAttribute('hidden', 'until-found');
 *   } else {
 *     ... Promise.all(panel.getAnimations().map(a => a.finished))
 *           .then(() => panel.setAttribute('hidden', 'until-found'));
 *   }
 * jsdom has no Element.getAnimations, so collapsing hides the panel synchronously inside
 * React's commit. @rtd/dom implements getAnimations() (always `[]`, docs/deviations.md
 * "Animations"), so React Aria takes the animated path and `hidden` lands a microtask later:
 * `rerender(...); expect(panel).not.toBeVisible()` fails.
 *
 * The deviation note already keeps `Element.animate` absent so code "keeps its non-animated
 * path, as on jsdom"; getAnimations is the other common probe. Options: drop getAnimations
 * (jsdom parity) or accept the timing difference and document it.
 * Spec: https://drafts.csswg.org/web-animations-1/#dom-animatable-getanimations
 * Owner: html-elements (Element/Animatable mixin; with css for animations).
 */
import { expect, test } from "vitest";
import { differential } from "./engines.ts";

differential("Element.getAnimations feature probe (React Aria useDisclosure)", (make) => {
  test("absent, so libraries keep their synchronous no-animation path", () => {
    const window = make();
    const panel = window.document.createElement("div");
    expect(typeof panel.getAnimations).toBe("undefined");
  });
});
