// Run by test/register.test.ts, which expects this file to FAIL: an exception thrown by an event
// listener must fail the run under bun test too.
import { test } from "bun:test";

test("a throwing listener fails the test", async () => {
  const button = document.createElement("button");
  button.addEventListener("click", () => {
    throw new Error("listener boom");
  });
  button.click();
  await new Promise((resolve) => setTimeout(resolve, 10));
});
