// Test setup for @ctrl/dom/testing-library. The DOM comes from @ctrl/dom/vitest-environment
// (`environment: "ctrl-dom"`); files under test/upstream-node/ (port of upstream's
// __node_tests__) run in the node environment without a global DOM.

import * as matchers from "@testing-library/jest-dom/matchers";
import { afterAll, beforeAll, chai, expect, vi } from "vitest";

// upstream tests/setup-env.js: `import '@testing-library/jest-dom/extend-expect'`
expect.extend(matchers as never);

// Upstream's Jest config snapshots every string raw (kcd-scripts' `jest-snapshot-serializer-raw/always`).
// Files that strip ANSI colors add test/helpers/ansi-serializer.js, as upstream adds
// jest-snapshot-serializer-ansi per file.
// eslint-disable-next-line no-control-regex
const ANSI = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
expect.addSnapshotSerializer({
  test: (val: unknown) => typeof val === "string",
  serialize: (val: string) => val,
});

// Jest's `toThrowErrorMatching(Inline)Snapshot` snapshots `error.message`; Vitest's snapshots the
// error object (`[Error: …]`). The ported assertions are Jest's, so restore Jest's behavior.
function thrownMessage(utils: any, assertion: any): string {
  const received = utils.flag(assertion, "object");
  const promise = utils.flag(assertion, "promise");
  let error: any;
  if (promise) {
    error = received;
  } else {
    let threw = false;
    try {
      received();
    } catch (e) {
      threw = true;
      error = e;
    }
    if (!threw) throw new Error("Received function did not throw");
  }
  const message = String(error != null && typeof error.message === "string" ? error.message : error);
  return (globalThis as any).__ctrlDomStripAnsiInSnapshots ? message.replace(ANSI, "") : message;
}

chai.use((chaiInstance, utils) => {
  utils.addMethod(chaiInstance.Assertion.prototype, "toThrowErrorMatchingSnapshot", function (this: any) {
    expect(thrownMessage(utils, this)).toMatchSnapshot();
  });
  utils.addMethod(
    chaiInstance.Assertion.prototype,
    "toThrowErrorMatchingInlineSnapshot",
    function (this: any, inlineSnapshot?: string) {
      const message = thrownMessage(utils, this);
      // Inline snapshots are keyed by call site in Vitest, so compare the way jest-snapshot does
      // (stripAddedIndentation + addExtraLineBreaks) instead of delegating to toMatchInlineSnapshot.
      const actual = message.includes("\n") ? `\n${message}\n` : message;
      expect(actual).toBe(stripAddedIndentation(inlineSnapshot ?? ""));
    },
  );
});

// https://github.com/jestjs/jest/blob/main/packages/jest-snapshot/src/utils.ts (MIT)
function stripAddedIndentation(inlineSnapshot: string): string {
  const match = inlineSnapshot.match(/^([^\S\n]*)\S/m);
  if (!match || !match[1]) return inlineSnapshot;
  const indentation = match[1];
  const lines = inlineSnapshot.split("\n");
  if (lines.length <= 2) return inlineSnapshot;
  if (lines[0].trim() !== "" || lines[lines.length - 1].trim() !== "") return inlineSnapshot;
  for (let i = 1; i < lines.length - 1; i++) {
    if (lines[i] !== "") {
      if (lines[i].indexOf(indentation) !== 0) return inlineSnapshot;
      lines[i] = lines[i].substring(indentation.length);
    }
  }
  lines[lines.length - 1] = "";
  return lines.join("\n");
}

// upstream tests/setup-env.js: silence "deprecated" warnings.
beforeAll(() => {
  const originalWarn = console.warn;
  vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
    const first = args[0] as { includes?: (s: string) => boolean } | undefined;
    if (first && first.includes && first.includes("deprecated")) {
      return;
    }
    originalWarn(...args);
  });
});

afterAll(() => {
  vi.restoreAllMocks();
});
