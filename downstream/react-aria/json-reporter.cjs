// Jest reporter for the react-aria downstream runner: writes the same shape as `jest --json`
// (formatTestResults) to $RTD_RA_JSON, but without `failureDetails` and with cycles replaced.
//
// Why not `--json --outputFile`: Jest JSON.stringify()s the raw thrown values in
// `failureDetails`. When an assertion error carries a DOM node, @rtd/dom wrappers (whose
// internal fields such as `_impl` are enumerable own properties, unlike jsdom's symbol-keyed
// impl) make that structure circular and Jest crashes after the run without writing a report.
// That is a filed finding (TRIAGE.md, dom-core); this reporter keeps the report robust to it.
'use strict';
const {writeFileSync} = require('node:fs');

module.exports = class SafeJsonReporter {
  constructor(globalConfig) {
    this.globalConfig = globalConfig;
  }
  onRunComplete(_contexts, results) {
    const {formatTestResults} = require(require.resolve('@jest/test-result', {paths: [this.globalConfig.rootDir + '/node_modules/@jest/core']}));
    const formatted = formatTestResults(results);
    const seen = new WeakSet();
    const json = JSON.stringify(formatted, (key, value) => {
      if (key === 'failureDetails') return undefined;
      if (value !== null && typeof value === 'object') {
        if (seen.has(value)) return '[Circular]';
        seen.add(value);
      }
      return value;
    });
    writeFileSync(process.env.RTD_RA_JSON, json);
  }
};
