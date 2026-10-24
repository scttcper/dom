/**
 * Session history and fragment navigation — differential against jsdom.
 *
 * Spec: HTML Standard §7.2–7.4
 *   - the History interface:              https://html.spec.whatwg.org/#the-history-interface
 *   - pushState / replaceState:           https://html.spec.whatwg.org/#dom-history-pushstate
 *                                         https://html.spec.whatwg.org/#shared-history-push/replace-state-steps
 *   - can have its URL rewritten:         https://html.spec.whatwg.org/#can-have-its-url-rewritten
 *   - history.state / length:             https://html.spec.whatwg.org/#dom-history-state
 *                                         https://html.spec.whatwg.org/#dom-history-length
 *   - back / forward / go:                https://html.spec.whatwg.org/#dom-history-go
 *   - update document for history step application (popstate, hashchange):
 *                                         https://html.spec.whatwg.org/#update-document-for-history-step-application
 *   - navigate to a fragment:             https://html.spec.whatwg.org/#navigate-fragid
 *   - the Location interface:             https://html.spec.whatwg.org/#the-location-interface
 *   - location.hash setter:               https://html.spec.whatwg.org/#dom-location-hash
 *
 * React Router / TanStack Router / wouter drive pushState and listen for popstate; tests of
 * routed components call `history.back()` and `window.location.hash = ...`.
 */
import { describe } from "vitest";
import { differential, differentialAsync, type AnyWindow } from "../../src/harness.ts";

const tick = (w: AnyWindow, ms = 10) => new Promise<void>((resolve) => w.setTimeout(resolve, ms));

function where(w: AnyWindow) {
  return { href: w.location.href, length: w.history.length, state: w.history.state };
}

function recordNavigationEvents(w: AnyWindow): unknown[] {
  const log: unknown[] = [];
  w.addEventListener("popstate", (e: AnyWindow) => log.push({ type: "popstate", state: e.state, href: w.location.href, ctor: e.constructor.name }));
  w.addEventListener("hashchange", (e: AnyWindow) => log.push({ type: "hashchange", oldURL: e.oldURL, newURL: e.newURL, ctor: e.constructor.name }));
  return log;
}

/**
 * jsdom's fragment navigations create the new session history entry without serialized state,
 * so `history.state` (and the popstate event's state) read undefined instead of null.
 */
function nullState(observed: any): any {
  if (Array.isArray(observed)) return observed.map(nullState);
  if (observed === null || typeof observed !== "object") return observed;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(observed)) out[k] = k === "state" && v === "<undefined>" ? null : nullState(v);
  return out;
}

const FRAGMENT_STATE = {
  fix: nullState,
  spec: "https://html.spec.whatwg.org/#navigate-fragid",
  reason: "Navigate to a fragment appends an entry whose serialized state is null; jsdom leaves it undefined.",
};

/** Our Location setters update the URL without loading a document (docs/deviations.md, Window row "Navigation never loads a document"). */
const NAVIGATION_DEVIATION = {
  spec: "https://html.spec.whatwg.org/#location-object-navigate",
  reason: "No navigation: the URL component setters only update the URL and session history (docs/deviations.md); jsdom reports \"Not implemented: navigation\" and keeps the old URL.",
};

describe("pushState / replaceState — https://html.spec.whatwg.org/#shared-history-push/replace-state-steps", () => {
  differential("pushState adds an entry and updates the URL; replaceState rewrites the current entry", (w) => {
    const steps = [where(w)];
    w.history.pushState({ n: 1 }, "", "/a?x=1#h");
    steps.push(where(w));
    w.history.replaceState({ n: 2 }, "", "b");
    steps.push(where(w));
    w.history.replaceState(null, "");
    steps.push(where(w));
    return steps;
  });

  differential(
    "step 4: the state is serialized (a new object; Dates and Maps survive; the same object on every read)",
    (w) => {
      const state = { date: new Date(0), map: new Map([["k", 1]]), nested: { a: [1, 2] } };
      w.history.pushState(state, "");
      const s = w.history.state;
      return { same: s === state, sameOnReread: s === w.history.state, date: s.date instanceof Date, time: s.date.getTime(), map: s.map.get("k"), nested: s.nested };
    },
    {
      jsdomFix: {
        fix: (o) => ({ ...o, same: false }),
        spec: "https://html.spec.whatwg.org/#shared-history-push/replace-state-steps",
        reason: "Step 4 is StructuredSerializeForStorage(data); jsdom stores the object itself, so history.state is the pushed object.",
      },
    },
  );

  differential(
    "step 4: an unserializable state throws DataCloneError and changes nothing",
    (w) => {
      let name = "none";
      try {
        w.history.pushState({ f() {} }, "", "/x");
      } catch (e) {
        name = (e as Error).name;
      }
      return { name, ...where(w) };
    },
    {
      jsdomDeviation: {
        expected: { name: "DataCloneError", href: "http://localhost/", length: 1, state: null },
        spec: "https://html.spec.whatwg.org/#shared-history-push/replace-state-steps",
        reason: "jsdom never serializes the state, so functions are accepted and the entry is pushed.",
      },
    },
  );

  differential("step 6: a different origin or an unparsable URL throws SecurityError", (w) => {
    const errors: string[] = [];
    for (const url of ["http://example.com/", "https://localhost/", "http://localhost:8080/", "http://[bad"]) {
      try {
        w.history.pushState(null, "", url);
        errors.push("none");
      } catch (e) {
        errors.push((e as Error).name);
      }
    }
    return { errors, ...where(w) };
  });
});

