// Preloaded with NODE_OPTIONS=--import: logs every module Node's loader loads (ESM and require),
// and every resolution with the module that asked for it.
import { registerHooks } from "node:module";
import { appendFileSync } from "node:fs";

const log = process.env.CTRL_DOM_LOAD_LOG;
if (log) {
  registerHooks({
    resolve(specifier, context, nextResolve) {
      const resolved = nextResolve(specifier, context);
      appendFileSync(log, `${process.pid}\tedge\t${resolved.url}\t${context.parentURL ?? ""}\n`);
      return resolved;
    },
    load(url, context, nextLoad) {
      appendFileSync(log, `${process.pid}\tnode\t${url}\n`);
      return nextLoad(url, context);
    },
  });
}
