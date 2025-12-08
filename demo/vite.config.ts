import { defineConfig } from "vite";
import pkg from "../package.json";

export default defineConfig({
  base: "./",
  server: { open: true },
  define: {
    __VERSION__: JSON.stringify(pkg.version),
  },
});
