import { fileURLToPath } from "node:url";

// React-level compat suite (react/**/*.test.tsx): the same files run in three projects.
//   compat:react-jsdom     environment jsdom + stock Testing Library (validates the expectations)
//   compat:react-rtd       environment rtd   + stock Testing Library (DOM swap only)
//   compat:react-rtd-full  environment rtd   + our packages aliased over @testing-library/*

const pkg = (p: string) => fileURLToPath(new URL(`../../packages/${p}`, import.meta.url));

export const include = ["react/**/*.test.{ts,tsx}"];

export const ourTestingLibrary = [
  { find: /^@testing-library\/react$/, replacement: pkg("react/src/index.ts") },
  { find: /^@testing-library\/react\/pure$/, replacement: pkg("react/src/pure.ts") },
  { find: /^@testing-library\/dom$/, replacement: pkg("testing-library/src/index.ts") },
  { find: /^@testing-library\/user-event$/, replacement: pkg("user-event/src/index.ts") },
  { find: /^@testing-library\/jest-dom\/vitest$/, replacement: pkg("jest-dom/src/vitest.ts") },
  { find: /^@testing-library\/jest-dom\/matchers$/, replacement: pkg("jest-dom/src/matchers.ts") },
  { find: /^@testing-library\/jest-dom$/, replacement: pkg("jest-dom/src/index.ts") },
];
