import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  base:
    command === "serve"
      ? "/"
      : (process.env.RLOGS_SITE_BASE ?? "/rlogs-website/"),
  build: {
    outDir: "dist",
    sourcemap: true,
  },
}));

