// setupFilesAfterEnv (first, every mode): proves which DOM and which Testing Library this test
// file runs on, and fails the file otherwise. Receipts: $CTRL_DOM_SENTRY_OUT/environments.jsonl.
"use strict";
const fs = require("node:fs");
const path = require("node:path");

const mode = process.env.CTRL_DOM_SENTRY_MODE;
const out = process.env.CTRL_DOM_SENTRY_OUT;
const repo = path.resolve(__dirname, "../../..");
const g = globalThis;
const receipt = {
  mode,
  pid: process.pid,
  testPath: path.relative(process.env.CTRL_DOM_SENTRY_CHECKOUT, expect.getState().testPath ?? ""),
  userAgent: navigator.userAgent,
  documentConstructor: document.constructor.name,
};
const modules = g[Symbol.for("ctrl-dom.dom.modules")];
if (mode === "jsdom") {
  if (modules || !navigator.userAgent.includes("jsdom")) throw new Error("jsdom mode is not running on jsdom");
} else {
  if (!modules) throw new Error(`${mode}: @ctrl/dom-jest-environment did not install @ctrl/dom`);
  const mapped = require("@ctrl/dom");
  receipt.singleDomInstance =
    mapped === modules.dom &&
    document instanceof modules.dom.Document &&
    g.Node === modules.dom.Node &&
    g[Symbol.for("ctrl-dom.sentry.window")]?.document === document;
  if (!receipt.singleDomInstance)
    throw new Error(`${mode}: more than one @ctrl/dom instance (environment vs test registry)`);
}
if (mode === "ctrl-dom-full" || mode === "ctrl-dom-nohacks") {
  const pkg = (...p) => path.join(repo, "packages", ...p);
  const expected = {
    "@testing-library/react": pkg("react/dist/index.cjs"),
    "@testing-library/dom": pkg("testing-library/dist/index.cjs"),
    "@testing-library/user-event": pkg("user-event/dist/index.cjs"),
    "@testing-library/jest-dom": pkg("jest-dom/dist/index.cjs"),
  };
  const shims = (process.env.CTRL_DOM_SENTRY_SHIMS ?? "react,dom,user-event,jest-dom").split(",");
  receipt.shims = {};
  for (const [spec, file] of Object.entries(expected)) {
    if (!shims.includes(spec.slice("@testing-library/".length))) continue;
    receipt.shims[spec] = require.resolve(spec) === file;
  }
  if (Object.values(receipt.shims).some((ok) => !ok))
    throw new Error("Testing Library mappings did not apply: " + JSON.stringify(receipt.shims));
}
fs.appendFileSync(path.join(out, "environments.jsonl"), JSON.stringify(receipt) + "\n");
