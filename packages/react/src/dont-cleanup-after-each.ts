// Port of @testing-library/react@16.3.3 dont-cleanup-after-each.js
// https://github.com/testing-library/react-testing-library/blob/v16.3.3/dont-cleanup-after-each.js
// Import this before `@rtd/react` (e.g. in a setup file) to disable automatic cleanup.
process.env.RTL_SKIP_AUTO_CLEANUP = "true";
