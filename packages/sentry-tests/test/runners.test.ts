// @vitest-environment node
/**
 * @ctrl/sentry-tests end to end from its sources: Vitest (the sentryTests() plugin, on jsdom) and
 * Jest (the reporter and test runner, on Jest's node environment) each run a test file against a
 * fake Sentry server, and the envelopes that arrive (https://develop.sentry.dev/sdk/data-model/envelopes/)
 * hold the file's trace with its describe block, tests, hooks and test functions (Vitest's runner
 * `trace` phases; jest-circus's events: https://github.com/jestjs/jest/blob/main/packages/jest-circus/src/run.ts)
 * and the span the test published on "sentry-tests:span", an issue for the failing test with the
 * page as it was before its afterEach hook (Vitest, on jsdom), and a flaky-test issue.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, expect, test } from "vitest";

const fixtures = new URL("./fixtures/", import.meta.url).pathname;
const require = createRequire(import.meta.url);
const vitest = join(dirname(require.resolve("vitest/package.json")), "vitest.mjs");
const jest = join(dirname(require.resolve("jest/package.json")), "bin/jest.js");

interface Span {
  span_id: string;
  parent_span_id: string;
  op: string;
  description: string;
  status: string;
  data: Record<string, unknown>;
}
interface Item {
  header: { type: string; filename?: string };
  payload: any;
}

function parseEnvelope(buffer: Buffer): Item[] {
  const items: Item[] = [];
  let at = buffer.indexOf(10) + 1;
  while (at < buffer.length) {
    const eol = buffer.indexOf(10, at);
    const header = JSON.parse(buffer.subarray(at, eol).toString());
    const payload = buffer.subarray(eol + 1, eol + 1 + header.length).toString();
    items.push({ header, payload: header.type === "attachment" ? payload : JSON.parse(payload) });
    at = eol + 1 + header.length + 1;
  }
  return items;
}

/** Run `args` in test/fixtures with SENTRY_DSN pointing at a fake Sentry server. */
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
    // Not this run's Vitest worker variables: the child would think it is one.
    env: { ...process.env, SENTRY_DSN: `http://public@127.0.0.1:${port}/1`, SENTRY_RELEASE: "r1", SENTRY_SPOTLIGHT: "", VITEST: undefined, VITEST_WORKER_ID: undefined, VITEST_POOL_ID: undefined },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (d) => (output += d));
  child.stderr.on("data", (d) => (output += d));
  const code = await new Promise<number | null>((resolve) => child.on("close", resolve));
  server.close();
  return { envelopes: received.map(parseEnvelope), output, code, port };
}

