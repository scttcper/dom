// @vitest-environment node
/**
 * @ctrl/sentry-tests' main-process side: what report.ts builds from one test file's results and the
 * spans its worker collected, the envelope format (https://develop.sentry.dev/sdk/data-model/envelopes/),
 * DSN parsing (https://develop.sentry.dev/sdk/overview/#parsing-the-dsn), stack frames, and delivery
 * to a DSN and to Spotlight, checked against a fake Sentry server.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import { parseDsn, parseStack, sendEnvelope, serializeEnvelope, toSentryFrames, type Envelope } from "../src/envelope.ts";
import { Delivery } from "../src/delivery.ts";
import { resolveOptions, type ResolvedOptions } from "../src/options.ts";
import { buildReport, FILE_FAILURE, type TestCaseReport, type TestFileReport } from "../src/report.ts";
import { circusTestName } from "../src/jest-collector.ts";
import type { CollectedFile, CollectedSpan, FailureContext } from "../src/collector.ts";

const ROOT = "/repo";
const options = (overrides: Partial<ResolvedOptions> = {}): ResolvedOptions => ({
  targets: [],
  environment: "ci",
  release: "abc123",
  traces: true,
  tracesSampleRate: 1,
  failures: true,
  flaky: true,
  attachments: true,
  tags: { team: "web" },
  ...overrides,
});

const span = (span_id: string, op: string, description: string, start: number, end: number, parent?: string, extra: Partial<CollectedSpan> = {}): CollectedSpan => ({
  span_id,
  parent_span_id: parent,
  op,
  description,
  start_timestamp: start,
  timestamp: end,
  status: "ok",
  data: {},
  ...extra,
});

// Span ids as the collector makes them: 16 hex characters.
const SUITE = "5000000000000001";
const CASE = "c000000000000001";
const HOOK = "e000000000000001";
const FN = "f000000000000001";
const RENDER = "a000000000000001";
const WAIT = "b000000000000001";
const QUERY = "d000000000000001";

/** describe("Signup") › test("submits"): a beforeEach hook, then the test function rendering, waiting and querying. */
const collected = (failures: FailureContext[] = []): CollectedFile => ({
  startedAt: 999.9,
  endedAt: 1000.6,
  droppedSpans: 0,
  tests: { t1: { spanIds: [CASE], droppedSpans: 0, failures } },
  spans: [
    span(SUITE, "test.suite", "Signup", 999.95, 1000.55),
    span(CASE, "test.case", "Signup > submits", 1000, 1000.5, SUITE),
    span(HOOK, "test.hook", "beforeEach", 1000, 1000.005, CASE),
    span(FN, "test.fn", "submits", 1000.005, 1000.4, CASE),
    span(RENDER, "react.render", "render(<Signup />)", 1000.01, 1000.02, FN),
    span(WAIT, "testing-library.wait_for", "waitFor(() => …)", 1000.1, 1000.3, FN, { data: { checks: 3 } }),
    span(QUERY, "testing-library.query", 'getByText("Done")', 1000.2, 1000.21, WAIT, { status: "internal_error" }),
  ],
});

const testCase = (overrides: Partial<TestCaseReport>): TestCaseReport => ({
  key: "t1",
  name: "Signup > submits",
  state: "pass",
  duration: 500,
  retries: 0,
  flaky: false,
  errors: [],
  ...overrides,
});

const file = (tests: TestCaseReport[], data: CollectedFile | null = collected()): TestFileReport => ({ runner: "vitest", root: ROOT, file: `${ROOT}/src/signup.test.tsx`, tests, collected: data, environmentSetupMs: 2.3 });

const payloads = (report: ReturnType<typeof buildReport>) => report.envelopes.flatMap((e) => e.items.map((i) => i.payload as any));

