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
// Adapter bridge (TODO(jest-environment)): Sentry's setWindowLocation() helper calls the jsdom
// API `global.jsdom.reconfigure({url})`, which @sentry/jest-environment exposes from jsdom's JSDOM
// object. jest-environment-rtd has no equivalent, so this harness provides `reconfigure({url})`
// (and nothing else) on top of the window's internal URL setter. See README "Adapter gaps".
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
const TRIAGE = process.env.RTD_SENTRY_TRIAGE === '1';

const triageApplied = [];

// TRIAGE.md "isolation drops lazily installed index getters": create every lazily built
// collection index table once, then take the interface baseline ourselves (it is taken once per
// process), so restoreInterfaces() keeps the accessors.
let prewarmed = false;
function prewarmIndexTables() {
  if (prewarmed) return;
  prewarmed = true;
  const {dom, internal} = {dom: require(path.join(repo, 'packages/dom/src/index.ts')), internal: require(path.join(repo, 'packages/dom/src/internal.ts'))};
  const w = dom.createWindow();
  const d = w.document;
  d.body.innerHTML = '<form><input name="r" type="radio"><input name="r" type="radio"><label for="x">l</label><input id="x"><select><option>a</option></select></form><div class="a b"></div>';
  const div = d.querySelector('div');
  const form = d.querySelector('form');
  void [div.children[0], div.classList[0], div.attributes[0], d.querySelectorAll('div')[0], d.getElementsByName?.('r')[0], d.body.childNodes[0], form.elements[0], form.elements.namedItem('r')?.[0], d.getElementById('x').labels?.[0], d.querySelector('select').options[0], w.getComputedStyle(div)[0]];
  w.close();
  internal.captureInterfaceBaseline();
  triageApplied.push('index tables pre-warmed before isolation baseline');
}

function trackTimers(g) {
  const timeouts = new Set();
  const intervals = new Set();
  const {setTimeout: st, clearTimeout: ct, setInterval: si, clearInterval: ci} = g;
  const wrappedTimeout = function setTimeout(callback, ms, ...args) {
    if (typeof callback !== 'function') return st(callback, ms, ...args);
    const handle = st(function (...a) {
      timeouts.delete(handle);
      return callback.apply(this, a);
    }, ms, ...args);
    timeouts.add(handle);
    return handle;
  };
  const util = require('node:util');
  if (st[util.promisify.custom]) wrappedTimeout[util.promisify.custom] = st[util.promisify.custom];
  g.setTimeout = wrappedTimeout;
  g.clearTimeout = function clearTimeout(handle) {
    timeouts.delete(handle);
    return ct(handle);
  };
  g.setInterval = function setInterval(callback, ms, ...args) {
    const handle = si(callback, ms, ...args);
    intervals.add(handle);
    return handle;
  };
  g.clearInterval = function clearInterval(handle) {
    intervals.delete(handle);
    return ci(handle);
  };
  return () => {
    for (const h of timeouts) ct(h);
    for (const h of intervals) ci(h);
    timeouts.clear();
    intervals.clear();
  };
}

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

class RtdWithJsdomReconfigure extends RtdEnvironment {
  async teardown() {
    this.__pendingTimers?.();
    this.__pendingTimers = null;
    return super.teardown();
  }

  constructor(config, context) {
    if (TRIAGE) prewarmIndexTables();
    if (TRIAGE) {
      // TRIAGE.md "navigator.platform follows the host OS": jsdom reports "".
      config = {
        ...config,
        projectConfig: {
          ...config.projectConfig,
          testEnvironmentOptions: {...config.projectConfig.testEnvironmentOptions, platform: ''},
        },
      };
    }
    withDirectContext(() => super(config, context));
    const window = this.rtdWindow;
    if (TRIAGE) {
      // TRIAGE.md "navigator.clipboard cannot be assigned": jsdom has no clipboard, so
      // `Object.assign(navigator, {clipboard})` creates an own property there.
      Object.defineProperty(window.navigator, 'clipboard', {value: window.navigator.clipboard, writable: true, configurable: true, enumerable: true});
      if (!triageApplied.includes('platform=""')) triageApplied.push('platform=""', 'navigator.clipboard writable', 'pending host timers cleared at teardown');
      // TRIAGE.md "window timers survive close()": track timers created through the file's
      // global and clear the pending ones at teardown, like jsdom's window.close().
      this.__pendingTimers = trackTimers(this.global);
      this.global[Symbol.for('rtd.sentry.triage')] = triageApplied;
    }
    this.global.jsdom = {
      reconfigure(settings) {
        const unsupported = Object.keys(settings).filter(key => key !== 'url');
        if (unsupported.length) throw new Error(`jsdom.reconfigure bridge: unsupported options ${unsupported.join(', ')}`);
        if (settings.url !== undefined) window._setURL(new URL(settings.url, window.location.href));
      },
    };
    // Lets the probe prove which window/@rtd/dom instance the test realm sees.
    this.global[Symbol.for('rtd.sentry.window')] = window;
  }
}

const Sentry = wrapWithStructuredClone(createEnvironment({baseEnvironment: {TestEnvironment: RtdWithJsdomReconfigure}}));

module.exports = instrument(Sentry);
