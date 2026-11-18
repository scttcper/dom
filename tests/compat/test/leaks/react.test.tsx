// @vitest-environment ctrl-dom
/**
 * Retention after Testing Library cleanup: render → interact → cleanup must leave nothing of the
 * rendered tree reachable (elements, React roots/fibers, listeners, per-node caches, waitFor
 * observers), including the containers created by render().
 *
 * Specs: ECMAScript WeakRef / FinalizationRegistry liveness
 *   https://tc39.es/ecma262/#sec-weak-ref-objects — an object is collectable once no strong
 *   reference chain reaches it; the suite forces GC (--expose-gc) between macrotasks.
 * Testing Library cleanup: https://testing-library.com/docs/react-testing-library/api#cleanup
 * React createRoot / root.unmount(): https://react.dev/reference/react-dom/client/createRoot#root-unmount
 */
import { Suspense, createContext, lazy, use, useContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { describe, expect, test, vi } from "vitest";
import { cleanup, render, renderHook, screen, waitFor, act, fireEvent } from "@ctrl/dom/react";
import { PointerEventsCheckLevel, userEvent } from "@ctrl/dom/user-event";
import { collectGarbage, Tracker, heapSlope } from "./gc.ts";
import { getByRole, prettyDOM } from "@ctrl/dom/testing-library";
import { createWindow, currentWindowOrNull, setCurrentWindow } from "@ctrl/dom";

// @ctrl/dom/user-event declares its own structural DOM types; @ctrl/dom/react returns @ctrl/dom's.
type User = Record<
  "type" | "click" | "keyboard" | "selectOptions" | "tab" | "hover" | "pointer" | "upload",
  (...args: any[]) => Promise<void>
>;
const setupUser = (): User => userEvent.setup() as unknown as User;

const Theme = createContext("light");

function Field({ label, name }: { label: string; name: string }) {
  const [value, setValue] = useState("");
  return (
    <label>
      {label}
      <input
        name={name}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        style={{ color: value ? "red" : "blue" }}
      />
    </label>
  );
}

function Modal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const theme = useContext(Theme);
  if (!open) return null;
  return createPortal(
    <div role="dialog" aria-label={`Settings ${theme}`}>
      <button onClick={onClose}>Close</button>
    </div>,
    document.body,
  );
}

