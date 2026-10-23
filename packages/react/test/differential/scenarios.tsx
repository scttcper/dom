/**
 * Differential smoke scenarios: the same React tests run against
 *   - stock @testing-library/react@16.3.3 + @testing-library/jest-dom@7.0.1 on jsdom
 *     (stock.test.tsx, the oracle), and
 *   - @rtd/react + @rtd/jest-dom on the project's DOM (rtd.test.tsx; @rtd/dom when
 *     RTD_STACK=rtd).
 * Each scenario returns a plain-text transcript of everything observable (DOM, query
 * results, error messages, matcher pass/fail + failure messages, console.error output),
 * and both files compare it to the same oracle file in __oracle__/.
 */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { expect, vi } from "vitest";

declare const document: any;

export interface Lib {
  render: any;
  renderHook: any;
  screen: any;
  fireEvent: any;
  within: any;
  waitFor: any;
  waitForElementToBeRemoved: any;
  prettyDOM: any;
  act: any;
  cleanup: any;
  matchers: Record<string, (...args: any[]) => { pass: boolean; message: () => string }>;
}

/** Captures vitest's matcher context (`this` inside a matcher) once per file. */
export function captureMatcherContext(): object {
  let ctx: object | undefined;
  expect.extend({
    __rtdCaptureContext(this: object) {
      ctx = this;
      return { pass: true, message: () => "" };
    },
  });
  (expect(null) as any).__rtdCaptureContext();
  return ctx!;
}

export class Transcript {
  lines: string[] = [];
  lib: Lib;
  ctx: object;
  constructor(lib: Lib, ctx: object) {
    this.lib = lib;
    this.ctx = ctx;
  }
  log(label: string, value: unknown): void {
    this.lines.push(`## ${label}\n${typeof value === "string" ? value : JSON.stringify(value, null, 2)}`);
  }
  dom(label: string, node: any = document.body): void {
    this.log(label, this.lib.prettyDOM(node, 100000, { highlight: false }) || "");
  }
  /** Runs a jest-dom matcher like `expect(el)[.not].name(...args)` would and records the outcome. */
  match(name: string, el: unknown, ...args: unknown[]): void {
    for (const isNot of [false, true]) {
      const context = Object.assign(Object.create(this.ctx), { isNot });
      let line: string;
      try {
        const result = this.lib.matchers[name].call(context, el, ...args);
        const failed = isNot ? result.pass : !result.pass;
        line = `${isNot ? ".not." : ""}${name}: ${failed ? "FAIL\n" + result.message() : "pass"}`;
      } catch (error) {
        line = `${isNot ? ".not." : ""}${name}: THROWS ${(error as Error).message}`;
      }
      this.lines.push(line);
    }
  }
  error(label: string, fn: () => unknown): void {
    try {
      fn();
      this.log(label, "(no error)");
    } catch (error) {
      this.log(label, String((error as Error).message));
    }
  }
  toString(): string {
    return this.lines.join("\n\n") + "\n";
  }
}

type Scenario = (t: Transcript, lib: Lib) => void | Promise<void>;

function Counter() {
  const [count, setCount] = React.useState(0);
  return (
    <div>
      <p data-testid="count">Count: {count}</p>
      <button onClick={() => setCount((c) => c + 1)}>Increment</button>
      <button onClick={() => setCount(0)} disabled={count === 0}>
        Reset
      </button>
    </div>
  );
}

function SignupForm({ onSubmit }: { onSubmit: (values: Record<string, unknown>) => void }) {
  const [email, setEmail] = React.useState("");
  const [agree, setAgree] = React.useState(false);
  const [error, setError] = React.useState("");
  return (
    <form
      aria-label="signup"
      onSubmit={(e) => {
        e.preventDefault();
        if (!email.includes("@")) {
          setError("Enter a valid email");
          return;
        }
        onSubmit({ email, agree });
      }}
    >
      <label htmlFor="email">Email</label>
      <input
        id="email"
        name="email"
        type="email"
        required
        value={email}
        aria-invalid={error ? "true" : "false"}
        aria-errormessage="email-error"
        aria-describedby="email-hint"
        onChange={(e) => setEmail(e.target.value)}
      />
      <span id="email-hint">We never share it</span>
      <span id="email-error">{error}</span>
      <label>
        <input type="checkbox" name="agree" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> I agree
      </label>
      <select name="plan" defaultValue="pro" aria-label="Plan">
        <option value="free">Free</option>
        <option value="pro">Pro</option>
      </select>
      <textarea name="bio" defaultValue="hello" aria-label="Bio" />
      <button type="submit">Sign up</button>
    </form>
  );
}

