# @ctrl/dom/testing-library

Drop-in replacement for `@testing-library/dom` 10.4 (same exports, behaviour, error messages and
`prettyDOM` output, same types), built on `@ctrl/dom`.

```ts
import { screen, within, waitFor, fireEvent } from "@ctrl/dom/testing-library";
```

Or keep your imports and alias `@testing-library/dom` to `@ctrl/dom/testing-library` (see the
repository README). Requires the ctrl-dom test environment. ESM and CommonJS builds.

Part of [ctrl-dom](../../README.md). MIT licensed; third-party notices in [NOTICE](../../NOTICE).
