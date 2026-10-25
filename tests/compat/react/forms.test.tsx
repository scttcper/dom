/**
 * React 19 forms through Testing Library + user-event — the scenarios real component tests
 * exercise. Runs unchanged in three projects (see vitest.react.shared.ts): jsdom with stock
 * Testing Library (proves every expectation below), @ctrl/dom with stock Testing Library, and
 * @ctrl/dom with our Testing Library packages aliased in.
 *
 * Specs behind the behavior:
 *   - input value / dirty flag / value tracker interplay: https://html.spec.whatwg.org/#dom-input-value
 *   - checkbox/radio activation:      https://html.spec.whatwg.org/#checkbox-state-(type=checkbox):activation-behaviour
 *   - implicit submission (Enter):    https://html.spec.whatwg.org/#implicit-submission
 *   - form submission + validation:   https://html.spec.whatwg.org/#concept-form-submit
 *   - constructing the entry list:    https://html.spec.whatwg.org/#constructing-the-form-data-set
 *   - selectedness:                   https://html.spec.whatwg.org/#selectedness-setting-algorithm
 *   - React form actions:             https://react.dev/reference/react-dom/components/form
 *
 * Expectations are explicit values (not snapshots) so a failure says what the behavior should be.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useActionState, useState, type FormEvent } from "react";
import { describe, expect, test, vi } from "vitest";

const engine = process.env.COMPAT_ENGINE ?? "jsdom";
/** jsdom lacks this behavior (see the reason); the expectation follows the spec and browsers. */
const specOnly = (reason: string) => test.skipIf(engine === "jsdom" && reason !== "");

describe("controlled text inputs", () => {
  function Controlled({
    onChange,
    transform = (v: string) => v,
  }: {
    onChange?: (v: string) => void;
    transform?: (v: string) => string;
  }) {
    const [value, setValue] = useState("");
    return (
      <label>
        Name
        <input
          value={value}
          onChange={(e) => {
            onChange?.(e.target.value);
            setValue(transform(e.target.value));
          }}
        />
      </label>
    );
  }

  test("user.type fires onChange once per character with the accumulated value", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Controlled onChange={onChange} />);
    const input = screen.getByRole("textbox", { name: "Name" });
    await user.type(input, "hello");
    expect(onChange.mock.calls.map((c) => c[0])).toEqual(["h", "he", "hel", "hell", "hello"]);
    expect(input).toHaveValue("hello");
    expect(screen.getByDisplayValue("hello")).toBe(input);
  });

  test("fireEvent.change with target.value fires exactly one onChange", () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "abc" } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith("abc");
    expect(input).toHaveValue("abc");
  });

  test("fireEvent.change with the current value does not fire onChange (value tracker)", () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "" } });
    expect(onChange).not.toHaveBeenCalled();
  });

  test("a transforming controlled input shows the transformed value while typing", async () => {
    const user = userEvent.setup();
    render(<Controlled transform={(v) => v.toUpperCase()} />);
    const input = screen.getByRole("textbox");
    await user.type(input, "abc");
    expect(input).toHaveValue("ABC");
  });

  test("a controlled input whose state never changes is reset by React after each keystroke", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    function Frozen() {
      return <input aria-label="frozen" value="fixed" onChange={(e) => onChange(e.target.value)} />;
    }
    render(<Frozen />);
    const input = screen.getByRole("textbox", { name: "frozen" });
    await user.type(input, "x");
    expect(onChange).toHaveBeenCalledWith("fixedx");
    expect(input).toHaveValue("fixed");
  });

  test("typing in the middle honors the selection (initialSelectionStart/End)", async () => {
    const user = userEvent.setup();
    function C() {
      const [v, setV] = useState("ac");
      return <input aria-label="mid" value={v} onChange={(e) => setV(e.target.value)} />;
    }
    render(<C />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    await user.type(input, "b", { initialSelectionStart: 1, initialSelectionEnd: 1 });
    expect(input).toHaveValue("abc");
    expect([input.selectionStart, input.selectionEnd]).toEqual([2, 2]);
  });

  test("user.clear empties the input and fires onChange with ''", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    function C() {
      const [v, setV] = useState("prefilled");
      return <input aria-label="c" value={v} onChange={(e) => (onChange(e.target.value), setV(e.target.value))} />;
    }
    render(<C />);
    await user.clear(screen.getByRole("textbox"));
    expect(onChange).toHaveBeenLastCalledWith("");
    expect(screen.getByRole("textbox")).toHaveValue("");
  });

  test("maxLength limits user.type but not programmatic values", async () => {
    const user = userEvent.setup();
    render(<input aria-label="m" maxLength={3} defaultValue="" />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    await user.type(input, "abcdef");
    expect(input).toHaveValue("abc");
    input.value = "abcdef";
    expect(input).toHaveValue("abcdef");
  });

  test("user.paste inserts at the cursor and fires one onChange", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    function C() {
      const [v, setV] = useState("");
      return <input aria-label="p" value={v} onChange={(e) => (onChange(e.target.value), setV(e.target.value))} />;
    }
    render(<C />);
    await user.click(screen.getByRole("textbox"));
    await user.paste("pasted text");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("textbox")).toHaveValue("pasted text");
  });

  test("number input: typing digits, valueAsNumber, and invalid characters", async () => {
    const user = userEvent.setup();
    render(<input type="number" aria-label="n" />);
    const input = screen.getByRole("spinbutton", { name: "n" }) as HTMLInputElement;
    await user.type(input, "12");
    expect(input).toHaveValue(12);
    expect(input.valueAsNumber).toBe(12);
  });
});

