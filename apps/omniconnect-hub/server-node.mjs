// Node HTTP runtime for the TanStack Start SSR build.
//
// Why: TanStack Start + `@lovable.dev/vite-tanstack-config` with `cloudflare: false`
// emits a fetch-style handler at `dist/server/server.js` but no Node listener.
// This wrapper adapts Node's IncomingMessage/ServerResponse to Web Fetch
// Request/Response and serves the SSR handler. Static client assets in
// `dist/client/` are served directly to skip the SSR roundtrip.
//
// No external deps — uses only Node builtins (Node 20+ ships native Request,
// Response, ReadableStream and Readable.toWeb).
import http from "node:http";
import { Readable } from "node:stream";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = path.join(__dirname, "dist", "client");
const SERVER_ENTRY = path.join(__dirname, "dist", "server", "server.js");

if (!fs.existsSync(SERVER_ENTRY)) {
  console.error(`[server-node] missing build output: ${SERVER_ENTRY}`);
  console.error(`[server-node] run \`pnpm run build\` before starting.`);
  process.exit(1);
}

const handlerModule = await import(SERVER_ENTRY);
const handler = handlerModule.default;

const MIME = {
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
};

function tryServeStatic(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  // Only static-serve the asset directories Vite owns.
  if (!urlPath.startsWith("/assets/") && !urlPath.startsWith("/favicon")) {
    return false;
  }
  const filePath = path.join(CLIENT_DIR, urlPath);
  // Prevent path traversal.
  if (!filePath.startsWith(CLIENT_DIR + path.sep) && filePath !== CLIENT_DIR) {
    return false;
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return false;
  const stat = fs.statSync(filePath);
  res.statusCode = 200;
  res.setHeader("content-type", MIME[path.extname(filePath)] ?? "application/octet-stream");
  res.setHeader("content-length", stat.size);
  // Hashed asset filenames — safe to cache aggressively.
  if (urlPath.startsWith("/assets/")) {
    res.setHeader("cache-control", "public, max-age=31536000, immutable");
  }
  if (req.method === "HEAD") {
    res.end();
  } else {
    fs.createReadStream(filePath).pipe(res);
  }
  return true;
}

async function handleSsr(req, res) {
  const url = `http://${req.headers.host ?? "localhost"}${req.url}`;
  const init = { method: req.method, headers: req.headers };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = Readable.toWeb(req);
    init.duplex = "half";
  }
  const request = new Request(url, init);
  const response = await handler.fetch(request, {}, {});
  res.statusCode = response.status;
  response.headers.forEach((v, k) => res.setHeader(k, v));
  if (!response.body) {
    res.end();
    return;
  }
  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(value);
  }
  res.end();
}

const server = http.createServer(async (req, res) => {
  try {
    if (tryServeStatic(req, res)) return;
    await handleSsr(req, res);
  } catch (err) {
    console.error("[server-node] request failed:", err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("content-type", "text/plain; charset=utf-8");
    }
    res.end("Internal Server Error");
  }
});

const PORT = Number(process.env.PORT ?? 4173);
const HOST = process.env.HOST ?? "0.0.0.0";

server.listen(PORT, HOST, () => {
  console.log(`[server-node] omniconnect-hub listening on http://${HOST}:${PORT}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    console.log(`[server-node] received ${signal}, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  });
}
