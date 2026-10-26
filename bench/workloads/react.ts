// React + testing-library workloads. Every configuration runs the same unmodified development
// React; only the DOM and (for `ctrl-dom`) the testing-library stack differ. Workloads are written
// with createElement (Node runs these files directly, without a JSX transform).
//
// Form fixtures follow ~/gh/vibedom/bench/dom-bench/react-test-workloads.mjs; the keyed list
// follows ~/gh/dom-bench/src/list-workloads.jsx.

import type { Env } from "../lib/configs.ts";
import { expectMatcher } from "../lib/configs.ts";
import type { Workload } from "./types.ts";
import { check, eq } from "./types.ts";

// oxfmt-ignore
const fieldNames = [
  "Name", "Slug", "Organization", "Team", "Email", "Website", "Environment", "Platform",
  "Release", "Repository", "Region", "Description", "Owner", "Timezone", "Language", "Endpoint",
  "Token", "Version", "Channel", "Contact",
];

/** 20-field settings form with an inactive hidden duplicate (named queries must skip it). */
function settingsForm(env: Env, state: { changes: number; submissions: number; submitted: any }) {
  const { React, window } = env;
  const h = React.createElement;
  return function Form() {
    const [values, setValues] = React.useState(() => fieldNames.map(() => ""));
    const [enabled, setEnabled] = React.useState(true);
    return h(
      "form",
      {
        onSubmit(event: any) {
          event.preventDefault();
          state.submissions++;
          state.submitted = new window.FormData(event.currentTarget);
        },
      },
      h("h1", null, "Project settings"),
      h(
        "fieldset",
        null,
        h("legend", null, "Project details"),
        fieldNames.map((name, index) =>
          h(
            "label",
            { key: name },
            name,
            h("input", {
              name: `field-${index}`,
              value: values[index],
              onChange(event: any) {
                state.changes++;
                const value = event.currentTarget.value;
                setValues((v) => v.with(index, value));
              },
            }),
          ),
        ),
      ),
      h(
        "div",
        { hidden: true },
        h("label", null, "Name", h("input", { name: "inactive-name" })),
        h("button", { type: "button" }, "Save"),
      ),
      h(
        "label",
        null,
        "Enable alerts",
        h("input", {
          type: "checkbox",
          name: "alerts",
          checked: enabled,
          onChange: (event: any) => setEnabled(event.currentTarget.checked),
        }),
      ),
      h("button", { type: "submit" }, "Save"),
    );
  };
}

function formWorkload(typing: boolean): Workload {
  return {
    id: typing ? "react/fill-10-submit" : "react/form-10-getByRole",
    title: typing
      ? "Render form, fill 10 fields with user-event, submit"
      : "Render form + 10 getByRole({name}) queries",
    kind: "react",
    iterations: typing ? 8 : 20,
    warmup: typing ? 2 : 5,
    setup(env) {
      const { React, rtl, dom, userEvent } = env;
      const state = { changes: 0, submissions: 0, submitted: null as any };
      const Form = settingsForm(env, state);
      let view: any;
      let user: any;
      let found: any[] = [];
      return {
        beforeEach() {
          found = [];
          state.changes = state.submissions = 0;
          state.submitted = null;
          if (typing) user = userEvent.setup({ document: env.document });
        },
        async run() {
          view = rtl.render(React.createElement(Form));
          if (typing) {
            for (const name of fieldNames.slice(0, 10)) {
              const input = dom.getByRole(view.container, "textbox", { name });
              found.push(input);
              await user.type(input, "100");
            }
            await user.click(dom.getByRole(view.container, "button", { name: "Save" }));
          } else {
            for (const name of fieldNames.slice(0, 8)) {
              found.push(dom.getByRole(view.container, "textbox", { name }));
            }
            found.push(dom.getByRole(view.container, "checkbox", { name: "Enable alerts" }));
            found.push(dom.getByRole(view.container, "button", { name: "Save" }));
            for (const el of found) expectMatcher(env, "toBeInTheDocument", el);
          }
        },
        verify() {
          eq(found.length, 10, "found");
          for (let i = 0; i < (typing ? 10 : 8); i++) {
            eq(found[i].name, `field-${i}`, "input name");
            eq(found[i].value, typing ? "100" : "", "input value");
          }
          eq(view.container.querySelectorAll("input").length, 22, "inputs");
          eq(state.changes, typing ? 30 : 0, "onChange calls");
          eq(state.submissions, typing ? 1 : 0, "submissions");
          if (typing) {
            for (let i = 0; i < 20; i++) {
              eq(state.submitted.get(`field-${i}`), i < 10 ? "100" : "", `FormData field-${i}`);
            }
            eq(state.submitted.get("alerts"), "on", "FormData alerts");
            eq(env.document.activeElement.textContent, "Save", "focus after click");
          } else {
            eq(found[8].checked, true, "checkbox checked");
            eq(found[9].type, "submit", "submit button");
            eq(found[9].closest("[hidden]"), null, "visible Save");
          }
        },
        afterEach() {
          view?.unmount();
          view?.container.remove();
          view = null;
        },
      };
    },
  };
}

