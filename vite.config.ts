import { defineConfig } from "vite";

export default defineConfig(({ command, mode }) => ({
  base:
    command === "serve" && mode === "development"
      ? "/"
      : (process.env.RLOGS_SITE_BASE ?? "/rlogs-website/"),
  build: {
    outDir: "dist",
    sourcemap: true,
  },
}));
