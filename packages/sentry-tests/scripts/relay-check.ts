// Checks what @ctrl/sentry-tests sends against Relay, Sentry's ingestion layer, rather than a fake:
// runs Relay (Docker image getsentry/relay) in static mode with full normalization and a local
// project config, sends the envelopes report.ts builds for a file with a passing, a failing and a
// flaky test, and inspects what Relay forwards upstream. Relay rejects malformed envelopes with an
// HTTP error and records fields it had to drop or fix in the event's `errors` and `_meta`, so a
// clean pass means Sentry will keep what the reporter sends.
//
//   node packages/sentry-tests/scripts/relay-check.ts [--image getsentry/relay:nightly] [--keep]
//   node packages/sentry-tests/scripts/relay-check.ts --run "pnpm exec vitest run" --cwd <dir>
//
// With --run, the command runs with SENTRY_DSN pointing at Relay instead (a real suite with
// @ctrl/sentry-tests turned on), and every item Relay forwards must come through without errors.
//
// Needs Docker (OrbStack on macOS).

import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { gunzipSync, zstdDecompressSync } from "node:zlib";
import { buildReport, type TestFileReport } from "../src/report.ts";
import { resolveOptions } from "../src/options.ts";
import { sendEnvelope, type Envelope } from "../src/envelope.ts";
import type { CollectedFile, CollectedSpan } from "../src/collector.ts";

const { values: flags } = parseArgs({
  options: {
    image: { type: "string", default: "getsentry/relay:nightly" },
    keep: { type: "boolean", default: false },
    run: { type: "string" },
    cwd: { type: "string", default: process.cwd() },
  },
});
const PROJECT_ID = 42;
const KEY = "a".repeat(32);

// ── a fake upstream: what Relay forwards ──────────────────────────────────────────────────────
const forwarded: Array<{ path: string; body: Buffer }> = [];
const upstream = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (c: Buffer) => chunks.push(c));
  req.on("end", () => {
    let body = Buffer.concat(chunks);
    const encoding = req.headers["content-encoding"];
    if (encoding === "gzip") body = gunzipSync(body);
    else if (encoding === "zstd") body = zstdDecompressSync(body);
    if (req.url?.includes("/envelope/")) forwarded.push({ path: req.url, body });
    res.writeHead(200, { "content-type": "application/json" }).end("{}");
  });
});
await new Promise<void>((resolve) => upstream.listen(0, "0.0.0.0", resolve));
const upstreamPort = (upstream.address() as { port: number }).port;

// ── Relay in static mode ──────────────────────────────────────────────────────────────────────
const config = mkdtempSync(join(tmpdir(), "sentry-tests-relay-"));
mkdirSync(join(config, "projects"));
writeFileSync(
  join(config, "config.yml"),
  [
    "relay:",
    "  mode: static",
    `  upstream: http://host.docker.internal:${upstreamPort}/`,
    "  host: 0.0.0.0",
    "  port: 3000",
    "logging:",
    "  level: info",
    "normalization:",
    "  level: full",
    "",
  ].join("\n"),
);
writeFileSync(
  join(config, "projects", `${PROJECT_ID}.json`),
  JSON.stringify({
    projectId: PROJECT_ID,
    slug: "sentry-tests",
    organizationId: 1,
    disabled: false,
    lastChange: new Date().toISOString(),
    publicKeys: [{ publicKey: KEY, numericId: 1, isEnabled: true }],
    config: { allowedDomains: ["*"], trustedRelays: [], piiConfig: null },
  }),
);
const container = execFileSync(
  "docker",
  [
    "run",
    "-d",
    "--rm",
    "-p",
    "127.0.0.1::3000",
    "-v",
    `${config}:/work/.relay`,
    flags.image!,
    "run",
    "--config",
    "/work/.relay",
  ],
  { encoding: "utf8" },
).trim();
const cleanup = () => {
  if (!flags.keep) spawnSync("docker", ["rm", "-f", container]);
  upstream.close();
  rmSync(config, { recursive: true, force: true });
};

