// Components for the React benchmarks: shapes that component suites are made of.
import { useEffect, useState } from "react";

/** A labelled form: queries by role and name walk every control. */
export function SignupForm({ fields = 20 }: { fields?: number }) {
  return (
    <form aria-label="Sign up">
      {Array.from({ length: fields }, (_, i) => (
        <div key={i}>
          <label htmlFor={`field-${i}`}>Field {i}</label>
          <input id={`field-${i}`} name={`field-${i}`} type={i % 5 === 4 ? "email" : "text"} />
        </div>
      ))}
      <label>
        <input type="checkbox" name="terms" /> I agree to the terms
      </label>
      <button type="submit">Create account</button>
    </form>
  );
}

export function NameInput() {
  const [value, setValue] = useState("");
  return (
    <label>
      Name
      <input value={value} onChange={(e) => setValue(e.target.value)} />
    </label>
  );
}

export function Counter() {
  const [count, setCount] = useState(0);
  return (
    <button type="button" onClick={() => setCount((c) => c + 1)}>
      Clicked {count} times
    </button>
  );
}

export function KeyedList({ items }: { items: readonly number[] }) {
  return (
    <ul aria-label="Items">
      {items.map((id) => (
        <li key={id}>
          Item {id} <button type="button">Remove {id}</button>
        </li>
      ))}
    </ul>
  );
}

export function OrdersTable({ rows }: { rows: number }) {
  return (
    <table>
      <tbody>
        {Array.from({ length: rows }, (_, i) => (
          <tr key={i}>
            <td>Order {i}</td>
            <td>{i % 3 === 0 ? "Shipped" : "Pending"}</td>
            <td>${(i * 4.25).toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Shows its result after `delay` ms, like a mocked request. */
export function DelayedGreeting({ delay }: { delay: number }) {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    const id = setTimeout(() => setName("Ada"), delay);
    return () => clearTimeout(id);
  }, [delay]);
  return name === null ? <p>Loading…</p> : <p role="status">Hello, {name}</p>;
}