describe("buildReport: a transaction per test file", () => {
  test("the collected tree as the file's spans: describe block, test, hook, test function, and the library spans under them", () => {
    const report = buildReport(file([testCase({})]), options());
    expect(report.traces).toBe(1);
    const [tx] = payloads(report);
    expect(tx).toMatchObject({
      type: "transaction",
      transaction: "src/signup.test.tsx",
      environment: "ci",
      release: "abc123",
      platform: "node",
      tags: { runner: "vitest", "test.file": "src/signup.test.tsx", team: "web" },
      measurements: { environment_setup: { value: 2.3, unit: "millisecond" } },
      contexts: { trace: { op: "test.file", status: "ok" } },
    });
    const root = tx.contexts.trace.span_id;
    const byOp = (op: string) => tx.spans.find((s: any) => s.op === op);
    expect(byOp("test.suite")).toMatchObject({ description: "Signup", parent_span_id: root });
    expect(byOp("test.case")).toMatchObject({ description: "Signup > submits", parent_span_id: SUITE, status: "ok", data: { "test.retries": 0, "test.flaky": false }, trace_id: tx.contexts.trace.trace_id });
    expect(byOp("test.hook")).toMatchObject({ description: "beforeEach", parent_span_id: CASE });
    expect(byOp("react.render").parent_span_id).toBe(FN);
    expect(byOp("testing-library.query").parent_span_id).toBe(WAIT);
    expect(tx.start_timestamp).toBe(999.9);
    expect(tx.timestamp).toBe(1000.6);
  });

  test("without the runner's spans there is no trace, and a failing test is still an issue", () => {
    const report = buildReport(file([testCase({ state: "fail", errors: [{ message: "boom" }] })], null), options());
    expect(report).toMatchObject({ traces: 0, failures: 1 });
    const [event] = payloads(report);
    expect(event.contexts.trace).toBeUndefined();
    expect(event.breadcrumbs.values).toEqual([]);
  });

  test("span origins use only what Relay accepts (lowercase letters, underscores, dots)", () => {
    const [tx] = payloads(buildReport(file([testCase({})]), options()));
    const origins = [tx.contexts.trace.origin, ...tx.spans.map((s: any) => s.origin)];
    for (const origin of origins) expect(origin).toMatch(/^[a-z_]+(\.[a-z_]+)*$/);
  });

  test("skipped tests are left out; a file with only skipped tests sends nothing", () => {
    expect(buildReport(file([testCase({ state: "skip" })]), options()).envelopes).toEqual([]);
  });

  test("a file over 1000 spans is split by whole tests into child transactions of the file's, losing none", () => {
    const tests = Array.from({ length: 400 }, (_, i) => testCase({ key: `t${i}`, name: `t${i}` }));
    const data: CollectedFile = {
      startedAt: 1000,
      endedAt: 1001,
      droppedSpans: 0,
      tests: Object.fromEntries(tests.map((t, i) => [t.key, { spanIds: [`case-${i}`], droppedSpans: 0, failures: [] }])),
      spans: tests.flatMap((t, i) => [span(`case-${i}`, "test.case", t.name, 1000 + i / 1000, 1000 + (i + 1) / 1000), ...Array.from({ length: 3 }, (_, j) => span(`${i}-${j}`, "react.render", "render(<A />)", 1000 + i / 1000, 1000 + i / 1000, `case-${i}`))]),
    };
    const report = buildReport(file(tests, data), options());
    expect(report.traces).toBe(1);
    const [root, part] = payloads(report);
    // 400 tests × (1 test span + 3 under it) = 1600 spans: 250 tests per transaction.
    expect(root.spans).toHaveLength(1000);
    expect(part.spans).toHaveLength(600);
    expect(part.contexts.trace).toMatchObject({ trace_id: root.contexts.trace.trace_id, parent_span_id: root.contexts.trace.span_id, data: { "test.part": 2, "test.parts": 2 } });
    expect(part.transaction).toBe("src/signup.test.tsx (part 2 of 2)");
    for (const tx of [root, part]) {
      const ids = new Set(tx.spans.map((s: any) => s.span_id).concat(tx.contexts.trace.span_id));
      for (const s of tx.spans) expect(ids.has(s.parent_span_id)).toBe(true);
    }
    // The file's transaction spans the whole file.
    expect(root.timestamp).toBeGreaterThanOrEqual(part.timestamp);
  });

  test("every span's parent is in the transaction: one whose parent is missing hangs off the file's root", () => {
    const data = collected();
    data.spans.push(span("d000000000000002", "testing-library.query", "getByText(…)", 1000.25, 1000.26, "9999999999999999"));
    const [tx] = payloads(buildReport(file([testCase({})], data), options()));
    const ids = new Set(tx.spans.map((s: any) => s.span_id).concat(tx.contexts.trace.span_id));
    for (const s of tx.spans) expect(ids.has(s.parent_span_id)).toBe(true);
    expect(tx.spans.find((s: any) => s.span_id === "d000000000000002").parent_span_id).toBe(tx.contexts.trace.span_id);
  });

  test("a test file outside the root keeps its full path", () => {
    const [tx] = payloads(buildReport({ ...file([testCase({})]), file: "/elsewhere/signup.test.tsx" }, options()));
    expect(tx.transaction).toBe("/elsewhere/signup.test.tsx");
  });

  test("traces: false sends no transaction", () => {
    expect(buildReport(file([testCase({})]), options({ traces: false })).envelopes).toEqual([]);
  });
});

