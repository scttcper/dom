/**
 * @ctrl/sentry-tests' worker side (src/collector.ts): the runner's structure spans, the spans
 * @ctrl/dom's packages publish on the "ctrl-dom:span" tracing channel nested under them
 * (https://nodejs.org/api/diagnostics_channel.html#class-tracingchannel), and what a failed test
 * leaves behind: the page as HTML (src/html.ts), plus what "sentry-tests:failure" subscribers add
 * (https://nodejs.org/api/diagnostics_channel.html#class-channel). Runs on @ctrl/dom's Vitest
 * environment, which subscribes to add the accessibility snapshot and the clock.
 */
import { channel } from "node:diagnostics_channel";
import { afterEach, describe, expect, test } from "vitest";
import { createContext, StrictMode, useState, type ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@ctrl/dom/react";
import userEvent from "@ctrl/dom/user-event";
import { tracing, traceSync } from "@ctrl/dom/internal";
import { createCollector, type CollectedSpan, type Collector } from "../src/collector.ts";
import { pageHtml } from "../src/html.ts";
import type { FailureMessage } from "../src/channels.ts";

afterEach(cleanup);

function Save() {
  const [state, setState] = useState("idle");
  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <label>
        Name <input />
      </label>
      <button
        onClick={() => {
          setState("saving");
          setTimeout(() => setState("saved"), 200);
        }}
      >
        Save
      </button>
      {state === "saved" && <p>Saved</p>}
    </form>
  );
}

const line = (s: CollectedSpan) => `${s.op} ${s.description}`;

/** Run `fn` as a test of `collector`, the way the Vitest runner does, and return the file's spans. */
async function asTest(collector: Collector, fn: () => Promise<void> | void): Promise<{ spans: CollectedSpan[]; test: CollectedSpan }> {
  const test = collector.open("test.case", "saves", {}, collector.test("t1"));
  await collector.run(test, fn);
  collector.close(test);
  return { spans: collector.finish().spans, test: test.span };
}

