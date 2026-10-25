// jsdom mode: upstream's tests/js/sentry-test/jest-environment.cjs, unchanged (it sets
// --retain-maps-for-n-gc=0 and wraps @sentry/jest-environment/jsdom), plus the
// measurement-only subclass shared by every mode.
'use strict';
const path = require('node:path');
const {instrument} = require('./instrument.cjs');

const Upstream = require(path.join(process.env.CTRL_DOM_SENTRY_CHECKOUT, 'tests/js/sentry-test/jest-environment.cjs'));

module.exports = instrument(Upstream);
