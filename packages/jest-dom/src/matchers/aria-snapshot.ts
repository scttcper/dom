// toMatchAriaSnapshot: an @ctrl/dom addition (upstream jest-dom has no such matcher). Playwright's
// aria snapshot assertion (https://playwright.dev/docs/aria-snapshots#partial-matching) for
// component tests, over @ctrl/dom/testing-library's ariaSnapshot model:
//
//   expect(screen.getByRole("form")).toMatchAriaSnapshot(`
//     - textbox "Email"
//     - button /Pay \d+ €/ [disabled]
//   `);
//
// The template lists a subset of the tree in order (partial matching); a failure prints the
// template against the closest part of the tree, then the received snapshot, which can be
// pasted back as a template.

import { AriaTemplateError, matchAriaSnapshot } from "@ctrl/dom/testing-library/agent";
import { $impl } from "@ctrl/dom/internal";
import { NodeTypeError, type DOMNode, type MatcherContext, type MatcherResult } from "../utils.ts";

export function toMatchAriaSnapshot(this: MatcherContext, container: DOMNode, template: string): MatcherResult {
  // An @ctrl/dom element, document or fragment (the snapshot is computed on its NodeImpl tree).
  if (container == null || typeof container !== "object" || container[$impl] === undefined) {
    throw new NodeTypeError(container, toMatchAriaSnapshot, this);
  }
  if (typeof template !== "string") {
    throw new TypeError(
      `toMatchAriaSnapshot expects an aria snapshot template string, got ${template === null ? "null" : typeof template}`,
    );
  }
  let match: ReturnType<typeof matchAriaSnapshot>;
  try {
    match = matchAriaSnapshot(container, template);
  } catch (error) {
    if (error instanceof AriaTemplateError && Error.captureStackTrace)
      Error.captureStackTrace(error, toMatchAriaSnapshot);
    throw error;
  }
  const hint = this.utils.matcherHint(`${this.isNot ? ".not" : ""}.toMatchAriaSnapshot`, "element", "template");
  return {
    pass: match.pass,
    message: () => {
      if (this.isNot) {
        return [
          hint,
          "",
          "Expected the accessibility tree not to match the template:",
          this.utils.EXPECTED_COLOR(match.expected()),
          "",
          "Received:",
          this.utils.RECEIVED_COLOR(match.received()),
        ].join("\n");
      }
      const ops = match.diff();
      let removed = 0;
      let added = 0;
      const lines: string[] = [];
      for (let i = 0; i < ops.length; i++) {
        const op = ops[i];
        if (op.kind === "-") {
          removed++;
          lines.push(this.utils.EXPECTED_COLOR(`- ${op.text}`));
        } else if (op.kind === "+") {
          added++;
          lines.push(this.utils.RECEIVED_COLOR(`+ ${op.text}`));
        } else lines.push(`  ${op.text}`);
      }
      return [
        hint,
        "",
        `${this.utils.EXPECTED_COLOR(`- Expected  - ${removed}`)}  (template)`,
        `${this.utils.RECEIVED_COLOR(`+ Received  + ${added}`)}  (closest part of the accessibility tree)`,
        "",
        ...lines,
        "",
        "Received accessibility tree:",
        this.utils.RECEIVED_COLOR(match.received()),
      ].join("\n");
    },
  };
}
