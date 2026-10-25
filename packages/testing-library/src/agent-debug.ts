// Agent debug mode (not part of upstream @testing-library/dom).
//
// `CTRL_DOM_DEBUG=aria` or `CTRL_DOM_DEBUG=compact` changes what `prettyDOM`, `screen.debug()`,
// `render().debug()` and the errors of failing queries print, without touching test code:
// - `aria`: the accessibility snapshot (./aria-snapshot.ts) instead of pretty-printed HTML;
// - `compact`: prettyDOM's HTML without `class`/`style` attributes and SVG internals.
// Failed ByRole / ByText / ByLabelText queries also list the closest candidates
// (./candidates.ts). Unset (the default), every output is byte-identical to upstream.
//
// The variable is read on every call (cheap), so a test can flip `process.env.CTRL_DOM_DEBUG`.
// It is deliberately not inferred from agent environment variables (CLAUDECODE & co.): suites
// run by agents, including this repository's, assert upstream's messages.

import { ariaSnapshot, describeElement, envMaxLines } from "./aria-snapshot.ts";
import { $impl, type NodeImpl } from "@ctrl/dom/internal";

declare const process: any;

/** prettyDOM's `format` option: upstream's pretty-printed HTML, the aria snapshot, or compact HTML. */
export type DebugFormat = "pretty" | "aria" | "compact";

/** `CTRL_DOM_DEBUG` when it names an agent format, else null (upstream behavior). */
export function envDebugFormat(): "aria" | "compact" | null {
  const raw = typeof process !== "undefined" ? process.env?.CTRL_DOM_DEBUG : undefined;
  if (raw === undefined || raw === "") return null;
  const value = String(raw).trim().toLowerCase();
  if (value === "aria") return "aria";
  if (value === "compact" || value === "html") return "compact";
  return null;
}

/** Line budget for snapshots inside error messages. */
export const ERROR_MAX_LINES = 100;

function containerLabel(container: any): string {
  const impl: NodeImpl | undefined = container?.[$impl];
  if (impl === undefined) return "the container";
  if (impl.type === 9) return "the document";
  return describeElement(impl);
}

/**
 * The text that replaces upstream's `Ignored nodes: comments, script, style\n<prettyDOM>` in a
 * query error under agent mode.
 */
export function agentErrorContext(container: any, format: "aria" | "compact", prettyDOM: (dom: any, maxLength?: number, options?: any) => string | false): string {
  if (format === "aria") {
    return `Accessibility snapshot of ${containerLabel(container)} (CTRL_DOM_DEBUG=aria):\n${ariaSnapshot(container, { maxLines: envMaxLines() ?? ERROR_MAX_LINES })}`;
  }
  return `DOM of ${containerLabel(container)} without class/style/SVG internals (CTRL_DOM_DEBUG=compact):\n${prettyDOM(container, undefined, { format: "compact" })}`;
}

/** One element of a "Found multiple elements" error, under agent mode. */
export function agentElementSummary(element: any): string {
  return ariaSnapshot(element, { maxLines: 12 });
}
