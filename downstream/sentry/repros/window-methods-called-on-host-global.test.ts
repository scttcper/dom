/**
 * Downstream repro (Sentry: replayClipPreview.spec.tsx, 3 tests, "Cannot read properties of
 * undefined (reading 'scheduledWith')" in Window.requestAnimationFrame).
 *
 * rrweb (via @sentry/rrweb) takes "untainted" implementations from a sandbox iframe and binds
 * them to the page's global:
 *   impl = sandbox.contentWindow.requestAnimationFrame;  impl.bind(window)(cb)
 * Under jsdom the test global *is* a Window, so this works. Under the ctrl-dom environments the
 * global is the host global with window members forwarded to a Window instance
 * (docs/deviations.md "Window ... the host global is the window"), so Window.prototype methods
 * run with `this` = the host global, read their internal slots from it and crash.
 * Window methods should accept the host global a window is installed on as their receiver
 * (map it to the installed Window), the way the forwarded bound copies already behave.
 *
 * Spec: https://html.spec.whatwg.org/#dom-animationframeprovider-requestanimationframe
 *       (WebIDL operations on the global object accept the global as `this`:
 *       https://webidl.spec.whatwg.org/#dfn-create-operation-function, step 2.1)
 * Owner: window.
 */
import { expect, test } from "vitest";
import { differential } from "./engines.ts";
import { installGlobals } from "../../../packages/dom/src/index.ts";

differential("an iframe's requestAnimationFrame bound to the page global (rrweb getImplementation)", (make, engine) => {
  test("does not throw", () => {
    const window = make();
    // The object test code sees as `window`: jsdom's Window, or a host global under ctrl-dom.
    const global: any = engine === "jsdom" ? window : {};
    const uninstall = engine === "ctrl-dom" ? installGlobals(window, global) : () => {};
    try {
      const sandbox = window.document.createElement("iframe");
      window.document.head.appendChild(sandbox);
      const impl = sandbox.contentWindow.requestAnimationFrame;
      window.document.head.removeChild(sandbox);
      const raf = impl.bind(global);
      expect(() => raf(() => {})).not.toThrow();
    } finally {
      uninstall();
    }
  });
});
