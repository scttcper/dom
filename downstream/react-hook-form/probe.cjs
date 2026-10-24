// Identity probe for the react-hook-form downstream runner. Prepended to upstream's
// setupFilesAfterEnv, so it runs first in every test file and fails the file when the wrong DOM,
// a second @rtd/dom instance, a second React, or a non-substituted Testing Library is loaded.
// Each test file appends one receipt line to $RTD_RHF_RECEIPTS (the runner checks them).
'use strict';
const {appendFileSync} = require('node:fs');

const mode = process.env.RTD_RHF_MODE;
const repo = process.env.RTD_RHF_REPO;
const g = globalThis;
const modules = g[Symbol.for('rtd.dom.modules')];
const receipt = {
  mode,
  testPath: expect.getState().testPath,
  userAgent: navigator.userAgent,
  documentConstructor: document.constructor.name,
  react: require.resolve('react'),
  reactDom: require.resolve('react-dom'),
  testingLibrary: {}
};
const fail = message => {
  receipt.error = message;
  appendFileSync(process.env.RTD_RHF_RECEIPTS, JSON.stringify(receipt) + '\n');
  throw new Error(`[react-hook-form downstream probe] ${message}`);
};

if (mode === 'jsdom') {
  if (modules !== undefined || !/jsdom/.test(navigator.userAgent)) fail('jsdom mode is not running on jsdom');
} else {
  if (modules === undefined) fail('rtd mode is not running under jest-environment-rtd');
  // One @rtd/dom per worker: the module the test registry sees is the instance whose window the
  // environment installed (the shim maps `@rtd/dom` to it; this proves the mapping applies).
  const dom = require('@rtd/dom');
  receipt.singleDomInstance =
    dom === modules.dom && dom.Node === g.Node && document instanceof dom.Document && require('@rtd/dom/internal') === modules.internal;
  if (!receipt.singleDomInstance) fail('two @rtd/dom instances (environment vs test registry)');
}

for (const spec of ['@testing-library/react', '@testing-library/react/pure', '@testing-library/dom', '@testing-library/user-event', '@testing-library/jest-dom']) {
  try {
    receipt.testingLibrary[spec] = require.resolve(spec);
  } catch (error) {
    receipt.testingLibrary[spec] = `unresolved: ${error.message.split('\n')[0]}`;
  }
}
if (mode === 'rtd-full') {
  const shims = (process.env.RTD_RHF_SHIMS ?? '').split(',').filter(Boolean);
  for (const [spec, value] of Object.entries(receipt.testingLibrary)) {
    const pkg = /^@testing-library\/([a-z-]+)/.exec(spec)[1];
    const ours = value.startsWith(`${repo}/packages/`);
    if (shims.includes(pkg) !== ours) fail(`${spec} resolved to ${value} (expected ${shims.includes(pkg) ? 'ours' : 'stock'})`);
  }
}

// One React: render a hook through @testing-library/react (ours in rtd-full) with the React the
// tests import. A second React/react-dom copy fails here with "Invalid hook call".
{
  const React = require('react');
  const {renderHook, cleanup} = require('@testing-library/react/pure');
  const previous = g.IS_REACT_ACT_ENVIRONMENT;
  g.IS_REACT_ACT_ENVIRONMENT = true;
  try {
    const {result} = renderHook(() => React.useState(42));
    receipt.singleReact = result.current[0] === 42;
  } catch (error) {
    receipt.singleReact = false;
    receipt.reactError = String(error && error.message);
  } finally {
    cleanup();
    g.IS_REACT_ACT_ENVIRONMENT = previous;
  }
  if (!receipt.singleReact) fail(`React instance check failed: ${receipt.reactError}`);
}

appendFileSync(process.env.RTD_RHF_RECEIPTS, JSON.stringify(receipt) + '\n');
