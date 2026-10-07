import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const API = process.env.API_ORIGIN || `http://127.0.0.1:${process.env.API_PORT || 8787}`;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // The browser only ever talks to /api — keys stay on the Node server.
      "/api": { target: API, changeOrigin: false },
    },
  },
  build: {
    chunkSizeWarningLimit: 900,
  },
});
