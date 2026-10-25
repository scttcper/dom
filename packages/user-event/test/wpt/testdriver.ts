/**
 * A `test_driver` (https://web-platform-tests.org/writing-tests/testdriver.html) for the WPT
 * harness (packages/dom/test/wpt/harness.ts, `RunOptions.testdriver`) backed by @ctrl/dom/user-event.
 *
 * WebDriver input is emulated with user-event's own pointer/keyboard simulation, so tests that
 * drive sequential focus navigation (`send_keys(el, "")` = Tab) observe user-event's tab
 * order, which follows upstream @testing-library/user-event rather than the HTML spec. That is
 * deliberate: drop-in compatibility with user-event wins (CLAUDE.md priorities), and WPT
 * failures caused by it are expected.
 *
 * Supported: `click`, `send_keys`, `bless`, and `Actions` with key actions and pointer actions
 * whose `origin` is an element. There is no layout, so pointer moves to viewport coordinates
 * (and `getBoundingClientRect()`-derived positions) cannot be hit-tested and reject.
 *
 * WebDriver key codes: https://w3c.github.io/webdriver/#keyboard-actions
 */
import type * as dom from "@ctrl/dom";
import { userEvent } from "../../src/index.ts";

/** WebDriver's normalized key values (https://w3c.github.io/webdriver/#keyboard-actions) → user-event key names. */
const KEYS: Record<string, string> = {
  "": "Cancel",
  "": "Help",
  "": "Backspace",
  "": "Tab",
  "": "Clear",
  "": "Enter",
  "": "Enter",
  "": "Shift",
  "": "Control",
  "": "Alt",
  "": "Pause",
  "": "Escape",
  "": " ",
  "": "PageUp",
  "": "PageDown",
  "": "End",
  "": "Home",
  "": "ArrowLeft",
  "": "ArrowUp",
  "": "ArrowRight",
  "": "ArrowDown",
  "": "Insert",
  "": "Delete",
  "": "Meta",
  "": "Shift",
  "": "Control",
  "": "Alt",
  "": "Meta",
};
const MODIFIERS = new Set(["Shift", "Control", "Alt", "Meta"]);

/** One key in user-event's `keyboard()` syntax; `suffix` is "" (press+release), ">" (hold) or "/" (release). */
function keyDescriptor(key: string, mode: "" | ">" | "/"): string {
  const name = KEYS[key] ?? key;
  if (name.length === 1 && mode === "") return name === "{" || name === "[" ? name + name : name;
  // `{` `[` in braces are fine as key values except for the delimiters themselves.
  return mode === "/" ? `{/${name}}` : `{${name}${mode}}`;
}

type Step =
  | { kind: "key"; key: string; down: boolean }
  | { kind: "move"; x: number; y: number; origin: unknown; pointer: string }
  | { kind: "button"; button: number; down: boolean; pointer: string }
  | { kind: "pause"; ms: number };

export function userEventTestDriver(window: dom.Window, document: dom.Document): Record<string, unknown> {
  const user = userEvent.setup({ document: document as never });
  const ElementCtor = (window as unknown as { Element: abstract new () => dom.Element }).Element;

  /** https://w3c.github.io/webdriver/#element-send-keys steps: focus the element unless it is already active, then type. */
  async function send_keys(element: dom.Element, keys: string): Promise<void> {
    if ((document as unknown as { activeElement: unknown }).activeElement !== element && element !== document.body && element !== document.documentElement) {
      (element as unknown as { focus(): void }).focus();
    }
    let text = "";
    const held: string[] = [];
    for (const ch of keys) {
      if (ch === "") {
        // NULL releases the held modifiers.
        for (const m of held.splice(0).reverse()) text += keyDescriptor(m, "/");
        continue;
      }
      const name = KEYS[ch] ?? ch;
      if (MODIFIERS.has(name)) {
        if (!held.includes(ch)) {
          held.push(ch);
          text += keyDescriptor(ch, ">");
        }
        continue;
      }
      text += keyDescriptor(ch, "");
    }
    for (const m of held.reverse()) text += keyDescriptor(m, "/");
    if (text !== "") await user.keyboard(text);
  }

  class Actions {
    readonly ButtonType = { LEFT: 0, MIDDLE: 1, RIGHT: 2, BACK: 3, FORWARD: 4 };
    #steps: Step[] = [];
    #pointer = "mouse";
    #pointerTypes = new Map<string, string>([["mouse", "mouse"]]);

    addPointer(name: string, type = "mouse"): this {
      this.#pointerTypes.set(name, type);
      this.#pointer = name;
      return this;
    }
    addKeyboard(): this {
      return this;
    }
    setPointer(name: string): this {
      this.#pointer = name;
      return this;
    }
    setKeyboard(): this {
      return this;
    }
    keyDown(key: string): this {
      this.#steps.push({ kind: "key", key, down: true });
      return this;
    }
    keyUp(key: string): this {
      this.#steps.push({ kind: "key", key, down: false });
      return this;
    }
    pointerMove(x: number, y: number, options: { origin?: unknown } = {}): this {
      this.#steps.push({ kind: "move", x, y, origin: options.origin ?? "viewport", pointer: this.#pointer });
      return this;
    }
    pointerDown(options: { button?: number } = {}): this {
      this.#steps.push({ kind: "button", button: options.button ?? 0, down: true, pointer: this.#pointer });
      return this;
    }
    pointerUp(options: { button?: number } = {}): this {
      this.#steps.push({ kind: "button", button: options.button ?? 0, down: false, pointer: this.#pointer });
      return this;
    }
    pause(ms = 0): this {
      this.#steps.push({ kind: "pause", ms });
      return this;
    }
    scroll(): this {
      throw new Error("test_driver.Actions.scroll needs layout");
    }

    async send(): Promise<void> {
      let target: dom.Element | null = null;
      for (const step of this.#steps) {
        switch (step.kind) {
          case "key":
            await user.keyboard(keyDescriptor(step.key, step.down ? ">" : "/"));
            break;
          case "pause":
            await new Promise((r) => setTimeout(r, step.ms));
            break;
          case "move": {
            if (!(step.origin instanceof ElementCtor)) {
              throw new Error("test_driver.Actions: pointer moves to viewport coordinates need layout (no hit testing here)");
            }
            target = step.origin as dom.Element;
            // Touch pointers have no hover position; the press carries the target.
            if (this.#pointerTypes.get(step.pointer) !== "touch") await user.pointer({ target: target as never });
            break;
          }
          case "button": {
            if (target === null) throw new Error("test_driver.Actions: pointer button action before any pointerMove");
            const key = this.#pointerKey(step.pointer, step.button);
            await user.pointer({ keys: step.down ? `[${key}>]` : `[/${key}]`, target: target as never });
            break;
          }
        }
      }
    }

    #pointerKey(pointer: string, button: number): string {
      if (this.#pointerTypes.get(pointer) === "touch") return "TouchA";
      return ["MouseLeft", "MouseMiddle", "MouseRight", "MouseBack", "MouseForward"][button] ?? "MouseLeft";
    }
  }

  return {
    click: (element: dom.Element) => user.click(element as never),
    send_keys,
    bless: async (_intent: string, action?: () => unknown) => action?.(),
    Actions,
    set_test_context() {},
    message_test() {
      return Promise.resolve();
    },
  };
}
