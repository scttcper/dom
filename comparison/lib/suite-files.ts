// The suite benchmark's test files: N small React test files in comparison/.generated/ (a dot
// directory, out of the root type check). Short files keep per-file costs (worker, environment,
// imports) visible the way they are in real component suites. Three shapes rotate: a static
// render with role queries, a stateful click, a labelled form typed into with user-event.

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const generatedDir = fileURLToPath(new URL("../.generated/", import.meta.url));

const SHAPES = [
  (id: string, n: number) => `function AccountCard({ name, count }: { name: string; count: number }) {
  return (
    <section aria-label="Account ${id}">
      <h2>{name}</h2>
      <p>Owner: team-${id}</p>
      <button type="button">Messages: {count}</button>
    </section>
  );
}

test("renders account card ${id}", () => {
  render(<AccountCard name="Account ${id}" count={${n}} />);
  expect(screen.getByRole("heading", { name: "Account ${id}" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Messages: ${n}" })).toBeVisible();
  expect(screen.getByText("Owner: team-${id}")).toBeInTheDocument();
});
`,
  (id: string) => `function Counter() {
  const [count, setCount] = useState(0);
  return <button type="button" onClick={() => setCount((c) => c + 1)}>Clicked {count} times</button>;
}

test("counter ${id} counts clicks", async () => {
  const user = userEvent.setup();
  render(<Counter />);
  const button = screen.getByRole("button", { name: "Clicked 0 times" });
  await user.click(button);
  await user.click(button);
  expect(button).toHaveTextContent("Clicked 2 times");
});
`,
  (id: string) => `function Signup({ onSubmit }: { onSubmit: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <form aria-label="Signup ${id}" onSubmit={(e) => { e.preventDefault(); onSubmit(name); }}>
      <label htmlFor="name-${id}">Name</label>
      <input id="name-${id}" value={name} onChange={(e) => setName(e.target.value)} />
      <button type="submit">Join</button>
    </form>
  );
}

test("signup ${id} submits the typed name", async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn();
  render(<Signup onSubmit={onSubmit} />);
  await user.type(screen.getByLabelText("Name"), "Ada ${id}");
  await user.click(screen.getByRole("button", { name: "Join" }));
  expect(onSubmit).toHaveBeenCalledWith("Ada ${id}");
});
`,
];

export function generate(count: number): void {
  rmSync(generatedDir, { recursive: true, force: true });
  mkdirSync(generatedDir, { recursive: true });
  for (let n = 1; n <= count; n++) {
    const id = String(n).padStart(3, "0");
    writeFileSync(
      `${generatedDir}file-${id}.test.tsx`,
      `import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, test, vi } from "vitest";

${SHAPES[n % SHAPES.length](id, n)}`,
    );
  }
}
