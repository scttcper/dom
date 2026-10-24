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

/**
 * A 40-field form styled the CSS-in-JS way: every element carries hashed component classes that
 * fixtures/css-in-js.ts styles (the sheet is injected separately, as Emotion does).
 */
export function StyledForm({ fields = 40 }: { fields?: number }) {
  return (
    <div className="app css-199">
      <div className="toolbar css-198">
        <button type="button" className="primary css-197">
          New
        </button>
      </div>
      <div className="panel css-196" hidden>
        <button type="button">Hidden action</button>
      </div>
      <form aria-label="Styled form" className="css-195">
        <h2 className="css-194">Profile</h2>
        <fieldset className="css-193">
          <legend>Fields</legend>
          {Array.from({ length: fields }, (_, i) => (
            <div key={i} className={`css-${i} field`}>
              <label htmlFor={`s-${i}`} className={`css-${100 + (i % 50)}`}>
                Field {i}
              </label>
              <input id={`s-${i}`} type="text" className={`css-${150 + (i % 50)}`} defaultValue={`v${i}`} />
              {i % 5 === 0 ? <span className="hint">Hint for field {i}</span> : null}
            </div>
          ))}
        </fieldset>
        <button type="submit" className="css-192">
          Submit
        </button>
      </form>
    </div>
  );
}