describe("collector: spans from the tracing channel, under the runner's", () => {
  test("render, queries, user-event actions and findBy each record a span under the test, with their data", async () => {
    const collector = createCollector();
    const { spans, test: testSpan } = await asTest(collector, async () => {
      render(<Save />);
      const user = userEvent.setup();
      // @ctrl/dom/user-event types elements with its own DOM interfaces (src/dom-types.ts).
      await user.type(screen.getByRole("textbox", { name: "Name" }) as never, "Ada");
      await user.click(screen.getByRole("button", { name: "Save" }) as never);
      await screen.findByText("Saved");
    });
    collector.stop();

    const lines = spans.map(line);
    expect(lines).toContain("react.render render(<Save />)");
    expect(lines).toContain('testing-library.query getByRole("textbox", { name: "Name" })');
    // Elements are named the way queries find them: role and accessible name.
    expect(lines).toContain('user-event.type user.type(textbox "Name", "Ada")');
    expect(lines).toContain('user-event.click user.click(button "Save")');
    const find = spans.find((s) => s.description === 'findByText("Saved")')!;
    expect(find.op).toBe("testing-library.query");
    expect(find.data.matches).toBe(1);
    expect(find.data.checks).toBeGreaterThan(0);
    // The 200 ms timer was skipped on the virtual clock rather than waited out (@ctrl/dom's trace.ts).
    expect(find.data["clock.skipped_ms"]).toBeGreaterThan(0);
    expect(find.parent_span_id).toBe(testSpan.span_id);
    for (const span of spans) expect(span.timestamp).toBeGreaterThanOrEqual(span.start_timestamp);
  });

  test("a query inside a waitFor callback is the waitFor span's child, across awaits", async () => {
    const collector = createCollector();
    const { spans } = await asTest(collector, async () => {
      render(<Save />);
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(screen.getByText("Saved")).toBeTruthy());
    });
    collector.stop();

    const wait = spans.find((s) => s.op === "testing-library.wait_for")!;
    expect(wait.description).toBe('waitFor(() => expect(screen.getByText("Saved")).toBeTruthy())');
    const children = spans.filter((s) => s.parent_span_id === wait.span_id);
    expect(children.length).toBeGreaterThan(0);
    expect(children.every((s) => s.description === 'getByText("Saved")')).toBe(true);
    // Retries that threw are errored spans; the last one found the text.
    expect(children.at(-1)!.status).toBe("ok");
    expect(spans.find((s) => s.op === "testing-library.fire_event")?.description).toBe('fireEvent.click(button "Save")');
  });

  test("descriptions name what the test wrote: the component inside test-helper wrappers, CommonJS callback source cleaned up, <body> alone", async () => {
    const Theme = createContext("light");
    const AllTheProviders = ({ children }: { children: ReactNode }) => <Theme value="dark">{children}</Theme>;
    // A bundler-renamed router provider, as test helpers wrap the UI in: `RouterProvider$1`.
    const RouterProvider = ({ router }: { router: { routes: Array<{ element: ReactNode; children?: Array<{ element: ReactNode }> }> } }) => <>{router.routes[0].children?.[0]?.element}</>;
    Object.defineProperty(RouterProvider, "name", { value: "RouterProvider$1" });
    const collector = createCollector();
    const { spans } = await asTest(collector, async () => {
      // An anonymous wrapper from a factory, under a layout route's <Outlet />.
      const makeProviders = () => ({ children }: { children: ReactNode }) => <AllTheProviders>{children}</AllTheProviders>;
      const Providers = makeProviders();
      const Outlet = () => null;
      render(<RouterProvider router={{ routes: [{ element: <Outlet />, children: [{ element: <Providers><StrictMode><Save /></StrictMode></Providers> }] }] } as never} />);
      // Babel/SWC CommonJS output: an interop object and a braced single statement.
      const babelStyle = new Function("_reactTestingLibrary", "expect", "return ()=>{ expect(_reactTestingLibrary.screen.getByText('Name')).toBeTruthy(); }")({ screen }, expect);
      await waitFor(babelStyle);
      fireEvent.click(document.body);
      render(<div><Save /></div>);
      render(<div><Save /><Save /></div>);
    });
    collector.stop();
    expect(spans.map(line)).toEqual(
      expect.arrayContaining([
        "react.render render(<Save />)",
        "testing-library.wait_for waitFor(() => expect(screen.getByText('Name')).toBeTruthy())",
        "testing-library.fire_event fireEvent.click(<body>)",
        "react.render render(<div><Save /></div>)",
        "react.render render(<div>…</div>)",
      ]),
    );
  });

  test("an event-driven runner's entered span takes the spans no async context places (Jest)", () => {
    const collector = createCollector();
    const suite = collector.open("test.suite", "Form");
    collector.enter(suite);
    const hook = collector.open("test.hook", "beforeEach");
    collector.enter(hook);
    render(<Save />);
    collector.close(hook);
    collector.enter(suite);
    collector.close(suite);
    const { spans } = collector.finish();
    collector.stop();
    expect(hook.span.parent_span_id).toBe(suite.span.span_id);
    expect(spans.find((s) => s.op === "react.render")?.parent_span_id).toBe(hook.span.span_id);
  });

  test("past 300 spans a test drops the rest, and what a dropped span starts nests under its parent", () => {
    const collector = createCollector();
    const test = collector.open("test.case", "t", {}, collector.test("t"));
    collector.run(test, () => {
      for (let i = 0; i < 300; i++) traceSync("custom.op", `step ${i}`, () => {});
      traceSync("custom.op", "dropped", () => traceSync("custom.op", "inside the dropped one", () => {}));
    });
    collector.close(test);
    const file = collector.finish();
    collector.stop();
    expect(file.spans.filter((s) => s.op === "custom.op")).toHaveLength(300);
    expect(file.spans.every((s) => s.op !== "custom.op" || s.parent_span_id === test.span.span_id)).toBe(true);
    expect(file.tests.t.droppedSpans).toBe(2);
  });

  test("nothing is traced without a subscriber, and spans outside every runner span are not recorded", () => {
    expect(tracing()).toBe(false);
    const collector = createCollector();
    expect(tracing()).toBe(true);
    render(<Save />);
    expect(collector.finish().spans).toEqual([]);
    collector.stop();
    expect(tracing()).toBe(false);
  });
});