let failed = false;
try {
  const port = execFileSync("docker", ["port", container, "3000"], { encoding: "utf8" }).trim().split(":").pop();
  const relay = `http://127.0.0.1:${port}`;
  await waitFor(
    async () => (await fetch(`${relay}/api/relay/healthcheck/ready/`).catch(() => null))?.ok === true,
    30_000,
    "Relay to start",
  );

  if (flags.run !== undefined) {
    await checkRun(relay, port!);
    process.exitCode = failed ? 1 : 0;
    throw null;
  }

  // ── what the reporter would send ────────────────────────────────────────────────────────────
  const options = resolveOptions(
    { dsn: `http://${KEY}@127.0.0.1:${port}/${PROJECT_ID}`, release: "relay-check", tags: { check: "relay" } },
    {},
  )!;
  const report = buildReport(sampleFile(), options);
  const sent = report.envelopes;
  for (const envelope of sent) {
    const error = await sendEnvelope(envelope, options.targets[0]);
    if (error !== null) throw new Error(`Relay rejected an envelope: ${error}`);
  }
  await waitFor(
    async () => countItems(forwarded) >= countItems(sent.map(serializeForCount)),
    20_000,
    "Relay to forward every item",
  );

  // ── what Relay kept ─────────────────────────────────────────────────────────────────────────
  const items = forwarded.flatMap((f) => parseEnvelope(f.body));
  const problems: string[] = [];
  const check = (ok: boolean, message: string) => ok || problems.push(message);
  const tx = items.find((i) => i.header.type === "transaction")?.payload;
  const failure = items.find((i) => i.header.type === "event" && i.payload.level === "error")?.payload;
  const flaky = items.find((i) => i.header.type === "event" && i.payload.level === "warning")?.payload;
  const attachments = items.filter((i) => i.header.type === "attachment").map((i) => i.header.filename);
  check(
    tx !== undefined && failure !== undefined && flaky !== undefined,
    `forwarded items: ${items.map((i) => i.header.type)}`,
  );
  const sentTx = sent[0].items[0].payload as { spans: unknown[] };
  for (const [name, event] of [
    ["transaction", tx],
    ["failure", failure],
    ["flaky", flaky],
  ] as const) {
    if (event === undefined) continue;
    check(event.errors === undefined, `${name}: Relay recorded errors ${JSON.stringify(event.errors)}`);
    const meta = metaErrors(event._meta);
    check(meta.length === 0, `${name}: Relay fixed or dropped fields: ${meta.join("; ")}`);
  }
  if (tx !== undefined) {
    check(
      tx.spans.length === sentTx.spans.length,
      `transaction: ${tx.spans.length} of ${sentTx.spans.length} spans kept`,
    );
    check(
      tx.contexts.trace.op === "test.file" && tx.transaction === "src/signup.test.tsx",
      `transaction: ${tx.transaction} ${tx.contexts.trace.op}`,
    );
    const ops = new Set(tx.spans.map((s: { op: string }) => s.op));
    check(
      ["test.suite", "test.case", "test.hook", "test.fn"].every((op) => ops.has(op)),
      `transaction: structure spans kept: ${[...ops]}`,
    );
    check(
      tx.spans.some(
        (s: { op: string; data?: Record<string, unknown> }) => s.op === "testing-library.query" && s.data?.checks === 4,
      ),
      "transaction: the findBy span lost its data",
    );
  }
  if (failure !== undefined) {
    const frames = failure.exception.values[0].stacktrace?.frames ?? [];
    const own = frames.find((f: { in_app?: boolean }) => f.in_app);
    check(
      own?.context_line !== undefined && own.pre_context?.length > 0,
      "failure: the in-app frame lost its source context",
    );
    check(
      failure.breadcrumbs?.values?.length === 4,
      `failure: ${failure.breadcrumbs?.values?.length} breadcrumbs kept`,
    );
    check(
      JSON.stringify(failure.fingerprint) ===
        JSON.stringify(["sentry-tests.test-failure", "src/signup.test.tsx", "Signup > shows an error"]),
      `failure: fingerprint ${failure.fingerprint}`,
    );
    check(failure.contexts?.trace?.trace_id === tx?.contexts.trace.trace_id, "failure: trace link lost");
    check(failure.contexts?.clock?.skipped_ms === 120, "failure: clock context lost");
  }
  if (flaky !== undefined)
    check(
      flaky.exception.values.length === 1 && flaky.exception.values[0].type === "FlakyTest",
      `flaky: ${flaky.exception.values.map((v: { type: string }) => v.type)} kept`,
    );
  check(
    attachments.includes("accessibility-snapshot.txt") && attachments.includes("page.html"),
    `attachments forwarded: ${attachments}`,
  );

  if (problems.length > 0) {
    failed = true;
    console.log(`Relay check FAILED:\n  ${problems.join("\n  ")}`);
    console.log(
      execFileSync("docker", ["logs", container], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
        .split("\n")
        .filter((l) => /WARN|ERROR/.test(l))
        .slice(-20)
        .join("\n"),
    );
  } else {
    console.log(
      `Relay check passed (${flags.image}): ${sent.length} envelopes accepted, ${items.length} items forwarded intact (${tx.spans.length} spans, failure with ${failure.breadcrumbs.values.length} breadcrumbs and ${attachments.length} attachments, flaky issue)`,
    );
  }
} catch (error) {
  if (error !== null) {
    failed = true;
    console.log(`Relay check FAILED: ${(error as Error).message}`);
  }
} finally {
  cleanup();
}
process.exit(failed ? 1 : 0);

// ── helpers ───────────────────────────────────────────────────────────────────────────────────

/** --run: a real suite reporting to Relay; everything forwarded must be free of Relay's errors. */
async function checkRun(relay: string, port: string): Promise<void> {
  const started = Date.now();
  const proc = spawnSync(flags.run!, {
    shell: true,
    cwd: flags.cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      SENTRY_DSN: `http://${KEY}@127.0.0.1:${port}/${PROJECT_ID}`,
      SENTRY_SPOTLIGHT: "",
      SENTRY_RELEASE: "relay-check",
    },
    maxBuffer: 256 * 1024 * 1024,
  });
  const summary =
    (proc.stdout + proc.stderr)
      .split("\n")
      .filter((l) => l.includes("@ctrl/sentry-tests:"))
      .at(-1) ?? "(no @ctrl/sentry-tests summary line)";
  // What the reporter says it sent: Relay must forward all of it (it answers 200 even for items it
  // then drops, so a short count is how a silent drop shows).
  const stated = /(\d+) traces?, (\d+) failed tests?, (\d+) flaky tests?/.exec(summary);
  const expected = stated ? { transactions: Number(stated[1]), events: Number(stated[2]) + Number(stated[3]) } : null;
  const unique = (type: string) =>
    new Set(
      forwarded
        .flatMap((f) => parseEnvelope(f.body))
        .filter((i) => i.header.type === type)
        .map((i) => i.payload.event_id),
    ).size;
  await waitFor(
    () => expected !== null && unique("transaction") >= expected.transactions && unique("event") >= expected.events,
    120_000,
    "Relay to forward everything the reporter sent",
  ).catch(() => undefined);
  const items = forwarded.flatMap((f) => parseEnvelope(f.body));
  const events = items.filter((i) => i.header.type === "event" || i.header.type === "transaction");
  const problems: string[] = [];
  for (const { payload } of events) {
    const where = payload.transaction ?? payload.event_id;
    if (payload.errors !== undefined) problems.push(`${where}: ${JSON.stringify(payload.errors).slice(0, 300)}`);
    for (const m of metaErrors(payload._meta)) problems.push(`${where}: ${m}`);
  }
  const counts = (type: string) =>
    new Set(items.filter((i) => i.header.type === type).map((i) => i.payload?.event_id ?? Math.random())).size;
  if (expected === null) problems.push("no @ctrl/sentry-tests summary line in the command's output");
  else if (counts("transaction") < expected.transactions || counts("event") < expected.events) {
    problems.push(
      `Relay forwarded ${counts("transaction")}/${expected.transactions} transactions and ${counts("event")}/${expected.events} events: it dropped the rest`,
    );
  }
  console.log(`${summary.trim()}`);
  console.log(
    `Relay forwarded ${counts("transaction")} transactions, ${counts("event")} events, ${items.filter((i) => i.header.type === "attachment").length} attachments (${forwarded.length} upstream requests) in ${((Date.now() - started) / 1000).toFixed(1)} s (exit ${proc.status})`,
  );
  const seen = new Set<string>();
  const ops = new Map<string, number>();
  for (const { header, payload } of items) {
    if (header.type !== "transaction" || seen.has(payload.event_id)) continue;
    seen.add(payload.event_id);
    for (const span of payload.spans ?? []) ops.set(span.op, (ops.get(span.op) ?? 0) + 1);
  }
  const top = [...ops]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([op, n]) => `${op} ${n}`);
  if (top.length > 0) console.log(`  spans: ${top.join(", ")}`);
  for (const { payload } of items.filter((i) => i.header.type === "event")) {
    console.log(
      `  ${payload.level}: ${payload.fingerprint?.slice(1).join(" › ")}: ${String(
        payload.exception?.values?.at(-1)?.value ?? "",
      )
        .split("\n")[0]
        .slice(0, 120)}`,
    );
  }
  if (problems.length > 0) {
    failed = true;
    console.log(
      `Relay check FAILED: ${problems.length} problems\n  ${[...new Set(problems)].slice(0, 30).join("\n  ")}`,
    );
  } else if (events.length === 0) {
    failed = true;
    console.log(`Relay check FAILED: nothing was forwarded\n${(proc.stdout + proc.stderr).slice(-2000)}`);
  } else {
    console.log("Relay check passed: every forwarded event came through without errors");
  }
}

