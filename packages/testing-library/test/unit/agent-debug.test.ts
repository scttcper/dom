/**
 * Agent debug mode: `CTRL_DOM_DEBUG=aria|compact` and prettyDOM's `format` option (@ctrl/dom
 * additions, docs/agent-debugging.md).
 *
 * Specs:
 * - Playwright aria snapshot format — https://playwright.dev/docs/aria-snapshots
 * - Accessible name computation — https://w3c.github.io/accname/#mapping_additional_nd_name
 * - HTML element role mappings — https://www.w3.org/TR/html-aam-1.0/#html-element-role-mappings
 * - Spec of record for the defaults: stock @testing-library/dom@10.4.2 on jsdom
 *   (https://github.com/testing-library/dom-testing-library), compared differentially.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { JSDOM } from "jsdom";
import * as stock from "@testing-library/dom";
import * as ours from "../../src/index.ts";

const PAGE = `
  <header class="flex items-center"><nav aria-label="Main"><a href="/" class="text-sm">Home</a></nav></header>
  <main class="mx-auto">
    <h1 class="text-2xl">Checkout</h1>
    <form aria-label="Payment">
      <label for="email">Email address</label><input id="email" type="email" class="rounded border">
      <input type="text" placeholder="Coupon code">
      <button type="submit" class="btn"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>Pay now</button>
      <div aria-hidden="true"><button>Submit</button></div>
      <div class="fake-btn">Submit</div>
      <button aria-pressed="false">Bold</button>
      <p>Total: <strong>$42.00</strong></p>
    </form>
  </main>`;

function ctrlDom(html = PAGE): any {
  document.body.innerHTML = html;
  return document.body;
}

function jsdomBody(html = PAGE): any {
  return new JSDOM(`<!doctype html><html><head></head><body>${html}</body></html>`).window.document.body;
}

function messageOf(run: () => unknown): string {
  try {
    run();
  } catch (e: any) {
    return e.message;
  }
  throw new Error("did not throw");
}

async function asyncMessageOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (e: any) {
    return e.message;
  }
  throw new Error("did not throw");
}

afterEach(() => {
  delete process.env.CTRL_DOM_DEBUG;
  delete process.env.CTRL_DOM_DEBUG_LINES;
});

describe("defaults without CTRL_DOM_DEBUG are byte-identical to stock @testing-library/dom", () => {
  const cases: Array<[string, (lib: typeof stock, c: any) => unknown]> = [
    ["getByRole with a name", (lib, c) => lib.getByRole(c, "button", { name: "Submit" })],
    ["getByRole with a state", (lib, c) => lib.getByRole(c, "button", { name: "Bold", pressed: true })],
    ["getByRole multiple", (lib, c) => lib.getByRole(c, "button")],
    ["getByText", (lib, c) => lib.getByText(c, "Total: $42.00")],
    ["getByLabelText", (lib, c) => lib.getByLabelText(c, "Coupon")],
  ];
  for (const [name, run] of cases) {
    test(`${name}: same error message`, () => {
      expect(messageOf(() => run(ours as any, ctrlDom()))).toBe(messageOf(() => run(stock, jsdomBody())));
    });
  }

  test('prettyDOM with an explicit format: "pretty" equals stock prettyDOM', () => {
    expect(ours.prettyDOM(ctrlDom(), undefined, { format: "pretty" } as any)).toBe(stock.prettyDOM(jsdomBody()));
  });

  test("a CTRL_DOM_DEBUG value that is not a format is ignored", () => {
    process.env.CTRL_DOM_DEBUG = "1";
    expect(ours.prettyDOM(ctrlDom())).toBe(stock.prettyDOM(jsdomBody()));
  });
});

describe("prettyDOM format option", () => {
  test('format: "aria" prints the accessibility snapshot and takes its options', () => {
    ctrlDom(`<ul>${"<li>x</li>".repeat(9)}</ul>`);
    expect(ours.prettyDOM(document.body, undefined, { format: "aria", collapseAfter: 1 } as any)).toBe(
      ours.ariaSnapshot(document.body, { collapseAfter: 1 }),
    );
  });

  test('format: "compact" drops class/style attributes and SVG internals, without colors', () => {
    ctrlDom(
      `<button class="btn" style="color:red" data-state="on"><svg class="i" aria-hidden="true" viewBox="0 0 2 2"><path d="M0 0"/></svg>Go</button>`,
    );
    expect(ours.prettyDOM(document.body, undefined, { format: "compact" } as any)).toBe(
      [
        "<body>",
        "  <button",
        '    data-state="on"',
        "  >",
        "    <svg",
        '      aria-hidden="true"',
        "    />",
        "    Go",
        "  </button>",
        "</body>",
      ].join("\n"),
    );
  });

  test("CTRL_DOM_DEBUG=aria makes it the default for prettyDOM, screen.debug and logDOM", () => {
    process.env.CTRL_DOM_DEBUG = "aria";
    ctrlDom(`<h1>Hi</h1>`);
    expect(ours.prettyDOM()).toBe('- heading "Hi" [level=1]');
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    ours.screen.debug();
    expect(log.mock.calls[0][0]).toMatch(/^- heading "Hi" \[level=1\]/);
    log.mockRestore();
  });
});

describe("query errors under CTRL_DOM_DEBUG=aria", () => {
  test("getByRole lists hidden, role-less and same-role candidates, then the snapshot instead of HTML", () => {
    process.env.CTRL_DOM_DEBUG = "aria";
    const message = messageOf(() => ours.getByRole(ctrlDom(), "button", { name: "Submit" }));
    expect(message).toBe(
      [
        'Unable to find an accessible element with the role "button" and name "Submit"',
        "",
        "Closest matches:",
        '- button "Submit" [hidden]  # hidden: aria-hidden="true" on <div> (or pass { hidden: true })',
        '- text: "Submit"  # in <div>, which has no role: give it role="button" or use getByText',
        '- button "Pay now"  # same role, other name',
        '- button "Bold" [pressed=false]  # same role, other name',
        "",
        "Accessibility snapshot of <body> (CTRL_DOM_DEBUG=aria):",
        "- banner:",
        '  - navigation "Main":',
        '    - link "Home"',
        "- main:",
        '  - heading "Checkout" [level=1]',
        '  - form "Payment":',
        '    - textbox "Email address"',
        "    - textbox",
        '    - button "Pay now"',
        "    - text: Submit",
        '    - button "Bold" [pressed=false]',
        "    - paragraph:",
        '      - text: "Total:"',
        "      - strong: $42.00",
      ].join("\n"),
    );
  });

  test("getByRole names a state mismatch and a same-name element with another role", () => {
    process.env.CTRL_DOM_DEBUG = "aria";
    ctrlDom(`<button aria-pressed="false">Bold</button><a href="/bold">Bold</a>`);
    const message = messageOf(() => ours.getByRole(document.body, "button", { name: "Bold", pressed: true }));
    expect(message).toContain('- button "Bold" [pressed=false]  # role and name match, state is not { pressed: true }');
    expect(message).toContain('- link "Bold"  # same name, role "link"');
  });

  test("getByRole ranks similar names (case, substring) above unrelated ones", () => {
    process.env.CTRL_DOM_DEBUG = "aria";
    ctrlDom(`<button>Cancel</button><button>save changes</button>`);
    const lines = messageOf(() => ours.getByRole(document.body, "button", { name: "Save" })).split("\n");
    expect(lines.slice(2, 5)).toEqual([
      "Closest matches:",
      '- button "save changes"  # similar name',
      '- button "Cancel"  # same role, other name',
    ]);
  });

  test("getByText points at text split across elements and at similar text", () => {
    process.env.CTRL_DOM_DEBUG = "aria";
    const message = messageOf(() => ours.getByText(ctrlDom(), "Total: $42.00"));
    expect(message).toContain(
      '- paragraph: "Total: $42.00"  # text split across child elements of <p>: use a function matcher or getByRole',
    );
    expect(message).toContain('- strong: "$42.00"  # similar text in <strong>');
  });

  test("getByLabelText lists the form controls with their names and placeholder-only fields", () => {
    process.env.CTRL_DOM_DEBUG = "aria";
    const message = messageOf(() => ours.getByLabelText(ctrlDom(), "Coupon"));
    expect(message).toContain(
      [
        "Labelled form controls:",
        '- textbox  # no label, placeholder "Coupon code": use getByPlaceholderText or add a <label>',
        '- textbox "Email address"  # labelled control',
      ].join("\n"),
    );
  });

  test("multiple matches print each element as its snapshot line", () => {
    process.env.CTRL_DOM_DEBUG = "aria";
    const message = messageOf(() => ours.getByRole(ctrlDom(), "textbox"));
    expect(message).toContain(
      ["Here are the matching elements:", "", '- textbox "Email address"', "- textbox", ""].join("\n"),
    );
    expect(message).not.toContain("<input");
  });

  test("findBy* timeouts carry the candidates and print the snapshot once", async () => {
    process.env.CTRL_DOM_DEBUG = "aria";
    ctrlDom();
    const message = await asyncMessageOf(() =>
      ours.findByRole(document.body, "button", { name: /submit/i }, { timeout: 50 }),
    );
    expect(message).toContain("Closest matches:");
    expect(message.split("Accessibility snapshot of").length).toBe(2);
  });

  test("waitFor timeouts with a plain assertion error append the snapshot", async () => {
    process.env.CTRL_DOM_DEBUG = "aria";
    ctrlDom(`<h1>Hi</h1>`);
    const message = await asyncMessageOf(() =>
      ours.waitFor(
        () => {
          throw new Error("nope");
        },
        { timeout: 50 },
      ),
    );
    expect(message).toBe(
      ["nope", "", "Accessibility snapshot of the document (CTRL_DOM_DEBUG=aria):", '- heading "Hi" [level=1]'].join(
        "\n",
      ),
    );
  });

  test("CTRL_DOM_DEBUG_LINES bounds the snapshot in errors", () => {
    process.env.CTRL_DOM_DEBUG = "aria";
    process.env.CTRL_DOM_DEBUG_LINES = "2";
    const message = messageOf(() => ours.getByRole(ctrlDom(), "slider"));
    expect(
      message.endsWith(
        ["- banner:", '  - navigation "Main":', "# … 12 more lines (raise maxLines or CTRL_DOM_DEBUG_LINES)"].join(
          "\n",
        ),
      ),
    ).toBe(true);
  });
});

describe("query errors under CTRL_DOM_DEBUG=compact", () => {
  test("the candidates stay; the context is HTML without class/style/SVG internals", () => {
    process.env.CTRL_DOM_DEBUG = "compact";
    const message = messageOf(() => ours.getByRole(ctrlDom(), "button", { name: "Submit" }));
    expect(message).toContain("Closest matches:");
    expect(message).toContain("DOM of <body> without class/style/SVG internals (CTRL_DOM_DEBUG=compact):\n<body>");
    expect(message).not.toContain("class=");
    expect(message).not.toContain("<path");
  });
});

describe("diffAriaSnapshots", () => {
  test("shows removed and added lines under their unchanged parents", () => {
    ctrlDom(
      `<nav aria-label="Main"><button aria-expanded="false">Menu</button></nav><main><h1>Home</h1><p>a</p><p>b</p></main>`,
    );
    const before = ours.ariaSnapshot();
    document.querySelector("button")!.setAttribute("aria-expanded", "true");
    document
      .querySelector("nav")!
      .insertAdjacentHTML("beforeend", `<ul role="menu"><li role="menuitem">Settings</li></ul>`);
    expect(ours.diffAriaSnapshots(before, ours.ariaSnapshot())).toBe(
      [
        '  - navigation "Main":',
        '-   - button "Menu" [expanded=false]',
        '+   - button "Menu" [expanded]',
        "+   - menu:",
        '+     - menuitem "Settings"',
      ].join("\n"),
    );
  });

  test("skipped unchanged lines between changes print as …", () => {
    expect(ours.diffAriaSnapshots("- a\n- b\n- c\n- d", "- A\n- b\n- c\n- D")).toBe(
      ["- - a", "+ - A", "  …", "- - d", "+ - D"].join("\n"),
    );
  });

  test("equal snapshots print (no changes)", () => {
    expect(ours.diffAriaSnapshots("- a", "- a")).toBe("(no changes)");
  });
});
