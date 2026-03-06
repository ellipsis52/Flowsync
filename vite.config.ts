import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 8085,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Fix React duplicate instances issue
      "react": path.resolve(__dirname, "./node_modules/react"),
      "react-dom": path.resolve(__dirname, "./node_modules/react-dom"),
    },
    // Ensure module deduplication
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    // Explicitly include React to ensure single instance
    include: ["react", "react-dom", "react/jsx-runtime"],
    // Force re-optimization on startup
    force: true,
    esbuildOptions: {
      // Ensure proper resolution
      resolveExtensions: ['.tsx', '.ts', '.jsx', '.js'],
    },
  },
});
