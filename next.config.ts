import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // sharp ships platform-specific native binaries — keep it out of the server bundle.
  serverExternalPackages: ["sharp", "heic-convert", "heic-decode", "libheif-js", "onnxruntime-web"],

  async headers() {
    return [
      {
        // Self-hosted ONNX/WASM model shards — cached aggressively, fetched by
        // @imgly/background-removal from `${origin}/imgly/`.
        source: "/imgly/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        ],
      },
      {
        // The service worker must never be served stale.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
      {
        // Cross-origin isolation enables SharedArrayBuffer → multithreaded WASM
        // for onnxruntime-web (major segmentation speedup).
        source: "/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
    ];
  },
};

export default nextConfig;
