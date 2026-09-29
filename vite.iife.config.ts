import { defineConfig } from "vite";

export default defineConfig({
  build: {
    target: "es2022",
    emptyOutDir: false,
    lib: {
      entry: "src/auto.ts",
      name: "DlbrAgeCheck",
      formats: ["iife"],
      fileName: () => "dlbr-age-check.iife.js",
    },
  },
});
