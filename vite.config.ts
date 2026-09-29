import { defineConfig } from "vite";

export default defineConfig({
  build: {
    target: "es2022",
    emptyOutDir: false,
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      fileName: () => "index.js",
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
