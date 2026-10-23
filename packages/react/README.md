# @rtd/react

Drop-in replacement for `@testing-library/react` 16.3 (`render`, `renderHook`, `act`,
`cleanup`, plus everything from `@rtd/testing-library`). Peer dependencies: `react` and
`react-dom` 19.

```tsx
import { render, screen } from "@rtd/react";
render(<button>Save</button>);
screen.getByRole("button", { name: "Save" });
```

Requires the `rtd` test environment (`vitest-environment-rtd` or `jest-environment-rtd` with
its preset). ESM and CommonJS builds.

Part of [react-testing-dom](../../README.md). Third-party notices: `dist/NOTICE`.