describe("checkboxes and radios", () => {
  test("controlled checkbox toggles via user.click and its label", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    function C() {
      const [checked, setChecked] = useState(false);
      return (
        <label>
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => (onChange(e.target.checked), setChecked(e.target.checked))}
          />
          Accept
        </label>
      );
    }
    render(<C />);
    const box = screen.getByRole("checkbox", { name: "Accept" });
    await user.click(box);
    expect(box).toBeChecked();
    await user.click(screen.getByText("Accept"));
    expect(box).not.toBeChecked();
    expect(onChange.mock.calls.map((c) => c[0])).toEqual([true, false]);
  });

  test("fireEvent.click on a controlled checkbox fires onChange", () => {
    const onChange = vi.fn();
    function C() {
      const [checked, setChecked] = useState(false);
      return (
        <input
          type="checkbox"
          aria-label="c"
          checked={checked}
          onChange={(e) => (onChange(e.target.checked), setChecked(e.target.checked))}
        />
      );
    }
    render(<C />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onChange).toHaveBeenCalledWith(true);
    expect(screen.getByRole("checkbox")).toBeChecked();
  });

  test("a controlled checkbox that ignores onChange stays unchecked after a click", async () => {
    const user = userEvent.setup();
    render(<input type="checkbox" aria-label="stuck" checked={false} onChange={() => {}} />);
    const box = screen.getByRole("checkbox");
    await user.click(box);
    expect(box).not.toBeChecked();
  });

  test("controlled radio group: clicking another option moves the selection", async () => {
    const user = userEvent.setup();
    function C() {
      const [value, setValue] = useState("a");
      return (
        <fieldset>
          <legend>Pick</legend>
          {["a", "b", "c"].map((v) => (
            <label key={v}>
              <input
                type="radio"
                name="pick"
                value={v}
                checked={value === v}
                onChange={(e) => setValue(e.target.value)}
              />
              {v.toUpperCase()}
            </label>
          ))}
        </fieldset>
      );
    }
    render(<C />);
    await user.click(screen.getByRole("radio", { name: "B" }));
    expect(screen.getByRole("radio", { name: "B" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "A" })).not.toBeChecked();
    expect(screen.getByRole("radio", { checked: true })).toHaveAttribute("value", "b");
  });

  test("indeterminate checkbox is reported as mixed and cleared by a click", async () => {
    const user = userEvent.setup();
    render(<input type="checkbox" aria-label="all" ref={(el) => void (el && (el.indeterminate = true))} />);
    const box = screen.getByRole("checkbox") as HTMLInputElement;
    expect(box).toBePartiallyChecked();
    await user.click(box);
    expect(box.indeterminate).toBe(false);
    expect(box).toBeChecked();
  });

  test("disabled checkbox ignores user.click", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<input type="checkbox" aria-label="d" disabled onChange={onChange} />);
    await user.click(screen.getByRole("checkbox"));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox")).toBeDisabled();
  });
});

