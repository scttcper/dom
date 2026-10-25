// Vite plugin: log every module Vite transforms itself (inlined modules), next to the Node
// loader log written by record-loads.mjs, so the runner can see every file a run loaded.
import { appendFileSync } from "node:fs";
import type { Plugin } from "vite";

export function recordLoads(): Plugin {
  return {
    name: "record-loads",
    enforce: "pre",
    transform(_code, id) {
      if (process.env.CTRL_DOM_LOAD_LOG) appendFileSync(process.env.CTRL_DOM_LOAD_LOG, `${process.pid}\tvite\t${id}\n`);
      return null;
    },
  };
}
