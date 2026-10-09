import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A plain static site (out/) for Cloudflare Pages: every screen runs in the
  // browser and all AI is on the device, so nothing needs a server.
  // Response headers live in public/_headers. Cache Components (partial
  // prerendering) needs a server, so it is off.
  output: "export",
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
