import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "src/index.ts",
      name: "vi-mode",
      fileName: () => "vi-mode.js",
      formats: ["umd"],
    },
    minify: "esbuild",
  },
});