describe("traversal — https://html.spec.whatwg.org/#update-document-for-history-step-application", () => {
  differentialAsync("back() fires popstate with the entry's state after the URL changes", async (w) => {
    const log = recordNavigationEvents(w);
    w.history.pushState({ page: 1 }, "", "/one");
    w.history.pushState({ page: 2 }, "", "/two");
    w.history.back();
    const sync = log.length;
    await tick(w);
    return { sync, log, ...where(w) };
  });

  differentialAsync("go(-2) then forward() move by the delta", async (w) => {
    w.history.pushState("a", "", "/a");
    w.history.pushState("b", "", "/b");
    w.history.go(-2);
    await tick(w);
    const first = where(w);
    w.history.forward();
    await tick(w);
    return { first, second: where(w) };
  });

  differentialAsync("out-of-range deltas do nothing", async (w) => {
    const log = recordNavigationEvents(w);
    w.history.pushState("a", "", "/a");
    w.history.go(5);
    w.history.forward();
    await tick(w);
    return { log, ...where(w) };
  });

  differentialAsync("pushing after back() truncates the forward entries", async (w) => {
    w.history.pushState(1, "", "/1");
    w.history.pushState(2, "", "/2");
    w.history.back();
    await tick(w);
    w.history.pushState(3, "", "/3");
    const after = where(w);
    w.history.forward();
    await tick(w);
    return { after, forwardIsNoop: where(w) };
  });

  differentialAsync("traversing between entries that differ only in fragment fires popstate then hashchange", async (w) => {
    w.history.pushState("x", "", "#x");
    const log = recordNavigationEvents(w);
    w.history.back();
    await tick(w);
    return { log, ...where(w) };
  });
});

describe("navigate to a fragment — https://html.spec.whatwg.org/#navigate-fragid", () => {
  differentialAsync(
    "location.hash setter: popstate (null state) before the setter returns, hashchange in a later task",
    async (w) => {
      const log = recordNavigationEvents(w);
      w.location.hash = "section";
      const sync = { log: log.length, ...where(w) };
      await tick(w);
      return { sync, log, after: where(w) };
    },
    {
      jsdomFix: {
        fix: (o) => ({ ...nullState(o), sync: { ...nullState(o.sync), log: 1 } }),
        spec: "https://html.spec.whatwg.org/#update-document-for-history-step-application",
        reason: "Navigate to a fragment runs update document for history step application synchronously, so popstate fires before the setter returns (step 6.3); jsdom fires it from a task, with an undefined state.",
      },
    },
  );

  differentialAsync(
    "location.hash setter step 7: setting the same fragment does nothing",
    async (w) => {
      w.location.hash = "same";
      await tick(w);
      const log = recordNavigationEvents(w);
      w.location.hash = "#same";
      await tick(w);
      return { log, ...where(w) };
    },
    { jsdomFix: FRAGMENT_STATE },
  );

  differentialAsync(
    "assigning location.href to a fragment URL is a fragment navigation",
    async (w) => {
      const log = recordNavigationEvents(w);
      w.location.href = "#frag";
      await tick(w);
      return { log, ...where(w) };
    },
    { jsdomFix: FRAGMENT_STATE },
  );

  differentialAsync(
    "location.replace() with a fragment replaces the entry (length unchanged) and still fires popstate and hashchange",
    async (w) => {
      const log = recordNavigationEvents(w);
      w.location.replace("#r");
      await tick(w);
      return { log, ...where(w) };
    },
    { jsdomFix: FRAGMENT_STATE },
  );

  differentialAsync("pushState never fires popstate or hashchange, even when only the fragment changes", async (w) => {
    const log = recordNavigationEvents(w);
    w.history.pushState(null, "", "#p");
    w.history.replaceState(null, "", "#q");
    await tick(w);
    return { log, ...where(w) };
  });
});

describe("Location URL components — https://html.spec.whatwg.org/#the-location-interface", () => {
  differential("getters follow the document URL after pushState", (w) => {
    w.history.pushState(null, "", "/path/page?q=1&r=2#frag");
    const l = w.location;
    return { href: l.href, origin: l.origin, protocol: l.protocol, host: l.host, hostname: l.hostname, port: l.port, pathname: l.pathname, search: l.search, hash: l.hash, url: w.document.URL };
  });

  differential(
    "search setter: a leading ? is optional; the empty string clears the query",
    (w) => {
      w.history.pushState(null, "", "/p?old#h");
      w.location.search = "a=1";
      const a = w.location.href;
      w.location.search = "?b=2";
      const b = w.location.href;
      w.location.search = "";
      return { a, b, c: w.location.href };
    },
    { jsdomDeviation: { expected: { a: "http://localhost/p?a=1#h", b: "http://localhost/p?b=2#h", c: "http://localhost/p#h" }, ...NAVIGATION_DEVIATION } },
  );

  differential(
    "pathname setter: a same-origin navigation that pushes an entry",
    (w) => {
      w.location.pathname = "/new/path";
      return where(w);
    },
    { jsdomDeviation: { expected: { href: "http://localhost/new/path", length: 2, state: null }, ...NAVIGATION_DEVIATION } },
  );
});
