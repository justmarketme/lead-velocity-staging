import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { edgeFunctionsPlugin } from "./vite-plugin-edge-functions";


// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), edgeFunctionsPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