async function waitFor(condition: () => Promise<boolean> | boolean, ms: number, what: string): Promise<void> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`timed out waiting for ${what}`);
}

function serializeForCount(envelope: Envelope): { body: Buffer } {
  return { body: Buffer.from(envelope.items.map(() => "x").join("")) };
}

function countItems(list: Array<{ body: Buffer }>): number {
  return list === forwarded
    ? forwarded.reduce((n, f) => n + parseEnvelope(f.body).length, 0)
    : list.reduce((n, f) => n + f.body.length, 0);
}

/** https://develop.sentry.dev/sdk/data-model/envelopes/: items are read by length when given, else to the newline. */
function parseEnvelope(buffer: Buffer): Array<{ header: any; payload: any }> {
  const items: Array<{ header: any; payload: any }> = [];
  let at = buffer.indexOf(10) + 1;
  while (at > 0 && at < buffer.length) {
    const eol = buffer.indexOf(10, at);
    if (eol < 0) break;
    const header = JSON.parse(buffer.subarray(at, eol).toString());
    const end =
      header.length !== undefined
        ? eol + 1 + header.length
        : buffer.indexOf(10, eol + 1) < 0
          ? buffer.length
          : buffer.indexOf(10, eol + 1);
    const raw = buffer.subarray(eol + 1, end).toString();
    items.push({ header, payload: header.type === "event" || header.type === "transaction" ? JSON.parse(raw) : raw });
    at = end + 1;
  }
  return items;
}

