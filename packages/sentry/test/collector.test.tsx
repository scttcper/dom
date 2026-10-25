/**
 * @ctrl/dom/sentry's worker side: the spans @rtd/dom's packages publish on their tracing channel
 * (packages/dom/src/trace.ts; https://nodejs.org/api/diagnostics_channel.html#class-tracingchannel)
 * and what collector.ts records from them for one test, plus the page it captures on failure.
 */
import { afterEach, describe, expect, test } from "vitest";
import { createContext, StrictMode, useState, type ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@rtd/react";
import userEvent from "@rtd/user-event";
import { tracing } from "@rtd/dom/internal";
import { startCollecting, type CollectedSpan } from "../src/collector.ts";

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

describe("collector: spans from the tracing channel", () => {
  test("render, queries, user-event actions and findBy each record a span with their data", async () => {
    const collector = startCollecting();
    collector.beginTest();
    render(<Save />);
    const user = userEvent.setup();
    // @rtd/user-event types elements with its own DOM interfaces (src/dom-types.ts).
    await user.type(screen.getByRole("textbox", { name: "Name" }) as never, "Ada");
    await user.click(screen.getByRole("button", { name: "Save" }) as never);
    await screen.findByText("Saved");
    const collected = collector.endTest()!;
    collector.stop();

    const lines = collected.spans.map(line);
    expect(lines).toContain("react.render render(<Save />)");
    expect(lines).toContain('testing-library.query getByRole("textbox", { name: "Name" })');
    // Elements are named the way queries find them: role and accessible name (@rtd/aria).
    expect(lines).toContain('user-event.type user.type(textbox "Name", "Ada")');
    expect(lines).toContain('user-event.click user.click(button "Save")');
    const find = collected.spans.find((s) => s.description === 'findByText("Saved")')!;
    expect(find.op).toBe("testing-library.query");
    expect(find.data.matches).toBe(1);
    expect(find.data.checks).toBeGreaterThan(0);
    // The 200 ms timer was skipped on the virtual clock rather than waited out.
    expect(find.data["clock.skipped_ms"]).toBeGreaterThan(0);
    for (const span of collected.spans) expect(span.timestamp).toBeGreaterThanOrEqual(span.start_timestamp);
    expect(collected.endedAt).toBeGreaterThanOrEqual(collected.startedAt);
  });

  test("a query inside a waitFor callback is the waitFor span's child, across awaits", async () => {
    const collector = startCollecting();
    collector.beginTest();
    render(<Save />);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByText("Saved")).toBeTruthy());
    const { spans } = collector.endTest()!;
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
    const collector = startCollecting();
    collector.beginTest();
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
    const { spans } = collector.endTest()!;
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

  test("captureFailure records the error, the accessibility snapshot, the HTML and the clock", () => {
    const collector = startCollecting();
    const collected = collector.beginTest();
    render(<Save />);
    collector.captureFailure(document, new Error("boom"));
    collector.endTest();
    collector.stop();

    const [failure] = collected.failures;
    expect(failure.error).toMatchObject({ name: "Error", message: "boom" });
    expect(failure.aria).toContain('button "Save"');
    expect(failure.html).toContain("<button>Save</button>");
    expect(failure.clock).toMatchObject({ skippedMs: expect.any(Number), pendingTimers: expect.any(Number) });
  });

  test("a retry keeps the previous attempts' failures", () => {
    const collector = startCollecting();
    collector.beginTest();
    collector.captureFailure(document, new Error("first attempt"));
    const first = collector.endTest();
    const second = collector.beginTest(first);
    collector.endTest();
    collector.stop();
    expect(second.failures.map((f) => f.error?.message)).toEqual(["first attempt"]);
  });

  test("nothing is traced without a subscriber, and spans outside a test are not recorded", () => {
    expect(tracing()).toBe(false);
    const collector = startCollecting();
    expect(tracing()).toBe(true);
    render(<Save />);
    const collected = collector.beginTest();
    collector.endTest();
    collector.stop();
    expect(collected.spans).toEqual([]);
    expect(tracing()).toBe(false);
  });
});
