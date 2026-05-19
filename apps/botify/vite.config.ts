import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: "127.0.0.1",
    port: 8090,
    hmr: {
      overlay: false,
    },
    proxy: {
      "/api/wp": {
        target: "http://localhost",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/wp/, "/wordpress"),
      },
      "/api/microservice": {
        target: "http://localhost:3001",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/microservice/, ""),
      },
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        secure: false,
      },
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@omniconnect/shared-types": path.resolve(
        __dirname,
        "../../packages/shared-types/src/index.ts",
      ),
    },
  },
}));
