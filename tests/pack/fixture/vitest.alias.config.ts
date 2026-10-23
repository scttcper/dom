// (c) the repository README's setup: stock imports aliased to the @rtd drop-ins.
import { defineConfig } from "vitest/config";
import { recordLoads } from "./record-plugin.ts";

export default defineConfig({
  plugins: [recordLoads()],
  resolve: {
    alias: {
      "@testing-library/react": "@rtd/react",
      "@testing-library/dom": "@rtd/testing-library",
      "@testing-library/user-event": "@rtd/user-event",
      "@testing-library/jest-dom": "@rtd/jest-dom",
    },
  },
  test: { environment: "rtd", include: ["stock.test.tsx"] },
});
