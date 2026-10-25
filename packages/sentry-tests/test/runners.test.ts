// @vitest-environment node
/**
 * @ctrl/sentry-tests end to end from its sources: Vitest (the sentryTests() plugin, on jsdom) and
 * Jest (the reporter and test runner, on Jest's node environment) each run a test file against a
 * fake Sentry server, and the envelopes that arrive (https://develop.sentry.dev/sdk/data-model/envelopes/)
 * hold the file's trace with its describe block, tests, hooks and test functions
 * (Vitest's runner `trace` phases; jest-circus's events:
 * https://github.com/jestjs/jest/blob/main/packages/jest-circus/src/run.ts) and the spans the test
 * published on "sentry-tests:span", an issue for the failing test with the page as it was before
 * its afterEach hook (Vitest, on jsdom), and a flaky-test issue.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, expect, test } from "vitest";

const fixtures = new URL("./fixtures/", import.meta.url).pathname;
const require = createRequire(import.meta.url);

interface Item {
  header: { type: string; filename?: string };
  payload: any;
}

function parseEnvelope(buffer: Buffer): Item[] {
  const items: Item[] = [];
  let at = buffer.indexOf(10) + 1;
  while (at < buffer.length) {
    const eol = buffer.indexOf(10, at);
    if (eol < 0) break;
    const header = JSON.parse(buffer.subarray(at, eol).toString());
    const payload = buffer.subarray(eol + 1, eol + 1 + header.length).toString();
    items.push({ header, payload: header.type === "attachment" ? payload : JSON.parse(payload) });
    at = eol + 1 + header.length + 1;
  }
  return items;
}

/** Run `args` with SENTRY_DSN pointing at a fake Sentry server; the envelopes it got and the output. */
async function runAgainstSentry(args: string[]): Promise<{ envelopes: Item[][]; output: string; code: number | null; port: number }> {
  const received: Buffer[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      received.push(Buffer.concat(chunks));
      res.writeHead(200).end("{}");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  const child = spawn(process.execPath, args, {
    cwd: fixtures,
    env: { ...process.env, SENTRY_DSN: `http://public@127.0.0.1:${port}/1`, SENTRY_RELEASE: "r1", SENTRY_SPOTLIGHT: "", VITEST: undefined, VITEST_WORKER_ID: undefined, VITEST_POOL_ID: undefined, NODE_OPTIONS: undefined },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (d) => (output += d));
  child.stderr.on("data", (d) => (output += d));
  const code = await new Promise<number | null>((resolve) => child.on("close", resolve));
  server.close();
  return { envelopes: received.map(parseEnvelope), output, code, port };
}

function checkRun(run: Awaited<ReturnType<typeof runAgainstSentry>>, file: string) {
  expect(run.code, run.output).toBe(1);
  const transactions = run.envelopes.flat().filter((i) => i.header.type === "transaction").map((i) => i.payload);
  expect(transactions).toHaveLength(1);
  const tx = transactions[0];
  expect(tx).toMatchObject({ transaction: file, release: "r1", contexts: { trace: { op: "test.file", status: "internal_error" } } });
  const byId = new Map<string, any>(tx.spans.map((s: any) => [s.span_id, s]));
  const parentOf = (s: any) => byId.get(s.parent_span_id);
  const find = (op: string, description: string) => tx.spans.find((s: any) => s.op === op && s.description === description);

  const suite = find("test.suite", "Cart");
  expect(suite.parent_span_id).toBe(tx.contexts.trace.span_id);
  const adds = find("test.case", "Cart > adds an item");
  expect(parentOf(adds)).toBe(suite);
  expect(adds.status).toBe("ok");
  // Its hooks and test function under it, the test's own span under the test function.
  const children = tx.spans.filter((s: any) => s.parent_span_id === adds.span_id).map((s: any) => `${s.op} ${s.description}`);
  expect(children).toEqual(["test.hook beforeEach", "test.fn adds an item", "test.hook afterEach"]);
  const query = find("db.query", "SELECT * FROM items");
  expect(parentOf(query)).toMatchObject({ op: "test.fn", parent_span_id: adds.span_id });
  expect(query.data).toEqual({ rows: 1 });
  expect(find("test.case", "Cart > checks out").status).toBe("internal_error");
  expect(tx.spans.some((s: any) => s.op === "test.collect")).toBe(true);

  const events = run.envelopes.filter((e) => e[0].header.type === "event");
  const failure = events.find((e) => e[0].payload.fingerprint[0] === "sentry-tests.test-failure")!;
  expect(failure[0].payload).toMatchObject({ fingerprint: ["sentry-tests.test-failure", file, "Cart > checks out"], level: "error" });
  // Jest retries it too (jest.retryTimes): the issue links to its last attempt.
  const attempts = tx.spans.filter((s: any) => s.op === "test.case" && s.description === "Cart > checks out");
  expect(failure[0].payload.contexts.trace).toMatchObject({ trace_id: tx.contexts.trace.trace_id, span_id: attempts.at(-1).span_id });
  expect(failure[0].payload.breadcrumbs.values[0].message).toMatch(/^beforeEach \(/);
  const flaky = events.find((e) => e[0].payload.fingerprint[0] === "sentry-tests.flaky-test")!;
  expect(flaky[0].payload.exception.values[0]).toMatchObject({ type: "FlakyTest" });
  expect(flaky[0].payload.exception.values[0].value).toMatch(/failed, then passed on retry 1\. The failed attempt:\n\nError: first try$/);
  expect(run.output).toContain(`@ctrl/sentry-tests: 1 trace, 1 failed test, 1 flaky test → 127.0.0.1:${run.port}`);
  return { failure };
}

describe("Vitest: the sentryTests() plugin", () => {
  test("a trace of describe blocks, tests, hooks and test functions; the failing test's page as it was before its afterEach hook; a flaky-test issue", { timeout: 60_000 }, async () => {
    const vitest = join(dirname(require.resolve("vitest/package.json")), "vitest.mjs");
    const run = await runAgainstSentry([vitest, "run", "--config", "vitest.config.ts"]);
    const { failure } = checkRun(run, "cart.vitest.ts");
    const page = failure.find((i) => i.header.filename === "page.html");
    expect(page?.payload).toBe(["<body>", "  <ul>", "    <li>Apple</li>", "  </ul>", "  <button>Checkout</button>", "</body>"].join("\n"));
  });
});

describe("Jest: the reporter and test runner", () => {
  test("the same trace and issues from jest-circus's events, on an environment that is not @ctrl/dom's", { timeout: 60_000 }, async () => {
    const jest = join(dirname(require.resolve("jest/package.json")), "bin/jest.js");
    const run = await runAgainstSentry([jest, "--config", "jest.config.cjs"]);
    checkRun(run, "cart.jest.cjs");
  });
});
