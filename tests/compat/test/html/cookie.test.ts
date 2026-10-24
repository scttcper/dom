/**
 * document.cookie — differential against jsdom (tough-cookie).
 *
 * Spec: HTML Standard §3.1.3 "Resource metadata management"
 *   - document.cookie:                    https://html.spec.whatwg.org/#dom-document-cookie
 *   - cookie-averse Document object:      https://html.spec.whatwg.org/#cookie-averse-document-object
 * and RFC 6265 storage/retrieval, which the HTML getter/setter defer to:
 *   - storage model:                      https://httpwg.org/specs/rfc6265.html#storage-model
 *   - retrieval (cookie-string):          https://httpwg.org/specs/rfc6265.html#retrieval-algorithm
 *
 * Auth/consent components read and write cookies directly (js-cookie, universal-cookie).
 */
import { describe } from "vitest";
import { differential, type AnyWindow } from "../../src/harness.ts";

function set(w: AnyWindow, ...cookies: string[]): string {
  for (const c of cookies) w.document.cookie = c;
  return w.document.cookie;
}

describe("document.cookie — https://html.spec.whatwg.org/#dom-document-cookie", () => {
  differential("setter adds one cookie per assignment; getter joins name=value pairs with \"; \"", (w) => set(w, "a=1", "b=2", "c=3"));

  differential("assigning an existing name replaces its value in place", (w) => set(w, "a=1", "b=2", "a=3"));

  differential("attributes are not part of the cookie-string", (w) => set(w, "a=1; Path=/; SameSite=Lax; Max-Age=3600"));

  differential("Max-Age=0 and an Expires date in the past delete the cookie", (w) =>
    set(w, "a=1", "b=2", "c=3", "a=; Max-Age=0", "b=x; Expires=Thu, 01 Jan 1970 00:00:00 GMT"),
  );

  differential("a cookie scoped to another path is not visible", (w) => set(w, "a=1; Path=/elsewhere", "b=2; Path=/"));

  differential("storage model step 6: a Domain the host does not domain-match is rejected", (w) => set(w, "a=1; Domain=example.com", "b=2"));

  differential("a Domain equal to the host (case-insensitive, leading dot dropped) is accepted", (w) =>
    set(w, "a=1; Domain=LOCALHOST", "b=2; Domain=.localhost"),
  );

  differential("storage model step 11: a domain cookie replaces the host-only cookie with the same name, domain and path", (w) => set(w, "a=1", "a=2; Domain=localhost"));

  differential("HttpOnly cookies cannot be set from script", (w) => set(w, "a=1; HttpOnly", "b=2"));

  differential("Secure cookies are accepted on http://localhost (a potentially trustworthy origin)", (w) => set(w, "a=1; Secure", "b=2"));

  differential("whitespace around names and values is trimmed; inner whitespace kept", (w) => set(w, "  spaced name  =  a b  "));

  differential("a value may contain = signs", (w) => set(w, "token=abc==; Path=/"));

  differential("a cookie without = has an empty name", (w) => set(w, "lonely"));

  differential("setter converts its argument to a string", (w) => {
    w.document.cookie = 42;
    w.document.cookie = null;
    return w.document.cookie;
  });

  differential("longer paths are listed first", (w) => {
    w.history.pushState(null, "", "/deep/page");
    return set(w, "root=1; Path=/", "deep=2; Path=/deep");
  });

  differential("cookie-averse documents (no browsing context) return \"\" and ignore writes", (w) => {
    w.document.cookie = "main=1";
    const other = w.document.implementation.createHTMLDocument("");
    other.cookie = "x=1";
    return { other: other.cookie, main: w.document.cookie };
  });
});
