/**
 * `ctrl-dom debug` (publish/ctrl-dom/cli/ctrl-dom.js) on a Vitest project: runs one test file with
 * CTRL_DOM_DEBUG=aria through its own reporter and exits with the run's status. An @ctrl/dom
 * addition (docs/agent-debugging.md); no spec. The Jest side is in
 * packages/jest-environment/test/jest.test.ts, the published package in tests/pack.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const pkg = fileURLToPath(new URL("..", import.meta.url));
const cli = fileURLToPath(new URL("../../../publish/ctrl-dom/cli/ctrl-dom.js", import.meta.url));

function ctrlDom(...args: string[]) {
  const env: Record<string, string | undefined> = { ...process.env };
  delete env.CTRL_DOM_DEBUG;
  delete env.CTRL_DOM_DEBUG_LINES;
  return spawnSync(process.execPath, [cli, ...args], { cwd: pkg, encoding: "utf8", env });
}

const FIXTURE = ["test/failure-snapshot/checkout.fixture.tsx", "--config", "test/failure-snapshot/vitest.config.ts"];

describe("ctrl-dom debug with Vitest", () => {
  test("prints each failure with its snapshot, the console output and a summary; exits 1", { timeout: 60_000 }, () => {
    const run = ctrlDom("debug", ...FIXTURE);
    expect(run.status).toBe(1);
    const out = run.stdout;
    expect(out).toMatch(/^ctrl-dom debug: vitest test\/failure-snapshot\/checkout\.fixture\.tsx \(CTRL_DOM_DEBUG=aria\)\n\n/);
    expect(out).toContain(
      [
        "FAIL  a thrown error",
        "  Error: boom",
        "",
        "  Accessibility snapshot of <body> when the test failed (CTRL_DOM_DEBUG=aria):",
        "  - main:",
        '    - heading "Checkout" [level=1]',
        '    - form "Payment":',
        '      - textbox "Email"',
        '      - button "Options" [expanded=false]',
        "",
        "  at test/failure-snapshot/checkout.fixture.tsx:34:9",
      ].join("\n"),
    );
    expect(out).toContain("FAIL  a failed query that printed the snapshot already\n  TestingLibraryElementError: Unable to find an accessible element");
    expect(out).toContain("Closest matches:\n  - button \"Options\" [expanded=false]  # same role, other name");
    expect(out).toContain("Console output:\nstdout | passes\n  rendered the checkout\n");
    expect(out).toMatch(/\n4 failed, 1 passed · vitest · test\/failure-snapshot\/checkout\.fixture\.tsx · [\d.]+ s\n$/);
    // No ANSI colors, no stack traces beyond the one frame.
    expect(out).not.toMatch(/\u001b\[|\n\s+at .*node_modules/);
  });

  test("-t runs one test; a passing run exits 0", { timeout: 60_000 }, () => {
    const run = ctrlDom("debug", ...FIXTURE, "-t", "passes");
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(/\n1 passed, 4 skipped · vitest · /);
    expect(run.stdout).not.toContain("FAIL");
  });

  test("usage errors exit 2", () => {
    const run = ctrlDom("debug");
    expect(run.status).toBe(2);
    expect(run.stderr).toContain("ctrl-dom: no test file given");
    expect(ctrlDom("frobnicate").status).toBe(2);
    expect(ctrlDom("--help").stdout).toContain("Usage: ctrl-dom debug <test file>");
  });
});