function Loader() {
  const [data, setData] = React.useState<string | null>(null);
  React.useEffect(() => {
    const id = setTimeout(() => setData("Loaded!"), 20);
    return () => clearTimeout(id);
  }, []);
  return data === null ? <div role="status">Loading...</div> : <h1>{data}</h1>;
}

function Disclosure() {
  const [open, setOpen] = React.useState(false);
  return (
    <section aria-labelledby="disc-title">
      <h2 id="disc-title">Details</h2>
      <button aria-expanded={open} aria-pressed={open} aria-controls="panel" onClick={() => setOpen((o) => !o)}>
        Toggle
      </button>
      <div id="panel" hidden={!open} style={{ color: "rgb(255, 0, 0)", display: open ? "block" : "none" }}>
        Secret content
      </div>
      <details>
        <summary>More</summary>
        <span>Inside details</span>
      </details>
    </section>
  );
}

function Portal({ children }: { children: React.ReactNode }) {
  const [node] = React.useState(() => {
    const el = document.createElement("div");
    el.setAttribute("data-testid", "portal-root");
    return el;
  });
  React.useLayoutEffect(() => {
    document.body.appendChild(node);
    return () => node.remove();
  }, [node]);
  return ReactDOM.createPortal(children, node);
}

function Table() {
  return (
    <table>
      <caption>Scores</caption>
      <thead>
        <tr>
          <th>Name</th>
          <th>Score</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Ada</td>
          <td>10</td>
        </tr>
        <tr>
          <td>Linus</td>
          <td>7</td>
        </tr>
      </tbody>
    </table>
  );
}

function useCounter(initial: number) {
  const [n, setN] = React.useState(initial);
  return { n, inc: () => setN((x) => x + 1) };
}

