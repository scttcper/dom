// Shared setup for the React compat projects. Under compat:react-rtd-full the imports below are
// aliased to @rtd/jest-dom and @rtd/react; elsewhere they are the stock packages.
import "@testing-library/jest-dom/vitest";
import * as rtl from "@testing-library/react";
import { afterEach } from "vitest";

const engine = process.env.COMPAT_ENGINE;

if (engine === "rtd" || engine === "rtd-full") {
  // Guard 1: the environment's DOM and the DOM the tests import must be the same instance.
  const dom = await import("@rtd/dom");
  if ((globalThis as { Node?: unknown }).Node !== dom.Node) {
    throw new Error("compat: two @rtd/dom instances (environment vs test imports) — check server.deps.external");
  }
}

if (engine === "rtd-full") {
  // Guard 2: @testing-library/* must really be our packages, not the stock ones.
  const ours = await import("@rtd/react");
  if (rtl.render !== ours.render) throw new Error("compat: @testing-library/react is not aliased to @rtd/react");
  const [dtl, oursDtl] = await Promise.all([import("@testing-library/dom"), import("@rtd/testing-library")]);
  if (dtl.getByRole !== oursDtl.getByRole) throw new Error("compat: @testing-library/dom is not aliased to @rtd/testing-library");
  const [ue, oursUe] = await Promise.all([import("@testing-library/user-event"), import("@rtd/user-event")]);
  if (ue.default !== oursUe.default) throw new Error("compat: @testing-library/user-event is not aliased to @rtd/user-event");
}

afterEach(rtl.cleanup);