describe("buildReport: an issue per failing test", () => {
  const failingData = () =>
    collected([
      {
        error: { message: "expected 1 to be 2" },
        attachments: [
          { filename: "page.html", contentType: "text/html", data: "<body></body>" },
          { filename: "accessibility-snapshot.txt", contentType: "text/plain", data: '- button "Save"' },
        ],
        contexts: { clock: { skipped_ms: 200, pending_timers: 1 } },
      },
    ]);
  const failing = testCase({
    state: "fail",
    errors: [{ name: "AssertionError", message: "expected 1 to be 2", frames: [{ method: "inner", file: `${ROOT}/src/a.ts`, line: 3, column: 5 }, { method: "outer", file: `${ROOT}/node_modules/x/index.js`, line: 9, column: 1 }] }],
  });

  test("fingerprinted by file and test name, linked to the test's span, with what the test did as breadcrumbs and the page attached", () => {
    const report = buildReport(file([failing], failingData()), options());
    expect(report.failures).toBe(1);
    const [tx, event] = payloads(report);
    const errorEnvelope = report.envelopes[1];
    expect(event).toMatchObject({
      level: "error",
      fingerprint: ["sentry-tests.test-failure", "src/signup.test.tsx", "Signup > submits"],
      transaction: "src/signup.test.tsx > Signup > submits",
      tags: { "test.name": "Signup > submits", flaky: "false", retries: "0" },
      contexts: { clock: { skipped_ms: 200, pending_timers: 1 }, test: { name: "Signup > submits", file: "src/signup.test.tsx" } },
    });
    expect(event.contexts.trace).toMatchObject({ trace_id: tx.contexts.trace.trace_id, span_id: CASE, parent_span_id: SUITE });
    expect(tx.spans.find((s: any) => s.op === "test.case").status).toBe("internal_error");
    const exception = event.exception.values[0];
    expect(exception).toMatchObject({ type: "AssertionError", value: "expected 1 to be 2" });
    // Vitest lists frames newest first; Sentry wants oldest first. node_modules is not in app.
    expect(exception.stacktrace.frames.map((f: any) => [f.function, f.filename, f.in_app])).toEqual([
      ["outer", "node_modules/x/index.js", false],
      ["inner", "src/a.ts", true],
    ]);
    // Hooks and library calls, not the test's own structure spans; the details are in the message
    // (Spotlight shows a breadcrumb's data instead of its message).
    expect(event.breadcrumbs.values.map((b: any) => b.message)).toEqual(["beforeEach (5.0 ms)", "render(<Signup />) (10.0 ms)", "waitFor(() => …) (200 ms, 3 checks)", 'getByText("Done") (10.0 ms)']);
    expect(event.breadcrumbs.values.every((b: any) => b.data === undefined)).toBe(true);
    expect(errorEnvelope.items.filter((i) => i.type === "attachment").map((i: any) => [i.filename, i.contentType, i.payload])).toEqual([
      ["page.html", "text/html", "<body></body>"],
      ["accessibility-snapshot.txt", "text/plain", '- button "Save"'],
    ]);
  });

  test("the message loses terminal colors, and its page dump when the page is attached", () => {
    const message = "Unable to find role=\"option\" and name \"Option Three\"\n\nIgnored nodes: comments, script, style\n\u001b[36m<body>\u001b[39m\n  <div />";
    const withPage = testCase({ state: "fail", errors: [{ name: "TestingLibraryElementError", message }] });
    expect(payloads(buildReport(file([withPage], failingData()), options()))[1].exception.values[0].value).toBe('Unable to find role="option" and name "Option Three"\n\n(The page when the test failed is attached: page.html, accessibility-snapshot.txt.)');
    const withoutPage = payloads(buildReport(file([withPage], failingData()), options({ attachments: false })))[1].exception.values[0].value;
    expect(withoutPage).toContain("Ignored nodes: comments, script, style\n<body>\n  <div />");
    expect(withoutPage).not.toContain("\u001b[");
  });

  test("an error whose name the runner lost (Jest's results) takes it from the worker's capture", () => {
    const data = collected([{ error: { name: "TestingLibraryElementError", message: "Unable to find role" }, attachments: [], contexts: {} }]);
    const event = payloads(buildReport(file([testCase({ state: "fail", errors: [{ message: "Unable to find role" }] })], data), options()))[1];
    expect(event.exception.values[0]).toMatchObject({ type: "TestingLibraryElementError", value: "Unable to find role" });
  });

  test("attachments: false attaches nothing; failures: false sends no issue", () => {
    expect(buildReport(file([failing], failingData()), options({ attachments: false })).envelopes[1].items).toHaveLength(1);
    expect(buildReport(file([failing], failingData()), options({ failures: false })).failures).toBe(0);
  });
});

