/**
 * Downstream repro (Base UI Avatar.Image keepMounted tests: 6 failures in both ctrl-dom modes).
 *
 * Base UI derives the initial loading status from `img.complete`: an `<img src>` that is not
 * complete is "loading" until load/error fires. jsdom (no resource loading) reports
 * `complete === false` for an `<img>` with a src that was never fetched; @ctrl/dom reports
 * `true` (docs/deviations.md HTML row), so the component starts in "loaded"/"error" and the
 * tests' expected ['loading', ...] status sequence never happens.
 *
 * Spec: https://html.spec.whatwg.org/#dom-img-complete (true only when the current request is
 * completely available or broken; a request that never progresses is neither).
 * Owner: html-elements (revisit the img deviation: never-fetched => complete false, like jsdom).
 */
import { expect, test } from "vitest";
import { differential } from "./engines.ts";

differential("img.complete for a src that is never fetched", (make) => {
  test("<img src> without loading is not complete", () => {
    const { document } = make();
    const img = document.createElement("img");
    img.src = "https://example.com/avatar.png";
    document.body.append(img);
    expect(img.complete).toBe(false);
  });
});
