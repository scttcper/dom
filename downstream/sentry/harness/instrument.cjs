// Measurement-only subclassing shared by every mode's environment (identical in all modes):
//   - per-file environment setup time: constructor + setup() of the environment;
//   - per-file teardown time;
//   - worker memory after each file's teardown (RSS, heap used; with RTD_SENTRY_GC=1 the heap is
//     sampled after a full GC, the leak signal), with the file's index within its worker;
// appended to $RTD_SENTRY_OUT/workers/<pid>.jsonl. Nothing here changes behaviour except the
// optional GC (enabled for every mode alike).
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const out = process.env.RTD_SENTRY_OUT;
const checkout = process.env.RTD_SENTRY_CHECKOUT;
const gc = process.env.RTD_SENTRY_GC === '1' ? globalThis.gc : undefined;
// RTD_SENTRY_SNAPSHOTS=10,38: write a heap snapshot after those file indexes (after the GC) to
// $RTD_SENTRY_OUT/snapshots/<pid>-<index>.heapsnapshot, for retention diffs.
const snapshotAt = new Set((process.env.RTD_SENTRY_SNAPSHOTS ?? '').split(',').filter(Boolean).map(Number));
let fileIndex = 0;

function record(entry) {
  if (!out) return;
  fs.mkdirSync(path.join(out, 'workers'), {recursive: true});
  fs.appendFileSync(path.join(out, 'workers', `${process.pid}.jsonl`), JSON.stringify(entry) + '\n');
}

function instrument(Base) {
  return class InstrumentedEnvironment extends Base {
    constructor(config, context) {
      const start = performance.now();
      super(config, context);
      this.__rtdTiming = {start, constructed: performance.now(), testPath: path.relative(checkout, context.testPath)};
    }

    async setup() {
      const t = performance.now();
      await super.setup();
      const now = performance.now();
      this.__rtdTiming.setupMs = now - this.__rtdTiming.start;
      this.__rtdTiming.setupOnlyMs = now - t;
      this.__rtdTiming.setupDone = now;
    }

    async teardown() {
      const timing = this.__rtdTiming;
      const t = performance.now();
      await super.teardown();
      const tornDown = performance.now();
      if (gc) gc();
      if (out && snapshotAt.has(fileIndex)) {
        fs.mkdirSync(path.join(out, 'snapshots'), {recursive: true});
        require('node:v8').writeHeapSnapshot(path.join(out, 'snapshots', `${process.pid}-${fileIndex}.heapsnapshot`));
      }
      const mem = process.memoryUsage();
      record({
        pid: process.pid,
        worker: process.env.JEST_WORKER_ID ?? null,
        index: fileIndex++,
        file: timing?.testPath,
        envSetupMs: timing?.setupMs,
        runMs: timing?.setupDone ? t - timing.setupDone : null,
        teardownMs: tornDown - t,
        rss: mem.rss,
        heapUsed: mem.heapUsed,
        external: mem.external,
        arrayBuffers: mem.arrayBuffers,
        gc: Boolean(gc),
      });
    }
  };
}

module.exports = {instrument};
