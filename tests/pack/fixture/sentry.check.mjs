// (s1) / (s2): @ctrl/dom/sentry end to end. `node sentry.check.mjs vitest|jest` runs the runner on
// the sentry fixtures with SENTRY_DSN pointing at a fake Sentry server, then checks the envelopes
// it received: one trace with spans for the tests (a nested describe's included) and their Testing
// Library and user-event calls, an issue for the failing test with the page attached and linked to
// the trace (and, under Vitest, its console output), an issue for the file that fails to load, and
// a flaky-test issue.
import { spawn } from "node:child_process";
import { createServer } from "node:http";

const runner = process.argv[2];
const received = [];
const server = createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    received.push({ url: req.url, body: Buffer.concat(chunks) });
    res.writeHead(200).end("{}");
  });
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();

const args = runner === "vitest" ? ["exec", "vitest", "run", "--config", "vitest.sentry.config.ts"] : ["exec", "jest", "--config", "jest.sentry.config.cjs"];
const child = spawn("pnpm", args, {
  env: { ...process.env, SENTRY_DSN: `http://public@127.0.0.1:${port}/1`, SENTRY_RELEASE: "pack-check" },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
child.stdout.on("data", (d) => (output += d));
child.stderr.on("data", (d) => (output += d));
const code = await new Promise((resolve) => child.on("close", resolve));
server.close();

/** https://develop.sentry.dev/sdk/data-model/envelopes/: items are read by their header's length. */
function parseEnvelope(buffer) {
  const items = [];
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

const problems = [];
const check = (ok, message) => ok || problems.push(message);
const envelopes = received.map(({ url, body }) => ({ url, items: parseEnvelope(body) }));
check(code === 1, `${runner} exited ${code}, expected 1 (one test fails on purpose)`);
check(envelopes.length > 0 && envelopes.every((e) => e.url.startsWith("/api/1/envelope/?sentry_key=public")), `envelope URLs: ${envelopes.map((e) => e.url)}`);

const file = runner === "vitest" ? "sentry.test.tsx" : "sentry.jest.test.cjs";
const transactions = envelopes.flatMap((e) => e.items).filter((i) => i.header.type === "transaction").map((i) => i.payload);
check(transactions.length === 1, `${transactions.length} transactions, expected 1`);
const tx = transactions[0] ?? { spans: [], contexts: { trace: {} } };
check(tx.transaction === file && tx.release === "pack-check", `transaction ${tx.transaction} release ${tx.release}`);
const tests = tx.spans.filter((s) => s.op === "test.case").map((s) => s.description).sort();
check(JSON.stringify(tests) === JSON.stringify(["Signup > types a name", "greets before signing up", "passes on the retry", "signs up"]), `test spans: ${tests}`);
const nested = tx.spans.find((s) => s.op === "test.case" && s.description === "Signup > types a name");
check(nested !== undefined && tx.spans.some((s) => s.parent_span_id === nested.span_id && s.op === "user-event.type"), "the nested describe's test has no user-event.type span under it");
const ops = new Set(tx.spans.map((s) => s.op));
for (const op of ["react.render", "user-event.type", "user-event.click", "testing-library.query"]) check(ops.has(op), `no ${op} span (ops: ${[...ops]})`);
check(tx.spans.some((s) => s.description === 'findByRole("status")' && s.data.matches === 1), "no findByRole(\"status\") span with one match");

const events = envelopes.filter((e) => e.items[0].header.type === "event");
const failures = events.filter((e) => e.items[0].payload.fingerprint[0] === "ctrl-dom.test-failure");
const failure = failures.filter((e) => e.items[0].payload.fingerprint[1] === file);
check(failure.length === 1, `${failure.length} failure events for ${file}, expected 1`);
const broken = failures.filter((e) => e.items[0].payload.fingerprint[1] !== file);
check(broken.length === 1 && broken[0].items[0].payload.fingerprint[2] === "(file failed to load)" && String(broken[0].items[0].payload.exception.values[0].value).includes("this file cannot load"), `file failure events: ${broken.map((e) => e.items[0].payload.fingerprint)}`);
if (failure[0]) {
  const event = failure[0].items[0].payload;
  check(event.fingerprint[2] === "greets before signing up", `failure fingerprint ${event.fingerprint}`);
  check(String(event.exception.values[0].value).includes('Unable to find an accessible element with the role "status"'), `failure message ${event.exception.values[0].value.slice(0, 120)}`);
  check(event.contexts.trace.trace_id === tx.contexts.trace.trace_id, "failure event not linked to the trace");
  const snapshot = failure[0].items.find((i) => i.header.filename === "accessibility-snapshot.txt");
  check(snapshot !== undefined && snapshot.payload.includes('button "Sign up"'), `snapshot attachment: ${snapshot?.payload.slice(0, 200)}`);
  if (runner === "vitest") check(event.breadcrumbs.values.some((b) => b.category === "console" && b.message === "about to look for the greeting"), "no console breadcrumb");
}
const flaky = events.filter((e) => e.items[0].payload.fingerprint[0] === "ctrl-dom.flaky-test").map((e) => e.items[0].payload);
check(flaky.length === 1, `${flaky.length} flaky events, expected 1`);
if (flaky[0]) {
  check(flaky[0].level === "warning" && flaky[0].fingerprint[2] === "passes on the retry", `flaky event ${flaky[0].level} ${flaky[0].fingerprint}`);
  const [exception] = flaky[0].exception.values;
  check(exception.type === "FlakyTest" && exception.value.endsWith("Error: first attempt fails"), `flaky event's exception ${exception.type}: ${exception.value}`);
}
check(output.includes(`@ctrl/dom/sentry: 1 trace, 2 failed tests, 1 flaky test → 127.0.0.1:${port}`), "no summary line in the output");

if (problems.length > 0) {
  console.log(`${problems.join("\n")}\n\n${output}`);
  process.exit(1);
}
console.log(`ok: ${envelopes.length} envelopes, ${tx.spans.length} spans, ${failures.length} failures, ${flaky.length} flaky`);