function App() {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(0);
  useEffect(() => {
    const onResize = () => setSaved((s) => s);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return (
    <Theme value="dark">
      <form
        aria-label="Profile"
        onSubmit={(e) => {
          e.preventDefault();
          setTimeout(() => setSaved((s) => s + 1), 5);
        }}
      >
        <Field label="First name" name="first" />
        <Field label="Email" name="email" />
        <select aria-label="Role" defaultValue="b">
          <option value="a">A</option>
          <option value="b">B</option>
        </select>
        <button type="submit">Save</button>
        <button type="button" onClick={() => setOpen(true)}>
          Open
        </button>
        {saved > 0 && <p role="status">Saved {saved}</p>}
      </form>
      <Modal open={open} onClose={() => setOpen(false)} />
    </Theme>
  );
}

let resolveData: (v: string) => void = () => {};
function makeLazy() {
  return lazy(async () => ({ default: () => <p>lazy loaded</p> }));
}
function Data({ promise }: { promise: Promise<string> }) {
  return <p>data {use(promise)}</p>;
}

describe("render → interact → cleanup — https://testing-library.com/docs/react-testing-library/api#cleanup", () => {
  test("typing releases the original field when an input handler replaces it", async () => {
    const tracker = new Tracker();
    const paused = Promise.withResolvers<void>();
    const resume = Promise.withResolvers<void>();
    const next = document.body.appendChild(document.createElement("input"));
    const released: string[] = [];
    next.addEventListener("keyup", (event) => released.push(event.key));
    let replaced = false;
    const user = userEvent.setup({
      advanceTimers() {
        if (replaced) {
          paused.resolve();
          return resume.promise;
        }
      },
    }) as unknown as User;
    const typing = (() => {
      const field = tracker.track("original field", document.body.appendChild(document.createElement("input")));
      field.addEventListener("input", () => {
        next.focus();
        field.remove();
        replaced = true;
      });
      return user.type(field, "{Shift>}abc");
    })();
    try {
      await Promise.race([paused.promise, typing]);
      expect(replaced).toBe(true);
      expect(next.value).toBe("");
      expect(await tracker.alive()).toEqual({});
    } finally {
      resume.resolve();
      await typing;
      next.remove();
    }
    expect(next.value).toBe("bc");
    expect(released.at(-1)).toBe("Shift");
  });

  test("a pending pointer sequence releases a removed target after moving on", async () => {
    const tracker = new Tracker();
    const paused = Promise.withResolvers<void>();
    const resume = Promise.withResolvers<void>();
    let waits = 0;
    const user = userEvent.setup({
      advanceTimers() {
        if (++waits === 3) {
          paused.resolve();
          return resume.promise;
        }
      },
    }) as unknown as User;
    const sequence = (() => {
      const target = tracker.track("hover target", document.body.appendChild(document.createElement("div")));
      target.addEventListener("pointerover", () => target.remove());
      return user.pointer([{ target }, { target: document.body }, { target: document.body }]);
    })();
    try {
      await Promise.race([
        paused.promise,
        sequence.then(() => {
          throw new Error("Sequence finished before pause");
        }),
      ]);
      expect(await tracker.alive()).toEqual({});
    } finally {
      resume.resolve();
      await sequence;
    }
  });

  test("resetting a form or changing input type releases uploaded files while the controls stay mounted", async () => {
    const tracker = new Tracker();
    const user = setupUser();
    render(
      <form>
        <input type="file" aria-label="Invoice" required />
        <input type="file" aria-label="Receipt" />
      </form>,
    );
    const invoice = screen.getByLabelText("Invoice") as HTMLInputElement;
    const receipt = screen.getByLabelText("Receipt") as HTMLInputElement;
    await (async () => {
      for (const input of [invoice, receipt]) {
        const file = tracker.track("upload", new File(["attachment"], "attachment.txt"));
        await user.upload(input, file);
        expect(input.files!.item(0)).toBe(file);
        tracker.track("file list", input.files!);
      }
    })();
    expect(invoice.validity.valueMissing).toBe(false);
    receipt.setAttribute("type", "text");
    invoice.form!.reset();
    expect(await tracker.alive()).toEqual({});
    expect(receipt.files).toBeNull();
    expect(invoice.files).toHaveLength(0);
    expect(invoice.value).toBe("");
    expect(invoice.validity.valueMissing).toBe(true);
    cleanup();
  });

  test("a rejected upload releases its files while the input and user stay active", async () => {
    const tracker = new Tracker();
    const user = setupUser();
    render(<input type="file" aria-label="Attachment" style={{ pointerEvents: "none" }} />);
    const input = screen.getByLabelText("Attachment") as HTMLInputElement;
    await (async () => {
      const file = tracker.track("rejected file", new File(["photo"], "photo.jpg"));
      const message = await user.upload(input, file).catch((error: Error) => error.message);
      expect(message).toMatch(/pointer-events/);
    })();
    expect(await tracker.alive()).toEqual({});
    input.style.pointerEvents = "auto";
    await user.click(input);
    expect(input.files).toHaveLength(0);
  });

  test("a blocked pointer target releases the ancestors used in its diagnostic", async () => {
    const tracker = new Tracker();
    const button = document.createElement("button");
    const user = userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.EachTarget }) as unknown as User;
    // Vitest retains errors passed to .rejects, including the pointer dispatch stack.
    const clickMessage = () => user.click(button).catch((error: Error) => error.message);
    const style = vi.spyOn(window, "getComputedStyle").mockImplementation((el) => {
      return { pointerEvents: el === button ? "inherit" : "none" } as CSSStyleDeclaration;
    });
    try {
      await (async () => {
        const parent = tracker.track("previous parent", document.body.appendChild(document.createElement("section")));
        parent.id = "previous";
        parent.appendChild(button);
        const first = await clickMessage();
        expect(first).toMatch(/SECTION#previous[^\n]*\n +BUTTON/);
        expect(await clickMessage()).toBe(first);
        button.remove();
        parent.remove();
      })();
    } finally {
      style.mockRestore();
    }
    expect(await tracker.alive()).toEqual({});
    expect(await clickMessage()).toContain("BUTTON");
  });

  test("removing a focused DOM input releases the keyboard target without another action", async () => {
    const user = setupUser();
    const tracker = new Tracker();
    await (async () => {
      const input = tracker.track("focused input", document.body.appendChild(document.createElement("input")));
      input.focus();
      await user.keyboard("x");
      input.remove();
    })();
    expect(await tracker.alive()).toEqual({});
    await user.keyboard("y");
  });

  test("the keyboard releases a blurred input after unmount while the user stays active", async () => {
    const tracker = new Tracker();
    const user = setupUser();
    await (async () => {
      const view = render(<input />);
      const input = tracker.track("keyboard target", view.getByRole("textbox"));
      input.focus();
      await user.keyboard("x");
      input.blur();
      cleanup();
    })();
    expect(await tracker.alive()).toEqual({});
    await user.keyboard("y");
  });

  test("an effect cleanup error still releases every root and container", async () => {
    const tracker = new Tracker();
    const failure = new Error("unmount failed");
    const unmounted: string[] = [];
    function Item({ name }: { name: string }) {
      useEffect(
        () => () => {
          unmounted.push(name);
          if (name === "first") throw failure;
        },
        [name],
      );
      return <p>{name}</p>;
    }
    for (const name of ["first", "second"]) {
      tracker.track(name, render(<Item name={name} />).container);
    }
    expect(cleanup).toThrow(failure);
    expect(unmounted).toEqual(["first", "second"]);
    expect(document.body.childNodes.length).toBe(0);
    expect(await tracker.alive()).toEqual({});
  });

  test("unmount releases initial props and manually detached containers before cleanup", async () => {
    const tracker = new Tracker();
    function Row({ data }: { data: { name: string } }) {
      return <p>{data.name}</p>;
    }
    for (const detach of [false, true]) {
      (() => {
        const data = tracker.track("initial props", { name: "row" });
        const view = render(<Row data={data} />);
        view.unmount();
        if (detach) tracker.track("detached container", view.container).remove();
      })();
    }
    expect(document.body.childNodes.length).toBe(1);
    expect(await tracker.alive()).toEqual({});
    cleanup();
    expect(document.body.childNodes.length).toBe(0);
  });

  test("a released mouse button lets its unmounted target be collected while the user stays active", async () => {
    const tracker = new Tracker();
    const user = setupUser();
    await (async () => {
      const view = render(<button>Remove</button>);
      const button = tracker.track("clicked button", view.getByRole("button"));
      await user.click(button);
      cleanup();
    })();
    expect(await tracker.alive()).toEqual({});
    await user.click(document.body);
  });

  test.each(["[MouseLeft>]", "[TouchA]"])(
    "pointer state after %s releases the target and explicit caret",
    async (keys) => {
      const tracker = new Tracker();
      const user = setupUser();
      await (async () => {
        const view = render(<p>Item</p>);
        const target = tracker.track("pointer target", view.getByText("Item"));
        const node = tracker.track("caret", target.firstChild!);
        await user.pointer({ keys, target, node, offset: 1 });
        cleanup();
      })();
      expect(await tracker.alive()).toEqual({});
      if (keys === "[MouseLeft>]") await user.pointer("[/MouseLeft]");
      await user.click(document.body);
    },
  );

  test("a drag across calls keeps its anchor while its target is still reachable", async () => {
    const user = setupUser();
    const view = render(<p>example</p>);
    const target = view.getByText("example");
    await user.pointer({ keys: "[MouseLeft>]", target, offset: 2 });
    document.getSelection()!.removeAllRanges();
    await collectGarbage();
    await user.pointer([{ offset: 5 }, "[/MouseLeft]"]);
    expect(document.getSelection()!.toString()).toBe("amp");
  });

  test("rendered elements, containers, React roots, portals and Suspense trees are collectable after cleanup()", async () => {
    const tracker = new Tracker();
    for (let i = 0; i < 4; i++) {
      await (async () => {
        const user = setupUser();
        const view = render(<App />);
        tracker.track("container", view.container);
        const first = screen.getByRole("textbox", { name: "First name" });
        tracker.track("input", first);
        tracker.track("form", screen.getByRole("form", { name: "Profile" }));
        await user.type(first, "Ada");
        await user.click(screen.getByRole("textbox", { name: "Email" }));
        await user.keyboard("a@b.c");
        await user.selectOptions(screen.getByRole("combobox", { name: "Role" }), "a");
        await user.click(screen.getByRole("button", { name: "Open" }));
        const dialog = await screen.findByRole("dialog", { name: "Settings dark" });
        tracker.track("portal", dialog);
        expect(dialog).toHaveProperty("isConnected", true);
        await user.click(screen.getByRole("button", { name: "Save" }));
        tracker.track("status", await screen.findByRole("status"));
        await user.tab();
        await user.hover(screen.getByRole("button", { name: "Close" }));
        fireEvent.click(screen.getByRole("button", { name: "Close" }));
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        // React keeps its root on the container (_reactRootContainer / __reactContainer$*).
        for (const key of Object.keys(view.container)) {
          const value = (view.container as unknown as Record<string, unknown>)[key];
          if (key.startsWith("__reactContainer") && typeof value === "object" && value !== null)
            tracker.track("fiber", value);
        }
        // Suspense: lazy component and use(promise).
        const Lazy = makeLazy();
        const promise = new Promise<string>((r) => (resolveData = r));
        await act(async () => {
          render(
            <Suspense fallback={<p>loading</p>}>
              <Lazy />
              <Data promise={promise} />
            </Suspense>,
          );
        });
        await act(async () => {
          resolveData(`#${i}`);
          await promise;
        });
        tracker.track("suspended", await screen.findByText(`data #${i}`));
        cleanup();
      })();
    }
    expect(document.body.childNodes.length).toBe(0);
    expect(await tracker.alive()).toEqual({});
  });

  test("renderHook results and waitFor observers are collectable after cleanup()", async () => {
    const tracker = new Tracker();
    for (let i = 0; i < 4; i++) {
      await (async () => {
        const { result } = renderHook(() => {
          const [n, setN] = useState(0);
          useEffect(() => {
            const id = setTimeout(() => setN(1), 2);
            return () => clearTimeout(id);
          }, []);
          return { n, box: { payload: new Array(100).fill(i) } };
        });
        tracker.track("hook-result", result.current.box);
        await waitFor(() => expect(result.current.n).toBe(1));
        const el = document.createElement("div");
        document.body.append(el);
        tracker.track("detached", el);
        setTimeout(() => el.remove(), 3);
        await waitFor(() => expect(el.isConnected).toBe(false));
        cleanup();
      })();
    }
    expect(await tracker.alive()).toEqual({});
  });
});

describe("module-level state of the testing stack", () => {
  test("prettyDOM's element-constructor cache does not keep custom element classes alive", async () => {
    const tracker = new Tracker();
    const previous = currentWindowOrNull();
    for (let i = 0; i < 3; i++) {
      (() => {
        // A window of its own: its registry (which keeps definitions by design) goes with it.
        const w = createWindow() as unknown as Record<string, any>;
        const Cls = class extends w.HTMLElement {};
        w.customElements.define("leak-pretty", Cls);
        tracker.track("custom element class", Cls);
        const el = w.document.createElement("leak-pretty");
        w.document.body.append(el);
        prettyDOM(w.document.body);
        expect(() => getByRole(w.document.body, "dialog")).toThrow(); // the error message prints the DOM
        w.close();
      })();
    }
    setCurrentWindow(previous);
    expect(await tracker.alive()).toEqual({});
  });
});

describe("heap slope — render/unmount churn", () => {
  test("heap-after-GC stays flat over render → query → type → cleanup cycles", async () => {
    const user = setupUser();
    const { bytesPerCycle, points } = await heapSlope(
      async () => {
        render(<App />);
        await user.type(screen.getByRole("textbox", { name: "First name" }), "x");
        screen.getByRole("button", { name: "Save" });
        cleanup();
      },
      { warmup: 500, samples: 6, every: 150 },
    );
    // A leaked tree of this App is several KB; noise is well below 1 KB/cycle.
    if (process.env.LEAK_DEBUG)
      console.log(points.map(([x, y]) => `${x}:${(y / 1024).toFixed(0)}K`).join(" "), bytesPerCycle);
    // A leaked App tree is several KB per cycle; post-warmup noise is well under 512 B.
    expect(bytesPerCycle).toBeLessThan(512);
  });
});
