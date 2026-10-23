# @rtd/testing-library

Drop-in replacement for `@testing-library/dom` 10.4 (same exports, behaviour, error messages and
`prettyDOM` output, same types), built on `@rtd/dom`.

```ts
import { screen, within, waitFor, fireEvent } from "@rtd/testing-library";
```

Or keep your imports and alias `@testing-library/dom` to `@rtd/testing-library` (see the
repository README). Requires the `rtd` test environment. ESM and CommonJS builds.

Part of [react-testing-dom](../../README.md). Third-party notices: `dist/NOTICE`.
