// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Hosts liberados no `vite dev` (mantido só para desenvolvimento local com HMR).
// Em produção (Coolify) servimos `node server-node.mjs` contra o build SSR — ver
// Dockerfile.hub. Vite bloqueia hosts não-listados por default (CVE-2025-30208).
// Hardcoded staging hosts + opt-in via env (`VITE_PUBLIC_HOST`, comma-separated).
const allowedHosts = [
  "localhost",
  "127.0.0.1",
  "app.cockpit.taticamarketing.com.br",
  ...(process.env.VITE_PUBLIC_HOST?.split(",").map((h) => h.trim()).filter(Boolean) ?? []),
];

// Redirect TanStack Start's bundled server entry to src/server.ts (SSR error wrapper).
// `cloudflare: false` disables the Workers adapter so the build emits a fetch-style
// handler runnable on Node via `server-node.mjs`. Workers path (wrangler.jsonc) is
// kept dormant in case we ever migrate to Cloudflare.
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  cloudflare: false,
  vite: {
    server: {
      host: "0.0.0.0",
      allowedHosts,
      proxy: {
        "/api": {
          target: "http://localhost:3000",
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
      },
    },
  },
});
