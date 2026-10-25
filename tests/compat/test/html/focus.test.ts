/**
 * Focus: focusable areas, the focusing/unfocusing steps and focus event order — differential
 * against jsdom.
 *
 * Spec: HTML Standard §6.6 "Focus"
 *   - focusable area:                     https://html.spec.whatwg.org/#focusable-area
 *   - tabindex focus flag:                https://html.spec.whatwg.org/#tabindex-focus-flag
 *   - tabIndex IDL default:               https://html.spec.whatwg.org/#dom-tabindex
 *   - focusing steps:                     https://html.spec.whatwg.org/#focusing-steps
 *   - unfocusing steps:                   https://html.spec.whatwg.org/#unfocusing-steps
 *   - focus update steps:                 https://html.spec.whatwg.org/#focus-update-steps
 *   - fire a focus event:                 https://html.spec.whatwg.org/#fire-a-focus-event
 *   - focus fixup rule:                   https://html.spec.whatwg.org/#focus-fixup-rule
 *   - disabled form controls:             https://html.spec.whatwg.org/#concept-fe-disabled
 *   - activeElement:                      https://html.spec.whatwg.org/#dom-documentorshadowroot-activeelement
 *
 * user-event's `click`/`tab`, Testing Library's `toHaveFocus` and every focus-trap / roving
 * tabindex component depend on these.
 */
import { describe } from "vitest";
import { describeNode, differential, type AnyWindow } from "../../src/harness.ts";

function tryFocus(w: AnyWindow, html: string): Record<string, string> {
  w.document.body.innerHTML = html;
  const out: Record<string, string> = {};
  for (const el of Array.from(w.document.querySelectorAll("[data-k]") as ArrayLike<AnyWindow>)) {
    el.focus();
    out[el.dataset.k] = w.document.activeElement === el ? "focused" : "-";
    w.document.activeElement?.blur?.();
  }
  return out;
}

function logFocusEvents(w: AnyWindow, ...els: AnyWindow[]): string[] {
  const log: string[] = [];
  for (const el of els) {
    for (const type of ["focus", "blur", "focusin", "focusout"]) {
      el.addEventListener(type, (e: AnyWindow) => {
        log.push(
          `${type}@${describeNode(e.target)} related=${describeNode(e.relatedTarget)} bubbles=${e.bubbles} composed=${e.composed} ${e.constructor.name}`,
        );
      });
    }
  }
  return log;
}

describe("focusable area — https://html.spec.whatwg.org/#focusable-area", () => {
  differential("form controls, links with href, and elements with a tabindex are focusable", (w) =>
    tryFocus(
      w,
      `<input data-k=input><button data-k=button>b</button><select data-k=select></select><textarea data-k=textarea></textarea>
       <a href="#x" data-k=link>l</a><a data-k=anchorNoHref>n</a><div data-k=div>d</div><div tabindex="-1" data-k=divTabindex>t</div>
       <span tabindex="0" data-k=spanTabindex0>s</span><div tabindex="bogus" data-k=divBadTabindex>x</div>`,
    ),
  );

  differential(
    "disabled controls (own attribute or disabled fieldset) are not focusable; the first legend's are",
    (w) =>
      tryFocus(
        w,
        `<input disabled data-k=disabledInput><button disabled data-k=disabledButton>b</button>
       <fieldset disabled><legend><input data-k=inLegend></legend><input data-k=inFieldset></fieldset>`,
      ),
  );

  differential("input type=hidden is not focusable; a disabled element with tabindex is still not focusable", (w) =>
    tryFocus(w, `<input type=hidden data-k=hidden><input disabled tabindex=0 data-k=disabledTabindex>`),
  );

  differential("disconnected elements are not focusable", (w) => {
    const input = w.document.createElement("input");
    input.focus();
    return describeNode(w.document.activeElement);
  });
});

describe("tabIndex IDL attribute — https://html.spec.whatwg.org/#dom-tabindex", () => {
  differential(
    "defaults: 0 for interactive elements, -1 otherwise; the attribute wins when valid",
    (w) => {
      w.document.body.innerHTML = `<a id=a></a><a id=ah href=x></a><button id=b></button><input id=i><select id=s></select><textarea id=t></textarea>
      <div id=d></div><div id=dt tabindex="3"></div><div id=dbad tabindex="x"></div><span id=neg tabindex="-5"></span>`;
      const out: Record<string, number> = {};
      for (const el of Array.from(w.document.querySelectorAll("[id]") as ArrayLike<AnyWindow>))
        out[el.id] = el.tabIndex;
      return out;
    },
    {
      jsdomFix: {
        fix: (o) => ({ ...o, dbad: -1 }),
        spec: "https://html.spec.whatwg.org/#dom-tabindex",
        reason:
          "The getter returns the default (-1 for a div) when parsing the attribute as an integer fails; jsdom returns 0 for an unparsable tabindex.",
      },
    },
  );

  differential("setter writes the attribute", (w) => {
    const el = w.document.createElement("div");
    el.tabIndex = 2;
    const a = el.getAttribute("tabindex");
    el.tabIndex = -1;
    return { a, b: el.getAttribute("tabindex"), read: el.tabIndex };
  });
});

