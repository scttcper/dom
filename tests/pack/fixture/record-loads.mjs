// Preloaded with NODE_OPTIONS=--import: logs every module Node's loader loads (ESM and require).
import { registerHooks } from "node:module";
import { appendFileSync } from "node:fs";

const log = process.env.CTRL_DOM_LOAD_LOG;
if (log) {
  registerHooks({
    load(url, context, nextLoad) {
      appendFileSync(log, `${process.pid}\tnode\t${url}\n`);
      return nextLoad(url, context);
    },
  });
}
