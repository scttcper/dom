// @vitest-environment ctrl-dom
/**
 * Retention after Testing Library cleanup: render → interact → cleanup must leave nothing of the
 * rendered tree reachable (elements, containers, React roots/fibers, listeners, per-node caches,
 * waitFor observers).
 *
 * Specs: ECMAScript WeakRef / FinalizationRegistry liveness
 *   https://tc39.es/ecma262/#sec-weak-ref-objects — an object is collectable once no strong
 *   reference chain reaches it; the suite forces GC (--expose-gc) between macrotasks.
 * Testing Library cleanup: https://testing-library.com/docs/react-testing-library/api#cleanup
 * React createRoot / root.unmount(): https://react.dev/reference/react-dom/client/createRoot#root-unmount
 */
import { Suspense, createContext, lazy, use, useContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { describe, expect, test } from "vitest";
import { cleanup, render, renderHook, screen, waitFor, act, fireEvent } from "@ctrl/dom/react";
import { userEvent } from "@ctrl/dom/user-event";
import { Tracker, heapSlope } from "./gc.ts";
import { getByRole, prettyDOM } from "@ctrl/dom/testing-library";
import { createWindow, currentWindowOrNull, setCurrentWindow } from "@ctrl/dom";

// @ctrl/dom/user-event declares its own structural DOM types; @ctrl/dom/react returns @ctrl/dom's.
type User = Record<"type" | "click" | "keyboard" | "selectOptions" | "tab" | "hover", (...args: any[]) => Promise<void>>;
const setupUser = (): User => userEvent.setup() as unknown as User;

const Theme = createContext("light");

function Field({ label, name }: { label: string; name: string }) {
  const [value, setValue] = useState("");
  return (
    <label>
      {label}
      <input name={name} value={value} onChange={(e) => setValue(e.target.value)} style={{ color: value ? "red" : "blue" }} />
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
          if (key.startsWith("__reactContainer") && typeof value === "object" && value !== null) tracker.track("fiber", value);
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
    if (process.env.LEAK_DEBUG) console.log(points.map(([x, y]) => `${x}:${(y / 1024).toFixed(0)}K`).join(" "), bytesPerCycle);
    // A leaked App tree is several KB per cycle; post-warmup noise is well under 512 B.
    expect(bytesPerCycle).toBeLessThan(512);
  });
});