describe("buildReport: an issue per flaky test", () => {
  test("a warning grouped by test, with the failed attempt's error under a FlakyTest exception", () => {
    const report = buildReport(file([testCase({ retries: 1, flaky: true })], collected([{ error: { name: "Error", message: "timed out" }, attachments: [], contexts: {} }])), options());
    expect(report.flaky).toBe(1);
    const event = payloads(report)[1];
    expect(event.level).toBe("warning");
    expect(event.fingerprint).toEqual(["sentry-tests.flaky-test", "src/signup.test.tsx", "Signup > submits"]);
    expect(event.tags).toMatchObject({ flaky: "true", retries: "1" });
    // One exception, so every UI titles the issue as flaky.
    expect(event.exception.values.map((v: any) => [v.type, v.value])).toEqual([["FlakyTest", "Signup > submits failed, then passed on retry 1. The failed attempt:\n\nError: timed out"]]);
  });

  test("with a span per attempt (Jest), the issue links to the failed attempt and shows what it did", () => {
    const data = collected([{ error: { name: "Error", message: "timed out" }, attachments: [], contexts: {} }]);
    data.tests.t1.spanIds.push("c000000000000002");
    data.spans.push(
      span("c000000000000002", "test.case", "Signup > submits", 1000.6, 1000.7, SUITE, { data: { "test.retry": 1 } }),
      span("a000000000000002", "react.render", "render(<Retried />)", 1000.61, 1000.62, "c000000000000002"),
    );
    const [tx, event] = payloads(buildReport(file([testCase({ retries: 1, flaky: true })], data), options()));
    expect(event.contexts.trace.span_id).toBe(CASE);
    expect(event.breadcrumbs.values.map((b: any) => b.message)).not.toContain("render(<Retried />) (10.0 ms)");
    // The test's result belongs to its last attempt.
    expect(tx.spans.find((s: any) => s.span_id === "c000000000000002").data).toMatchObject({ "test.retry": 1, "test.retries": 1, "test.flaky": true });
  });
});

describe("buildReport: console output, files that fail to load, sampling", () => {
  test("a test's console output joins its spans in the failure's breadcrumbs, in time order", () => {
    const failing = testCase({ state: "fail", errors: [{ message: "boom" }], console: [{ timestamp: 1000.15, stream: "stderr", message: "Warning: An update to Signup inside a test was not wrapped in act(...)" }] });
    const event = payloads(buildReport(file([failing]), options()))[1];
    expect(event.breadcrumbs.values.map((b: any) => [b.category, b.level])).toEqual([
      ["test.hook", "info"],
      ["react.render", "info"],
      ["testing-library.wait_for", "info"],
      ["console", "error"],
      ["testing-library.query", "error"],
    ]);
  });

  test("a file that failed to load is an issue of its own, with no trace", () => {
    const report = buildReport({ ...file([], null), fileErrors: [{ name: "SyntaxError", message: "Unexpected token" }] }, options());
    expect(report).toMatchObject({ traces: 0, failures: 1 });
    const [event] = payloads(report);
    expect(event.fingerprint).toEqual(["sentry-tests.test-failure", "src/signup.test.tsx", FILE_FAILURE]);
    expect(event.exception.values[0]).toMatchObject({ type: "SyntaxError", value: "Unexpected token" });
  });

  test("tracesSampleRate 0 sends no trace, and failures still go out without a trace link", () => {
    const report = buildReport(file([testCase({ state: "fail", errors: [{ message: "boom" }] })]), options({ tracesSampleRate: 0 }));
    expect(report).toMatchObject({ traces: 0, failures: 1 });
    expect(payloads(report)[0].contexts.trace).toBeUndefined();
  });
});

