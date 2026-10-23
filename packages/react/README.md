# @rtd/react

> Workspace package `@rtd/react`, published as `@ctrl/dom/react` (see the root README and scripts/release.ts).

Drop-in replacement for `@testing-library/react` 16.3 (`render`, `renderHook`, `act`,
`cleanup`, plus everything from `@ctrl/dom/testing-library`). Peer dependencies: `react` and
`react-dom` 19.

```tsx
import { render, screen } from "@ctrl/dom/react";
render(<button>Save</button>);
screen.getByRole("button", { name: "Save" });
```

Requires the `rtd` test environment (`vitest-environment-ctrl-dom` or `jest-environment-ctrl-dom` with
its preset). ESM and CommonJS builds.

Part of [ctrl-dom](../../README.md). Third-party notices: `dist/NOTICE`.
