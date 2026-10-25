// ctrl-dom-nohacks (EXPERIMENT, not a compatibility mode): runs after upstream's tests/js/setup.ts and
// undoes the jsdom-only workarounds it installs, so the suite exercises @ctrl/dom's own
// implementations:
//   - window.getComputedStyle: upstream returns `element.style` ("The full jsdom CSS cascade is
//     too slow"); restored to the environment's real cascade;
//   - @floating-ui/react-dom: upstream mocks useFloating to skip geometry work ("jsdom does not
//     lay out elements"); restored to the real module;
//   - window.matchMedia: upstream's stub always answers `matches: false`; restored to @ctrl/dom's
//     media query evaluator (1024x768 desktop values);
//   - window.IntersectionObserver: upstream's inert class; restored to @ctrl/dom's (also inert).
// Kept as test infrastructure (not jsdom hacks): MockResizeObserver (tests drive it with
// triggerResizeObservers), crypto.subtle, lodash/debounce + Pacer mocks, framer-motion
// skipAnimations, fetch mocks, `??=` polyfills (no-ops when the DOM already has them).
jest.unmock('@floating-ui/react-dom');

const originals = (globalThis as any)[Symbol.for('ctrl-dom.sentry.originals')];
if (!originals) throw new Error('harness/stash.cjs did not run');

Object.defineProperty(window, 'getComputedStyle', {
  value: originals.getComputedStyle,
  configurable: true,
  writable: true,
});
Object.defineProperty(window, 'matchMedia', {
  value: originals.matchMedia,
  configurable: true,
  writable: true,
});
window.IntersectionObserver = originals.IntersectionObserver;

// Prove the unmock took effect (the real useFloating calls computePosition; upstream's mock
// returns a constant object).
if (!String(require('@floating-ui/react-dom').useFloating).includes('computePosition')) {
  throw new Error('ctrl-dom-nohacks: @floating-ui/react-dom is still mocked');
}