/** What both fixtures (cart.vitest.ts, cart.jest.cjs) must produce; the failure's envelope. */
function expectCartReport(run: Awaited<ReturnType<typeof runAgainstSentry>>, file: string): Item[] {
  expect(run.code, run.output).toBe(1);
  const transactions = run.envelopes.flat().filter((i) => i.header.type === "transaction");
  expect(transactions).toHaveLength(1);
  const tx = transactions[0].payload;
  expect(tx).toMatchObject({ transaction: file, release: "r1", contexts: { trace: { op: "test.file", status: "internal_error" } } });
  const spans: Span[] = tx.spans;
  const find = (op: string, description: string) => spans.find((s) => s.op === op && s.description === description)!;
  const parentOf = (span: Span) => spans.find((s) => s.span_id === span.parent_span_id);

  expect(spans.some((s) => s.op === "test.collect")).toBe(true);
  const suite = find("test.suite", "Cart");
  expect(suite.parent_span_id).toBe(tx.contexts.trace.span_id);
  const adds = find("test.case", "Cart > adds an item");
  expect(parentOf(adds)).toBe(suite);
  expect(adds.status).toBe("ok");
  // One span per run of hooks: the describe block's afterEach and the file's are one "afterEach".
  expect(spans.filter((s) => s.parent_span_id === adds.span_id).map((s) => `${s.op} ${s.description} ${s.data.hooks ?? ""}`.trim())).toEqual(["test.hook beforeEach 1", "test.fn adds an item", "test.hook afterEach 2"]);
  const eventually = find("test.case", "eventually passes");
  expect(spans.some((s) => s.parent_span_id === eventually.span_id && s.op === "test.hook" && s.description === "afterEach")).toBe(true);
  const query = find("db.query", "SELECT * FROM items");
  expect(parentOf(query)).toMatchObject({ op: "test.fn", parent_span_id: adds.span_id });
  expect(query.data).toEqual({ rows: 1 });

  const events = run.envelopes.filter((e) => e[0].header.type === "event");
  const failure = events.find((e) => e[0].payload.fingerprint[0] === "sentry-tests.test-failure")!;
  expect(failure[0].payload).toMatchObject({ fingerprint: ["sentry-tests.test-failure", file, "Cart > checks out"], level: "error" });
  // Jest retries it too (jest.retryTimes), a span per attempt: the issue links to the last one.
  const attempts = spans.filter((s) => s.op === "test.case" && s.description === "Cart > checks out");
  expect(attempts.at(-1)!.status).toBe("internal_error");
  expect(failure[0].payload.contexts.trace).toMatchObject({ trace_id: tx.contexts.trace.trace_id, span_id: attempts.at(-1)!.span_id });
  expect(failure[0].payload.breadcrumbs.values[0].message).toMatch(/^beforeEach \(/);
  const flaky = events.find((e) => e[0].payload.fingerprint[0] === "sentry-tests.flaky-test")!;
  expect(flaky[0].payload.exception.values).toEqual([expect.objectContaining({ type: "FlakyTest", value: expect.stringMatching(/failed, then passed on retry 1\. The failed attempt:\n\nError: first try$/) })]);
  // The describe block whose beforeAll threw: under Vitest an issue for the block, under Jest for its test.
  expect(events.some((e) => e[0].payload.exception.values[0].value === "coupon service down" && /^Coupons( > applies a coupon)?$/.test(e[0].payload.fingerprint[2]))).toBe(true);
  // A skipped test has no span; a test named "constructor" is a test like any other.
  expect(spans.some((s) => s.description === "pays later")).toBe(false);
  expect(find("test.case", "constructor").status).toBe("ok");
  expect(run.output).toContain(`@ctrl/sentry-tests: 1 trace, 2 failed tests, 1 flaky test → 127.0.0.1:${run.port}`);
  return failure;
}

describe("Vitest: the sentryTests() plugin", () => {
  test("a trace of describe blocks, tests, hooks and test functions; the failing test's page as it was before its afterEach hook; a flaky-test issue", { timeout: 60_000 }, async () => {
    const failure = expectCartReport(await runAgainstSentry([vitest, "run", "--config", "vitest.config.ts"]), "cart.vitest.ts");
    expect(failure.find((i) => i.header.filename === "page.html")?.payload).toBe(["<body>", "  <ul>", "    <li>Apple</li>", "  </ul>", "  <button>Checkout</button>", "</body>"].join("\n"));
  });
});

describe("Jest: the reporter and test runner", () => {
  test("the same trace and issues from jest-circus's events, on an environment that is not @ctrl/dom's", { timeout: 60_000 }, async () => {
    expectCartReport(await runAgainstSentry([jest, "--config", "jest.config.cjs"]), "cart.jest.cjs");
  });

  test("without the test runner, the issues still go out and the summary says how to get traces", { timeout: 60_000 }, async () => {
    const run = await runAgainstSentry([jest, "--config", "jest.config.cjs", "--testRunner", require.resolve("jest-circus/runner")]);
    expect(run.envelopes.flat().some((i) => i.header.type === "transaction")).toBe(false);
    expect(run.output).toContain(`@ctrl/sentry-tests: 0 traces, 2 failed tests, 1 flaky test → 127.0.0.1:${run.port} (no traces: add testRunner: "@ctrl/sentry-tests/jest-runner")`);
  });
});
