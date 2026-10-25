// @vitest-environment node
/**
 * @ctrl/dom/sentry's main-process side: what report.ts builds from one test file's results, the
 * envelope format (https://develop.sentry.dev/sdk/data-model/envelopes/), DSN parsing
 * (https://develop.sentry.dev/sdk/overview/#parsing-the-dsn), stack frames, and delivery to a DSN
 * and to Spotlight, checked against a fake Sentry server.
 */
import { createServer, type IncomingMessage } from "node:http";
import { afterEach, describe, expect, test } from "vitest";
import { parseDsn, parseStack, sendEnvelope, serializeEnvelope, toSentryFrames, type Envelope } from "../src/envelope.ts";
import { Delivery } from "../src/delivery.ts";
import { resolveOptions, type ResolvedOptions } from "../src/options.ts";
import { buildReport, type TestCaseReport, type TestFileReport } from "../src/report.ts";
import type { CollectedTest } from "../src/collector.ts";

const ROOT = "/repo";
const options = (overrides: Partial<ResolvedOptions> = {}): ResolvedOptions => ({
  targets: [],
  environment: "ci",
  release: "abc123",
  traces: true,
  failures: true,
  flaky: true,
  snapshots: true,
  tags: { team: "web" },
  ...overrides,
});

const collected = (failures: CollectedTest["failures"] = []): CollectedTest => ({
  startedAt: 1000,
  endedAt: 1000.5,
  droppedSpans: 0,
  failures,
  spans: [
    { span_id: "aaaaaaaaaaaaaaaa", op: "react.render", description: "render(<Signup />)", start_timestamp: 1000.01, timestamp: 1000.02, status: "ok", data: {} },
    { span_id: "bbbbbbbbbbbbbbbb", op: "testing-library.wait_for", description: "waitFor(() => …)", start_timestamp: 1000.1, timestamp: 1000.3, status: "ok", data: { checks: 3 } },
    { span_id: "cccccccccccccccc", parent_span_id: "bbbbbbbbbbbbbbbb", op: "testing-library.query", description: 'getByText("Done")', start_timestamp: 1000.2, timestamp: 1000.21, status: "internal_error", data: {} },
  ],
});

const testCase = (overrides: Partial<TestCaseReport>): TestCaseReport => ({
  name: "Signup > submits",
  state: "pass",
  startedAt: 1000,
  duration: 500,
  retries: 0,
  flaky: false,
  errors: [],
  collected: collected(),
  ...overrides,
});

const file = (tests: TestCaseReport[]): TestFileReport => ({ runner: "vitest", root: ROOT, file: `${ROOT}/src/signup.test.tsx`, tests, environmentSetupMs: 2.3 });

const payloads = (report: ReturnType<typeof buildReport>) => report.envelopes.flatMap((e) => e.items.map((i) => i.payload as any));

describe("buildReport: a transaction per test file", () => {
  test("a test span per test, the collected spans under it, nested spans keeping their parent", () => {
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
    const testSpan = tx.spans.find((s: any) => s.op === "test.case");
    expect(testSpan).toMatchObject({ description: "Signup > submits", parent_span_id: root, status: "ok", trace_id: tx.contexts.trace.trace_id });
    const render = tx.spans.find((s: any) => s.op === "react.render");
    expect(render.parent_span_id).toBe(testSpan.span_id);
    const query = tx.spans.find((s: any) => s.op === "testing-library.query");
    expect(query.parent_span_id).toBe("bbbbbbbbbbbbbbbb");
    expect(tx.start_timestamp).toBe(1000);
    expect(tx.timestamp).toBe(1000.5);
  });

  test("skipped tests are left out; a file with only skipped tests sends nothing", () => {
    expect(buildReport(file([testCase({ state: "skip" })]), options()).envelopes).toEqual([]);
  });

  test("traces: false sends no transaction", () => {
    expect(buildReport(file([testCase({})]), options({ traces: false })).envelopes).toEqual([]);
  });
});

describe("buildReport: an issue per failing test", () => {
  const failing = testCase({
    state: "fail",
    errors: [{ name: "AssertionError", message: "expected 1 to be 2", frames: [{ method: "inner", file: `${ROOT}/src/a.ts`, line: 3, column: 5 }, { method: "outer", file: `${ROOT}/node_modules/x/index.js`, line: 9, column: 1 }] }],
    collected: collected([{ error: { message: "expected 1 to be 2" }, aria: '- button "Save"', html: "<html></html>", clock: { skippedMs: 200, pendingTimers: 1 } }]),
  });

  test("fingerprinted by file and test name, linked to the test's span, with the snapshot attached", () => {
    const report = buildReport(file([failing]), options());
    expect(report.failures).toBe(1);
    const [tx, event] = payloads(report);
    const errorEnvelope = report.envelopes[1];
    expect(event).toMatchObject({
      level: "error",
      fingerprint: ["ctrl-dom.test-failure", "src/signup.test.tsx", "Signup > submits"],
      transaction: "src/signup.test.tsx > Signup > submits",
      tags: { "test.name": "Signup > submits", flaky: "false", retries: "0" },
      contexts: { clock: { skipped_ms: 200, pending_timers: 1 }, test: { name: "Signup > submits", file: "src/signup.test.tsx" } },
    });
    expect(event.contexts.trace.trace_id).toBe(tx.contexts.trace.trace_id);
    expect(event.contexts.trace.span_id).toBe(tx.spans.find((s: any) => s.op === "test.case").span_id);
    const exception = event.exception.values[0];
    expect(exception).toMatchObject({ type: "AssertionError", value: "expected 1 to be 2" });
    // Vitest lists frames newest first; Sentry wants oldest first. node_modules is not in app.
    expect(exception.stacktrace.frames.map((f: any) => [f.function, f.filename, f.in_app])).toEqual([
      ["outer", "node_modules/x/index.js", false],
      ["inner", "src/a.ts", true],
    ]);
    expect(event.breadcrumbs.values.map((b: any) => b.message)).toEqual(["render(<Signup />)", "waitFor(() => …)", 'getByText("Done")']);
    expect(errorEnvelope.items.filter((i) => i.type === "attachment").map((i: any) => [i.filename, i.contentType, i.payload])).toEqual([
      ["accessibility-snapshot.txt", "text/plain", '- button "Save"'],
      ["page.html", "text/html", "<html></html>"],
    ]);
  });

  test("snapshots: false attaches nothing; failures: false sends no issue", () => {
    expect(buildReport(file([failing]), options({ snapshots: false })).envelopes[1].items).toHaveLength(1);
    expect(buildReport(file([failing]), options({ failures: false })).failures).toBe(0);
  });
});

