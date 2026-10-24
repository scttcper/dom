/**
 * Agent debug mode's failure snapshots under a real Vitest run (spawned): the setup file
 * src/failure-snapshot.ts appends an aria snapshot of `document.body`, as it was when the test
 * failed, to each failing test's error. An @ctrl/dom addition (docs/agent-debugging.md), not a
 * spec: the specs exercised are the testing library's (see packages/testing-library).
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, test } from "vitest";

const pkg = fileURLToPath(new URL("..", import.meta.url));
const out = mkdtempSync(join(tmpdir(), "rtd-failure-snapshot-"));
afterAll(() => rmSync(out, { recursive: true, force: true }));

interface VitestJson {
  numFailedTests: number;
  testResults: { assertionResults: { title: string; status: string; failureMessages: string[] }[] }[];
}

const runs = new Map<string, Map<string, string>>();

/** Failure messages by test title, for one run of the fixture project per environment. */
function vitest(env: Record<string, string | undefined>): Map<string, string> {
  const key = JSON.stringify(env);
  let messages = runs.get(key);
  if (messages === undefined) runs.set(key, (messages = spawnVitest(env)));
  return messages;
}

function spawnVitest(env: Record<string, string | undefined>): Map<string, string> {
  const merged: Record<string, string | undefined> = { ...process.env, ...env };
  for (const key of Object.keys(env)) if (env[key] === undefined) delete merged[key];
  const file = join(out, `run-${runs.size}.json`);
  spawnSync("pnpm", ["exec", "vitest", "run", "--config", "test/failure-snapshot/vitest.config.ts", "--reporter=json", `--outputFile.json=${file}`], {
    cwd: pkg,
    encoding: "utf8",
    env: merged,
  });
  const json = JSON.parse(readFileSync(file, "utf8")) as VitestJson;
  return new Map(json.testResults[0].assertionResults.map((a) => [a.title, a.failureMessages.join("\n")]));
}

const BEFORE_CLICK = ["- main:", '  - heading "Checkout" [level=1]', '  - form "Payment":', '    - textbox "Email"', '    - button "Options" [expanded=false]'].join("\n");

describe("failure snapshots under CTRL_DOM_DEBUG (setup file, onTestFailed)", () => {
  test("each failure gets the body as it was before Testing Library's cleanup", { timeout: 60_000 }, () => {
    const messages = vitest({ CTRL_DOM_DEBUG: "aria", CTRL_DOM_DEBUG_LINES: undefined });
    const header = "Accessibility snapshot of <body> when the test failed (CTRL_DOM_DEBUG=aria):";
    expect(messages.get("a failed expect")).toContain(`to be 'Cart' // Object.is equality\n\n${header}\n${BEFORE_CLICK}\n    at `);
    expect(messages.get("a thrown error")).toContain(`Error: boom\n\n${header}\n${BEFORE_CLICK}\n    at `);
    expect(messages.get("passes")).toBe("");
  });

  test("what changed since the last snapshot the test took is diffed", { timeout: 60_000 }, () => {
    const messages = vitest({ CTRL_DOM_DEBUG: "aria", CTRL_DOM_DEBUG_LINES: undefined });
    expect(messages.get("what changed since the previous snapshot")).toContain(
      [
        "Changes since the previous snapshot in this test:",
        "  - main:",
        "  …",
        '    - form "Payment":',
        "  …",
        '-     - button "Options" [expanded=false]',
        '+     - button "Options" [expanded]',
        '+     - button "Gift wrap"',
      ].join("\n"),
    );
  });

  test("a snapshot the error already printed (a failed query) is not repeated", { timeout: 60_000 }, () => {
    const messages = vitest({ CTRL_DOM_DEBUG: "aria", CTRL_DOM_DEBUG_LINES: undefined });
    const message = messages.get("a failed query that printed the snapshot already")!;
    expect(message).toContain(`Accessibility snapshot of <body> (CTRL_DOM_DEBUG=aria):\n${BEFORE_CLICK}\n\nAccessibility snapshot of <body> when the test failed: the same as above.`);
  });

  test("CTRL_DOM_DEBUG_LINES budgets the snapshot", { timeout: 60_000 }, () => {
    const messages = vitest({ CTRL_DOM_DEBUG: "aria", CTRL_DOM_DEBUG_LINES: "2" });
    expect(messages.get("a thrown error")).toContain(`- main:\n  - heading "Checkout" [level=1]\n# … 3 more lines (raise maxLines or CTRL_DOM_DEBUG_LINES)\n`);
  });

  test("without CTRL_DOM_DEBUG the setup file registers nothing", { timeout: 60_000 }, () => {
    const messages = vitest({ CTRL_DOM_DEBUG: undefined });
    expect(messages.get("a thrown error")).toMatch(/^Error: boom\n {4}at /);
    expect([...messages.values()].join("\n")).not.toContain("Accessibility snapshot");
  });
});
