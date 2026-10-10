import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Client build only. Pre-rendering is done by scripts/build.mjs, which loads src/entry-server.tsx through Vite's
// own SSR module loader and writes one finished HTML file per route (see README, "Why a custom pre-render script").
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  build: {
    manifest: true,
    target: "es2020",
    cssCodeSplit: false, // one small CSS file for every route: no flash, one request, cached across pages
    assetsInlineLimit: 0, // nothing inlined: the CSP allows 'self' only (no data: fonts or images)
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
  server: { port: 5173 },
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
} as import("vite").UserConfig & { test: unknown });
