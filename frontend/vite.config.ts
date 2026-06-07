import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

// React + Tailwind v4 SPA served by a single Cloudflare Worker (Static Assets).
export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
});
