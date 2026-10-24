// Run by test/register.test.ts: an interval left running must not keep the file's process alive.
import { test } from "node:test";

test("leaves an interval and a window timer running", () => {
  setInterval(() => {}, 1000);
  window.setTimeout(() => {}, 60_000);
});
