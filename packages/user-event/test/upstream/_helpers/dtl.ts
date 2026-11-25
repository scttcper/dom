// Divergence from upstream: upstream's tests import `getConfig`/`configure` from
// `@testing-library/dom`. @ctrl/dom/user-event reads its config from `@ctrl/dom/testing-library`
// (src/setup/dtl.ts), so tests configure the module user-event actually uses.

export {configure, getConfig} from '@ctrl/dom/testing-library'
