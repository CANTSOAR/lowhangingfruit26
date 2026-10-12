import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // NEXT_DIST_DIR lets several dev servers share one checkout without clobbering each other.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async headers() {
    return [{ source: "/oauth/:path*", headers: [
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
      { key: "X-Frame-Options", value: "DENY" },
      // Native form POSTs under no-referrer send Origin: null. Preserve the
      // same-origin consent check without leaking the consent URL off-site.
      { key: "Referrer-Policy", value: "same-origin" },
      { key: "Cache-Control", value: "no-store" },
    ] }];
  },
  serverExternalPackages: ["better-sqlite3"],
  turbopack: {
    root: process.env.NEXT_TURBOPACK_ROOT || process.cwd(),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