/** n-field form: mount + 3 rerenders, each followed by named queries. */
function bigFormWorkload(n: number): Workload {
  return {
    id: `react/form-${n}-rerender`,
    title: `${n}-field form: mount + 3 rerenders with queries`,
    kind: "react",
    iterations: n >= 100 ? 6 : 15,
    warmup: n >= 100 ? 2 : 4,
    setup(env) {
      const { React, rtl, dom } = env;
      const h = React.createElement;
      const probe = [0, Math.floor(n / 2), n - 1];
      function BigForm({ revision }: { revision: number }) {
        const fields = [];
        for (let i = 0; i < n; i++) {
          fields.push(
            h(
              "div",
              { key: i, className: "field" },
              h("label", { htmlFor: `f-${i}` }, `Field ${i}`),
              h("input", { id: `f-${i}`, name: `f-${i}`, readOnly: true, value: `v${revision}-${i}` }),
              i % 5 === 0 ? h("span", { className: "hint" }, `Hint for field ${i}`) : null,
            ),
          );
        }
        return h(
          "form",
          { "aria-label": "Big form" },
          h("h2", null, `Revision ${revision}`),
          fields,
          h("button", { type: "submit", disabled: revision % 2 === 1 }, "Submit"),
        );
      }
      let view: any;
      let values: string[] = [];
      return {
        beforeEach() {
          values = [];
        },
        run() {
          view = rtl.render(h(BigForm, { revision: 0 }));
          for (let revision = 0; revision < 4; revision++) {
            if (revision > 0) view.rerender(h(BigForm, { revision }));
            dom.getByRole(view.container, "heading", { name: `Revision ${revision}` });
            for (const i of probe) {
              values.push(dom.getByRole(view.container, "textbox", { name: `Field ${i}` }).value);
            }
            dom.getByRole(view.container, "button", { name: "Submit" });
          }
        },
        verify() {
          eq(values.length, 12, "queried values");
          for (let revision = 0; revision < 4; revision++) {
            for (let k = 0; k < probe.length; k++) {
              eq(values[revision * 3 + k], `v${revision}-${probe[k]}`, "rerendered value");
            }
          }
          eq(view.container.querySelectorAll("input").length, n, "inputs");
          eq(view.container.querySelector("button").disabled, true, "button disabled at rev 3");
        },
        afterEach() {
          view?.unmount();
          view?.container.remove();
          view = null;
        },
      };
    },
  };
}

const listSize = 1000;

