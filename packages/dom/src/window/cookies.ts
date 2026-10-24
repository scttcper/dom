// https://html.spec.whatwg.org/#dom-document-cookie
// https://httpwg.org/specs/rfc6265.html#storage-model (simplified "non-HTTP" API cookie jar)
//
// One jar per window. Supports Expires / Max-Age (expiry and deletion), Domain (host-only vs
// domain cookies, domain-match; no public suffix list), Path (default-path and path-match),
// Secure (only on secure origins), ignores SameSite and rejects HttpOnly cookies from the
// document.cookie setter (scripts cannot set them).

import { $cookies } from "../keys.ts";
interface Cookie {
  name: string;
  value: string;
  /** Canonicalized host (host-only cookies) or Domain attribute value. */
  domain: string;
  hostOnly: boolean;
  path: string;
  /** ms since epoch, Infinity for session cookies */
  expires: number;
  secure: boolean;
}

/** https://httpwg.org/specs/rfc6265.html#cookie-path (default-path) */
function defaultPath(url: URL): string {
  const p = url.pathname;
  if (!p.startsWith("/")) return "/";
  const i = p.lastIndexOf("/");
  return i === 0 ? "/" : p.slice(0, i);
}

/** https://httpwg.org/specs/rfc6265.html#cookie-path (path-match) */
function pathMatches(requestPath: string, cookiePath: string): boolean {
  if (requestPath === cookiePath) return true;
  if (!requestPath.startsWith(cookiePath)) return false;
  return cookiePath.endsWith("/") || requestPath[cookiePath.length] === "/";
}

/** https://httpwg.org/specs/rfc6265.html#cookie-domain (domain-match) */
function domainMatches(host: string, domain: string): boolean {
  if (host === domain) return true;
  // The string is a host name (not an IP address) that ends with "." + domain.
  return host.endsWith("." + domain) && !/^[\d.]+$/.test(host) && !host.startsWith("[");
}

/** https://httpwg.org/specs/rfc6265.html#retrieval-algorithm step 1 (domain part). */
function cookieDomainMatches(cookie: Cookie, host: string): boolean {
  return cookie.hostOnly ? host === cookie.domain : domainMatches(host, cookie.domain);
}

export class CookieJar {
  [$cookies]: Cookie[];

  constructor() {
    this[$cookies] = [];
  }

  /** https://httpwg.org/specs/rfc6265.html#sane-set-cookie-syntax — the `document.cookie` setter. */
  set(cookieString: string, url: URL, now = Date.now()): void {
    const parts = String(cookieString).split(";");
    const pair = parts[0];
    const eq = pair.indexOf("=");
    // A string without "=" sets a cookie with an empty name (browser behavior).
    const name = (eq === -1 ? "" : pair.slice(0, eq)).trim();
    const value = (eq === -1 ? pair : pair.slice(eq + 1)).trim();
    if (name === "" && value === "") return;
    let path = defaultPath(url);
    let expires = Infinity;
    let maxAgeSeen = false;
    let secure = false;
    let domainAttr = "";
    for (let i = 1; i < parts.length; i++) {
      const attr = parts[i];
      const aeq = attr.indexOf("=");
      const key = (aeq === -1 ? attr : attr.slice(0, aeq)).trim().toLowerCase();
      const val = aeq === -1 ? "" : attr.slice(aeq + 1).trim();
      switch (key) {
        case "max-age": {
          if (!/^-?\d+$/.test(val)) break;
          const seconds = Number(val);
          expires = seconds <= 0 ? -Infinity : now + seconds * 1000;
          maxAgeSeen = true;
          break;
        }
        case "expires": {
          if (maxAgeSeen) break;
          const t = Date.parse(val);
          if (!Number.isNaN(t)) expires = t;
          break;
        }
        case "domain": {
          // https://httpwg.org/specs/rfc6265.html#domain-attribute: an empty value is ignored;
          // a leading "." is dropped; the last Domain attribute wins.
          if (val === "") break;
          domainAttr = (val.startsWith(".") ? val.slice(1) : val).toLowerCase();
          break;
        }
        case "path":
          path = val.startsWith("/") ? val : defaultPath(url);
          break;
        case "secure":
          secure = true;
          break;
        case "httponly":
          // https://httpwg.org/specs/rfc6265.html#storage-model step 10: non-HTTP APIs cannot set these.
          return;
      }
    }
    if (secure && url.protocol !== "https:" && url.hostname !== "localhost") return;
    // https://httpwg.org/specs/rfc6265.html#storage-model step 6: a Domain the request host does
    // not domain-match makes the user agent ignore the cookie entirely; without one the cookie
    // is host-only.
    const host = url.hostname.toLowerCase();
    if (domainAttr !== "" && !domainMatches(host, domainAttr)) return;
    const hostOnly = domainAttr === "";
    const domain = hostOnly ? host : domainAttr;
    // Step 11: an existing cookie with the same name, domain and path is replaced.
    const i = this[$cookies].findIndex((c) => c.name === name && c.domain === domain && c.path === path);
    if (expires <= now) {
      if (i !== -1) this[$cookies].splice(i, 1);
      return;
    }
    const cookie: Cookie = { name, value, domain, hostOnly, path, expires, secure };
    if (i !== -1) this[$cookies][i] = cookie;
    else this[$cookies].push(cookie);
  }

  /** https://httpwg.org/specs/rfc6265.html#cookie — the `document.cookie` getter. */
  get(url: URL, now = Date.now()): string {
    let out = "";
    const host = url.hostname.toLowerCase();
    // Longer paths first, then creation order (RFC 6265 §5.4 step 2).
    const matching: Cookie[] = [];
    for (let i = this[$cookies].length - 1; i >= 0; i--) {
      const c = this[$cookies][i];
      if (c.expires <= now) {
        this[$cookies].splice(i, 1);
        continue;
      }
      if (c.secure && url.protocol !== "https:" && url.hostname !== "localhost") continue;
      if (!cookieDomainMatches(c, host) || !pathMatches(url.pathname, c.path)) continue;
      matching.push(c);
    }
    matching.reverse();
    matching.sort((a, b) => b.path.length - a.path.length);
    for (const c of matching) {
      if (out !== "") out += "; ";
      out += c.name === "" ? c.value : `${c.name}=${c.value}`;
    }
    return out;
  }
}
