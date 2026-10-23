// Jest transformer: passes code through and logs every file Jest's module registry loads.
"use strict";
const { appendFileSync } = require("node:fs");

module.exports = {
  process(sourceText, sourcePath) {
    if (process.env.RTD_LOAD_LOG) appendFileSync(process.env.RTD_LOAD_LOG, `${process.pid}\tjest\t${sourcePath}\n`);
    return { code: sourceText };
  },
};
