import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "../..");

export default defineConfig({
  server: {
    port: 5188,
    host: "127.0.0.1",
    // Docs route imports public/API.md via `?raw` from the monorepo root.
    fs: { allow: [repoRoot] },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  plugins: [
    tailwindcss(),
    tanstackStart({ srcDirectory: "src" }),
    react(),
    nitro(),
  ],
});
