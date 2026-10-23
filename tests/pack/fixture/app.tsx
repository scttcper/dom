// The component every check renders (Vitest + tsc side; app.cjs is the Jest twin).
import { useState } from "react";

export function Signup() {
  const [name, setName] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setSubmitted(name);
      }}
    >
      <label htmlFor="name">Name</label>
      <input id="name" value={name} onChange={(event) => setName(event.target.value)} />
      <input type="checkbox" aria-label="Subscribe" />
      <button type="submit" disabled={name === ""}>
        Sign up
      </button>
      {submitted !== null && <p role="status">Welcome, {submitted}!</p>}
    </form>
  );
}
