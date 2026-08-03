import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @react-pdf/renderer touches Node built-ins (fs, stream) that shouldn't be bundled by
  // webpack/turbopack for the route handlers that import it — resolved as a plain Node require
  // at runtime instead. See lib/pdf/render.ts.
  serverExternalPackages: ["@react-pdf/renderer"],
  async headers() {
    return [
      {
        // The service worker script itself must never be cached by the browser's
        // HTTP cache — otherwise a stale sw.js can stick around after a deploy.
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
    ];
  },
};

export default nextConfig;
