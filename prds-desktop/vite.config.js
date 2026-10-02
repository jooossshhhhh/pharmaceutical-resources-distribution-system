import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@backend": path.resolve(__dirname, "./src/backend"),
      "@frontend": path.resolve(__dirname, "./src/frontend"),
      "@shared": path.resolve(__dirname, "./src/shared"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
  clearScreen: false,
  server: {
    strictPort: true,
    host: host || false,
    port: 5173,
    watch: {
      // Prevent Vite from watching Rust build files and DLLs in src-tauri
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("recharts")) {
              return "vendor-charts";
            }
            if (id.includes("leaflet") || id.includes("react-leaflet")) {
              return "vendor-maps";
            }
            if (id.includes("lucide-react")) {
              return "vendor-icons";
            }
            if (id.includes("@supabase")) {
              return "vendor-supabase";
            }
            if (id.includes("react-router-dom") || id.includes("react") || id.includes("react-dom")) {
              return "vendor-react";
            }
          }
        },
      },
    },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
});

