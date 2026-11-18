// Importing user-event observes real timer deadlines between keyboard and pointer actions.
import { clearTimeout as hostClearTimeout } from "node:timers";
import { expect, test } from "vitest";
import { createWindow } from "@ctrl/dom";
import { trackGlobalTimers } from "@ctrl/dom/internal";
import { userEvent } from "@ctrl/dom/user-event";
import { Tracker } from "./gc.ts";

test("user-event releases timers canceled outside its global clear wrappers", async () => {
  const tracker = new Tracker();
  (() => {
    const viaHost = tracker.track(
      "timeout cleared by the host",
      setTimeout(() => {}, 60_000),
    );
    const numeric = tracker.track(
      "interval cleared by ID",
      setInterval(() => {}, 60_000),
    );
    const disposed = tracker.track(
      "disposed interval",
      setInterval(() => {}, 60_000),
    );
    hostClearTimeout(viaHost);
    clearInterval(Number(numeric));
    disposed[Symbol.dispose]();
  })();
  expect(await tracker.alive()).toEqual({});
});

test("timer observers release a finished window after its global timer functions are restored", async () => {
  const tracker = new Tracker();
  await (async () => {
    const w = tracker.track("window", createWindow());
    const restore = trackGlobalTimers(w, globalThis as unknown as Record<PropertyKey, unknown>);
    try {
      tracker.track("window timer", globalThis.setTimeout);
      const button = w.document.body!.appendChild(w.document.createElement("button"));
      await userEvent.click(button as unknown as Parameters<typeof userEvent.click>[0]);
    } finally {
      restore();
      w.close();
    }
  })();
  expect(await tracker.alive()).toEqual({});
});
