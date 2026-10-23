// rtd modes: jest-environment-rtd (packages/jest-environment, loaded exactly as its preset names
// it) in place of jsdom, composed the way upstream composes jsdom in
// tests/js/sentry-test/jest-environment.cjs:
//   - same process-wide --retain-maps-for-n-gc=0 V8 flag (upstream's leak workaround for vm
//     contexts kept alive by optimized code; applies to any per-file vm context);
//   - @sentry/jest-environment's createEnvironment() factory (test tracing; inert locally since
//     dsn is false) with our environment as its base, wrapped with upstream's
//     wrapWithStructuredClone;
//   - the measurement-only subclass shared by every mode.
//
// No adapter bridge: jest-environment-rtd exposes `environment.dom.reconfigure({url})`, which
// @sentry/jest-environment copies to `global.jsdom` exactly as it does for JSDOM.
'use strict';
const path = require('node:path');
const v8 = require('node:v8');
const {createRequire} = require('node:module');
const {instrument} = require('./instrument.cjs');

v8.setFlagsFromString('--retain-maps-for-n-gc=0');

const checkout = process.env.RTD_SENTRY_CHECKOUT;
const repo = path.resolve(__dirname, '../../..');
const preset = require(path.join(repo, 'packages/jest-environment/jest-preset.cjs'));
const rtdModule = require(preset.testEnvironment);
const RtdEnvironment = rtdModule.TestEnvironment ?? rtdModule.default;

const testsRequire = createRequire(path.join(checkout, 'tests/js/package.json'));
const sentryEnvDir = path.dirname(testsRequire.resolve('@sentry/jest-environment/jsdom'));
const createEnvironment = require(path.join(sentryEnvDir, 'createEnvironment.js'));
const wrapWithStructuredClone = require(path.join(checkout, 'tests/js/sentry-test/wrapWithStructuredClone.cjs'));

// --triage (run.ts): workarounds for blockers already filed in TRIAGE.md, to see the failures
// behind them. Reports from such runs are labelled "-triage" and are not compatibility results.
// --triage (run.ts) has no rtd workarounds left: every filed blocker is fixed in packages/*
// (TRIAGE.md). Kept so the flag still parses and reports stay labelled.
const TRIAGE = process.env.RTD_SENTRY_TRIAGE === '1';
const triageApplied = [];

// rtd-direct (EXPERIMENT): the same environment, but the test file's vm context is created with
// vm.constants.DONT_CONTEXTIFY (an ordinary global object, as jsdom 30 does) instead of
// jest-environment-node's contextified context around Jest's GlobalProxy. Every global read in
// test code (React, Emotion, app code) otherwise goes through V8's contextify interceptors and a
// Proxy. jest-environment-node creates the context with `vm.createContext(proxy)` inside its
// constructor, so the experiment swaps vm.createContext for the duration of that call only.
const DIRECT = process.env.RTD_SENTRY_MODE === 'rtd-direct';
const vm = require('node:vm');
function withDirectContext(fn) {
  if (!DIRECT) return fn();
  const original = vm.createContext;
  vm.createContext = () => original(vm.constants.DONT_CONTEXTIFY);
  try {
    return fn();
  } finally {
    vm.createContext = original;
  }
}

class RtdSentryEnvironment extends RtdEnvironment {
  constructor(config, context) {
    withDirectContext(() => super(config, context));
    if (TRIAGE) this.global[Symbol.for('rtd.sentry.triage')] = triageApplied;
    // Lets the probe prove which window/@rtd/dom instance the test realm sees.
    this.global[Symbol.for('rtd.sentry.window')] = this.rtdWindow;
  }
}

const Sentry = wrapWithStructuredClone(createEnvironment({baseEnvironment: {TestEnvironment: RtdSentryEnvironment}}));

module.exports = instrument(Sentry);