describe("collector: a failed test's capture", () => {
  test("records the error and the page as HTML, plus @ctrl/dom's accessibility snapshot and clock (its environment subscribes)", async () => {
    const collector = createCollector();
    const test = collector.test("t1");
    render(<Save />);
    await collector.captureFailure(test, "saves", new Error("boom"), document);
    collector.stop();

    const [failure] = test.failures;
    expect(failure.error).toMatchObject({ name: "Error", message: "boom" });
    expect(failure.attachments.map((a) => a.filename)).toEqual(["page.html", "accessibility-snapshot.txt"]);
    expect(failure.attachments[0].data).toContain("<button>Save</button>");
    expect(failure.attachments[1].data).toContain('button "Save"');
    expect(failure.contexts.clock).toMatchObject({ skipped_ms: expect.any(Number), pending_timers: expect.any(Number) });
  });

  test('"sentry-tests:failure" subscribers add attachments and contexts, can hold the capture with waitUntil, and cannot replace page.html', async () => {
    const failures = channel("sentry-tests:failure");
    const subscriber = (message: unknown) => {
      const m = message as FailureMessage;
      m.contexts.store = { user: "ada" };
      m.attachments.push({ filename: "page.html", contentType: "text/html", data: "not this one" });
      m.waitUntil(
        new Promise<void>((resolve) => setImmediate(resolve)).then(() => {
          m.attachments.push({ filename: "store.json", contentType: "application/json", data: `{"test":${JSON.stringify(m.test)}}` });
        }),
      );
    };
    failures.subscribe(subscriber);
    try {
      const collector = createCollector();
      const test = collector.test("t1");
      render(<Save />);
      await collector.captureFailure(test, "Form > saves", new Error("boom"), document);
      collector.stop();
      const [failure] = test.failures;
      expect(failure.contexts.store).toEqual({ user: "ada" });
      expect(failure.attachments.find((a) => a.filename === "page.html")!.data).toContain("<form>");
      expect(failure.attachments.find((a) => a.filename === "store.json")!.data).toBe('{"test":"Form > saves"}');
    } finally {
      failures.unsubscribe(subscriber);
    }
  });
});

describe("pageHtml: the failure's page.html", () => {
  test("indents the body, keeps short text on its element's line, leaves out <style>/<script> contents and comments", () => {
    render(
      <div>
        <style>{".a { color: red }"}</style>
        <p title={'say "hi" & go'}>Short</p>
        <input disabled />
      </div>,
    );
    document.body.firstElementChild!.append(document.createComment("hidden"));
    expect(pageHtml(document)).toBe(['<body>', "  <div>", "    <div>", "      <style></style>", '      <p title="say &quot;hi&quot; &amp; go">Short</p>', '      <input disabled="" />', "    </div>", "  </div>", "</body>"].join("\n"));
  });

  test("cuts at the limit, and has nothing for a document without a body", () => {
    render(<ul>{Array.from({ length: 50 }, (_, i) => <li key={i}>item {i}</li>)}</ul>);
    const html = pageHtml(document, 200)!;
    expect(html.endsWith("<!-- truncated -->")).toBe(true);
    expect(html.length).toBeLessThan(300);
    expect(pageHtml({})).toBeUndefined();
    expect(pageHtml(undefined)).toBeUndefined();
  });
});
