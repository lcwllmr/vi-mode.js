import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  build: {
    lib: {
      entry: "src/index.ts",
      name: "vi-mode",
      formats: ["es", "cjs"],
    },
  },
  plugins: [dts({ rollupTypes: true })],
});