describe("focus update steps — https://html.spec.whatwg.org/#focus-update-steps", () => {
  differential(
    "moving focus: blur, focusout on the old element, then focus, focusin on the new one, with relatedTarget",
    (w) => {
      w.document.body.innerHTML = "<input id=a><input id=b>";
      const a = w.document.getElementById("a");
      const b = w.document.getElementById("b");
      a.focus();
      const log = logFocusEvents(w, a, b);
      b.focus();
      return log;
    },
  );

  differential("focusin and focusout bubble to ancestors; focus and blur do not", (w) => {
    w.document.body.innerHTML = "<div id=wrap><input id=a><input id=b></div>";
    const wrap = w.document.getElementById("wrap");
    const seen: string[] = [];
    for (const type of ["focus", "blur", "focusin", "focusout"])
      wrap.addEventListener(type, (e: AnyWindow) => seen.push(`${type}@${e.target.id}`));
    w.document.getElementById("a").focus();
    w.document.getElementById("b").focus();
    return seen;
  });

  differential("focusing the already-focused element fires nothing", (w) => {
    w.document.body.innerHTML = "<input id=a>";
    const a = w.document.getElementById("a");
    a.focus();
    const log = logFocusEvents(w, a);
    a.focus();
    return log;
  });

  differential("a focus listener that moves focus elsewhere wins", (w) => {
    w.document.body.innerHTML = "<input id=a><input id=b>";
    const a = w.document.getElementById("a");
    const b = w.document.getElementById("b");
    a.addEventListener("focus", () => b.focus(), { once: true });
    a.focus();
    return describeNode(w.document.activeElement);
  });
});

describe("unfocusing steps — https://html.spec.whatwg.org/#unfocusing-steps", () => {
  differential("blur() fires blur and focusout with a null relatedTarget; activeElement becomes body", (w) => {
    w.document.body.innerHTML = "<input id=a>";
    const a = w.document.getElementById("a");
    a.focus();
    const log = logFocusEvents(w, a);
    a.blur();
    // (document.hasFocus() differs by design: docs/deviations.md, "Focus: document.hasFocus()".)
    return { log, active: describeNode(w.document.activeElement) };
  });

  differential("blur() on an element that is not focused does nothing", (w) => {
    w.document.body.innerHTML = "<input id=a><input id=b>";
    const a = w.document.getElementById("a");
    const b = w.document.getElementById("b");
    a.focus();
    const log = logFocusEvents(w, a, b);
    b.blur();
    return { log, active: describeNode(w.document.activeElement) };
  });
});

describe("focus fixup rule — https://html.spec.whatwg.org/#focus-fixup-rule", () => {
  differential("removing the focused element (or an ancestor) resets activeElement to body without blur", (w) => {
    w.document.body.innerHTML = "<div id=wrap><input id=a></div>";
    const a = w.document.getElementById("a");
    a.focus();
    const log = logFocusEvents(w, a);
    w.document.getElementById("wrap").remove();
    return { log, active: describeNode(w.document.activeElement) };
  });

  differential("replacing the body's content via innerHTML resets focus", (w) => {
    w.document.body.innerHTML = "<button id=a>a</button>";
    w.document.getElementById("a").focus();
    w.document.body.innerHTML = "<p>new</p>";
    return describeNode(w.document.activeElement);
  });
});

describe("activeElement — https://html.spec.whatwg.org/#dom-documentorshadowroot-activeelement", () => {
  differential("is the body when nothing is focused; :focus and :focus-within follow focus", (w) => {
    w.document.body.innerHTML = "<section id=s><input id=a></section>";
    const before = describeNode(w.document.activeElement);
    w.document.getElementById("a").focus();
    return {
      before,
      after: describeNode(w.document.activeElement),
      focus: Array.from(w.document.querySelectorAll(":focus") as ArrayLike<AnyWindow>).map(describeNode),
      within: Array.from(w.document.querySelectorAll(":focus-within") as ArrayLike<AnyWindow>).map(describeNode),
    };
  });

  differential(
    "focus inside a shadow tree: document.activeElement is the host, shadowRoot.activeElement the element",
    (w) => {
      w.document.body.innerHTML = "<div id=host></div>";
      const host = w.document.getElementById("host");
      const root = host.attachShadow({ mode: "open" });
      root.innerHTML = "<input id=inner>";
      root.getElementById("inner").focus();
      return { doc: describeNode(w.document.activeElement), shadow: describeNode(root.activeElement) };
    },
  );
});