describe("circusTestName (jest-collector.ts): Jest's test names", () => {
  test("the runner's name for a test matches the reporter's (describe blocks and title joined with ' > ')", () => {
    const root = { name: "ROOT_DESCRIBE_BLOCK" };
    const outer = { name: "Signup", parent: root };
    const inner = { name: "when invalid", parent: outer };
    expect(circusTestName({ name: "shows an error", parent: inner })).toBe(["Signup", "when invalid", "shows an error"].join(" > "));
    expect(circusTestName({ name: "top level", parent: root })).toBe("top level");
  });
});

describe("envelopes and DSNs", () => {
  test("a DSN becomes the envelope endpoint with the key in the query", () => {
    const dsn = parseDsn("https://abc@o1.ingest.sentry.io/42");
    expect(dsn).toMatchObject({ host: "o1.ingest.sentry.io", projectId: "42" });
    expect(dsn.url).toBe("https://o1.ingest.sentry.io/api/42/envelope/?sentry_key=abc&sentry_version=7&sentry_client=ctrl.sentry-tests%2F0.0.0");
    expect(parseDsn("http://k@localhost:9000/prefix/7").url).toMatch(/^http:\/\/localhost:9000\/prefix\/api\/7\/envelope\/\?/);
    expect(() => parseDsn("not a dsn")).toThrow(/invalid DSN/);
    expect(() => parseDsn("https://o1.ingest.sentry.io/42")).toThrow(/expected https:\/\/<key>@<host>\/<project>/);
  });

  test("serialization: a header line, then each item's header (with its byte length) and payload", () => {
    const envelope: Envelope = { eventId: "e".repeat(32), items: [{ type: "event", payload: { message: "café" } }, { type: "attachment", filename: "a.txt", contentType: "text/plain", payload: "é" }] };
    const text = new TextDecoder().decode(serializeEnvelope(envelope, parseDsn("https://k@h/1")));
    const lines = text.split("\n");
    expect(JSON.parse(lines[0])).toMatchObject({ event_id: "e".repeat(32), dsn: "https://k@h/1", sdk: { name: "ctrl.sentry-tests" } });
    expect(JSON.parse(lines[1])).toEqual({ type: "event", length: 19 });
    expect(lines[2]).toBe('{"message":"café"}');
    expect(JSON.parse(lines[3])).toEqual({ type: "attachment", length: 2, filename: "a.txt", content_type: "text/plain", attachment_type: "event.attachment" });
    expect(lines[4]).toBe("é");
  });

  test("V8 stack lines become frames, oldest first, with source context; frames from the packages next to this one are not in app", () => {
    const dir = mkdtempSync(join(tmpdir(), "sentry-tests-frames-"));
    const testFile = join(dir, "signup.test.tsx");
    writeFileSync(testFile, ["import x from 'y';", "", "test('a', async () => {", "  await screen.findByRole('option');", "});"].join("\n"));
    const [own, test] = toSentryFrames([{ method: "find", file: fileURLToPath(import.meta.url), line: 1, column: 1 }, { method: "Object.findByRole", file: testFile, line: 4, column: 3 }], dir);
    // This file lives in the workspace's packages/, next to @ctrl/dom's packages: library code.
    expect(own.in_app).toBe(false);
    expect(test).toMatchObject({ filename: "signup.test.tsx", in_app: true, context_line: "  await screen.findByRole('option');", pre_context: ["import x from 'y';", "", "test('a', async () => {"] });
    rmSync(dir, { recursive: true, force: true });
    expect(parseStack("Error: x\n    at fn (/a/b.js:1:2)\n    at async run (file:///c/d.js:3:4)\n    at /e/f.js:5:6")).toEqual([
      { method: undefined, file: "/e/f.js", line: 5, column: 6 },
      { method: "run", file: "file:///c/d.js", line: 3, column: 4 },
      { method: "fn", file: "/a/b.js", line: 1, column: 2 },
    ]);
  });
});

