// setupFiles (first, every mode): keep references to the environment's own implementations of
// the globals that upstream's tests/js/setup.ts replaces with jsdom speed hacks, before it runs.
// Only ctrl-dom-nohacks (harness/nohacks.ts) uses them; storing them changes nothing else.
'use strict';
const g = globalThis;
g[Symbol.for('ctrl-dom.sentry.originals')] = {
  getComputedStyle: g.getComputedStyle,
  matchMedia: g.matchMedia,
  IntersectionObserver: g.IntersectionObserver,
  ResizeObserver: g.ResizeObserver,
  setPointerCapture: g.HTMLElement?.prototype.setPointerCapture,
  getTotalLength: g.SVGElement?.prototype.getTotalLength,
  setImmediate: g.setImmediate,
  crypto: Object.getOwnPropertyDescriptor(g, 'crypto'),
};
