import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    coverage: {
      reporter: ["html"],
      reportsDirectory: "./demo/dist/coverage",
    },
  },
});
