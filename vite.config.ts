import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

const isGistBuild = process.env.GIST_BUILD === "true";

export default defineConfig({
  base: "./",
  plugins: [react(), ...(isGistBuild ? [viteSingleFile()] : [])],
  build: {
    outDir: isGistBuild ? "dist-gist" : "dist",
    assetsInlineLimit: isGistBuild ? 100_000_000 : 4096,
  },
});