describe("delivery", () => {
  let close: (() => void) | null = null;
  afterEach(() => close?.());

  async function fakeSentry(status = 200) {
    const requests: Array<{ url: string; type: string | undefined; body: string }> = [];
    const server = createServer((req: IncomingMessage, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        requests.push({ url: req.url!, type: req.headers["content-type"], body });
        res.writeHead(status).end(status === 200 ? "{}" : "rate limited");
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    close = () => server.close();
    const { port } = server.address() as { port: number };
    return { requests, port };
  }

  test("envelopes go to the DSN's endpoint and to Spotlight; flush waits for them and summarizes", async () => {
    const { requests, port } = await fakeSentry();
    const resolved = resolveOptions({ dsn: `http://public@127.0.0.1:${port}/42`, spotlight: `http://127.0.0.1:${port}/stream`, release: "r1" }, {})!;
    expect(resolved.targets.map((t) => t.label)).toEqual([`127.0.0.1:${port}`, "Spotlight"]);
    const delivery = new Delivery(resolved, sendEnvelope);
    delivery.add(buildReport(file([testCase({}), testCase({ key: "t2", name: "Signup > fails", state: "fail", errors: [{ message: "boom" }] })]), resolved));
    const summary = await delivery.flush();
    expect(summary).toBe(`@ctrl/sentry-tests: 1 trace, 1 failed test, 0 flaky tests → 127.0.0.1:${port} and Spotlight`);
    expect(requests.map((r) => r.url.split("?")[0]).sort()).toEqual(["/api/42/envelope/", "/api/42/envelope/", "/stream", "/stream"]);
    expect(requests.every((r) => r.type === "application/x-sentry-envelope")).toBe(true);
    const items = requests.filter((r) => r.url.startsWith("/api")).map((r) => JSON.parse(r.body.split("\n")[1]).type);
    expect(items.sort()).toEqual(["event", "transaction"]);
  });

  test("each run's summary counts that run only (watch mode)", async () => {
    const { port } = await fakeSentry();
    const resolved = resolveOptions({ dsn: `http://public@127.0.0.1:${port}/42` }, {})!;
    const delivery = new Delivery(resolved, sendEnvelope);
    delivery.add(buildReport(file([testCase({})]), resolved));
    expect(await delivery.flush()).toMatch(/: 1 trace, 0 failed tests/);
    expect(await delivery.flush()).toBeNull();
    delivery.add(buildReport(file([testCase({})]), resolved));
    expect(await delivery.flush()).toMatch(/: 1 trace, 0 failed tests/);
  });

  test("a rejected envelope is reported in the summary, not thrown", async () => {
    const { port } = await fakeSentry(429);
    const resolved = resolveOptions({ dsn: `http://public@127.0.0.1:${port}/42` }, {})!;
    const delivery = new Delivery(resolved, sendEnvelope);
    delivery.add(buildReport(file([testCase({})]), resolved));
    expect(await delivery.flush()).toMatch(/not delivered: 127\.0\.0\.1:\d+ answered 429 rate limited/);
  });

  test("without a DSN or Spotlight there is nothing to do", () => {
    expect(resolveOptions({}, {})).toBeNull();
    expect(resolveOptions({}, { SENTRY_SPOTLIGHT: "1" })!.targets[0].url).toBe("http://localhost:8969/stream");
    expect(resolveOptions({}, { SENTRY_SPOTLIGHT: "false" })).toBeNull();
    expect(resolveOptions({}, { SENTRY_DSN: "https://k@h/1", CI: "true", SENTRY_RELEASE: "v1" })).toMatchObject({ environment: "ci", release: "v1", tracesSampleRate: 1 });
    expect(resolveOptions({}, { SENTRY_DSN: "https://k@h/1", SENTRY_TRACES_SAMPLE_RATE: "0.25" })!.tracesSampleRate).toBe(0.25);
    expect(resolveOptions({ tracesSampleRate: 7 }, { SENTRY_DSN: "https://k@h/1" })!.tracesSampleRate).toBe(1);
  });
});