const keyedList: Workload = {
  id: "react/keyed-list-1000",
  title: "1,000-row keyed list: reorder 200 + replace 100",
  kind: "react",
  iterations: 20,
  warmup: 5,
  setup(env) {
    const { React, createRoot, act, document } = env;
    const h = React.createElement;
    function KeyedList({ ids }: { ids: number[] }) {
      return h(
        "ul",
        null,
        ids.map((id) => h("li", { key: id, "data-id": id }, `Row ${id}`, h("button", null, "Open"))),
      );
    }
    const container = document.createElement("main");
    document.body.append(container);
    const root = createRoot(container);
    const original = Array.from({ length: listSize }, (_, i) => i);
    const updated = original.filter((id) => id % 10 !== 0);
    for (let i = 0; i < 200; i++) {
      const from = (i * 397) % updated.length;
      const to = (i * 173 + 501) % updated.length;
      const [id] = updated.splice(from, 1);
      updated.splice(to, 0, id);
    }
    for (let i = 0; i < 100; i++) updated.splice(i * 10, 0, listSize + i);
    let originalNodes: Map<number, any>;
    return {
      async beforeEach() {
        await act(async () => root.render(h(KeyedList, { ids: original })));
        originalNodes = new Map(
          Array.from(container.firstChild.children as Iterable<any>, (node) => [Number(node.dataset.id), node]),
        );
      },
      async run() {
        await act(async () => root.render(h(KeyedList, { ids: updated })));
      },
      verify() {
        const nodes = Array.from(container.firstChild.children as Iterable<any>);
        eq(nodes.length, listSize, "row count");
        for (let i = 0; i < nodes.length; i++) {
          const id = updated[i];
          eq(nodes[i].dataset.id, String(id), `row ${i} id`);
          eq(nodes[i].textContent, `Row ${id}Open`, `row ${i} text`);
          if (id < listSize) check(nodes[i] === originalNodes.get(id), `retained row ${id} identity`);
        }
        for (let id = 0; id < listSize; id += 10) {
          check(originalNodes.get(id).parentNode === null, `removed row ${id}`);
        }
      },
      async afterEach() {
        // Reset to a fresh list so every iteration reorders the same DOM.
        await act(async () => root.render(h(KeyedList, { ids: [] })));
      },
      async close() {
        await act(async () => root.unmount());
        container.remove();
      },
    };
  },
};

const textQueries: Workload = {
  id: "react/text-queries",
  title: "getByText / getByLabelText / getByTestId scans (200 rows, 30 queries)",
  kind: "react",
  iterations: 30,
  warmup: 5,
  setup(env) {
    const { React, rtl } = env;
    const h = React.createElement;
    const rows = 200;
    function Table() {
      return h(
        "section",
        null,
        h("h2", null, "Members"),
        Array.from({ length: rows }, (_, i) =>
          h(
            "div",
            { key: i, className: "member", "data-testid": `member-${i}` },
            h("p", null, `Member ${i} joined in ${2000 + (i % 25)}`),
            h("label", { htmlFor: `role-${i}` }, `Role for member ${i}`),
            h("input", { id: `role-${i}`, defaultValue: i % 3 ? "viewer" : "admin" }),
            h("button", { type: "button" }, `Remove member ${i}`),
          ),
        ),
      );
    }
    const view = rtl.render(h(Table));
    const screen = rtl.screen;
    const picks = Array.from({ length: 10 }, (_, k) => (k * 37 + 11) % rows);
    return {
      run() {
        const out: any[] = [];
        for (const i of picks) out.push(screen.getByText(`Member ${i} joined in ${2000 + (i % 25)}`));
        for (const i of picks) out.push(screen.getByLabelText(`Role for member ${i}`));
        for (const i of picks) out.push(screen.getByTestId(`member-${i}`));
        return out;
      },
      verify(out: any) {
        eq(out.length, 30, "results");
        for (let k = 0; k < 10; k++) {
          const i = picks[k];
          eq(out[k].tagName, "P", "getByText element");
          eq(out[10 + k].id, `role-${i}`, "getByLabelText element");
          eq(out[20 + k].getAttribute("data-testid"), `member-${i}`, "getByTestId element");
          check(out[20 + k].contains(out[k]) && out[20 + k].contains(out[10 + k]), "same row");
        }
      },
      close() {
        view.unmount();
        view.container.remove();
      },
    };
  },
};

