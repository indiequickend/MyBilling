import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules", ".next", "tests/e2e/**"],
    setupFiles: ["./tests/setup.ts"],
    // Several test files open a real MongoDB Atlas connection. Running files
    // in parallel worker processes means each one dials a fresh connection
    // simultaneously, which can occasionally exceed Mongoose's default 10s
    // operation-buffering timeout under concurrent load. These are
    // effectively integration tests against a shared external service, so
    // sequential execution is the correct (and more stable) choice anyway.
    fileParallelism: false,
    // A cold connection to Atlas (TLS handshake + replica-set discovery) plus
    // a beforeAll that does several round trips can occasionally exceed
    // Vitest's default 10s hook timeout — a separate timeout from Mongoose's
    // own operation-buffering one (see lib/db/connect.ts).
    hookTimeout: 20_000,
  },
});
