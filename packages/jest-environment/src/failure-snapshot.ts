// Failure snapshots for agent debug mode (docs/agent-debugging.md): with CTRL_DOM_DEBUG set, every
// failing test's error gets one budgeted aria snapshot of `document.body` appended, taken when the
// test function failed (before afterEach hooks such as Testing Library's cleanup unmount it), plus
// what changed since the last snapshot the test took.
//
// Hooked through the environment's `handleTestEvent`, which jest-circus calls for every event:
// `test_start` forgets the previous test's snapshot, `test_fn_failure` (the test function threw or
// rejected; `event.error` is what it threw) appends the report. Without CTRL_DOM_DEBUG the
// environment defines no handler at all, so Jest's behavior and output are unchanged.
//
// The report code lives in @ctrl/dom/testing-library/agent and is imported on the first event, in the
// environment's realm: it reads the same DOM instance (the environment loaded it), and the last
// snapshot the test took is kept on the document, which both realms share.

import type { Circus } from "@jest/types";

type Agent = typeof import("@ctrl/dom/testing-library/agent");

/** The values of CTRL_DOM_DEBUG that turn agent mode on (agent-debug.ts, envDebugFormat). */
function debugEnabled(): boolean {
  const value = process.env.CTRL_DOM_DEBUG?.trim().toLowerCase();
  return value === "aria" || value === "compact" || value === "html";
}

/** A `handleTestEvent` for the environment, or undefined when CTRL_DOM_DEBUG is off. */
export function failureSnapshotHandler(
  getDocument: () => unknown,
): ((event: Circus.Event) => Promise<void> | void) | undefined {
  if (!debugEnabled()) return undefined;
  let agent: Agent | null = null;
  return async (event) => {
    if (event.name !== "test_start" && event.name !== "test_fn_failure") return;
    agent ??= await import("@ctrl/dom/testing-library/agent");
    const document = getDocument();
    if (document == null) return;
    if (event.name === "test_start") {
      agent.resetFailureSnapshot(document as never);
      return;
    }
    const error: unknown = event.error;
    const message =
      error !== null && typeof error === "object" && typeof (error as Error).message === "string"
        ? (error as Error).message
        : "";
    const snapshot = agent.captureFailureSnapshot(document as never);
    if (snapshot !== null) agent.appendToErrorMessage(error, agent.formatFailureSnapshot(snapshot, message));
  };
}