describe("selects and textareas", () => {
  test("controlled select: user.selectOptions and fireEvent.change", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    function C() {
      const [v, setV] = useState("a");
      return (
        <select aria-label="letter" value={v} onChange={(e) => (onChange(e.target.value), setV(e.target.value))}>
          <option value="a">Alpha</option>
          <option value="b">Bravo</option>
          <option value="c">Charlie</option>
        </select>
      );
    }
    render(<C />);
    const select = screen.getByRole("combobox", { name: "letter" });
    await user.selectOptions(select, "b");
    expect(select).toHaveValue("b");
    expect(screen.getByRole("option", { name: "Bravo", selected: true })).toBeInTheDocument();
    fireEvent.change(select, { target: { value: "c" } });
    expect(select).toHaveDisplayValue("Charlie");
    expect(onChange.mock.calls.map((c) => c[0])).toEqual(["b", "c"]);
  });

  test("multiple select: user.selectOptions selects several options", async () => {
    const user = userEvent.setup();
    function C() {
      const [v, setV] = useState<string[]>([]);
      return (
        <select
          aria-label="many"
          multiple
          value={v}
          onChange={(e) => setV(Array.from(e.target.selectedOptions, (o) => o.value))}
        >
          <option value="a">A</option>
          <option value="b">B</option>
          <option value="c">C</option>
        </select>
      );
    }
    render(<C />);
    const select = screen.getByRole("listbox", { name: "many" });
    await user.selectOptions(select, ["a", "c"]);
    expect(select).toHaveValue(["a", "c"]);
    await user.deselectOptions(select, "a");
    expect(select).toHaveValue(["c"]);
  });

  test("controlled textarea with Enter producing newlines", async () => {
    const user = userEvent.setup();
    function C() {
      const [v, setV] = useState("");
      return <textarea aria-label="notes" value={v} onChange={(e) => setV(e.target.value)} />;
    }
    render(<C />);
    const ta = screen.getByRole("textbox", { name: "notes" });
    await user.type(ta, "one{Enter}two");
    expect(ta).toHaveValue("one\ntwo");
  });
});

describe("form submission", () => {
  test("Enter in a text field submits the form (implicit submission) with FormData values", async () => {
    const onSubmit = vi.fn((e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      return Object.fromEntries(new FormData(e.currentTarget));
    });
    const user = userEvent.setup();
    render(
      <form onSubmit={onSubmit}>
        <input name="email" aria-label="email" />
        <input type="checkbox" name="remember" aria-label="remember" defaultChecked />
        <select name="plan" aria-label="plan" defaultValue="pro">
          <option value="free">Free</option>
          <option value="pro">Pro</option>
        </select>
        <button type="submit">Save</button>
      </form>,
    );
    await user.type(screen.getByRole("textbox", { name: "email" }), "a@b.c{Enter}");
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.results[0].value).toEqual({ email: "a@b.c", remember: "on", plan: "pro" });
  });

  test("clicking the submit button submits once with the button as submitter", async () => {
    const submitters: (string | null)[] = [];
    const user = userEvent.setup();
    render(
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submitters.push(((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.name ?? null);
        }}
      >
        <button name="publish" type="submit">
          Publish
        </button>
        <button name="draft" type="submit">
          Draft
        </button>
      </form>,
    );
    await user.click(screen.getByRole("button", { name: "Draft" }));
    expect(submitters).toEqual(["draft"]);
  });

  test("a required empty field blocks submission", async () => {
    const onSubmit = vi.fn((e: FormEvent) => e.preventDefault());
    const onInvalid = vi.fn();
    const user = userEvent.setup();
    render(
      <form onSubmit={onSubmit}>
        <input name="title" aria-label="title" required onInvalid={onInvalid} />
        <button type="submit">Go</button>
      </form>,
    );
    await user.click(screen.getByRole("button", { name: "Go" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onInvalid).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("textbox", { name: "title" })).toBeInvalid();
  });

  test("a type=button button does not submit; a reset button restores defaults", async () => {
    const onSubmit = vi.fn((e: FormEvent) => e.preventDefault());
    const user = userEvent.setup();
    render(
      <form onSubmit={onSubmit}>
        <input aria-label="name" name="name" defaultValue="Ada" />
        <button type="button">Noop</button>
        <button type="reset">Reset</button>
      </form>,
    );
    const input = screen.getByRole("textbox", { name: "name" });
    await user.clear(input);
    await user.type(input, "Grace");
    await user.click(screen.getByRole("button", { name: "Noop" }));
    expect(onSubmit).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(input).toHaveValue("Ada");
  });

  test("toHaveFormValues mirrors the entry list", () => {
    render(
      <form aria-label="profile">
        <input name="username" defaultValue="ada" />
        <input type="checkbox" name="tags" value="x" defaultChecked />
        <input type="checkbox" name="tags" value="y" />
        <input type="radio" name="tier" value="gold" defaultChecked />
        <textarea name="bio" defaultValue="hi" />
      </form>,
    );
    expect(screen.getByRole("form", { name: "profile" })).toHaveFormValues({
      username: "ada",
      tags: ["x"],
      tier: "gold",
      bio: "hi",
    });
  });

  specOnly("jsdom does not implement HTMLFormElement named properties")(
    "event.currentTarget.<name> reads a control through the form's named properties",
    async () => {
      let seen: string | undefined;
      const user = userEvent.setup();
      render(
        <form
          onSubmit={(e) => {
            e.preventDefault();
            seen = (e.currentTarget as unknown as Record<string, HTMLInputElement>).email.value;
          }}
        >
          <input name="email" aria-label="email" defaultValue="x@y.z" />
          <button>Send</button>
        </form>,
      );
      await user.click(screen.getByRole("button"));
      expect(seen).toBe("x@y.z");
    },
  );

  test("React 19 form action receives FormData and useActionState updates", async () => {
    const user = userEvent.setup();
    function Subscribe() {
      const [message, action] = useActionState(
        async (_prev: string, data: FormData) => `Subscribed ${data.get("email")}`,
        "",
      );
      return (
        <form action={action}>
          <input name="email" aria-label="email" />
          <button>Subscribe</button>
          <output>{message}</output>
        </form>
      );
    }
    render(<Subscribe />);
    await user.type(screen.getByRole("textbox", { name: "email" }), "a@b.c");
    await user.click(screen.getByRole("button", { name: "Subscribe" }));
    expect(await screen.findByText("Subscribed a@b.c")).toBeInTheDocument();
    // React resets uncontrolled fields after a successful action.
    expect(screen.getByRole("textbox", { name: "email" })).toHaveValue("");
  });
});