const asyncFlows: Workload = {
  id: "react/findby-waitfor",
  title: "findBy* + waitFor flows (async load, 5 async saves)",
  kind: "react",
  iterations: 15,
  warmup: 3,
  setup(env) {
    const { React, rtl, dom } = env;
    const h = React.createElement;
    function Saver() {
      const [items, setItems] = React.useState<number[] | null>(null);
      const [saved, setSaved] = React.useState(0);
      React.useEffect(() => {
        let live = true;
        Promise.resolve().then(() => live && setItems(Array.from({ length: 10 }, (_, i) => i)));
        return () => {
          live = false;
        };
      }, []);
      if (items === null) return h("p", null, "Loading…");
      return h(
        "div",
        null,
        h("h2", null, `Loaded ${items.length} items`),
        h(
          "ul",
          null,
          items.map((i) => h("li", { key: i }, `Item ${i}`)),
        ),
        h(
          "button",
          {
            type: "button",
            onClick: () => {
              Promise.resolve().then(() => setSaved((s) => s + 1));
            },
          },
          "Save",
        ),
        h("p", { role: "status" }, saved ? `Saved ${saved}` : "Not saved"),
      );
    }
    let view: any;
    let statusText: string[] = [];
    return {
      beforeEach() {
        statusText = [];
      },
      async run() {
        view = rtl.render(h(Saver));
        await rtl.screen.findByRole("heading", { name: "Loaded 10 items" });
        const button = rtl.screen.getByRole("button", { name: "Save" });
        for (let i = 1; i <= 5; i++) {
          dom.fireEvent.click(button);
          await rtl.waitFor(() => {
            const status = rtl.screen.getByRole("status");
            if (status.textContent !== `Saved ${i}`) throw new Error("not yet");
            statusText.push(status.textContent);
          });
        }
        await rtl.screen.findByText("Item 9");
      },
      verify() {
        eq(statusText.join(","), "Saved 1,Saved 2,Saved 3,Saved 4,Saved 5", "async saves");
      },
      afterEach() {
        view?.unmount();
        view?.container.remove();
        view = null;
      },
    };
  },
};

const churn: Workload = {
  id: "react/mount-unmount-churn",
  title: "Mount/unmount churn of the 20-field form (memory slope)",
  kind: "react",
  iterations: 200,
  warmup: 20,
  setup(env) {
    const { React, rtl, dom } = env;
    const state = { changes: 0, submissions: 0, submitted: null as any };
    const Form = settingsForm(env, state);
    const gc = (globalThis as any).gc as () => void;
    const heap: Array<[number, number]> = [];
    let done = 0;
    let view: any;
    return {
      run() {
        view = rtl.render(React.createElement(Form));
        return dom.getByRole(view.container, "button", { name: "Save" });
      },
      verify(button: any) {
        eq(button.type, "submit", "Save button");
      },
      afterEach() {
        // What auto-cleanup does after each test: render() keeps every container (and its React
        // root) in Testing Library's mounted set until cleanup(), which would read as growth.
        rtl.cleanup();
        view = null;
        done++;
        if (done % 20 === 0 && gc) {
          gc();
          gc();
          heap.push([done, process.memoryUsage().heapUsed]);
        }
      },
      extra(): Record<string, number> {
        // Least-squares slope of heap-after-GC over iterations (warmup included in `done`).
        const pts = heap.slice(1);
        if (pts.length < 3) return {};
        const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
        const my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
        let num = 0;
        let den = 0;
        for (const [x, y] of pts) {
          num += (x - mx) * (y - my);
          den += (x - mx) ** 2;
        }
        return { heapSlopeKBPerMount: num / den / 1024 };
      },
    };
  },
};

/**
 * A CSS-in-JS style sheet like the ones Emotion / styled-components / MUI inject into test
 * documents: one or two hashed classes per component, :hover/:focus variants, descendant and
 * child rules scoped under component classes, a few global tag / universal / attribute rules.
 * `n` component classes → about 6n rules.
 */
function cssInJsSheet(n: number): string {
  const rules = [
    "*, *::before, *::after { box-sizing: border-box; }",
    "html { font-size: 16px; } body { margin: 0; font-family: sans-serif; }",
    "[hidden] { display: none !important; }",
    "button { cursor: pointer; } input, textarea { font: inherit; }",
    "form > fieldset { border: 0; } fieldset legend { font-weight: 600; }",
    ".app .toolbar button.primary { color: white; }",
    "ul li + li { margin-top: 4px; }",
  ];
  for (let i = 0; i < n; i++) {
    rules.push(
      `.css-${i} { display: flex; padding: ${i % 8}px; color: rgb(${i % 255}, 10, 20); }`,
      `.css-${i}:hover { color: blue; }`,
      `.css-${i}:focus-visible { outline: 2px solid; }`,
      `.css-${i} > label { font-weight: ${i % 2 ? 400 : 500}; }`,
      `.css-${i} .hint, .theme-dark .css-${i} input { opacity: 0.8; }`,
      `.panel .css-${i} input[type="text"] { border-color: gray; }`,
    );
  }
  return rules.join("\n");
}

