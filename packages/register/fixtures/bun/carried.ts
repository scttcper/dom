// Shared by second.test.ts and third.test.ts: each file sees a registered, empty window, and
// shares it with the files before it unless `bun test --isolate` gives every file a fresh global.
import { expect, test } from "bun:test";

export function carriedOverTest(): void {
  test("sees a registered window", () => {
    expect(document.body.childNodes.length).toBe(0);
    console.log(`window carried over: ${(globalThis as Record<string, unknown>).leftover === true}`);
    (globalThis as Record<string, unknown>).leftover = true;
  });
}
