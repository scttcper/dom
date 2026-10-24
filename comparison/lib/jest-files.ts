// The Jest suite's test files: the same three shapes as lib/suite-files.ts (a render with role
// queries, a stateful click, a form typed into with user-event), written as plain CommonJS with
// React.createElement so Jest runs them with `transform: {}`. Every contender then pays for its
// environment, DOM and Testing Library only, not for a transformer.

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const jestGeneratedDir = fileURLToPath(new URL("../.generated-jest/", import.meta.url));

const SHAPES = [
  (id: string, n: number) => `function AccountCard({ name, count }) {
  return h("section", { "aria-label": "Account ${id}" },
    h("h2", null, name),
    h("p", null, "Owner: team-${id}"),
    h("button", { type: "button" }, "Messages: ", count));
}

test("renders account card ${id}", () => {
  render(h(AccountCard, { name: "Account ${id}", count: ${n} }));
  expect(screen.getByRole("heading", { name: "Account ${id}" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Messages: ${n}" })).toBeVisible();
  expect(screen.getByText("Owner: team-${id}")).toBeInTheDocument();
});
`,
  (id: string) => `function Counter() {
  const [count, setCount] = useState(0);
  return h("button", { type: "button", onClick: () => setCount((c) => c + 1) }, "Clicked ", count, " times");
}

test("counter ${id} counts clicks", async () => {
  const user = userEvent.setup();
  render(h(Counter));
  const button = screen.getByRole("button", { name: "Clicked 0 times" });
  await user.click(button);
  await user.click(button);
  expect(button).toHaveTextContent("Clicked 2 times");
});
`,
  (id: string) => `function Signup({ onSubmit }) {
  const [name, setName] = useState("");
  return h("form", { "aria-label": "Signup ${id}", onSubmit: (e) => { e.preventDefault(); onSubmit(name); } },
    h("label", { htmlFor: "name-${id}" }, "Name"),
    h("input", { id: "name-${id}", value: name, onChange: (e) => setName(e.target.value) }),
    h("button", { type: "submit" }, "Join"));
}

test("signup ${id} submits the typed name", async () => {
  const user = userEvent.setup();
  const onSubmit = jest.fn();
  render(h(Signup, { onSubmit }));
  await user.type(screen.getByLabelText("Name"), "Ada ${id}");
  await user.click(screen.getByRole("button", { name: "Join" }));
  expect(onSubmit).toHaveBeenCalledWith("Ada ${id}");
});
`,
];

export function generateJest(count: number): void {
  rmSync(jestGeneratedDir, { recursive: true, force: true });
  mkdirSync(jestGeneratedDir, { recursive: true });
  for (let n = 1; n <= count; n++) {
    const id = String(n).padStart(3, "0");
    writeFileSync(
      `${jestGeneratedDir}file-${id}.test.cjs`,
      `"use strict";
const { createElement: h, useState } = require("react");
const { render, screen } = require("@testing-library/react");
const { userEvent } = require("@testing-library/user-event");

${SHAPES[n % SHAPES.length](id, n)}`,
    );
  }
}
