/**
 * Downstream repro (Base UI Field.Root "custom validity ownership" tests).
 *
 * When an input has a custom validity error AND a native constraint failure (here
 * typeMismatch on type=email), `validationMessage` must report the custom message: it is what
 * the UA shows, and what Base UI reads back to decide which message it owns. jsdom (the
 * baseline) and Chromium both return the custom message; @rtd/dom returns its localized
 * typeMismatch text ("Please include an '@' ...").
 *
 * Spec: https://html.spec.whatwg.org/#dom-cva-validationmessage
 *       https://html.spec.whatwg.org/#dom-cva-setcustomvalidity
 * Owner: html-forms (validationMessage precedence: customError first).
 */
import { expect, test } from "vitest";
import { differential } from "./engines.ts";

differential("validationMessage prefers the custom validity message", (make) => {
  test("type=email with a typeMismatch value and setCustomValidity()", () => {
    const { document } = make();
    const input = document.createElement("input");
    input.type = "email";
    document.body.append(input);
    input.value = "bad";
    input.setCustomValidity("custom error");
    expect(input.validity.typeMismatch).toBe(true);
    expect(input.validity.customError).toBe(true);
    expect(input.validationMessage).toBe("custom error");
  });
});
