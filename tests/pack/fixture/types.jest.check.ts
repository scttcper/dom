// (e) type-level checks for Jest (never executed): `@ctrl/dom/jest-dom/jest-globals` augments
// @jest/globals' expect, including @ctrl/dom's toMatchAriaSnapshot.
import "@ctrl/dom/jest-dom/jest-globals";
import { expect } from "@jest/globals";

expect(document.body).toBeInTheDocument();
expect(document.body).toMatchAriaSnapshot(`
  - heading "Checkout" [level=1]
  - button /Pay \\d+/
`);
// @ts-expect-error -- the template is a string
expect(document.body).toMatchAriaSnapshot(42);
