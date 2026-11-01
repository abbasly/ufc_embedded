import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// BASE_PATH lets the same build live at "/" locally and at "/<repo>/" on GitHub Pages.
export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  plugins: [react()],
  build: { chunkSizeWarningLimit: 6000 }, // Plotly is big but lazy-loaded on the style map only
});
