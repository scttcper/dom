// Jest resolver for the react-router downstream runner's ctrl-dom modes. Upstream runs Jest in native
// ESM mode, where the same specifier is `import`ed by test files and `require`d by CommonJS
// (the probe, CJS dependencies). For the specifiers run.ts substitutes ($CTRL_DOM_RR_RESOLVE: exact
// specifier -> { import, require }), it resolves the way a published package's exports map
// would: the ESM bundle when Jest resolves with the "import" condition, the `.cjs` bundle
// otherwise. Everything else goes to Jest's default resolver.
'use strict';

const targets = JSON.parse(process.env.CTRL_DOM_RR_RESOLVE || '{}');

module.exports = (request, options) => {
  const target = targets[request];
  if (target !== undefined) return options.conditions?.includes('import') ? target.import : target.require;
  return options.defaultResolver(request, options);
};
