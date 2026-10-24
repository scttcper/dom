// pnpm install hooks.
//
// Vitest (through @vitest/mocker) declares msw as an optional peer, for browser mode. tests/compat
// installs msw (as msw-3 / msw-2) to test XMLHttpRequest mocking, and pnpm, which matches peers
// by real package name, would then create extra copies of Vitest keyed to msw: the test
// runner and packages that import "vitest" themselves (stock @testing-library/jest-dom/vitest)
// end up loading different copies, and expect() breaks across them (`rejects` loses its value).
// Nothing here uses Vitest's browser mode, so the peer is dropped and one Vitest remains.
module.exports = {
  hooks: {
    readPackage(pkg) {
      if (pkg.name === "vitest" || pkg.name === "@vitest/mocker") {
        if (pkg.peerDependencies) delete pkg.peerDependencies.msw;
        if (pkg.peerDependenciesMeta) delete pkg.peerDependenciesMeta.msw;
      }
      return pkg;
    },
  },
};