/** 40-field styled form under a CSS-in-JS sheet: mount + 3 rerenders with role queries. */
function styledFormWorkload(): Workload {
  const n = 40;
  return {
    id: "react/styled-form-rerender",
    title: "40-field form under a 1,200-rule CSS-in-JS sheet: mount + 3 rerenders with queries",
    kind: "react",
    iterations: 10,
    warmup: 3,
    setup(env) {
      const { React, rtl, dom, document } = env;
      const h = React.createElement;
      const style = document.createElement("style");
      style.textContent = cssInJsSheet(200);
      document.head.append(style);
      const probe = [0, Math.floor(n / 2), n - 1];
      function StyledForm({ revision }: { revision: number }) {
        const fields = [];
        for (let i = 0; i < n; i++) {
          fields.push(
            h(
              "div",
              { key: i, className: `css-${i} field` },
              h("label", { htmlFor: `s-${i}`, className: `css-${100 + (i % 50)}` }, `Field ${i}`),
              h("input", {
                id: `s-${i}`,
                className: `css-${150 + (i % 50)}`,
                readOnly: true,
                value: `v${revision}-${i}`,
              }),
              i % 5 === 0 ? h("span", { className: "hint" }, `Hint for field ${i}`) : null,
            ),
          );
        }
        return h(
          "div",
          { className: "app css-199" },
          h(
            "div",
            { className: "toolbar css-198" },
            h("button", { type: "button", className: "primary css-197" }, "New"),
          ),
          h(
            "div",
            { className: "panel css-196", hidden: revision % 2 === 1 },
            h("button", { type: "button" }, "Hidden action"),
          ),
          h(
            "form",
            { "aria-label": "Styled form", className: "css-195" },
            h("h2", { className: "css-194" }, `Revision ${revision}`),
            h("fieldset", { className: "css-193" }, h("legend", null, "Fields"), fields),
            h("button", { type: "submit", className: "css-192" }, "Submit"),
          ),
        );
      }
      let view: any;
      let values: string[] = [];
      return {
        beforeEach() {
          values = [];
        },
        run() {
          view = rtl.render(h(StyledForm, { revision: 0 }));
          for (let revision = 0; revision < 4; revision++) {
            if (revision > 0) view.rerender(h(StyledForm, { revision }));
            dom.getByRole(view.container, "heading", { name: `Revision ${revision}` });
            for (const i of probe) {
              values.push(dom.getByRole(view.container, "textbox", { name: `Field ${i}` }).value);
            }
            dom.getByRole(view.container, "button", { name: "Submit" });
            values.push(String(dom.queryAllByRole(view.container, "button").length));
          }
        },
        verify() {
          eq(values.length, 16, "queried values");
          for (let revision = 0; revision < 4; revision++) {
            for (let k = 0; k < probe.length; k++) {
              eq(values[revision * 4 + k], `v${revision}-${probe[k]}`, "rerendered value");
            }
            // The hidden panel's button is excluded on odd revisions.
            eq(values[revision * 4 + 3], revision % 2 === 1 ? "2" : "3", "visible buttons");
          }
          eq(env.window.getComputedStyle(view.container.querySelector(".css-0")).display, "flex", "class rule");
          eq(env.window.getComputedStyle(view.container.querySelector("label")).fontWeight, "500", "child rule");
        },
        afterEach() {
          view?.unmount();
          view?.container.remove();
          view = null;
        },
        close() {
          style.remove();
        },
      };
    },
  };
}

export const reactWorkloads: Workload[] = [
  formWorkload(false),
  formWorkload(true),
  bigFormWorkload(20),
  bigFormWorkload(100),
  styledFormWorkload(),
  keyedList,
  textQueries,
  asyncFlows,
  churn,
];
