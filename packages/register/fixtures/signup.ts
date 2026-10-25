// The component the node:test and bun test fixtures render. `.ts` with createElement: Node strips
// types but does not transform JSX.
import { createElement as h, useState } from "react";

export function Signup() {
  const [name, setName] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);
  return h(
    "form",
    {
      onSubmit: (event: { preventDefault(): void }) => {
        event.preventDefault();
        setTimeout(() => setSubmitted(name), 500);
      },
    },
    h("label", { htmlFor: "name" }, "Name"),
    h("input", {
      id: "name",
      value: name,
      onChange: (event: { target: { value: string } }) => setName(event.target.value),
    }),
    h("button", { type: "submit", disabled: name === "" }, "Sign up"),
    submitted !== null && h("p", { role: "status" }, `Welcome, ${submitted}!`),
  );
}