export const scenarios: Record<string, Scenario> = {
  "counter-click"(t, { render, screen, fireEvent }) {
    const { container } = render(<Counter />);
    t.dom("initial", container);
    t.match("toHaveTextContent", screen.getByTestId("count"), "Count: 0");
    t.match("toBeDisabled", screen.getByRole("button", { name: "Reset" }));
    fireEvent.click(screen.getByRole("button", { name: /increment/i }));
    fireEvent.click(screen.getByText("Increment"));
    t.dom("after two clicks", container);
    t.match("toHaveTextContent", screen.getByTestId("count"), "Count: 2");
    t.match("toBeEnabled", screen.getByRole("button", { name: "Reset" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    t.match("toHaveTextContent", screen.getByTestId("count"), /Count: 0/);
    t.log(
      "roles",
      screen.getAllByRole("button").map((b: any) => b.textContent),
    );
  },

  "form-queries-and-matchers"(t, { render, screen, fireEvent }) {
    const onSubmit = vi.fn();
    render(<SignupForm onSubmit={onSubmit} />);
    const email = screen.getByLabelText("Email");
    const form = screen.getByRole("form", { name: "signup" });
    t.match("toBeRequired", email);
    t.match("toBeInvalid", email);
    t.match("toHaveAccessibleName", email, "Email");
    t.match("toHaveAccessibleDescription", email, "We never share it");
    t.match("toHaveRole", email, "textbox");
    t.match("toHaveValue", email, "");
    t.match("toHaveFormValues", form, { email: "", agree: false, plan: "pro", bio: "hello" });
    fireEvent.change(email, { target: { value: "nope" } });
    fireEvent.submit(form);
    t.match("toHaveAccessibleErrorMessage", email, "Enter a valid email");
    t.match("toHaveValue", email, "nope");
    t.match("toHaveDisplayValue", email, "nope");
    fireEvent.change(email, { target: { value: "a@b.co" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "I agree" }));
    t.match("toBeChecked", screen.getByRole("checkbox"));
    t.match("toHaveDisplayValue", screen.getByRole("combobox", { name: "Plan" }), "Pro");
    t.match("toHaveFormValues", form, { email: "a@b.co", agree: true, plan: "pro" });
    fireEvent.submit(form);
    t.log("submitted", onSubmit.mock.calls);
    t.match("toBeValid", email);
  },

  async "async-findBy-waitFor"(t, { render, screen, waitFor, waitForElementToBeRemoved }) {
    render(<Loader />);
    t.match("toBeInTheDocument", screen.getByRole("status"));
    await waitForElementToBeRemoved(() => screen.queryByRole("status"));
    const heading = await screen.findByRole("heading", { level: 1 });
    t.match("toHaveTextContent", heading, "Loaded!");
    await waitFor(() => expect(screen.getByText("Loaded!")).toBeTruthy());
    t.dom("loaded");
  },

  "visibility-style-aria-state"(t, { render, screen, fireEvent }) {
    render(<Disclosure />);
    const button = screen.getByRole("button", { name: "Toggle" });
    const panel = document.getElementById("panel");
    t.match("toBeVisible", panel);
    t.match("toHaveStyle", panel, { display: "none" });
    // Not a named color on purpose: jsdom 30 computes `red` as rgb(255, 0, 0) while keeping
    // `red` in element.style (so stock jest-dom fails toHaveStyle("color: red") there), and
    // @rtd/dom keeps the keyword like the jsdom versions jest-dom's own tests were written
    // against. That intentional difference is pinned in @rtd/jest-dom's to-have-style suite.
    t.match("toHaveStyle", panel, "color: rgb(255, 0, 0); display: none");
    t.match("toBePressed", button);
    t.match("toHaveAttribute", button, "aria-expanded", "false");
    t.match("toBeVisible", screen.getByText("Inside details"));
    t.match("toBeVisible", screen.getByText("More"));
    fireEvent.click(button);
    t.match("toBeVisible", panel);
    t.match("toHaveStyle", panel, { display: "block" });
    t.match("toBePressed", button);
    t.match("toHaveRole", screen.getByRole("region"), "region");
    t.match("toHaveAccessibleName", screen.getByRole("region"), "Details");
    t.dom("open");
  },

  "query-error-messages"(t, { render, screen }) {
    render(<Counter />);
    t.error("getByText missing", () => screen.getByText("Nope"));
    t.error("getByRole missing", () => screen.getByRole("link", { name: "Home" }));
    t.error("getByRole wrong name", () => screen.getByRole("button", { name: "Decrement" }));
    t.error("getByRole multiple", () => screen.getByRole("button"));
    t.error("getByLabelText missing", () => screen.getByLabelText("Username"));
    t.error("getByTestId missing", () => screen.getByTestId("missing"));
  },

  "portal-within-table"(t, { render, screen, within }) {
    render(
      <div>
        <Table />
        <Portal>
          <p>Portaled text</p>
        </Portal>
      </div>,
    );
    t.match("toBeInTheDocument", screen.getByText("Portaled text"));
    const rows = screen.getAllByRole("row");
    t.log(
      "rows",
      rows.map((r: any) => within(r).queryAllByRole("cell").map((c: any) => c.textContent)),
    );
    t.log(
      "columnheaders",
      screen.getAllByRole("columnheader").map((h: any) => h.textContent),
    );
    t.match("toHaveAccessibleName", screen.getByRole("table"), "Scores");
    t.match("toContainElement", screen.getByRole("table"), screen.getByText("Ada"));
    t.match("toContainHTML", screen.getByRole("table"), "<td>Ada</td>");
    t.dom("body");
  },

  "rerender-unmount-hook"(t, { render, renderHook, act }) {
    function Greeting({ name }: { name: string }) {
      return <h1 className={`greeting greeting--${name.toLowerCase()}`}>Hello {name}</h1>;
    }
    const { container, rerender, unmount, asFragment } = render(<Greeting name="Ada" />);
    t.match("toHaveClass", container.firstChild, "greeting", "greeting--ada");
    rerender(<Greeting name="Linus" />);
    t.match("toHaveClass", container.firstChild, "greeting greeting--linus", { exact: true });
    t.dom("fragment first child", asFragment().firstChild);
    unmount();
    t.match("toBeEmptyDOMElement", container);
    const { result, rerender: rerenderHook } = renderHook(({ start }: { start: number }) => useCounter(start), { initialProps: { start: 5 } });
    act(() => result.current.inc());
    t.log("hook after inc", result.current.n);
    rerenderHook({ start: 100 });
    t.log("hook after rerender", result.current.n);
  },

  "act-warnings"(t, { render }) {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      function Late() {
        const [v, setV] = React.useState(0);
        React.useEffect(() => {
          Promise.resolve().then(() => setV(1));
        }, []);
        return <span>{v}</span>;
      }
      render(<Late />);
      t.log("console.error before flush", spy.mock.calls.length);
    } finally {
      spy.mockRestore();
    }
  },
};