describe("buildReport: an issue per flaky test", () => {
  test("a warning grouped by test, with the failed attempt's error under a FlakyTest exception", () => {
    const flaky = testCase({ retries: 1, flaky: true, collected: collected([{ error: { name: "Error", message: "timed out" } }]) });
    const report = buildReport(file([flaky]), options());
    expect(report.flaky).toBe(1);
    const event = payloads(report)[1];
    expect(event.level).toBe("warning");
    expect(event.fingerprint).toEqual(["ctrl-dom.flaky-test", "src/signup.test.tsx", "Signup > submits"]);
    expect(event.tags).toMatchObject({ flaky: "true", retries: "1" });
    expect(event.exception.values.map((v: any) => [v.type, v.value])).toEqual([
      ["Error", "timed out"],
      ["FlakyTest", "Signup > submits (passed on retry 1)"],
    ]);
  });
});

describe("envelopes and DSNs", () => {
  test("a DSN becomes the envelope endpoint with the key in the query", () => {
    const dsn = parseDsn("https://abc@o1.ingest.sentry.io/42");
    expect(dsn).toMatchObject({ host: "o1.ingest.sentry.io", projectId: "42" });
    expect(dsn.url).toBe("https://o1.ingest.sentry.io/api/42/envelope/?sentry_key=abc&sentry_version=7&sentry_client=ctrl-dom.test-reporter%2F0.0.0");
    expect(parseDsn("http://k@localhost:9000/prefix/7").url).toMatch(/^http:\/\/localhost:9000\/prefix\/api\/7\/envelope\/\?/);
    expect(() => parseDsn("not a dsn")).toThrow(/invalid DSN/);
    expect(() => parseDsn("https://o1.ingest.sentry.io/42")).toThrow(/expected https:\/\/<key>@<host>\/<project>/);
  });

  test("serialization: a header line, then each item's header (with its byte length) and payload", () => {
    const envelope: Envelope = { eventId: "e".repeat(32), items: [{ type: "event", payload: { message: "café" } }, { type: "attachment", filename: "a.txt", contentType: "text/plain", payload: "é" }] };
    const text = new TextDecoder().decode(serializeEnvelope(envelope, parseDsn("https://k@h/1")));
    const lines = text.split("\n");
    expect(JSON.parse(lines[0])).toMatchObject({ event_id: "e".repeat(32), dsn: "https://k@h/1", sdk: { name: "ctrl-dom.test-reporter" } });
    expect(JSON.parse(lines[1])).toEqual({ type: "event", length: 19 });
    expect(lines[2]).toBe('{"message":"café"}');
    expect(JSON.parse(lines[3])).toEqual({ type: "attachment", length: 2, filename: "a.txt", content_type: "text/plain", attachment_type: "event.attachment" });
    expect(lines[4]).toBe("é");
  });

  test("V8 stack lines become frames, oldest first, with source context for local files", () => {
    const error = new Error("here");
    const frames = toSentryFrames(parseStack(error.stack), process.cwd());
    const self = frames.findLast((f) => f.abs_path.endsWith("report.test.ts"))!;
    expect(self.in_app).toBe(true);
    expect(self.context_line).toContain('new Error("here")');
    expect(self.pre_context!.length).toBeGreaterThan(0);
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
    delivery.add(buildReport(file([testCase({}), testCase({ name: "Signup > fails", state: "fail", errors: [{ message: "boom" }] })]), resolved));
    const summary = await delivery.flush();
    expect(summary).toBe(`@ctrl/dom/sentry: 1 trace, 1 failed test, 0 flaky tests → 127.0.0.1:${port} and Spotlight`);
    expect(requests.map((r) => r.url.split("?")[0]).sort()).toEqual(["/api/42/envelope/", "/api/42/envelope/", "/stream", "/stream"]);
    expect(requests.every((r) => r.type === "application/x-sentry-envelope")).toBe(true);
    const items = requests.filter((r) => r.url.startsWith("/api")).map((r) => JSON.parse(r.body.split("\n")[1]).type);
    expect(items.sort()).toEqual(["event", "transaction"]);
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
    expect(resolveOptions({}, { SENTRY_DSN: "https://k@h/1", CI: "true", SENTRY_RELEASE: "v1" })).toMatchObject({ environment: "ci", release: "v1" });
  });
});
