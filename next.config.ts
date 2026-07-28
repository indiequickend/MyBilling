import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @react-pdf/renderer touches Node built-ins (fs, stream) that shouldn't be bundled by
  // webpack/turbopack for the route handlers that import it — resolved as a plain Node require
  // at runtime instead. See lib/pdf/render.ts.
  serverExternalPackages: ["@react-pdf/renderer"],
};

export default nextConfig;
