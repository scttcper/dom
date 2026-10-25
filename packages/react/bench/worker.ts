// One benchmark sample in a fresh process: `node --expose-gc worker.ts <stack> <scenario> <iterations>`.
// Prints one JSON line: { setupMs, perIterationMs, heapUsedMB, rssMB }.
//
// stacks:
//   ctrl-dom        @ctrl/dom/react + @ctrl/dom/jest-dom on @ctrl/dom (@ctrl/dom/vitest-environment globals)
//   jsdom      stock @testing-library/react + @testing-library/jest-dom on jsdom
//   happy-dom  stock @testing-library/react + @testing-library/jest-dom on happy-dom
import * as React from "react";

const [stack, scenarioName, iterationsArg] = process.argv.slice(2);
const iterations = Number(iterationsArg ?? 200);
const g = globalThis as any;

function installWindowGlobals(win: any): void {
  // Like jest-environment-jsdom / GlobalRegistrator: expose the window's globals.
  for (const key of Object.getOwnPropertyNames(win)) {
    if (key in g) continue;
    try {
      g[key] = win[key];
    } catch {}
  }
  g.window = win;
  g.document = win.document;
  g.navigator ??= win.navigator;
}

const t0 = performance.now();
if (stack === "jsdom") {
  const { JSDOM } = await import("jsdom");
  installWindowGlobals(
    new JSDOM("<!doctype html><html><head></head><body></body></html>", { url: "http://localhost/" }).window,
  );
} else if (stack === "happy-dom") {
  const { Window } = await import("happy-dom");
  installWindowGlobals(new Window({ url: "http://localhost/" }));
} else if (stack === "ctrl-dom") {
  // TODO(react): use the window agent's installGlobals once it exists.
  const dom: any = await import("@ctrl/dom");
  const win = dom.createWindow();
  if (typeof dom.installGlobals === "function") dom.installGlobals(win);
  else installWindowGlobals(win);
}
g.IS_REACT_ACT_ENVIRONMENT = true;

const stockLib = stack === "jsdom" || stack === "happy-dom";
const rtl: any = stockLib ? await import("@testing-library/react/pure.js") : await import("@ctrl/dom/react/pure");
const matchers: any = stockLib
  ? await import("@testing-library/jest-dom/matchers")
  : await import("@ctrl/dom/jest-dom/matchers");
const setupMs = performance.now() - t0;

// Minimal matcher context: only the pass path runs in the benchmark.
const ctx = { isNot: false, equals: (a: unknown, b: unknown) => Object.is(a, b), utils: {} };
function assert(name: string, ...args: unknown[]): void {
  const r = matchers[name].apply(ctx, args);
  if (!r.pass) throw new Error(`${name} failed in benchmark: ${r.message?.()}`);
}

// Node runs .ts directly but does not transform JSX, so components use createElement.
const h = React.createElement;

// --- scenario 1: render + rerender + unmount of a 50-component tree ----------------------

function Item({ i, label }: { i: number; label: string }) {
  const [n, setN] = React.useState(i);
  return h(
    "li",
    { className: i % 2 ? "odd" : "even", "data-index": i },
    h("span", null, label, " ", n),
    h("button", { type: "button", onClick: () => setN(n + 1), "aria-label": `bump ${i}` }, "+"),
  );
}

function Tree({ label }: { label: string }) {
  const items = [];
  for (let i = 0; i < 48; i++) items.push(h(Item, { key: i, i, label }));
  return h("section", { "aria-label": "list" }, h("h2", null, label), h("ul", null, items));
}

function treeIteration(): void {
  const { rerender, unmount } = rtl.render(h(Tree, { label: "first" }));
  rerender(h(Tree, { label: "second" }));
  unmount();
  rtl.cleanup();
}

// --- scenario 2: typical form test (render, 10 queries, 5 jest-dom assertions) -----------

function LoginForm() {
  const [user, setUser] = React.useState("");
  return h(
    "form",
    { "aria-label": "login" },
    h("h1", null, "Sign in"),
    h("label", { htmlFor: "user" }, "Username"),
    h("input", {
      id: "user",
      name: "user",
      value: user,
      onChange: (e: any) => setUser(e.target.value),
      required: true,
    }),
    h("label", { htmlFor: "pass" }, "Password"),
    h("input", { id: "pass", name: "pass", type: "password", required: true }),
    h("label", null, h("input", { type: "checkbox", name: "remember", defaultChecked: true }), " Remember me"),
    h(
      "select",
      { "aria-label": "Region", defaultValue: "eu" },
      h("option", { value: "us" }, "US"),
      h("option", { value: "eu" }, "EU"),
    ),
    h("p", { "data-testid": "hint" }, "Use your work account"),
    h("a", { href: "/forgot" }, "Forgot password?"),
    h("button", { type: "submit", disabled: user === "" }, "Sign in"),
    h("button", { type: "button" }, "Cancel"),
  );
}

function formIteration(): void {
  const { screen } = rtl;
  rtl.render(h(LoginForm));
  const form = screen.getByRole("form", { name: "login" });
  const user = screen.getByLabelText("Username");
  screen.getByLabelText("Password");
  const remember = screen.getByRole("checkbox", { name: "Remember me" });
  screen.getByRole("combobox", { name: "Region" });
  const submit = screen.getByRole("button", { name: "Sign in" });
  screen.getByRole("button", { name: "Cancel" });
  screen.getByRole("heading", { name: "Sign in" });
  screen.getByText("Forgot password?");
  const hint = screen.getByTestId("hint");
  assert("toBeInTheDocument", form);
  assert("toBeDisabled", submit);
  assert("toBeChecked", remember);
  assert("toHaveTextContent", hint, "work account");
  assert("toBeRequired", user);
  rtl.cleanup();
}

const scenarios: Record<string, () => void> = { tree: treeIteration, form: formIteration };
const run = scenarios[scenarioName];
if (!run) throw new Error(`unknown scenario ${scenarioName}`);

// Warm up (JIT), then measure.
const warmup = Math.max(5, Math.floor(iterations / 10));
for (let i = 0; i < warmup; i++) run();
const start = performance.now();
for (let i = 0; i < iterations; i++) run();
const perIterationMs = (performance.now() - start) / iterations;

g.gc?.();
g.gc?.();
const mem = process.memoryUsage();
console.log(JSON.stringify({ setupMs, perIterationMs, heapUsedMB: mem.heapUsed / 2 ** 20, rssMB: mem.rss / 2 ** 20 }));
process.exit(0);
