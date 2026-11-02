import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // The dev server is started with -H 0.0.0.0, so 127.0.0.1 would otherwise be blocked as cross-origin
  // and the page would never hydrate (every button looks dead). Development only.
  allowedDevOrigins: ["127.0.0.1"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
