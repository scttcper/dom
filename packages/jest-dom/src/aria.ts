// Accessible name / description computation used by the matchers.
//
// @rtd/dom elements go through @rtd/aria's dom-accessibility-api@0.6.3-compatible surface
// (`daa06`, the exact version @testing-library/jest-dom@7.0.1 uses), which walks NodeImpl
// records directly. Foreign elements (jsdom/happy-dom, used by the oracle runs) fall back to
// dom-accessibility-api@0.6.3 itself, loaded lazily so @rtd/dom users never pay for it.

import { createRequire } from "node:module";
import { daa06 } from "@rtd/aria";
import type { DOMNode } from "./utils.ts";
import { $impl } from "@rtd/dom/internal";

interface DAA {
  computeAccessibleName(element: DOMNode): string;
  computeAccessibleDescription(element: DOMNode): string;
}

let fallback: DAA | null = null;
function foreign(): DAA {
  return (fallback ??= createRequire(import.meta.url)("dom-accessibility-api") as DAA);
}

export function computeAccessibleName(element: DOMNode): string {
  if (element[$impl] !== undefined) return daa06.computeAccessibleName(element);
  return foreign().computeAccessibleName(element);
}

export function computeAccessibleDescription(element: DOMNode): string {
  if (element[$impl] !== undefined) return daa06.computeAccessibleDescription(element);
  return foreign().computeAccessibleDescription(element);
}