describe("focus and keyboard", () => {
  test("user.tab moves focus through fields in order, firing focus/blur handlers", async () => {
    const log: string[] = [];
    const user = userEvent.setup();
    render(
      <form>
        <input aria-label="first" onFocus={() => log.push("focus first")} onBlur={() => log.push("blur first")} />
        <input aria-label="skip" tabIndex={-1} />
        <input aria-label="disabled" disabled />
        <select aria-label="second" onFocus={() => log.push("focus second")}>
          <option>x</option>
        </select>
        <button type="button" onFocus={() => log.push("focus button")}>
          B
        </button>
      </form>,
    );
    await user.tab();
    expect(screen.getByRole("textbox", { name: "first" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("combobox", { name: "second" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button")).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole("combobox")).toHaveFocus();
    expect(log).toEqual(["focus first", "blur first", "focus second", "focus button", "focus second"]);
  });

  test("Space toggles a focused checkbox; Enter does not", async () => {
    const user = userEvent.setup();
    render(<input type="checkbox" aria-label="k" />);
    const box = screen.getByRole("checkbox");
    box.focus();
    await user.keyboard("{Enter}");
    expect(box).not.toBeChecked();
    await user.keyboard(" ");
    expect(box).toBeChecked();
  });

  test("onKeyDown sees modifier state from a held Shift", async () => {
    const keys: string[] = [];
    const user = userEvent.setup();
    render(<input aria-label="k" onKeyDown={(e) => keys.push(`${e.shiftKey ? "Shift+" : ""}${e.key}`)} />);
    await user.click(screen.getByRole("textbox"));
    await user.keyboard("{Shift>}a{/Shift}b");
    // user-event types the descriptor's key as written ("a"); Shift only sets the modifier state.
    expect(keys).toEqual(["Shift+Shift", "Shift+a", "b"]);
    expect(screen.getByRole("textbox")).toHaveValue("ab");
  });

  test("clicking a label focuses its text input", async () => {
    const user = userEvent.setup();
    render(
      <>
        <label htmlFor="city">City</label>
        <input id="city" />
      </>,
    );
    await user.click(screen.getByText("City"));
    expect(screen.getByLabelText("City")).toHaveFocus();
  });

  test("act + focus(): document.activeElement follows element.focus()", () => {
    render(<input aria-label="f" />);
    act(() => screen.getByRole("textbox").focus());
    expect(document.activeElement).toBe(screen.getByRole("textbox"));
  });
});
