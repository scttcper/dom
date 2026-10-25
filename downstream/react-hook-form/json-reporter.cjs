// Jest reporter for the react-hook-form downstream runner: writes the same shape as `jest --json`
// (formatTestResults) to $CTRL_DOM_RHF_JSON, but without `failureDetails` and with cycles replaced.
//
// Why not `--json --outputFile`: Jest JSON.stringify()s the raw thrown values in
// `failureDetails`. When an assertion error carries a DOM node, @ctrl/dom wrappers (whose
// internal fields such as `_impl` are enumerable own properties, unlike jsdom's symbol-keyed
// impl) make that structure circular and Jest crashes after the run without writing a report.
// That is a filed finding (react-aria TRIAGE.md, dom-core); this reporter keeps the report robust to it.
'use strict';
const {writeFileSync} = require('node:fs');

module.exports = class SafeJsonReporter {
  constructor(globalConfig) {
    this.globalConfig = globalConfig;
  }
  onRunComplete(_contexts, results) {
    // pnpm does not hoist @jest/core: walk jest -> @jest/core -> @jest/test-result.
    const from = (spec, dir) => require('node:path').dirname(require.resolve(`${spec}/package.json`, {paths: [dir]}));
    const core = from('@jest/core', from('jest', this.globalConfig.rootDir));
    const {formatTestResults} = require(require.resolve('@jest/test-result', {paths: [core]}));
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
    writeFileSync(process.env.CTRL_DOM_RHF_JSON, json);
  }
};
