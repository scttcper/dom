// Jest resolver for the Sentry downstream corpus. Delegates to upstream's own
// tests/js/jestWorkspaceResolver.cjs for everything, except:
//   - bare react / react-dom / scheduler imports made *from our packages* (packages/*/dist) are
//     resolved as if imported from Sentry's tests/js workspace, so there is exactly one React;
//   - bare imports made from this harness directory resolve from Sentry's tests/js workspace
//     (the harness lives outside the checkout).
// Receipts for react / react-dom / @testing-library/* / @rtd/* resolutions are appended to
// $RTD_SENTRY_OUT/resolutions.jsonl (deduplicated per worker) so the report can prove one React
// and that rtd-full resolved @testing-library/* to our bundles.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const checkout = process.env.RTD_SENTRY_CHECKOUT;
const out = process.env.RTD_SENTRY_OUT;
const repo = path.resolve(__dirname, '../../..');
const ours = path.join(repo, 'packages') + path.sep;
const harness = __dirname + path.sep;
const scratch = process.env.RTD_SENTRY_SCRATCH;
const upstream = require(path.join(checkout, 'tests/js/jestWorkspaceResolver.cjs'));
const testsJs = path.join(checkout, 'tests/js');

const REDIRECT = /^(react|react-dom|scheduler)(\/|$)/;
const RECORD = /^(react|react-dom|@testing-library\/[a-z-]+|@rtd\/[a-z-]+)(\/|$)/;
const seen = new Set();
const fmt = p =>
  p.startsWith(checkout + path.sep) ? path.relative(checkout, p) : p.startsWith(repo + path.sep) ? '<rtd>/' + path.relative(repo, p) : p;

module.exports = function resolve(request, options) {
  let opts = options;
  if ((options.basedir.startsWith(ours) && REDIRECT.test(request)) || options.basedir === __dirname || options.basedir.startsWith(harness) || (scratch && options.basedir.startsWith(scratch))) {
    if (!request.startsWith('.') && !path.isAbsolute(request)) opts = {...options, basedir: testsJs};
  }
  const result = upstream(request, opts);
  if (out && (RECORD.test(request) || result.startsWith(ours))) {
    const line = JSON.stringify({request: fmt(request), importer: fmt(options.basedir), id: fmt(fs.realpathSync(result))});
    if (!seen.has(line)) {
      seen.add(line);
      fs.appendFileSync(path.join(out, 'resolutions.jsonl'), line + '\n');
    }
  }
  return result;
};