/** Relay's per-field notes in `_meta` (errors on fields it removed or could not parse). */
function metaErrors(meta: unknown, path = ""): string[] {
  if (meta === null || typeof meta !== "object") return [];
  const out: string[] = [];
  for (const [key, value] of Object.entries(meta as Record<string, unknown>)) {
    if (key === "" && value !== null && typeof value === "object" && "err" in (value as object))
      out.push(`${path || "."}: ${JSON.stringify((value as { err: unknown }).err)}`);
    else out.push(...metaErrors(value, path ? `${path}.${key}` : key));
  }
  return out;
}

function sampleFile(): TestFileReport {
  const now = Date.now() / 1000;
  // A frame of "the test" outside this repository: the packages here are library code to the reporter.
  const testFile = join(config, "signup.test.tsx");
  writeFileSync(
    testFile,
    [
      "import { screen } from '@testing-library/react';",
      "",
      "test('shows an error', async () => {",
      "  await screen.findByText('Saved');",
      "});",
    ].join("\n"),
  );
  const span = (
    id: string,
    op: string,
    description: string,
    start: number,
    end: number,
    parent?: string,
    data: CollectedSpan["data"] = {},
  ): CollectedSpan => ({
    span_id: id,
    parent_span_id: parent,
    op,
    description,
    start_timestamp: now + start,
    timestamp: now + end,
    status: op === "testing-library.query" ? "internal_error" : "ok",
    data,
  });
  // describe("Signup") with three tests, each a beforeEach hook and a test function rendering, typing and finding.
  const test = (n: number, name: string, offset: number) => [
    span(`c00000000000000${n}`, "test.case", `Signup > ${name}`, offset, offset + 0.03, "9000000000000001"),
    span(`e00000000000000${n}`, "test.hook", "beforeEach", offset, offset + 0.002, `c00000000000000${n}`),
    span(`f00000000000000${n}`, "test.fn", name, offset + 0.002, offset + 0.025, `c00000000000000${n}`),
    span(
      `a00000000000000${n}`,
      "react.render",
      "render(<Signup />)",
      offset + 0.003,
      offset + 0.007,
      `f00000000000000${n}`,
    ),
    span(
      `b00000000000000${n}`,
      "user-event.type",
      'user.type(textbox "Email", "ada@example.com")',
      offset + 0.008,
      offset + 0.015,
      `f00000000000000${n}`,
    ),
    span(
      `d00000000000000${n}`,
      "testing-library.query",
      'findByText("Saved")',
      offset + 0.016,
      offset + 0.024,
      `f00000000000000${n}`,
      { checks: 4, matches: 0, "clock.skipped_ms": 120 },
    ),
  ];
  const failureError = new Error("Unable to find an element with the text: Saved");
  const collected: CollectedFile = {
    startedAt: now - 0.01,
    endedAt: now + 0.14,
    droppedSpans: 0,
    spans: [
      span("9000000000000001", "test.suite", "Signup", 0, 0.135),
      ...test(1, "submits", 0),
      ...test(2, "shows an error", 0.05),
      ...test(3, "retries", 0.1),
    ],
    tests: {
      t1: { spanIds: ["c000000000000001"], droppedSpans: 0, failures: [] },
      t2: {
        spanIds: ["c000000000000002"],
        droppedSpans: 0,
        failures: [
          {
            error: { message: failureError.message },
            attachments: [
              {
                filename: "page.html",
                contentType: "text/html",
                data: "<body>\n  <form>\n    <button>Save</button>\n  </form>\n</body>",
              },
              {
                filename: "accessibility-snapshot.txt",
                contentType: "text/plain",
                data: '- textbox "Email"\n- button "Save"',
              },
            ],
            contexts: { clock: { skipped_ms: 120, pending_timers: 1 } },
          },
        ],
      },
      t3: {
        spanIds: ["c000000000000003"],
        droppedSpans: 0,
        failures: [{ error: { name: "Error", message: "first attempt fails" }, attachments: [], contexts: {} }],
      },
    },
  };
  return {
    runner: "vitest",
    root: "/repo",
    file: "/repo/src/signup.test.tsx",
    environmentSetupMs: 2.5,
    collected,
    tests: [
      { key: "t1", name: "Signup > submits", state: "pass", duration: 30, retries: 0, flaky: false, errors: [] },
      {
        key: "t2",
        name: "Signup > shows an error",
        state: "fail",
        duration: 30,
        retries: 0,
        flaky: false,
        errors: [
          {
            name: "TestingLibraryElementError",
            message: failureError.message,
            frames: [{ method: "check", file: testFile, line: 4, column: 3 }],
          },
        ],
      },
      { key: "t3", name: "Signup > retries", state: "pass", duration: 30, retries: 1, flaky: true, errors: [] },
    ],
  };
}
