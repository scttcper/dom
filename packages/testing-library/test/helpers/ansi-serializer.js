// Stand-in for jest-snapshot-serializer-ansi (MIT, https://github.com/emotion-js/jest-snapshot-serializer-ansi):
// strips ANSI escape sequences from snapshotted strings. Upstream adds it per test file; files
// that do not add it snapshot raw color codes.

const ANSI =
  // eslint-disable-next-line no-control-regex
  /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g

// Read by the Jest-compatible toThrowErrorMatching*Snapshot shims in test/setup.ts.
globalThis.__ctrlDomStripAnsiInSnapshots = true

export default {
  test: value => typeof value === 'string' && value.replace(ANSI, '') !== value,
  serialize: (value, config, indentation, depth, refs, printer) =>
    printer(value.replace(ANSI, ''), config, indentation, depth, refs),
}
